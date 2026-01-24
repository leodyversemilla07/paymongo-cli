import axios, { AxiosInstance } from 'axios';
const REQUEST_TIMEOUT = 30000;

import { NetworkError, ApiKeyError, PayMongoError, withRetry } from '../../utils/errors.js';
import Cache from '../../utils/cache.js';
import RateLimiter, { RateLimitConfig } from './rate-limiter.js';
import {
  PayMongoConfig,
  WebhookData,
  WebhookDataWithSecret,
  PaymentDataFull,
  PaymentIntentData,
  RefundData,
} from '../../types/paymongo.js';

export interface ApiClientOptions {
  config: PayMongoConfig;
  timeout?: number;
  enableCache?: boolean;
  enableRateLimiting?: boolean;
  rateLimitConfig?: RateLimitConfig;
}

export class ApiClient {
  private client: AxiosInstance;
  private config: PayMongoConfig;
  private cache: Cache;
  private rateLimiter?: RateLimiter;

  constructor(options: ApiClientOptions) {
    this.config = options.config;
    const timeout = options.timeout || REQUEST_TIMEOUT;

    this.client = axios.create({
      baseURL: `https://api.paymongo.com/v1`,
      timeout,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'paymongo-cli/1.0.0',
      },
    });

    this.cache = new Cache({ ttl: 2 * 60 * 1000 }); // 2 minute cache for API responses

    // Initialize rate limiter if enabled
    const rateLimitEnabled =
      options.enableRateLimiting !== false && this.config.rateLimiting?.enabled !== false;
    if (rateLimitEnabled) {
      const rateLimitConfig = options.rateLimitConfig || this.getDefaultRateLimitConfig();
      // Override with config file settings if they exist
      if (this.config.rateLimiting) {
        rateLimitConfig.default.maxRequests = this.config.rateLimiting.maxRequests;
        rateLimitConfig.default.windowMs = this.config.rateLimiting.windowMs;
        if (this.config.rateLimiting.environmentMultiplier !== undefined) {
          rateLimitConfig.default.environmentMultiplier =
            this.config.rateLimiting.environmentMultiplier;
        }
        if (this.config.rateLimiting.endpoints) {
          rateLimitConfig.endpoints = {
            ...rateLimitConfig.endpoints,
            ...this.config.rateLimiting.endpoints,
          };
        }
      }
      this.rateLimiter = new RateLimiter(this.config, rateLimitConfig);
    }

