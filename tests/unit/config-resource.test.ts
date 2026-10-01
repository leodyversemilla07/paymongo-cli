import { describe, expect, it } from 'vitest';
import type { PayMongoConfig } from '../../src/types/paymongo.js';
import { redactConfigSecrets } from '../../src/utils/config-resource.js';

describe('Diagnostic configuration redaction', () => {
  it('redacts both environments and signing secrets without mutating stored credentials', () => {
    const config: PayMongoConfig = {
      version: '1',
      projectName: 'test',
      environment: 'test',
      apiKeys: {
        test: { public: 'pk_test_private', secret: 'sk_test_private' },
        live: { public: 'pk_live_private', secret: 'sk_live_private' },
      },
      webhookSecrets: { hook_123: 'whsk_private' },
      webhooks: { url: '', events: [] },
      dev: { port: 3000, autoRegisterWebhook: false, verifyWebhookSignatures: true },
    };
    const sanitized = redactConfigSecrets(config);
    expect(sanitized).toMatchObject({
      apiKeys: {
        test: { public: '[REDACTED]', secret: '[REDACTED]' },
        live: { public: '[REDACTED]', secret: '[REDACTED]' },
      },
      webhookSecrets: { hook_123: '[REDACTED]' },
    });
    expect(JSON.stringify(sanitized)).not.toContain('private');
    expect(config.apiKeys.test?.secret).toBe('sk_test_private');
    expect(config.webhookSecrets.hook_123).toBe('whsk_private');
  });
  it('keeps a credential-free configuration usable for diagnostics', () => {
    const config: PayMongoConfig = {
      version: '1',
      projectName: 'test',
      environment: 'test',
      apiKeys: {},
      webhookSecrets: {},
      webhooks: { url: '', events: [] },
      dev: { port: 3000, autoRegisterWebhook: false, verifyWebhookSignatures: false },
    };
    expect(redactConfigSecrets(config)).toEqual(config);
  });
});
