import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PaymentSimulator, type SimulationOptions } from '../../src/services/payments/simulator.js';
import { ValidationError } from '../../src/utils/errors.js';

describe('Local-only payment simulator', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it.each([
    ['gcash', 'gcash'],
    ['maya', 'paymaya'],
    ['grabpay', 'grab_pay'],
  ] as const)('maps %s display names to %s API types and honors zero delay', async (method, apiType) => {
    const pending = new PaymentSimulator().simulatePaymentConfirmation('pi_123', {
      paymentMethod: method,
      outcome: 'success',
      delayMs: 0,
    });
    await vi.advanceTimersByTimeAsync(0);
    const result = await pending;
    expect(result.delayApplied).toBe(0);
    expect(result.paymentIntent.attributes).toMatchObject({
      status: 'succeeded',
      livemode: false,
      payment_method_allowed: [apiType],
    });
    expect(result.simulationType).toBe(`${method}_success`);
  });

  it('uses local default delays when none are specified', async () => {
    const pending = new PaymentSimulator().simulatePaymentConfirmation('pi_123', {
      paymentMethod: 'gcash',
    });
    expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(3000);
    expect((await pending).delayApplied).toBe(3000);
  });

  it.each([
    { paymentMethod: 'unknown' },
    { paymentMethod: '__proto__' },
    { paymentMethod: 'gcash', outcome: 'unknown' },
    { paymentMethod: 'gcash', delayMs: -1 },
    { paymentMethod: 'gcash', delayMs: 0.5 },
    { paymentMethod: 'gcash', delayMs: Number.NaN },
    { paymentMethod: 'gcash', delayMs: Number.POSITIVE_INFINITY },
    { paymentMethod: 'gcash', delayMs: 2147483648 },
  ])('validates runtime input before timer lookup: %s', async (options) => {
    await expect(
      new PaymentSimulator().simulatePaymentConfirmation('pi_123', options as SimulationOptions)
    ).rejects.toBeInstanceOf(ValidationError);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([
    'failure',
    'timeout',
  ] as const)('does not invent a failed intent state for %s', async (outcome) => {
    const pending = new PaymentSimulator().simulatePaymentConfirmation('pi_123', {
      paymentMethod: 'gcash',
      outcome,
      delayMs: 0,
    });
    await vi.advanceTimersByTimeAsync(0);
    expect((await pending).paymentIntent.attributes.status).toBe('awaiting_payment_method');
  });

  it.each([
    ['success', 'payment.paid'],
    ['failure', 'payment.failed'],
  ] as const)('uses the documented envelope and event name for %s', (outcome, type) => {
    const events = new PaymentSimulator().generateWebhookEvents('pi_123', 'maya', outcome);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      data: {
        type: 'event',
        attributes: {
          type,
          livemode: false,
          data: {
            type: 'payment',
            attributes: {
              livemode: false,
              payment_intent_id: 'pi_123',
              source: { type: 'paymaya' },
            },
          },
        },
      },
    });
    expect(JSON.stringify(events)).not.toContain('payment_intent.succeeded');
    expect(JSON.stringify(events)).not.toContain('payment_intent.payment_method.attached');
  });

  it('does not fabricate a remote failure event for a local timeout', () => {
    expect(new PaymentSimulator().generateWebhookEvents('pi_123', 'gcash', 'timeout')).toEqual([]);
  });
});