    this.setupInterceptors();
  }

  private getDefaultRateLimitConfig(): RateLimitConfig {
    // Default rate limits: generous for development, stricter for production
    // Window: 1 minute (60,000 ms)
    // Test environment: 100 requests/minute
    // Live environment: 50 requests/minute (50% of test)
    return {
      default: {
        maxRequests: 100,
        windowMs: 60 * 1000, // 1 minute
        environmentMultiplier: 0.5, // Live gets 50% of test limits
      },
      endpoints: {
        // Webhook operations (more expensive)
        '/webhooks': {
          maxRequests: 30, // Stricter limits for webhook creation
          windowMs: 60 * 1000,
        },
        // Payment operations (critical)
        '/payments': {
          maxRequests: 60,
          windowMs: 60 * 1000,
        },
        '/payment_intents': {
          maxRequests: 60,
          windowMs: 60 * 1000,
        },
        '/refunds': {
          maxRequests: 20, // Very strict for refunds
          windowMs: 60 * 1000,
        },
      },
      environments: {
        test: {
          // Test environment gets full default limits
        },
        live: {
          // Live gets reduced limits via environmentMultiplier
        },
      },
    };
  }

  private setupInterceptors(): void {
    // Request interceptor to add authentication and rate limiting
    this.client.interceptors.request.use(async (config) => {
      // Add authentication
      const env = this.config.environment;
      const secretKey = this.config.apiKeys[env]?.secret;

      if (!secretKey) {
        throw new Error('Secret API key not found');
      }

      config.auth = {
        username: secretKey,
        password: '', // PayMongo uses username-only auth
      };

      // Check rate limits if enabled
      if (this.rateLimiter) {
        const endpoint = config.url?.replace('/v1', '') || '/unknown';
        const limitCheck = this.rateLimiter.checkLimit(endpoint);

        if (!limitCheck.allowed) {
          const waitTime = Math.ceil(limitCheck.backoffMs! / 1000);
          throw new PayMongoError(
            `Rate limit exceeded. Next request available in ${waitTime} seconds. ` +
              `Consider using --rate-limit-max-requests to increase limits or wait before retrying.`,
            'RATE_LIMIT_EXCEEDED',
            429
          );
        }
      }

      return config;
    });

    // Response interceptor for error handling and rate limit recording
    this.client.interceptors.response.use(
      (response) => {
        // Record successful API call for rate limiting
        if (this.rateLimiter && response.config.url) {
          const endpoint = response.config.url.replace('/v1', '');
          this.rateLimiter.recordCall(endpoint);
        }

        return response;
      },
      async (error) => {
        if (axios.isAxiosError(error)) {
          const status = error.response?.status;

          if (!error.response) {
            throw new NetworkError(`Network error - no response received: ${error.message}`, error);
          }

          if (status === 401) {
            throw new ApiKeyError('Invalid API key or unauthorized', 'secret');
          }

          if (status === 404) {
            throw new PayMongoError('Resource not found', 'RESOURCE_NOT_FOUND', status);
          }

          if (status && status >= 500) {
            throw new PayMongoError(`Server error: ${error.message}`, `SERVER_${status}`, status);
          }

          throw new PayMongoError(error.message, `API_${status}`, status);
        }

        throw new NetworkError('Unknown network error');
      }
    );
  }

  async validateApiKey(): Promise<boolean> {
    try {
      await withRetry(() => this.client.get('/webhooks'));
      return true;
    } catch (_error) {
      return false;
    }
  }

  // Webhook methods
  async createWebhook(url: string, events: string[]): Promise<WebhookDataWithSecret> {
    const result = await withRetry(() =>
      this.client
        .post('/webhooks', {
          data: {
            attributes: {
              url,
              events,
            },
          },
        })
        .then((response) => response.data.data)
    );

    // Invalidate webhook list cache when creating new webhook
    await this.cache.invalidate(`webhooks_${this.config.environment}`);

    return result;
  }

  async listWebhooks(): Promise<WebhookData[]> {
    const cacheKey = `webhooks_${this.config.environment}`;

    // Try cache first for list operations
    const cached = await this.cache.get<WebhookData[]>(cacheKey);
    if (cached) {
      return cached;
    }

    const result = await withRetry(() =>
      this.client.get('/webhooks').then((response) => response.data.data)
    );

    // Cache the result
    await this.cache.set(cacheKey, result);
    return result;
  }

  async getWebhook(id: string): Promise<WebhookData> {
    const cacheKey = `webhook_${id}`;

    // Try cache first
    const cached = await this.cache.get<WebhookData>(cacheKey);
    if (cached) {
      return cached;
    }

    const result = await withRetry(() =>
      this.client.get(`/webhooks/${id}`).then((response) => response.data.data)
    );

    // Cache the result
    await this.cache.set(cacheKey, result);
    return result;
  }

  async updateWebhook(
    id: string,
    updates: { url?: string; events?: string[]; status?: 'enabled' | 'disabled' }
  ): Promise<WebhookData> {
    // Invalidate cache when updating
    await this.cache.invalidate(`webhook_${id}`);
    await this.cache.invalidate(`webhooks_${this.config.environment}`);

    return withRetry(() =>
      this.client
        .put(`/webhooks/${id}`, {
          data: {
            attributes: updates,
          },
        })
        .then((response) => response.data.data)
    );
  }

  async deleteWebhook(id: string): Promise<void> {
    // Invalidate cache when deleting
    await this.cache.invalidate(`webhook_${id}`);
    await this.cache.invalidate(`webhooks_${this.config.environment}`);

    return withRetry(() => this.client.delete(`/webhooks/${id}`));
  }

  // Payment methods (for validation and testing)
  async getPayment(id: string): Promise<PaymentDataFull> {
    return withRetry(() =>
      this.client.get(`/payments/${id}`).then((response) => response.data.data)
    );
  }

  async listPayments(limit: number = 10): Promise<PaymentDataFull[]> {
    // Validate limit is within API constraints
    const validLimit = Math.max(1, Math.min(100, limit));

    const result = await withRetry(() =>
      this.client
        .get('/payments', {
          params: { limit: validLimit },
        })
        .then((response) => response.data.data)
    );
    return result;
  }

  async createPaymentIntent(
    amount: number,
    currency: string = 'PHP',
    description?: string,
    paymentMethods: string[] = ['card', 'gcash', 'paymaya']
  ): Promise<PaymentIntentData> {
    return withRetry(() =>
      this.client
        .post('/payment_intents', {
          data: {
            attributes: {
              amount,
              payment_method_allowed: paymentMethods,
              currency,
              description,
            },
          },
        })
        .then((response) => response.data.data)
    );
  }

  async confirmPaymentIntent(
    id: string,
    paymentMethodId: string,
    returnUrl?: string
  ): Promise<PaymentIntentData> {
    return withRetry(() =>
      this.client
        .post(`/payment_intents/${id}/confirm`, {
          data: {
            attributes: {
              payment_method: paymentMethodId,
              return_url: returnUrl,
            },
          },
        })
        .then((response) => response.data.data)
    );
  }

  async capturePaymentIntent(id: string): Promise<PaymentIntentData> {
    return withRetry(() =>
      this.client.post(`/payment_intents/${id}/capture`).then((response) => response.data.data)
    );
  }

  async createRefund(
    paymentId: string,
    amount?: number,
    reason?: 'duplicate' | 'fraudulent' | 'requested_by_customer'
  ): Promise<RefundData> {
    const attributes: any = {};
    if (amount !== undefined) {
      attributes.amount = amount;
    }
    if (reason) {
      attributes.reason = reason;
    }

    return withRetry(() =>
      this.client
        .post('/refunds', {
          data: {
            attributes: {
              payment_id: paymentId,
              ...attributes,
            },
          },
        })
        .then((response) => response.data.data)
    );
  }
}

export default ApiClient;
