import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AnalyticsService } from '../../src/services/analytics/service.js';
import { DevServer } from '../../src/services/dev/server.js';
import type { PayMongoConfig, WebhookEventPayload } from '../../src/types/paymongo.js';

describe('Dev server documented event envelope', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(AnalyticsService.prototype, 'recordEvent').mockResolvedValue(undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  it('logs the event name, nested payment details, and distinct event/payment IDs', async () => {
    const config: PayMongoConfig = {
      version: '1.0',
      projectName: 'test',
      environment: 'test',
      apiKeys: {},
      webhooks: { url: '', events: [] },
      webhookSecrets: {},
      dev: { port: 3000, autoRegisterWebhook: false, verifyWebhookSignatures: false },
    };
    const event: WebhookEventPayload = {
      data: {
        id: 'evt_123',
        type: 'event',
        attributes: {
          type: 'payment.paid',
          livemode: false,
          data: { id: 'pay_456', type: 'payment', attributes: { amount: 10000, status: 'paid' } },
        },
      },
    };
    const server = new DevServer(3000, config);
    await (
      server as unknown as { logWebhookEvent: (event: WebhookEventPayload) => Promise<void> }
    ).logWebhookEvent(event);
    expect(AnalyticsService.prototype.recordEvent).toHaveBeenCalledWith({
      type: 'payment.paid',
      success: true,
      data: event.data.attributes,
    });
    const output = vi
      .mocked(console.log)
      .mock.calls.map((call) => call.join(' '))
      .join('\n');
    expect(output).toContain('PAYMENT.PAID');
    expect(output).toContain('100.00');
    expect(output).toContain('Payment ID: pay_456');
    expect(output).toContain('Event ID: evt_123');
    expect(output).toContain('/payments/pay_456');
    expect(output).not.toContain('/payments/evt_123');
  });
});
