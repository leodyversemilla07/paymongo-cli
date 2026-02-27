import { request } from 'undici';
import { NetworkError, ApiKeyError, PayMongoError, withRetry } from '../../utils/errors.js';
import Cache from '../../utils/cache.js';
import RateLimiter, { RateLimitConfig } from './rate-limiter.js';
import { CLI_VERSION } from '../../utils/constants.js';
import {
  PayMongoConfig,
  WebhookData,
  WebhookDataWithSecret,
  PaymentDataFull,
  PaymentIntentData,
  RefundData,
  ApiResponse,
} from '../../types/paymongo.js';

const REQUEST_TIMEOUT = 30000;

// Error type with code property for network errors
interface ErrorWithCode extends Error {
  code?: string;
}

// PayMongo API error response type
interface PayMongoErrorResponse {
  errors: Array<{
    code?: string;
    detail?: string;
    title?: string;
  }>;
}

interface PaymentIntentAttributes {
  amount: number;
  payment_method_allowed: string[];
  currency: string;
  description?: string;
}

interface PaymentIntentConfirmAttributes {
  payment_method: string;
  return_url?: string;
}

export interface ApiClientOptions {
  config: PayMongoConfig;
  timeout?: number;
  enableCache?: boolean;
  enableRateLimiting?: boolean;
  rateLimitConfig?: RateLimitConfig;
}

export class ApiClient {
  private config: PayMongoConfig;
  private baseUrl: string;
  private defaultHeaders: Record<string, string>;
  private timeout: number;
  private cache: Cache;
  private rateLimiter?: RateLimiter;

