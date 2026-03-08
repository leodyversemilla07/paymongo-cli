// API Constants
export const PAYMONGO_API_BASE = 'https://api.paymongo.com';
export const PAYMONGO_API_VERSION = 'v1';

// Webhook Events
export const WEBHOOK_EVENTS = [
  'payment.paid',
  'payment.failed',
  'payment.refunded',
  'source.chargeable',
  'checkout_session.payment.paid',
  'qrph.expired',
] as const;

// Environment Constants
export const ENVIRONMENTS = ['test', 'live'] as const;

// File Paths
export const CONFIG_FILE_NAME = '.paymongo';
export const ENV_FILE_NAME = '.env';

// CLI Constants
export const CLI_NAME = 'paymongo';

import { createRequire } from 'module';
const _require = createRequire(import.meta.url);
const _pkg = _require('../../package.json') as { version: string };
export const CLI_VERSION = _pkg.version;

// HTTP Constants
export const REQUEST_TIMEOUT = 30000; // 30 seconds
export const MAX_RETRIES = 3;
export const RETRY_DELAY = 1000; // 1 second

// Cache Constants
export const CACHE_TTL = 2 * 60 * 1000; // 2 minutes

// Rate Limit Defaults
export const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
export const RATE_LIMIT_DEFAULT_MAX = 100;
export const RATE_LIMIT_WEBHOOKS_MAX = 30;
export const RATE_LIMIT_PAYMENTS_MAX = 60;
export const RATE_LIMIT_REFUNDS_MAX = 20;
export const RATE_LIMIT_ENV_MULTIPLIER = 0.5; // Live gets 50% of test limits

// Development Constants
export const DEFAULT_DEV_PORT = 3000;
export const DEFAULT_WEBHOOK_PATH = '/webhook';

// Logging Constants
export const LOG_LEVELS = ['error', 'warn', 'info', 'debug'] as const;

// Error Messages
export const ERROR_MESSAGES = {
  INVALID_API_KEY: 'Invalid API key format',
  INVALID_WEBHOOK_URL: 'Invalid webhook URL. Must be HTTPS or localhost',
  CONFIG_NOT_FOUND: 'Configuration file not found. Run "paymongo init" first',
  API_KEY_NOT_FOUND: 'API key not found. Run "paymongo login" to set it up',
  NETWORK_ERROR: 'Network error. Please check your internet connection',
  UNAUTHORIZED: 'Unauthorized. Please check your API keys',
  RATE_LIMITED: 'Rate limited. Please try again later',
  SERVER_ERROR: 'Server error. Please try again later',
} as const;

// Success Messages
export const SUCCESS_MESSAGES = {
  CONFIG_SAVED: 'Configuration saved successfully',
  WEBHOOK_CREATED: 'Webhook created successfully',
  WEBHOOK_DELETED: 'Webhook deleted successfully',
  LOGIN_SUCCESSFUL: 'Login successful',
  DEV_SERVER_STARTED: 'Development server started',
} as const;
