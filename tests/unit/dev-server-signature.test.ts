import { describe, it, expect, beforeEach } from '@jest/globals';
import * as crypto from 'crypto';
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
      server as unknown as { verifyWebhookSignature: (req: unknown, body: string) => boolean }
    ).verifyWebhookSignature(req, body);
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
    const body = JSON.stringify({ data: { id: 'evt_1', type: 'payment' } });
    const timestamp = '1710000000';
    const secret = 'whsec_test_123';
    const webhookId = 'wh_123';
    const expected = crypto
      .createHmac('sha256', secret)
      .update(`${timestamp}.${body}`)
      .digest('hex');

    config.webhookSecrets = { [webhookId]: secret };
    const server = new DevServer(3000, config);
    const header = `t=${timestamp},te=${expected},li=${webhookId}`;
    expect(callVerify(server, header, body)).toBe(true);
  });

  it('returns false for invalid signature with configured secrets', () => {
    const body = JSON.stringify({ data: { id: 'evt_2', type: 'payment' } });
    const timestamp = '1710000001';
    const secret = 'whsec_test_456';
    const webhookId = 'wh_456';
    config.webhookSecrets = { [webhookId]: secret };

    const server = new DevServer(3000, config);
    const header = `t=${timestamp},te=deadbeef,li=${webhookId}`;
    expect(callVerify(server, header, body)).toBe(false);
  });
});