  constructor(options: ApiClientOptions) {
    this.config = options.config;
    this.baseUrl = 'https://api.paymongo.com';
    this.timeout = options.timeout || REQUEST_TIMEOUT;

    this.defaultHeaders = {
      'Content-Type': 'application/json',
      'User-Agent': `paymongo-cli/${CLI_VERSION}`,
    };

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
        // Refunds (very strict)
        '/refunds': {
          maxRequests: 20,
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

  private async makeRequest(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    path: string,
    options: {
      body?: unknown;
      params?: Record<string, string | number>;
      headers?: Record<string, string>;
    } = {}
  ): Promise<{ statusCode: number; data: unknown }> {
    const url = new URL(path, this.baseUrl);
    if (options.params) {
      Object.entries(options.params).forEach(([key, value]) => {
        url.searchParams.append(key, value.toString());
      });
    }

    // Check rate limits if enabled
    if (this.rateLimiter) {
      const endpoint = path.replace('/v1', '') || '/unknown';
      const limitCheck = this.rateLimiter.checkLimit(endpoint);

      if (!limitCheck.allowed) {
        const backoffMs = limitCheck.backoffMs;
        if (backoffMs === undefined) {
          throw new PayMongoError(
            'Rate limit exceeded but no backoff time available.',
            'RATE_LIMIT_ERROR',
            429
          );
        }
        const waitTime = Math.ceil(backoffMs / 1000);
        throw new PayMongoError(
          `Rate limit exceeded. Next request available in ${waitTime} seconds. ` +
            `Consider using --rate-limit-max-requests to increase limits or wait before retrying.`,
          'RATE_LIMIT_EXCEEDED',
          429
        );
      }
    }

    // Prepare headers with authentication
    const env = this.config.environment;
    const secretKey = this.config.apiKeys[env]?.secret;

    if (!secretKey) {
      throw new ApiKeyError('Secret API key not found', 'secret');
    }

    const headers = {
      ...this.defaultHeaders,
      ...options.headers,
      // PayMongo uses HTTP Basic Auth with username=secret_key, password=''
      Authorization: `Basic ${Buffer.from(`${secretKey}:`).toString('base64')}`,
    };

    // Prepare request body
    let body: string | Buffer | null = null;
    if (options.body) {
      body = JSON.stringify(options.body);
    }

    // Create AbortController for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await request(url.toString(), {
        method,
        headers,
        body,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // Record successful API call for rate limiting
      if (this.rateLimiter && path) {
        const endpoint = path.replace('/v1', '');
        this.rateLimiter.recordCall(endpoint);
      }

      // Parse JSON response
      let data: unknown;
      const contentType = response.headers['content-type'];
      if (contentType && contentType.includes('application/json')) {
        data = await response.body.json();
      } else {
        data = await response.body.text();
      }

      // Handle HTTP errors
      if (response.statusCode >= 400) {
        this.handleHttpError(response.statusCode, data);
      }

      return {
        statusCode: response.statusCode,
        data,
      };
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof Error && error.name === 'AbortError') {
        throw new NetworkError(`Request timeout after ${this.timeout}ms`, error);
      }

      if (error instanceof Error && (error as ErrorWithCode).code === 'UND_ERR_CONNECT_TIMEOUT') {
        throw new NetworkError(`Connection timeout: ${error.message}`, error);
      }

      if (error instanceof Error && (error as ErrorWithCode).code === 'ENOTFOUND') {
        throw new NetworkError(`DNS resolution failed: ${error.message}`, error);
      }

      throw new NetworkError(
        `Network error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error : undefined
      );
    }
  }

  private handleHttpError(statusCode: number, data: unknown): never {
    if (statusCode === 401) {
      throw new ApiKeyError('Invalid API key or unauthorized', 'secret');
    }

    if (statusCode === 404) {
      throw new PayMongoError('Resource not found', 'RESOURCE_NOT_FOUND', statusCode);
    }

    if (statusCode >= 500) {
      throw new PayMongoError(`Server error: ${statusCode}`, `SERVER_${statusCode}`, statusCode);
    }

    // Try to parse PayMongo error format
    if (data && typeof data === 'object' && 'errors' in data) {
      const errorResponse = data as PayMongoErrorResponse;
      if (Array.isArray(errorResponse.errors) && errorResponse.errors.length > 0) {
        const error = errorResponse.errors[0];
        if (error) {
          const message = error.detail || error.title || `API error: ${statusCode}`;
          const code = error.code || `API_${statusCode}`;
          throw new PayMongoError(message, code, statusCode);
        }
      }
    }

    throw new PayMongoError(`HTTP ${statusCode}`, `HTTP_${statusCode}`, statusCode);
  }

  async validateApiKey(): Promise<void> {
    await this.makeRequest('GET', '/v1/webhooks');
  }

  // Webhook methods
  async createWebhook(url: string, events: string[]): Promise<WebhookDataWithSecret> {
    const result = await withRetry(() =>
      this.makeRequest('POST', '/v1/webhooks', {
        body: {
          data: {
            attributes: {
              url,
              events,
            },
          },
        },
      }).then((response) => (response.data as ApiResponse<WebhookDataWithSecret>).data)
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
      this.makeRequest('GET', '/v1/webhooks').then(
        (response) => (response.data as ApiResponse<WebhookData[]>).data
      )
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
      this.makeRequest('GET', `/v1/webhooks/${id}`).then(
        (response) => (response.data as ApiResponse<WebhookData>).data
      )
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
      this.makeRequest('PUT', `/v1/webhooks/${id}`, {
        body: {
          data: {
            attributes: updates,
          },
        },
      }).then((response) => (response.data as ApiResponse<WebhookData>).data)
    );
  }

  async deleteWebhook(id: string): Promise<void> {
    // Invalidate cache when deleting
    await this.cache.invalidate(`webhook_${id}`);
    await this.cache.invalidate(`webhooks_${this.config.environment}`);

    return withRetry(async () => {
      await this.makeRequest('DELETE', `/v1/webhooks/${id}`);
    });
  }

  // Payment methods (for validation and testing)
  async getPayment(id: string): Promise<PaymentDataFull> {
    return withRetry(() =>
      this.makeRequest('GET', `/v1/payments/${id}`).then(
        (response) => (response.data as ApiResponse<PaymentDataFull>).data
      )
    );
  }

  async listPayments(limit: number = 10): Promise<PaymentDataFull[]> {
    // Validate limit is within API constraints
    const validLimit = Math.max(1, Math.min(100, limit));

    const result = await withRetry(() =>
      this.makeRequest('GET', '/v1/payments', {
        params: { limit: validLimit },
      }).then((response) => (response.data as ApiResponse<PaymentDataFull[]>).data)
    );
    return result;
  }

  async createPaymentIntent(
    amount: number,
    currency: string = 'PHP',
    description?: string,
    paymentMethods: string[] = ['card', 'gcash', 'paymaya']
  ): Promise<PaymentIntentData> {
    const attributes: PaymentIntentAttributes = {
      amount,
      payment_method_allowed: paymentMethods,
      currency,
    };
    if (description !== undefined) {
      attributes.description = description;
    }

    return withRetry(() =>
      this.makeRequest('POST', '/v1/payment_intents', {
        body: {
          data: {
            attributes,
          },
        },
      }).then((response) => (response.data as ApiResponse<PaymentIntentData>).data)
    );
  }

  async confirmPaymentIntent(
    id: string,
    paymentMethodId: string,
    returnUrl?: string
  ): Promise<PaymentIntentData> {
    const attributes: PaymentIntentConfirmAttributes = {
      payment_method: paymentMethodId,
    };
    if (returnUrl !== undefined) {
      attributes.return_url = returnUrl;
    }

    return withRetry(() =>
      this.makeRequest('POST', `/v1/payment_intents/${id}/confirm`, {
        body: {
          data: {
            attributes,
          },
        },
      }).then((response) => (response.data as ApiResponse<PaymentIntentData>).data)
    );
  }

  async capturePaymentIntent(id: string): Promise<PaymentIntentData> {
    return withRetry(() =>
      this.makeRequest('POST', `/v1/payment_intents/${id}/capture`).then(
        (response) => (response.data as ApiResponse<PaymentIntentData>).data
      )
    );
  }

  async createRefund(
    paymentId: string,
    amount?: number,
    reason?: 'duplicate' | 'fraudulent' | 'requested_by_customer'
  ): Promise<RefundData> {
    const attributes: {
      amount?: number;
      reason?: 'duplicate' | 'fraudulent' | 'requested_by_customer';
    } = {};
    if (amount !== undefined) {
      attributes.amount = amount;
    }
    if (reason) {
      attributes.reason = reason;
    }

    return withRetry(() =>
      this.makeRequest('POST', '/v1/refunds', {
        body: {
          data: {
            attributes: {
              payment_id: paymentId,
              ...attributes,
            },
          },
        },
      }).then((response) => (response.data as ApiResponse<RefundData>).data)
    );
  }
}

export default ApiClient;
