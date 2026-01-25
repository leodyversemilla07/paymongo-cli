import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// Create mock cache
const mockCache = {
  get: jest.fn<(key: string) => Promise<any>>(),
  set: jest.fn<(key: string, value: any) => Promise<void>>(),
  invalidate: jest.fn<(key: string) => Promise<void>>(),
  clear: jest.fn<() => Promise<void>>(),
};

// Create mock Cache class
const MockCache = jest.fn((_options?: any) => mockCache);

// Create mock axios instance
const mockAxiosInstance = {
  get: jest.fn<(url: string, config?: any) => Promise<any>>(),
  post: jest.fn<(url: string, data?: any, config?: any) => Promise<any>>(),
  put: jest.fn<(url: string, data?: any, config?: any) => Promise<any>>(),
  delete: jest.fn<(url: string, config?: any) => Promise<any>>(),
  interceptors: {
    request: { use: jest.fn<(fn: any) => void>() },
    response: { use: jest.fn<(success: any, error: any) => void>() },
  },
};

// Create mock axios
const mockAxios = {
  create: jest.fn<(config: any) => typeof mockAxiosInstance>(),
  isAxiosError: jest.fn<(error: any) => boolean>(),
};

// Create mock rate limiter
const mockRateLimiter = {
  checkLimit:
    jest.fn<
      (endpoint: string) => { allowed: boolean; backoffMs?: number; remainingRequests?: number }
    >(),
  recordCall: jest.fn<(endpoint: string) => void>(),
};

// Create mock RateLimiter class
const MockRateLimiter = jest.fn((_config, _rateLimitConfig) => mockRateLimiter);

// Mock modules before importing ApiClient
jest.unstable_mockModule('axios', () => ({
  default: mockAxios,
}));

jest.unstable_mockModule('../../src/utils/cache.js', () => ({
  default: MockCache,
}));

jest.unstable_mockModule('../../src/services/api/rate-limiter.js', () => ({
  default: MockRateLimiter,
}));

// Import after mocking
const { ApiClient } = await import('../../src/services/api/client.js');

