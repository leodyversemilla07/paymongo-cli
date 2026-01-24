import axios, { AxiosInstance } from 'axios';
const REQUEST_TIMEOUT = 30000;

import { NetworkError, withRetry } from '../../utils/errors';
import Cache from '../../utils/cache';

export interface ApiClientOptions {
  config: any; // Temporary
  timeout?: number;
  enableCache?: boolean;
}

export class ApiClient {
  private client: AxiosInstance;
  private config: any;
  private cache: Cache;

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

    this.setupInterceptors();
  }

  private setupInterceptors(): void {
    // Request interceptor to add authentication
    this.client.interceptors.request.use((config) => {
      const env = this.config.environment;
      const secretKey = this.config.apiKeys[env]?.secret;

      if (!secretKey) {
        throw new Error('Secret API key not found');
      }

      config.auth = {
        username: secretKey,
        password: '', // PayMongo uses username-only auth
      };

      return config;
    });

    // Response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => response,
      async (error) => {
        if (axios.isAxiosError(error)) {
          const status = error.response?.status;

          if (!error.response) {
            throw new NetworkError(`Network error - no response received: ${error.message}`, error);
          }

          if (status === 401) {
            throw new Error('Invalid API key or unauthorized');
          }

          throw new Error(error.message);
        }

        throw new Error('Unknown network error');
      }
    );
  }

  async validateApiKey(): Promise<boolean> {
    try {
      await withRetry(() => this.client.get('/webhooks'));
      return true;
    } catch (error) {
      return false;
    }
  }

  // Webhook methods
  async createWebhook(url: string, events: string[]): Promise<any> {
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

  async listWebhooks(): Promise<any[]> {
    const cacheKey = `webhooks_${this.config.environment}`;

    // Try cache first for list operations
    const cached = await this.cache.get<any[]>(cacheKey);
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

  async getWebhook(id: string): Promise<any> {
    const cacheKey = `webhook_${id}`;

    // Try cache first
    const cached = await this.cache.get<any>(cacheKey);
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
  ): Promise<any> {
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
  async getPayment(id: string): Promise<any> {
    return withRetry(() =>
      this.client.get(`/payments/${id}`).then((response) => response.data.data)
    );
  }

  async listPayments(limit: number = 10): Promise<any[]> {
    const result = await withRetry(() =>
      this.client
        .get('/payments', {
          params: { limit },
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
  ): Promise<any> {
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
}

export default ApiClient;
