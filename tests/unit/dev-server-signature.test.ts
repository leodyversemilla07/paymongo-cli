import * as crypto from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { DevServer } from '../../src/services/dev/server.js';
import type { PayMongoConfig } from '../../src/types/paymongo.js';

describe('DevServer signature verification', () => {
  let config: PayMongoConfig;

  beforeEach(() => {
    config = {
      version: '1.0',
      projectName: 'test-project',
      environment: 'test',
      apiKeys: { test: { secret: 'sk_test_key', public: 'pk_test_key' } },
      webhooks: { url: '', events: [] },
      webhookSecrets: {},
      dev: { port: 3000, autoRegisterWebhook: false, verifyWebhookSignatures: true },
      analytics: { enabled: false },
    };
  });

  function callVerify(server: DevServer, signature?: string, body = '{}'): boolean {
    const req = { headers: {} as Record<string, string> } as unknown as {
      headers: Record<string, string | string[]>;
    };
    if (signature !== undefined) {
      req.headers['paymongo-signature'] = signature;
    }
    return (
      server as unknown as {
        verifyWebhookSignature: (req: unknown, body: string, event?: unknown) => boolean;
      }
    ).verifyWebhookSignature(req, body, JSON.parse(body));
  }

  it('returns true when verification disabled', () => {
    config.dev.verifyWebhookSignatures = false;
    const server = new DevServer(3000, config);
    expect(callVerify(server)).toBe(true);
  });

  it('returns false when signature header missing', () => {
    const server = new DevServer(3000, config);
    expect(callVerify(server)).toBe(false);
  });

  it('returns false for invalid signature format', () => {
    const server = new DevServer(3000, config);
    expect(callVerify(server, 'bad-format')).toBe(false);
  });

  it('returns false when no secrets configured (verification enabled)', () => {
    const server = new DevServer(3000, config);
    expect(callVerify(server, 't=123,te=abc')).toBe(false);
  });

  it('returns true for valid signature with matching webhook secret', () => {
    const body = JSON.stringify({
      data: { id: 'evt_1', type: 'event', attributes: { type: 'payment.paid', livemode: false } },
    });
    const timestamp = '1710000000';
    const secret = 'whsec_test_123';
    const expected = crypto
      .createHmac('sha256', secret)
      .update(`${timestamp}.${body}`)
      .digest('hex');

    config.webhookSecrets = { wh_123: secret };
    const server = new DevServer(3000, config);
    const header = `t=${timestamp},te=${expected},li=`;
    expect(callVerify(server, header, body)).toBe(true);
  });

  it('returns false for invalid signature with configured secrets', () => {
    const body = JSON.stringify({
      data: { id: 'evt_2', type: 'event', attributes: { type: 'payment.failed', livemode: false } },
    });
    const timestamp = '1710000001';
    const secret = 'whsec_test_456';
    config.webhookSecrets = { wh_456: secret };

    const server = new DevServer(3000, config);
    const header = `t=${timestamp},te=deadbeef,li=`;
    expect(callVerify(server, header, body)).toBe(false);
  });
});
