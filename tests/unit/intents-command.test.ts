import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PaymentIntentData } from '../../src/types/paymongo.js';

const mocks = vi.hoisted(() => ({
  config: { environment: 'test' as 'test' | 'live' },
  spinner: { start: vi.fn(), succeed: vi.fn(), stop: vi.fn(), fail: vi.fn(), info: vi.fn() },
  api: {
    createPaymentIntent: vi.fn(),
    getPaymentIntent: vi.fn(),
    attachPaymentIntent: vi.fn(),
    capturePaymentIntent: vi.fn(),
    cancelPaymentIntent: vi.fn(),
  },
}));
vi.mock('../../src/commands/shared/runtime.js', () => ({
  createCommandContext: () => ({ spinner: mocks.spinner, configManager: {} }),
  loadCommandConfig: async () => mocks.config,
  createApiClient: () => mocks.api,
  failCommand: (_prefix: string, error: unknown) => {
    throw error;
  },
}));

const { createIntentsCommand } = await import('../../src/commands/intents/index.js');
const { default: paymentsCommand } = await import('../../src/commands/payments.js');

describe('Payment Intent command workflow', () => {
  const intent: PaymentIntentData = {
    id: 'pi_123',
    type: 'payment_intent',
    attributes: {
      amount: 50000,
      currency: 'PHP',
      status: 'awaiting_payment_method',
      livemode: false,
      capture_type: 'manual',
      payment_method_allowed: ['card'],
      created_at: 1710000000,
      updated_at: 1710000000,
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    mocks.config.environment = 'test';
    for (const method of Object.values(mocks.api)) method.mockResolvedValue(intent);
  });
  afterEach(() => vi.restoreAllMocks());

  function output(): string {
    return vi
      .mocked(console.log)
      .mock.calls.map((call) => call.join(' '))
      .join('\n');
  }

  it('creates a card authorization through documented creation flags', async () => {
    await createIntentsCommand().parseAsync(
      [
        'create',
        '--amount',
        '50000',
        '--methods',
        'card',
        '--capture-type',
        'manual',
        '--three-d-secure',
        'any',
        '--description',
        'Order #9012',
        '--json',
      ],
      { from: 'user' }
    );
    expect(mocks.api.createPaymentIntent).toHaveBeenCalledWith(
      50000,
      'PHP',
      'Order #9012',
      ['card'],
      { captureType: 'manual', threeDSecure: 'any' }
    );
    expect(console.log).toHaveBeenCalledWith(JSON.stringify(intent, null, 2));
  });

  it.each([
    ['create'],
    ['show', 'pi_123'],
    ['cancel', 'pi_123'],
    ['attach', 'pi_123', '--payment-method', 'pm_123'],
    ['capture', 'pi_123'],
  ])('redacts nested credentials and billing from canonical intent JSON: %s', async (...args) => {
    const resource = {
      ...intent,
      attributes: {
        ...intent.attributes,
        client_key: 'private-client-key',
        metadata: { secret_key: 'private-signing-secret' },
        payments: [{ billing: { email: 'private@example.com' } }],
      },
    };
    for (const method of Object.values(mocks.api)) method.mockResolvedValue(resource);
    await createIntentsCommand().parseAsync([...args, '--json'], { from: 'user' });
    const result = output();
    expect(result).not.toContain('private');
    expect(result).toContain('pi_123');
    expect(resource.attributes.client_key).toBe('private-client-key');
  });

  it('preserves defaults and trims documented comma-separated method names', async () => {
    await createIntentsCommand().parseAsync(['create', '--methods', 'gcash, paymaya,grab_pay'], {
      from: 'user',
    });
    expect(mocks.api.createPaymentIntent).toHaveBeenCalledWith(
      10000,
      'PHP',
      undefined,
      ['gcash', 'paymaya', 'grab_pay'],
      { captureType: 'automatic' }
    );
  });

  it.each([
    ['--amount', '99'],
    ['--amount', '100.5'],
    ['--amount', '100abc'],
    ['--currency', 'USD'],
    ['--methods', 'maya'],
    ['--methods', 'card,'],
    ['--methods', 'gcash', '--capture-type', 'manual'],
    ['--methods', 'gcash', '--three-d-secure', 'any'],
  ])('rejects invalid creation options without API calls: %s', async (...args) => {
    await expect(
      createIntentsCommand().parseAsync(['create', ...args], { from: 'user' })
    ).rejects.toThrow();
    expect(mocks.api.createPaymentIntent).not.toHaveBeenCalled();
  });

  it('attaches a method and reports the customer redirect', async () => {
    mocks.api.attachPaymentIntent.mockResolvedValue({
      ...intent,
      attributes: {
        ...intent.attributes,
        status: 'awaiting_next_action',
        next_action: { type: 'redirect', redirect: { url: 'https://checkout.example.com' } },
      },
    });
    await createIntentsCommand().parseAsync(
      [
        'attach',
        'pi_123',
        '--payment-method',
        'pm_456',
        '--return-url',
        'https://example.com/return',
      ],
      { from: 'user' }
    );
    expect(mocks.api.attachPaymentIntent).toHaveBeenCalledWith(
      'pi_123',
      'pm_456',
      'https://example.com/return'
    );
    expect(output()).toContain('https://checkout.example.com');
    expect(output()).toContain('Customer action is required');
  });

  it('supports both full and partial capture in the canonical command', async () => {
    await createIntentsCommand().parseAsync(['capture', 'pi_123', '--json'], { from: 'user' });
    expect(mocks.api.capturePaymentIntent).toHaveBeenLastCalledWith('pi_123', undefined);
    await createIntentsCommand().parseAsync(['capture', 'pi_123', '--amount', '25000', '--json'], {
      from: 'user',
    });
    expect(mocks.api.capturePaymentIntent).toHaveBeenLastCalledWith('pi_123', 25000);
  });

  it('retrieves live mode and authorization status without hardcoding TEST', async () => {
    mocks.api.getPaymentIntent.mockResolvedValue({
      ...intent,
      attributes: { ...intent.attributes, status: 'awaiting_capture', livemode: true },
    });
    await createIntentsCommand().parseAsync(['show', 'pi_123'], { from: 'user' });
    expect(output()).toContain('LIVE');
    expect(output()).not.toContain('TEST');
    expect(output()).toContain('Authorized, not charged');
    expect(output()).toContain('paymongo intents capture pi_123');
  });

  it('uses identical lifecycle flags in the payments compatibility commands', () => {
    const intents = createIntentsCommand();
    for (const [canonical, legacy] of [
      ['create', 'create-intent'],
      ['attach', 'attach'],
      ['capture', 'capture'],
    ]) {
      const actual = intents.commands.find((command) => command.name() === canonical);
      const compatibility = paymentsCommand.commands.find((command) => command.name() === legacy);
      expect(actual?.options.map((option) => option.flags)).toEqual(
        compatibility?.options.map((option) => option.flags)
      );
    }
  });
});
