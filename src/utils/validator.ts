import { PayMongoConfig } from '../types/paymongo.js';

export class ValidationError extends Error {
  constructor(
    message: string,
    public field?: string
  ) {
    super(message);
    this.name = 'ValidationError';
  }
}

export function validateApiKey(key: string, type: 'public' | 'secret'): boolean {
  if (!key || typeof key !== 'string') {
    return false;
  }

  // PayMongo API keys follow the format: pk_{env}_XXXXXXXXXXXXXXXXXX
  // where env is 'test' or 'live', and X is alphanumeric characters
  const prefix = type === 'public' ? 'pk_' : 'sk_';
  const pattern = new RegExp(`^${prefix}(test|live)_[a-zA-Z0-9]{20,}$`);

  return pattern.test(key);
}

export function validateWebhookUrl(url: string): boolean {
  try {
    const parsedUrl = new URL(url);
    return (
      parsedUrl.protocol === 'https:' ||
      parsedUrl.hostname === 'localhost' ||
      parsedUrl.hostname === '127.0.0.1'
    );
  } catch {
    return false;
  }
}

export function validateConfig(config: Partial<PayMongoConfig>): void {
  if (!config.projectName?.trim()) {
    throw new ValidationError('Project name is required', 'projectName');
  }

  if (!config.version) {
    throw new ValidationError('Config version is required', 'version');
  }

  if (!['test', 'live'].includes(config.environment!)) {
    throw new ValidationError('Environment must be either "test" or "live"', 'environment');
  }

  const env = config.environment!;
  const apiKeys = config.apiKeys?.[env];

  if (!apiKeys?.secret) {
    throw new ValidationError(
      `Secret API key for ${env} environment is required`,
      'apiKeys.secret'
    );
  }

  if (apiKeys.public && !validateApiKey(apiKeys.public, 'public')) {
    throw new ValidationError('Invalid public API key format', 'apiKeys.public');
  }

  if (!validateApiKey(apiKeys.secret, 'secret')) {
    throw new ValidationError('Invalid secret API key format', 'apiKeys.secret');
  }

  if (config.webhooks?.url && !validateWebhookUrl(config.webhooks.url)) {
    throw new ValidationError('Invalid webhook URL. Must be HTTPS or localhost', 'webhooks.url');
  }

  if (config.dev?.port !== undefined && (config.dev.port < 1 || config.dev.port > 65535)) {
    throw new ValidationError('Port must be between 1 and 65535', 'dev.port');
  }
}

export function validateEventTypes(events: string[]): void {
  const validEvents = [
    'payment.paid',
    'payment.failed',
    'payment.refunded',
    'source.chargeable',
    'checkout_session.payment.paid',
    'qrph.expired',
  ];

  const invalidEvents = events.filter((event) => !validEvents.includes(event));
  if (invalidEvents.length > 0) {
    throw new ValidationError(`Invalid event types: ${invalidEvents.join(', ')}`);
  }
}
