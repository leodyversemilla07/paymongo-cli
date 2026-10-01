import type { PayMongoConfig } from '../../src/types/paymongo.js';

/** Fresh, synthetic configuration; never resolves real project/global credentials. */
export function testConfig(): PayMongoConfig {
  return {
    version: '1.0',
    projectName: 'fixture',
    environment: 'test',
    apiKeys: { test: { public: 'pk_test_fixture', secret: 'sk_test_fixture' } },
    webhooks: { url: 'http://127.0.0.1:3000/webhooks', events: ['payment.paid'] },
    webhookSecrets: {},
    dev: { port: 4000, autoRegisterWebhook: false, verifyWebhookSignatures: true },
  };
}
