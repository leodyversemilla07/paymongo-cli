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

// Mock UndiciClient
const mockUndiciClient = {
  validateApiKey: jest.fn(),
  createWebhook: jest.fn(),
  listWebhooks: jest.fn(),
  getWebhook: jest.fn(),
  updateWebhook: jest.fn(),
  deleteWebhook: jest.fn(),
  getPayment: jest.fn(),
  listPayments: jest.fn(),
  createPaymentIntent: jest.fn(),
  confirmPaymentIntent: jest.fn(),
  capturePaymentIntent: jest.fn(),
  createRefund: jest.fn(),
};

// Mock modules before importing ApiClient
jest.unstable_mockModule('../../src/services/api/undici-client.js', () => ({
  default: jest.fn(() => mockUndiciClient),
  UndiciClient: jest.fn(() => mockUndiciClient),
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
    // Reset UndiciClient mocks
    Object.values(mockUndiciClient).forEach((mock) => {
      if (typeof mock === 'function') mock.mockReset();
    });
    MockRateLimiter.mockClear();

    apiClient = new ApiClient({ config: validConfig });
  });

  describe('constructor', () => {
    it('should create ApiClient successfully', () => {
      expect(() => new ApiClient({ config: validConfig })).not.toThrow();
    });
  });

  describe('validateApiKey', () => {
    it('should return true when API key is valid', async () => {
      mockUndiciClient.validateApiKey.mockResolvedValue(true);

      const result = await apiClient.validateApiKey();

      expect(result).toBe(true);
      expect(mockUndiciClient.validateApiKey).toHaveBeenCalled();
    });

    it('should return false when API key is invalid', async () => {
      mockUndiciClient.validateApiKey.mockResolvedValue(false);

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
      mockUndiciClient.createWebhook.mockResolvedValue(mockWebhook);

      const result = await apiClient.createWebhook(webhookUrl, events);

      expect(mockUndiciClient.createWebhook).toHaveBeenCalledWith(webhookUrl, events);
      expect(result).toEqual(mockWebhook);
    });
  });

  describe('listWebhooks', () => {
    const mockWebhooks = [
      { id: 'hook_1', attributes: { url: 'https://example.com/1' } },
      { id: 'hook_2', attributes: { url: 'https://example.com/2' } },
    ];

    it('should fetch webhooks from API', async () => {
      mockUndiciClient.listWebhooks.mockResolvedValue(mockWebhooks);

      const result = await apiClient.listWebhooks();

      expect(mockUndiciClient.listWebhooks).toHaveBeenCalled();
      expect(result).toEqual(mockWebhooks);
    });
  });

  describe('getWebhook', () => {
    const webhookId = 'hook_123';
    const mockWebhook = { id: webhookId, attributes: { url: 'https://example.com' } };

    it('should fetch webhook from API', async () => {
      mockUndiciClient.getWebhook.mockResolvedValue(mockWebhook);

      const result = await apiClient.getWebhook(webhookId);

      expect(mockUndiciClient.getWebhook).toHaveBeenCalledWith(webhookId);
      expect(result).toEqual(mockWebhook);
    });
  });

  describe('updateWebhook', () => {
    const webhookId = 'hook_123';
    const updates = { url: 'https://new.example.com', status: 'enabled' as const };
    const mockUpdatedWebhook = { id: webhookId, attributes: updates };

    it('should update webhook with correct payload', async () => {
      mockUndiciClient.updateWebhook.mockResolvedValue(mockUpdatedWebhook);

      const result = await apiClient.updateWebhook(webhookId, updates);

      expect(mockUndiciClient.updateWebhook).toHaveBeenCalledWith(webhookId, updates);
      expect(result).toEqual(mockUpdatedWebhook);
    });
  });

  describe('deleteWebhook', () => {
    const webhookId = 'hook_123';

    it('should delete webhook', async () => {
      mockUndiciClient.deleteWebhook.mockResolvedValue(undefined);

      await apiClient.deleteWebhook(webhookId);

      expect(mockUndiciClient.deleteWebhook).toHaveBeenCalledWith(webhookId);
    });
  });

  describe('getPayment', () => {
    const paymentId = 'pay_123';
    const mockPayment = { id: paymentId, attributes: { amount: 10000 } };

    it('should fetch payment by ID', async () => {
      mockUndiciClient.getPayment.mockResolvedValue(mockPayment);

      const result = await apiClient.getPayment(paymentId);

      expect(mockUndiciClient.getPayment).toHaveBeenCalledWith(paymentId);
      expect(result).toEqual(mockPayment);
    });
  });

  describe('listPayments', () => {
    const mockPayments = [
      { id: 'pay_1', attributes: { amount: 10000 } },
      { id: 'pay_2', attributes: { amount: 20000 } },
    ];

    it('should list payments with default limit', async () => {
      mockUndiciClient.listPayments.mockResolvedValue(mockPayments);

      const result = await apiClient.listPayments();

      expect(mockUndiciClient.listPayments).toHaveBeenCalledWith(10);
      expect(result).toEqual(mockPayments);
    });

    it('should list payments with custom limit', async () => {
      mockUndiciClient.listPayments.mockResolvedValue(mockPayments);

      await apiClient.listPayments(25);

      expect(mockUndiciClient.listPayments).toHaveBeenCalledWith(25);
    });
  });

  describe('createPaymentIntent', () => {
    const mockPaymentIntent = { id: 'pi_123', attributes: { amount: 10000 } };

    it('should create payment intent with required parameters', async () => {
      mockUndiciClient.createPaymentIntent.mockResolvedValue(mockPaymentIntent);

      const result = await apiClient.createPaymentIntent(10000);

      expect(mockUndiciClient.createPaymentIntent).toHaveBeenCalledWith(10000, 'PHP', undefined, [
        'card',
        'gcash',
        'paymaya',
      ]);
      expect(result).toEqual(mockPaymentIntent);
    });

    it('should create payment intent with all parameters', async () => {
      mockUndiciClient.createPaymentIntent.mockResolvedValue(mockPaymentIntent);

      await apiClient.createPaymentIntent(50000, 'USD', 'Test payment', ['card']);

      expect(mockUndiciClient.createPaymentIntent).toHaveBeenCalledWith(
        50000,
        'USD',
        'Test payment',
        ['card']
      );
    });
  });

  // Rate limiting tests - TODO: Update for UndiciClient internal rate limiting
  // describe('rate limiting', () => {
  //   const configWithRateLimiting = {
  //     ...validConfig,
  //     rateLimiting: {
  //       enabled: true,
  //       maxRequests: 50,
  //       windowMs: 60000,
  //     },
  //   };

  //   it('should initialize rate limiter when enabled', () => {
  //     jest.clearAllMocks();
  //     new ApiClient({ config: configWithRateLimiting });

  //     expect(MockRateLimiter).toHaveBeenCalledWith(configWithRateLimiting, expect.any(Object));
  //   });

  //   it('should not initialize rate limiter when disabled', () => {
  //     jest.clearAllMocks();
  //     new ApiClient({ config: validConfig, enableRateLimiting: false });

  //     expect(MockRateLimiter).not.toHaveBeenCalled();
  //   });

  //   it('should check rate limits in request interceptor', async () => {
  //     new ApiClient({ config: configWithRateLimiting });

  //     // Mock the interceptors to actually call the rate limiter
  //     const requestInterceptor = mockAxiosInstance.interceptors.request.use.mock.calls[0][0];
  //     const mockConfig = { url: '/webhooks' };

  //     await requestInterceptor(mockConfig);

  //     expect(mockRateLimiter.checkLimit).toHaveBeenCalledWith('/webhooks');
  //   });

  //   it('should throw error when rate limit exceeded', async () => {
  //     mockRateLimiter.checkLimit.mockReturnValue({ allowed: false, backoffMs: 5000 });
  //     new ApiClient({ config: configWithRateLimiting });

  //     const requestInterceptor = mockAxiosInstance.interceptors.request.use.mock.calls[0][0];
  //     const mockConfig = { url: '/webhooks' };

  //     await expect(requestInterceptor(mockConfig)).rejects.toThrow('Rate limit exceeded');
  //   });

  //   it('should record successful calls in response interceptor', async () => {
  //     new ApiClient({ config: configWithRateLimiting });

  //     const responseInterceptor = mockAxiosInstance.interceptors.response.use.mock.calls[0][0];
  //     const mockResponse = { config: { url: '/webhooks' }, data: {} };

  //     const result = await responseInterceptor(mockResponse);

  //     expect(mockRateLimiter.recordCall).toHaveBeenCalledWith('/webhooks');
  //     expect(result).toBe(mockResponse);
  //   });
  // });

  // Error handling tests - TODO: Update for UndiciClient error handling
  // describe('detailed error handling', () => {
  //   let errorInterceptor: any;

  //   beforeEach(() => {
  //     new ApiClient({ config: validConfig });
  //     errorInterceptor = mockAxiosInstance.interceptors.response.use.mock.calls[0][1];
  //   });

  //   it('should handle 401 unauthorized errors', async () => {
  //     const axiosError = {
  //       isAxiosError: true,
  //       response: { status: 401 },
  //       message: 'Unauthorized',
  //     };

  //     await expect(errorInterceptor(axiosError)).rejects.toThrow('Invalid API key or unauthorized');
  //   });

  //   it('should handle 404 not found errors', async () => {
  //     const axiosError = {
  //       isAxiosError: true,
  //       response: { status: 404 },
  //       message: 'Not Found',
  //     };

  //     await expect(errorInterceptor(axiosError)).rejects.toThrow('Resource not found');
  //   });

  //   it('should handle 5xx server errors', async () => {
  //     const axiosError = {
  //       isAxiosError: true,
  //       response: { status: 500 },
  //       message: 'Internal Server Error',
  //     };

  //     await expect(errorInterceptor(axiosError)).rejects.toThrow(
  //       'Server error: Internal Server Error'
  //     );
  //   });

  //   it('should handle network errors without response', async () => {
  //     const axiosError = {
  //       isAxiosError: true,
  //       response: undefined,
  //       message: 'Network Error',
  //     };

  //     await expect(errorInterceptor(axiosError)).rejects.toThrow(
  //       'Network error - no response received: Network Error'
  //     );
  //   });

  //   it('should handle generic API errors', async () => {
  //     const axiosError = {
  //       isAxiosError: true,
  //       response: { status: 422 },
  //       message: 'Unprocessable Entity',
  //     };

  //     await expect(errorInterceptor(axiosError)).rejects.toThrow('Unprocessable Entity');
  //   });
  // });

  describe('confirmPaymentIntent', () => {
    const paymentIntentId = 'pi_123';
    const paymentMethodId = 'pm_456';
    const returnUrl = 'https://example.com/return';
    const mockConfirmedIntent = { id: paymentIntentId, attributes: { status: 'succeeded' } };

    it('should confirm payment intent with payment method only', async () => {
      mockUndiciClient.confirmPaymentIntent.mockResolvedValue(mockConfirmedIntent);

      const result = await apiClient.confirmPaymentIntent(paymentIntentId, paymentMethodId);

      expect(mockUndiciClient.confirmPaymentIntent).toHaveBeenCalledWith(
        paymentIntentId,
        paymentMethodId,
        undefined
      );
      expect(result).toEqual(mockConfirmedIntent);
    });

    it('should confirm payment intent with return URL', async () => {
      mockUndiciClient.confirmPaymentIntent.mockResolvedValue(mockConfirmedIntent);

      await apiClient.confirmPaymentIntent(paymentIntentId, paymentMethodId, returnUrl);

      expect(mockUndiciClient.confirmPaymentIntent).toHaveBeenCalledWith(
        paymentIntentId,
        paymentMethodId,
        returnUrl
      );
    });
  });

  describe('capturePaymentIntent', () => {
    const paymentIntentId = 'pi_123';
    const mockCapturedIntent = { id: paymentIntentId, attributes: { status: 'succeeded' } };

    it('should capture payment intent', async () => {
      mockUndiciClient.capturePaymentIntent.mockResolvedValue(mockCapturedIntent);

      const result = await apiClient.capturePaymentIntent(paymentIntentId);

      expect(mockUndiciClient.capturePaymentIntent).toHaveBeenCalledWith(paymentIntentId);
      expect(result).toEqual(mockCapturedIntent);
    });
  });

  describe('createRefund', () => {
    const paymentId = 'pay_123';
    const mockRefund = { id: 'ref_456', attributes: { amount: 5000 } };

    it('should create refund with payment ID only', async () => {
      mockUndiciClient.createRefund.mockResolvedValue(mockRefund);

      const result = await apiClient.createRefund(paymentId);

      expect(mockUndiciClient.createRefund).toHaveBeenCalledWith(paymentId, undefined, undefined);
      expect(result).toEqual(mockRefund);
    });

    it('should create refund with amount', async () => {
      mockUndiciClient.createRefund.mockResolvedValue(mockRefund);

      await apiClient.createRefund(paymentId, 5000);

      expect(mockUndiciClient.createRefund).toHaveBeenCalledWith(paymentId, 5000, undefined);
    });

    it('should create refund with reason', async () => {
      mockUndiciClient.createRefund.mockResolvedValue(mockRefund);

      await apiClient.createRefund(paymentId, undefined, 'fraudulent');

      expect(mockUndiciClient.createRefund).toHaveBeenCalledWith(
        paymentId,
        undefined,
        'fraudulent'
      );
    });

    it('should create refund with amount and reason', async () => {
      mockUndiciClient.createRefund.mockResolvedValue(mockRefund);

      await apiClient.createRefund(paymentId, 7500, 'requested_by_customer');

      expect(mockUndiciClient.createRefund).toHaveBeenCalledWith(
        paymentId,
        7500,
        'requested_by_customer'
      );
    });
  });
});
