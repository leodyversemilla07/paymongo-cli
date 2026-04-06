import type { PayMongoConfig } from '../../types/paymongo.js';

export interface CredentialValidationOptions {
  projectName?: string;
  environment: 'test' | 'live';
  publicKey?: string;
  secretKey: string;
  webhookUrl?: string;
  events?: string[];
  port?: number;
}

export function createCredentialValidationConfig({
  projectName = 'temp',
  environment,
  publicKey = '',
  secretKey,
  webhookUrl = '',
  events = [],
  port = 3000,
}: CredentialValidationOptions): PayMongoConfig {
  return {
    version: '1.0',
    projectName,
    environment,
    apiKeys: {
      [environment]: {
        public: publicKey,
        secret: secretKey,
      },
    },
    webhooks: {
      url: webhookUrl,
      events,
    },
    webhookSecrets: {},
    dev: {
      port,
      autoRegisterWebhook: true,
      verifyWebhookSignatures: true,
    },
  };
}