describe('ApiClient', () => {
  let apiClient: InstanceType<typeof ApiClient>;

  const validConfig = {
    version: '1.0.0',
    projectName: 'test-project',
    environment: 'test' as const,
    apiKeys: {
      test: {
        public: 'pk_test_1234567890123456789012',
        secret: 'sk_test_1234567890123456789012',
      },
    },
    webhooks: {
      url: 'https://example.com',
      events: ['payment.paid'],
    },
    webhookSecrets: {},
    dev: {
      port: 3000,
      autoRegisterWebhook: false,
      verifyWebhookSignatures: false,
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    // Reset mocks
    mockCache.get.mockResolvedValue(null);
    mockCache.set.mockResolvedValue(undefined);
    mockCache.invalidate.mockResolvedValue(undefined);
    mockCache.clear.mockResolvedValue(undefined);
    mockRateLimiter.checkLimit.mockImplementation(() => ({ allowed: true }));
    mockRateLimiter.recordCall.mockImplementation(() => {});
    mockAxiosInstance.get.mockReset();
    mockAxiosInstance.post.mockReset();
    mockAxiosInstance.put.mockReset();
    mockAxiosInstance.delete.mockReset();
    mockAxios.create.mockReturnValue(mockAxiosInstance as any);
    mockAxios.isAxiosError.mockImplementation((error: any) => error?.isAxiosError === true);
    MockRateLimiter.mockClear();

    apiClient = new ApiClient({ config: validConfig });
  });

  describe('constructor', () => {
    it('should create axios instance with correct base URL', () => {
      expect(mockAxios.create).toHaveBeenCalledWith(
        expect.objectContaining({
          baseURL: 'https://api.paymongo.com/v1',
        })
      );
    });

    it('should set default timeout', () => {
      expect(mockAxios.create).toHaveBeenCalledWith(
        expect.objectContaining({
          timeout: 30000,
        })
      );
    });

    it('should use custom timeout when provided', () => {
      jest.clearAllMocks();
      new ApiClient({ config: validConfig, timeout: 5000 });
      expect(mockAxios.create).toHaveBeenCalledWith(
        expect.objectContaining({
          timeout: 5000,
        })
      );
    });

    it('should setup request and response interceptors', () => {
      expect(mockAxiosInstance.interceptors.request.use).toHaveBeenCalled();
      expect(mockAxiosInstance.interceptors.response.use).toHaveBeenCalled();
    });

    it('should initialize cache with 2 minute TTL', () => {
      expect(MockCache).toHaveBeenCalledWith({ ttl: 2 * 60 * 1000 });
    });
  });

  describe('validateApiKey', () => {
    it('should return true when API key is valid', async () => {
      mockAxiosInstance.get.mockResolvedValue({ data: { data: [] } });

      const result = await apiClient.validateApiKey();

      expect(result).toBe(true);
      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/webhooks');
    });

    it('should return false when API key is invalid', async () => {
      mockAxiosInstance.get.mockRejectedValue(new Error('Invalid API key'));

      const result = await apiClient.validateApiKey();

      expect(result).toBe(false);
    });
  });

  describe('createWebhook', () => {
    const webhookUrl = 'https://example.com/webhook';
    const events = ['payment.paid', 'payment.failed'];
    const mockWebhook = {
      id: 'hook_123',
      attributes: { url: webhookUrl, events },
    };

    it('should create webhook with correct payload', async () => {
      mockAxiosInstance.post.mockResolvedValue({ data: { data: mockWebhook } });

      const result = await apiClient.createWebhook(webhookUrl, events);

      expect(mockAxiosInstance.post).toHaveBeenCalledWith('/webhooks', {
        data: {
          attributes: {
            url: webhookUrl,
            events,
          },
        },
      });
      expect(result).toEqual(mockWebhook);
    });

    it('should invalidate webhook list cache after creation', async () => {
      mockAxiosInstance.post.mockResolvedValue({ data: { data: mockWebhook } });

      await apiClient.createWebhook(webhookUrl, events);

      expect(mockCache.invalidate).toHaveBeenCalledWith('webhooks_test');
    });
  });

  describe('listWebhooks', () => {
    const mockWebhooks = [
      { id: 'hook_1', attributes: { url: 'https://example.com/1' } },
      { id: 'hook_2', attributes: { url: 'https://example.com/2' } },
    ];

    it('should return cached webhooks if available', async () => {
      mockCache.get.mockResolvedValue(mockWebhooks);

      const result = await apiClient.listWebhooks();

      expect(result).toEqual(mockWebhooks);
      expect(mockAxiosInstance.get).not.toHaveBeenCalled();
    });

    it('should fetch webhooks from API when cache miss', async () => {
      mockCache.get.mockResolvedValue(null);
      mockAxiosInstance.get.mockResolvedValue({ data: { data: mockWebhooks } });

      const result = await apiClient.listWebhooks();

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/webhooks');
      expect(result).toEqual(mockWebhooks);
    });

    it('should cache webhook list after fetching', async () => {
      mockCache.get.mockResolvedValue(null);
      mockAxiosInstance.get.mockResolvedValue({ data: { data: mockWebhooks } });

      await apiClient.listWebhooks();

      expect(mockCache.set).toHaveBeenCalledWith('webhooks_test', mockWebhooks);
    });
  });

  describe('getWebhook', () => {
    const webhookId = 'hook_123';
    const mockWebhook = { id: webhookId, attributes: { url: 'https://example.com' } };

    it('should return cached webhook if available', async () => {
      mockCache.get.mockResolvedValue(mockWebhook);

      const result = await apiClient.getWebhook(webhookId);

      expect(result).toEqual(mockWebhook);
      expect(mockAxiosInstance.get).not.toHaveBeenCalled();
    });

    it('should fetch webhook from API when cache miss', async () => {
      mockCache.get.mockResolvedValue(null);
      mockAxiosInstance.get.mockResolvedValue({ data: { data: mockWebhook } });

      const result = await apiClient.getWebhook(webhookId);

      expect(mockAxiosInstance.get).toHaveBeenCalledWith(`/webhooks/${webhookId}`);
      expect(result).toEqual(mockWebhook);
    });

    it('should cache webhook after fetching', async () => {
      mockCache.get.mockResolvedValue(null);
      mockAxiosInstance.get.mockResolvedValue({ data: { data: mockWebhook } });

      await apiClient.getWebhook(webhookId);

      expect(mockCache.set).toHaveBeenCalledWith(`webhook_${webhookId}`, mockWebhook);
    });
  });

  describe('updateWebhook', () => {
    const webhookId = 'hook_123';
    const updates = { url: 'https://new.example.com', status: 'enabled' as const };
    const mockUpdatedWebhook = { id: webhookId, attributes: updates };

    it('should update webhook with correct payload', async () => {
      mockAxiosInstance.put.mockResolvedValue({ data: { data: mockUpdatedWebhook } });

      const result = await apiClient.updateWebhook(webhookId, updates);

      expect(mockAxiosInstance.put).toHaveBeenCalledWith(`/webhooks/${webhookId}`, {
        data: {
          attributes: updates,
        },
      });
      expect(result).toEqual(mockUpdatedWebhook);
    });

    it('should invalidate both specific and list cache', async () => {
      mockAxiosInstance.put.mockResolvedValue({ data: { data: mockUpdatedWebhook } });

      await apiClient.updateWebhook(webhookId, updates);

      expect(mockCache.invalidate).toHaveBeenCalledWith(`webhook_${webhookId}`);
      expect(mockCache.invalidate).toHaveBeenCalledWith('webhooks_test');
    });
  });

  describe('deleteWebhook', () => {
    const webhookId = 'hook_123';

    it('should delete webhook', async () => {
      mockAxiosInstance.delete.mockResolvedValue({});

      await apiClient.deleteWebhook(webhookId);

      expect(mockAxiosInstance.delete).toHaveBeenCalledWith(`/webhooks/${webhookId}`);
    });

    it('should invalidate both specific and list cache', async () => {
      mockAxiosInstance.delete.mockResolvedValue({});

      await apiClient.deleteWebhook(webhookId);

      expect(mockCache.invalidate).toHaveBeenCalledWith(`webhook_${webhookId}`);
      expect(mockCache.invalidate).toHaveBeenCalledWith('webhooks_test');
    });
  });

  describe('getPayment', () => {
    const paymentId = 'pay_123';
    const mockPayment = { id: paymentId, attributes: { amount: 10000 } };

    it('should fetch payment by ID', async () => {
      mockAxiosInstance.get.mockResolvedValue({ data: { data: mockPayment } });

      const result = await apiClient.getPayment(paymentId);

      expect(mockAxiosInstance.get).toHaveBeenCalledWith(`/payments/${paymentId}`);
      expect(result).toEqual(mockPayment);
    });
  });

  describe('listPayments', () => {
    const mockPayments = [
      { id: 'pay_1', attributes: { amount: 10000 } },
      { id: 'pay_2', attributes: { amount: 20000 } },
    ];

    it('should list payments with default limit', async () => {
      mockAxiosInstance.get.mockResolvedValue({ data: { data: mockPayments } });

      const result = await apiClient.listPayments();

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/payments', {
        params: { limit: 10 },
      });
      expect(result).toEqual(mockPayments);
    });

    it('should list payments with custom limit', async () => {
      mockAxiosInstance.get.mockResolvedValue({ data: { data: mockPayments } });

      await apiClient.listPayments(25);

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/payments', {
        params: { limit: 25 },
      });
    });
  });

  describe('createPaymentIntent', () => {
    const mockPaymentIntent = { id: 'pi_123', attributes: { amount: 10000 } };

    it('should create payment intent with required parameters', async () => {
      mockAxiosInstance.post.mockResolvedValue({ data: { data: mockPaymentIntent } });

      const result = await apiClient.createPaymentIntent(10000);

      expect(mockAxiosInstance.post).toHaveBeenCalledWith('/payment_intents', {
        data: {
          attributes: {
            amount: 10000,
            payment_method_allowed: ['card', 'gcash', 'paymaya'],
            currency: 'PHP',
            description: undefined,
          },
        },
      });
      expect(result).toEqual(mockPaymentIntent);
    });

    it('should create payment intent with all parameters', async () => {
      mockAxiosInstance.post.mockResolvedValue({ data: { data: mockPaymentIntent } });

      await apiClient.createPaymentIntent(50000, 'USD', 'Test payment', ['card']);

      expect(mockAxiosInstance.post).toHaveBeenCalledWith('/payment_intents', {
        data: {
          attributes: {
            amount: 50000,
            payment_method_allowed: ['card'],
            currency: 'USD',
            description: 'Test payment',
          },
        },
      });
    });
  });

  describe('rate limiting', () => {
    const configWithRateLimiting = {
      ...validConfig,
      rateLimiting: {
        enabled: true,
        maxRequests: 50,
        windowMs: 60000,
      },
    };

    it('should initialize rate limiter when enabled', () => {
      jest.clearAllMocks();
      new ApiClient({ config: configWithRateLimiting });

      expect(MockRateLimiter).toHaveBeenCalledWith(configWithRateLimiting, expect.any(Object));
    });

    it('should not initialize rate limiter when disabled', () => {
      jest.clearAllMocks();
      new ApiClient({ config: validConfig, enableRateLimiting: false });

      expect(MockRateLimiter).not.toHaveBeenCalled();
    });

    it('should check rate limits in request interceptor', async () => {
      new ApiClient({ config: configWithRateLimiting });

      // Mock the interceptors to actually call the rate limiter
      const requestInterceptor = mockAxiosInstance.interceptors.request.use.mock.calls[0][0];
      const mockConfig = { url: '/webhooks' };

      await requestInterceptor(mockConfig);

      expect(mockRateLimiter.checkLimit).toHaveBeenCalledWith('/webhooks');
    });

    it('should throw error when rate limit exceeded', async () => {
      mockRateLimiter.checkLimit.mockReturnValue({ allowed: false, backoffMs: 5000 });
      new ApiClient({ config: configWithRateLimiting });

      const requestInterceptor = mockAxiosInstance.interceptors.request.use.mock.calls[0][0];
      const mockConfig = { url: '/webhooks' };

      await expect(requestInterceptor(mockConfig)).rejects.toThrow('Rate limit exceeded');
    });

    it('should record successful calls in response interceptor', async () => {
      new ApiClient({ config: configWithRateLimiting });

      const responseInterceptor = mockAxiosInstance.interceptors.response.use.mock.calls[0][0];
      const mockResponse = { config: { url: '/webhooks' }, data: {} };

      const result = await responseInterceptor(mockResponse);

      expect(mockRateLimiter.recordCall).toHaveBeenCalledWith('/webhooks');
      expect(result).toBe(mockResponse);
    });
  });

  describe('detailed error handling', () => {
    let errorInterceptor: any;

    beforeEach(() => {
      new ApiClient({ config: validConfig });
      errorInterceptor = mockAxiosInstance.interceptors.response.use.mock.calls[0][1];
    });

    it('should handle 401 unauthorized errors', async () => {
      const axiosError = {
        isAxiosError: true,
        response: { status: 401 },
        message: 'Unauthorized',
      };

      await expect(errorInterceptor(axiosError)).rejects.toThrow('Invalid API key or unauthorized');
    });

    it('should handle 404 not found errors', async () => {
      const axiosError = {
        isAxiosError: true,
        response: { status: 404 },
        message: 'Not Found',
      };

      await expect(errorInterceptor(axiosError)).rejects.toThrow('Resource not found');
    });

    it('should handle 5xx server errors', async () => {
      const axiosError = {
        isAxiosError: true,
        response: { status: 500 },
        message: 'Internal Server Error',
      };

      await expect(errorInterceptor(axiosError)).rejects.toThrow(
        'Server error: Internal Server Error'
      );
    });

    it('should handle network errors without response', async () => {
      const axiosError = {
        isAxiosError: true,
        response: undefined,
        message: 'Network Error',
      };

      await expect(errorInterceptor(axiosError)).rejects.toThrow(
        'Network error - no response received: Network Error'
      );
    });

    it('should handle generic API errors', async () => {
      const axiosError = {
        isAxiosError: true,
        response: { status: 422 },
        message: 'Unprocessable Entity',
      };

      await expect(errorInterceptor(axiosError)).rejects.toThrow('Unprocessable Entity');
    });
  });

  describe('confirmPaymentIntent', () => {
    const paymentIntentId = 'pi_123';
    const paymentMethodId = 'pm_456';
    const returnUrl = 'https://example.com/return';
    const mockConfirmedIntent = { id: paymentIntentId, attributes: { status: 'succeeded' } };

    it('should confirm payment intent with payment method only', async () => {
      mockAxiosInstance.post.mockResolvedValue({ data: { data: mockConfirmedIntent } });

      const result = await apiClient.confirmPaymentIntent(paymentIntentId, paymentMethodId);

      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        `/payment_intents/${paymentIntentId}/confirm`,
        {
          data: {
            attributes: {
              payment_method: paymentMethodId,
              return_url: undefined,
            },
          },
        }
      );
      expect(result).toEqual(mockConfirmedIntent);
    });

    it('should confirm payment intent with return URL', async () => {
      mockAxiosInstance.post.mockResolvedValue({ data: { data: mockConfirmedIntent } });

      await apiClient.confirmPaymentIntent(paymentIntentId, paymentMethodId, returnUrl);

      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        `/payment_intents/${paymentIntentId}/confirm`,
        {
          data: {
            attributes: {
              payment_method: paymentMethodId,
              return_url: returnUrl,
            },
          },
        }
      );
    });
  });

  describe('capturePaymentIntent', () => {
    const paymentIntentId = 'pi_123';
    const mockCapturedIntent = { id: paymentIntentId, attributes: { status: 'succeeded' } };

    it('should capture payment intent', async () => {
      mockAxiosInstance.post.mockResolvedValue({ data: { data: mockCapturedIntent } });

      const result = await apiClient.capturePaymentIntent(paymentIntentId);

      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        `/payment_intents/${paymentIntentId}/capture`
      );
      expect(result).toEqual(mockCapturedIntent);
    });
  });

  describe('createRefund', () => {
    const paymentId = 'pay_123';
    const mockRefund = { id: 'ref_456', attributes: { amount: 5000 } };

    it('should create refund with payment ID only', async () => {
      mockAxiosInstance.post.mockResolvedValue({ data: { data: mockRefund } });

      const result = await apiClient.createRefund(paymentId);

      expect(mockAxiosInstance.post).toHaveBeenCalledWith('/refunds', {
        data: {
          attributes: {
            payment_id: paymentId,
          },
        },
      });
      expect(result).toEqual(mockRefund);
    });

    it('should create refund with amount', async () => {
      mockAxiosInstance.post.mockResolvedValue({ data: { data: mockRefund } });

      await apiClient.createRefund(paymentId, 5000);

      expect(mockAxiosInstance.post).toHaveBeenCalledWith('/refunds', {
        data: {
          attributes: {
            payment_id: paymentId,
            amount: 5000,
          },
        },
      });
    });

    it('should create refund with reason', async () => {
      mockAxiosInstance.post.mockResolvedValue({ data: { data: mockRefund } });

      await apiClient.createRefund(paymentId, undefined, 'fraudulent');

      expect(mockAxiosInstance.post).toHaveBeenCalledWith('/refunds', {
        data: {
          attributes: {
            payment_id: paymentId,
            reason: 'fraudulent',
          },
        },
      });
    });

    it('should create refund with amount and reason', async () => {
      mockAxiosInstance.post.mockResolvedValue({ data: { data: mockRefund } });

      await apiClient.createRefund(paymentId, 7500, 'requested_by_customer');

      expect(mockAxiosInstance.post).toHaveBeenCalledWith('/refunds', {
        data: {
          attributes: {
            payment_id: paymentId,
            amount: 7500,
            reason: 'requested_by_customer',
          },
        },
      });
    });
  });
});
