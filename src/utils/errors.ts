import type Logger from './logger.js';

let retryLogger: Logger | undefined;

async function getRetryLogger(): Promise<Logger> {
  if (!retryLogger) {
    const module = await import('./logger.js');
    retryLogger = new module.default({ level: 'info' });
  }
  return retryLogger;
}

export class PayMongoError extends Error {
  constructor(
    message: string,
    public code?: string,
    public statusCode?: number
  ) {
    super(message);
    this.name = 'PayMongoError';
  }
}

export class ConfigError extends Error {
  constructor(
    message: string,
    public configPath?: string
  ) {
    super(message);
    this.name = 'ConfigError';
  }
}

export class ApiKeyError extends Error {
  constructor(
    message: string,
    public keyType?: 'public' | 'secret'
  ) {
    super(message);
    this.name = 'ApiKeyError';
  }
}

export class NetworkError extends Error {
  constructor(
    message: string,
    public originalError?: Error
  ) {
    super(message);
    this.name = 'NetworkError';
  }
}

export class ValidationError extends Error {
  constructor(
    message: string,
    public field?: string
  ) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class WebhookError extends Error {
  constructor(
    message: string,
    public webhookId?: string
  ) {
    super(message);
    this.name = 'WebhookError';
  }
}

export interface RetryOptions {
  maxRetries?: number;
  delayMs?: number;
  backoffMultiplier?: number;
  retryCondition?: (error: Error) => boolean;
  silent?: boolean; // Suppress retry logs
}

export async function withRetry<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxRetries = 3,
    delayMs = 1000,
    backoffMultiplier = 2,
    silent = false,
    retryCondition = (error: Error) => {
      // Default: retry on network errors, 5xx status codes, and rate limit errors
      return (
        error.name === 'NetworkError' ||
        (error.message.includes('Network error') && !error.message.includes('401')) ||
        error.message.includes('timeout') ||
        error.message.includes('ECONNRESET') ||
        (error instanceof PayMongoError &&
          (error.code === 'RATE_LIMIT_EXCEEDED' || error.statusCode === 429))
      );
    },
  } = options;

  let lastError: Error = new Error('Operation failed');
  let currentDelay = delayMs;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;

      if (attempt === maxRetries || !retryCondition(lastError)) {
        throw lastError;
      }

      if (!silent) {
        const logger = await getRetryLogger();
        if (error instanceof PayMongoError && error.code === 'RATE_LIMIT_EXCEEDED') {
          logger.info(`Rate limit reached, waiting ${currentDelay}ms before retry...`);
        } else {
          logger.info(`Attempt ${attempt + 1} failed, retrying in ${currentDelay}ms...`);
        }
      }
      await new Promise((resolve) => setTimeout(resolve, currentDelay));
      currentDelay *= backoffMultiplier;
    }
  }

  throw lastError;
}
