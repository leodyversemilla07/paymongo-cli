import { Pool } from 'undici';
import type {
  ApiResponse,
  CheckoutSessionData,
  PayMongoConfig,
  PaymentDataFull,
  PaymentIntentCreateOptions,
  PaymentIntentData,
  PaymentLinkData,
  PaymentMethodCreateOptions,
  PaymentMethodData,
  RefundData,
  RefundReason,
  SourceData,
  WebhookData,
  WebhookDataWithSecret,
} from '../../types/paymongo.js';
import {
  type CheckoutSessionCreateInput,
  CheckoutSessionCreateSchema,
  CheckoutSessionIdSchema,
  PaymentIntentAttachSchema,
  PaymentIntentCaptureSchema,
  PaymentIntentCreateSchema,
  PaymentIntentIdSchema,
  PaymentLinkCreateSchema,
  type PaymentMethodCreateInput,
  PaymentMethodCreateSchema,
  PaymentMethodIdSchema,
  parseApiInput,
  RefundCreateSchema,
} from '../../types/schemas.js';
import Cache from '../../utils/cache.js';
import {
  CACHE_TTL,
  CLI_VERSION,
  DEFAULT_PAYMENT_INTENT_METHODS,
  PAYMONGO_API_BASE,
  RATE_LIMIT_DEFAULT_MAX,
  RATE_LIMIT_ENV_MULTIPLIER,
  RATE_LIMIT_PAYMENTS_MAX,
  RATE_LIMIT_REFUNDS_MAX,
  RATE_LIMIT_WEBHOOKS_MAX,
  RATE_LIMIT_WINDOW_MS,
  REQUEST_TIMEOUT,
} from '../../utils/constants.js';
import {
  ApiKeyError,
  NetworkError,
  PayMongoError,
  ValidationError,
  withRetry,
} from '../../utils/errors.js';
import RateLimiter, { type RateLimitConfig } from './rate-limiter.js';

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
  private pool: Pool;

  constructor(options: ApiClientOptions) {
    this.config = options.config;
    this.baseUrl = PAYMONGO_API_BASE;
    this.timeout = options.timeout || REQUEST_TIMEOUT;

    this.defaultHeaders = {
      'Content-Type': 'application/json',
      'User-Agent': `paymongo-cli/${CLI_VERSION}`,
    };

    this.cache = new Cache({ ttl: CACHE_TTL });

    // Create undici pool with connection settings
    this.pool = new Pool(this.baseUrl, {
      connections: 10,
      connectTimeout: this.timeout,
    });

    // Initialize rate limiter if enabled
    const globalRateLimitDisabled = process.env.PAYMONGO_DISABLE_RATE_LIMIT === '1';
    const rateLimitEnabled =
      options.enableRateLimiting !== false &&
      !globalRateLimitDisabled &&
      this.config.rateLimiting?.enabled !== false;
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
        maxRequests: RATE_LIMIT_DEFAULT_MAX,
        windowMs: RATE_LIMIT_WINDOW_MS,
        environmentMultiplier: RATE_LIMIT_ENV_MULTIPLIER,
      },
      endpoints: {
        '/webhooks': {
          maxRequests: RATE_LIMIT_WEBHOOKS_MAX,
          windowMs: RATE_LIMIT_WINDOW_MS,
        },
        '/payments': {
          maxRequests: RATE_LIMIT_PAYMENTS_MAX,
          windowMs: RATE_LIMIT_WINDOW_MS,
        },
        '/payment_intents': {
          maxRequests: RATE_LIMIT_PAYMENTS_MAX,
          windowMs: RATE_LIMIT_WINDOW_MS,
        },
        '/refunds': {
          maxRequests: RATE_LIMIT_REFUNDS_MAX,
          windowMs: RATE_LIMIT_WINDOW_MS,
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
    if (!['test', 'live'].includes(env) || !secretKey.startsWith(`sk_${env}_`)) {
      throw new ApiKeyError('Secret API key does not match the configured environment', 'secret');
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
    timeoutId.unref?.();

    try {
      const response = await this.pool.request({
        path: url.pathname + url.search,
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
      if (contentType?.includes('application/json')) {
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

      // Preserve API codes/statuses so validation/authentication failures aren't
      // misclassified as network failures and retried.
      if (error instanceof PayMongoError || error instanceof ApiKeyError) {
        throw error;
      }

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

  async disableWebhook(id: string): Promise<WebhookData> {
    // Invalidate cache when deleting
    await this.cache.invalidate(`webhook_${id}`);
    await this.cache.invalidate(`webhooks_${this.config.environment}`);

    return withRetry(() =>
      this.makeRequest('POST', `/v1/webhooks/${id}/disable`).then(
        (response) => (response.data as ApiResponse<WebhookData>).data
      )
    );
  }

  async enableWebhook(id: string): Promise<WebhookData> {
    await this.cache.invalidate(`webhook_${id}`);
    await this.cache.invalidate(`webhooks_${this.config.environment}`);

    return withRetry(() =>
      this.makeRequest('POST', `/v1/webhooks/${id}/enable`).then(
        (response) => (response.data as ApiResponse<WebhookData>).data
      )
    );
  }

  async deleteWebhook(id: string): Promise<void> {
    await this.disableWebhook(id);
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
    paymentMethods: string[] = DEFAULT_PAYMENT_INTENT_METHODS,
    options: PaymentIntentCreateOptions = {}
  ): Promise<PaymentIntentData> {
    const result = PaymentIntentCreateSchema.safeParse({
      amount,
      payment_method_allowed: paymentMethods,
      currency,
      ...(description !== undefined && { description }),
      ...(options.captureType !== undefined && { capture_type: options.captureType }),
      ...(options.threeDSecure !== undefined && {
        payment_method_options: { card: { request_three_d_secure: options.threeDSecure } },
      }),
    });
    if (!result.success) {
      throw new ValidationError(result.error.issues.map((issue) => issue.message).join('; '));
    }
    const attributes = result.data;

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

  async attachPaymentIntent(
    id: string,
    paymentMethodId: string,
    returnUrl?: string
  ): Promise<PaymentIntentData> {
    this.validatePaymentIntentId(id);
    const result = PaymentIntentAttachSchema.safeParse({
      payment_method: paymentMethodId,
      return_url: returnUrl,
    });
    if (!result.success) {
      throw new ValidationError(result.error.issues.map((issue) => issue.message).join('; '));
    }
    const attributes = result.data;

    return withRetry(() =>
      this.makeRequest('POST', `/v1/payment_intents/${id}/attach`, {
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
    return this.attachPaymentIntent(id, paymentMethodId, returnUrl);
  }

  async capturePaymentIntent(id: string, amount?: number): Promise<PaymentIntentData> {
    this.validatePaymentIntentId(id);
    const result = PaymentIntentCaptureSchema.safeParse({ amount });
    if (!result.success) {
      throw new ValidationError(result.error.issues.map((issue) => issue.message).join('; '));
    }
    return withRetry(() =>
      this.makeRequest('POST', `/v1/payment_intents/${id}/capture`, {
        ...(amount !== undefined && { body: { data: { attributes: result.data } } }),
      }).then((response) => (response.data as ApiResponse<PaymentIntentData>).data)
    );
  }

  async createRefund(
    paymentId: string,
    amount?: number,
    reason?: RefundReason
  ): Promise<RefundData> {
    const result = RefundCreateSchema.safeParse({ payment_id: paymentId, amount, reason });
    if (!result.success) {
      throw new ValidationError(result.error.issues.map((issue) => issue.message).join('; '));
    }

    return withRetry(() =>
      this.makeRequest('POST', '/v1/refunds', {
        body: {
          data: {
            attributes: result.data,
          },
        },
      }).then((response) => (response.data as ApiResponse<RefundData>).data)
    );
  }

  // Payment Intent methods
  private validatePaymentIntentId(id: string): void {
    if (!PaymentIntentIdSchema.safeParse(id).success) {
      throw new ValidationError('Invalid payment intent ID', 'id');
    }
  }

  async getPaymentIntent(id: string): Promise<PaymentIntentData> {
    this.validatePaymentIntentId(id);
    return withRetry(() =>
      this.makeRequest('GET', `/v1/payment_intents/${id}`).then(
        (response) => (response.data as ApiResponse<PaymentIntentData>).data
      )
    );
  }

  async cancelPaymentIntent(id: string): Promise<PaymentIntentData> {
    this.validatePaymentIntentId(id);
    return withRetry(() =>
      this.makeRequest('POST', `/v1/payment_intents/${id}/cancel`).then(
        (response) => (response.data as ApiResponse<PaymentIntentData>).data
      )
    );
  }

  // Source methods (one-time payments)
  async createSource(
    amount: number,
    type: string,
    currency: string = 'PHP',
    description?: string,
    metadata?: Record<string, unknown>
  ): Promise<SourceData> {
    const attributes: {
      amount: number;
      type: string;
      currency: string;
      description?: string;
      metadata?: Record<string, unknown>;
    } = { amount, type, currency };
    if (description) attributes.description = description;
    if (metadata) attributes.metadata = metadata;

    return withRetry(() =>
      this.makeRequest('POST', '/v1/sources', {
        body: {
          data: {
            attributes,
          },
        },
      }).then((response) => (response.data as ApiResponse<SourceData>).data)
    );
  }

  async getSource(id: string): Promise<SourceData> {
    return withRetry(() =>
      this.makeRequest('GET', `/v1/sources/${id}`).then(
        (response) => (response.data as ApiResponse<SourceData>).data
      )
    );
  }

  // Payment Link methods
  async createPaymentLink(
    amount: number,
    description: string,
    currency: string = 'PHP',
    remarks?: string,
    metadata?: Record<string, string>
  ): Promise<PaymentLinkData> {
    const result = PaymentLinkCreateSchema.safeParse({
      amount,
      description,
      currency,
      remarks,
      metadata,
    });
    if (!result.success) {
      throw new ValidationError(result.error.issues.map((issue) => issue.message).join('; '));
    }

    return withRetry(() =>
      this.makeRequest('POST', '/v1/payment_links', {
        body: result.data,
      }).then((response) => (response.data as ApiResponse<PaymentLinkData>).data)
    );
  }

  async getPaymentLink(id: string): Promise<PaymentLinkData> {
    return withRetry(() =>
      this.makeRequest('GET', `/v1/payment_links/${id}`).then(
        (response) => (response.data as ApiResponse<PaymentLinkData>).data
      )
    );
  }

  async listPaymentLinks(limit: number = 25): Promise<PaymentLinkData[]> {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw new ValidationError('Limit must be an integer between 1 and 100', 'limit');
    }
    // The documented endpoint does not expose a limit query parameter.
    // Retain the CLI's display limit without sending unsupported parameters.
    const links = await withRetry(() =>
      this.makeRequest('GET', '/v1/payment_links').then(
        (response) => (response.data as ApiResponse<PaymentLinkData[]>).data
      )
    );
    return links.slice(0, limit);
  }

  /** Create a non-card method. Raw card tokenization stays in the application. */
  async createPaymentMethod(
    type: string,
    billing?: PaymentMethodCreateInput['billing'],
    metadata?: Record<string, string>,
    options: PaymentMethodCreateOptions = {}
  ): Promise<PaymentMethodData> {
    if (type === 'card') {
      throw new ValidationError(
        'Raw card creation is not supported by this CLI. Tokenize in your application or use Hosted Checkout.',
        'type'
      );
    }
    const attributes = parseApiInput(PaymentMethodCreateSchema, {
      type,
      billing,
      metadata,
      ...(options.bankCode !== undefined && { details: { bank_code: options.bankCode } }),
      ...(options.expirySeconds !== undefined && { expiry_seconds: options.expirySeconds }),
    });
    // Avoid duplicate resource creation after an ambiguous network failure.
    return withRetry(
      () =>
        this.makeRequest('POST', '/v1/payment_methods', {
          body: { data: { attributes } },
        }).then((response) => (response.data as ApiResponse<PaymentMethodData>).data),
      { maxRetries: 0 }
    );
  }

  async getPaymentMethod(id: string): Promise<PaymentMethodData> {
    parseApiInput(PaymentMethodIdSchema, id);
    return withRetry(
      () =>
        this.makeRequest('GET', `/v1/payment_methods/${id}`).then(
          (response) => (response.data as ApiResponse<PaymentMethodData>).data
        ),
      { silent: true }
    );
  }

  /** Create a Hosted Checkout Session using the documented v1 endpoint. */
  async createCheckoutSession(input: CheckoutSessionCreateInput): Promise<CheckoutSessionData> {
    const attributes = parseApiInput(CheckoutSessionCreateSchema, input);
    return withRetry(
      () =>
        this.makeRequest('POST', '/v1/checkout_sessions', {
          body: { data: { attributes } },
        }).then((response) => (response.data as ApiResponse<CheckoutSessionData>).data),
      { maxRetries: 0 }
    );
  }

  async getCheckoutSession(id: string): Promise<CheckoutSessionData> {
    parseApiInput(CheckoutSessionIdSchema, id);
    return withRetry(
      () =>
        this.makeRequest('GET', `/v1/checkout_sessions/${id}`).then(
          (response) => (response.data as ApiResponse<CheckoutSessionData>).data
        ),
      { silent: true }
    );
  }

  async expireCheckoutSession(id: string): Promise<CheckoutSessionData> {
    parseApiInput(CheckoutSessionIdSchema, id);
    return withRetry(
      () =>
        this.makeRequest('POST', `/v1/checkout_sessions/${id}/expire`).then(
          (response) => (response.data as ApiResponse<CheckoutSessionData>).data
        ),
      { maxRetries: 0 }
    );
  }

  /** Release connections, forcing teardown if graceful closure fails. */
  async close(): Promise<void> {
    try {
      await this.pool.close();
    } catch {
      await this.pool.destroy();
    }
  }
}

export default ApiClient;
