import { beforeEach, describe, expect, it, vi as jest } from 'vitest';

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

// Create mock request for Pool instance
const mockPoolRequest = jest.fn<any>();

// Create mock Pool class
const MockPool = jest.fn((_url: string, _options?: any) => ({
  request: mockPoolRequest,
  close: jest.fn<() => Promise<void>>(),
}));

// Mock modules before importing ApiClient
jest.mock('undici', () => ({
  Pool: MockPool,
}));

jest.mock('../../src/utils/cache.js', () => ({
  default: MockCache,
}));

jest.mock('../../src/services/api/rate-limiter.js', () => ({
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
    mockPoolRequest.mockReset();
    MockRateLimiter.mockClear();
    delete process.env.PAYMONGO_DISABLE_RATE_LIMIT;

    apiClient = new ApiClient({ config: validConfig });
  });

  describe('constructor', () => {
    it('should create ApiClient successfully', () => {
      expect(() => new ApiClient({ config: validConfig })).not.toThrow();
    });

    it('should not initialize rate limiting when globally disabled', () => {
      process.env.PAYMONGO_DISABLE_RATE_LIMIT = '1';
      MockRateLimiter.mockClear();

      new ApiClient({
        config: {
          ...validConfig,
          rateLimiting: {
            enabled: true,
            maxRequests: 100,
            windowMs: 60000,
          },
        },
      });

      expect(MockRateLimiter).not.toHaveBeenCalled();
    });
  });

  describe('validateApiKey', () => {
    it('should resolve when API key is valid', async () => {
      mockPoolRequest.mockResolvedValue({
        statusCode: 200,
        headers: { 'content-type': 'application/json' },
        body: { json: () => Promise.resolve({ data: [] }), text: () => Promise.resolve('') },
      });

      await expect(apiClient.validateApiKey()).resolves.toBeUndefined();
      expect(mockPoolRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          path: '/v1/webhooks',
          method: 'GET',
          headers: expect.objectContaining({
            Authorization: expect.stringContaining('Basic'),
          }),
        })
      );
    });

    it('should throw when API key is invalid', async () => {
      mockPoolRequest.mockResolvedValue({
        statusCode: 401,
        headers: { 'content-type': 'application/json' },
        body: {
          json: () => Promise.resolve({ errors: [{ detail: 'Invalid API key' }] }),
          text: () => Promise.resolve(''),
        },
      });

      await expect(apiClient.validateApiKey()).rejects.toThrow('Invalid API key or unauthorized');
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
      mockPoolRequest.mockResolvedValue({
        statusCode: 200,
        headers: { 'content-type': 'application/json' },
        body: {
          json: () => Promise.resolve({ data: mockWebhook }),
          text: () => Promise.resolve(''),
        },
      });

      const result = await apiClient.createWebhook(webhookUrl, events);

      expect(mockPoolRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          path: '/v1/webhooks',
          method: 'POST',
          body: JSON.stringify({
            data: {
              attributes: {
                url: webhookUrl,
                events,
              },
            },
          }),
        })
      );
      expect(result).toEqual(mockWebhook);
    });
  });

  describe('listWebhooks', () => {
    const mockWebhooks = [
      { id: 'hook_1', attributes: { url: 'https://example.com/1' } },
      { id: 'hook_2', attributes: { url: 'https://example.com/2' } },
    ];

    it('should fetch webhooks from API', async () => {
      mockPoolRequest.mockResolvedValue({
        statusCode: 200,
        headers: { 'content-type': 'application/json' },
        body: {
          json: () => Promise.resolve({ data: mockWebhooks }),
          text: () => Promise.resolve(''),
        },
      });

      const result = await apiClient.listWebhooks();

      expect(mockPoolRequest).toHaveBeenCalledWith(
        expect.objectContaining({ path: '/v1/webhooks', method: 'GET' })
      );
      expect(result).toEqual(mockWebhooks);
    });
  });

  describe('getWebhook', () => {
    const webhookId = 'hook_123';
    const mockWebhook = { id: webhookId, attributes: { url: 'https://example.com' } };

    it('should fetch webhook from API', async () => {
      mockPoolRequest.mockResolvedValue({
        statusCode: 200,
        headers: { 'content-type': 'application/json' },
        body: {
          json: () => Promise.resolve({ data: mockWebhook }),
          text: () => Promise.resolve(''),
        },
      });

      const result = await apiClient.getWebhook(webhookId);

      expect(mockPoolRequest).toHaveBeenCalledWith(
        expect.objectContaining({ path: `/v1/webhooks/${webhookId}`, method: 'GET' })
      );
      expect(result).toEqual(mockWebhook);
    });
  });

  describe('updateWebhook', () => {
    const webhookId = 'hook_123';
    const updates = { url: 'https://new.example.com', status: 'enabled' as const };
    const mockUpdatedWebhook = { id: webhookId, attributes: updates };

    it('should update webhook with correct payload', async () => {
      mockPoolRequest.mockResolvedValue({
        statusCode: 200,
        headers: { 'content-type': 'application/json' },
        body: {
          json: () => Promise.resolve({ data: mockUpdatedWebhook }),
          text: () => Promise.resolve(''),
        },
      });

      const result = await apiClient.updateWebhook(webhookId, updates);

      expect(mockPoolRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          path: `/v1/webhooks/${webhookId}`,
          method: 'PUT',
          body: JSON.stringify({
            data: {
              attributes: updates,
            },
          }),
        })
      );
      expect(result).toEqual(mockUpdatedWebhook);
    });
  });

  describe('disableWebhook', () => {
    const webhookId = 'hook_123';

    it('should disable webhook', async () => {
      mockPoolRequest.mockResolvedValue({
        statusCode: 200,
        headers: { 'content-type': 'application/json' },
        body: {
          json: () =>
            Promise.resolve({ data: { id: webhookId, attributes: { status: 'disabled' } } }),
          text: () => Promise.resolve(''),
        },
      });

      await apiClient.disableWebhook(webhookId);

      expect(mockPoolRequest).toHaveBeenCalledWith(
        expect.objectContaining({ path: `/v1/webhooks/${webhookId}/disable`, method: 'POST' })
      );
    });
  });

  describe('getPayment', () => {
    const paymentId = 'pay_123';
    const mockPayment = { id: paymentId, attributes: { amount: 10000 } };

    it('should fetch payment by ID', async () => {
      mockPoolRequest.mockResolvedValue({
        statusCode: 200,
        headers: { 'content-type': 'application/json' },
        body: {
          json: () => Promise.resolve({ data: mockPayment }),
          text: () => Promise.resolve(''),
        },
      });

      const result = await apiClient.getPayment(paymentId);

      expect(mockPoolRequest).toHaveBeenCalledWith(
        expect.objectContaining({ path: `/v1/payments/${paymentId}`, method: 'GET' })
      );
      expect(result).toEqual(mockPayment);
    });
  });

  describe('listPayments', () => {
    const mockPayments = [
      { id: 'pay_1', attributes: { amount: 10000 } },
      { id: 'pay_2', attributes: { amount: 20000 } },
    ];

    it('should list payments with default limit', async () => {
      mockPoolRequest.mockResolvedValue({
        statusCode: 200,
        headers: { 'content-type': 'application/json' },
        body: {
          json: () => Promise.resolve({ data: mockPayments }),
          text: () => Promise.resolve(''),
        },
      });

      const result = await apiClient.listPayments();

      expect(mockPoolRequest).toHaveBeenCalledWith(
        expect.objectContaining({ path: '/v1/payments?limit=10', method: 'GET' })
      );
      expect(result).toEqual(mockPayments);
    });

    it('should list payments with custom limit', async () => {
      mockPoolRequest.mockResolvedValue({
        statusCode: 200,
        headers: { 'content-type': 'application/json' },
        body: {
          json: () => Promise.resolve({ data: mockPayments }),
          text: () => Promise.resolve(''),
        },
      });

      await apiClient.listPayments(25);

      expect(mockPoolRequest).toHaveBeenCalledWith(
        expect.objectContaining({ path: '/v1/payments?limit=25', method: 'GET' })
      );
    });
  });

  describe('createPaymentIntent', () => {
    const mockPaymentIntent = { id: 'pi_123', attributes: { amount: 10000 } };

    it('should create payment intent with required parameters', async () => {
      mockPoolRequest.mockResolvedValue({
        statusCode: 200,
        headers: { 'content-type': 'application/json' },
        body: {
          json: () => Promise.resolve({ data: mockPaymentIntent }),
          text: () => Promise.resolve(''),
        },
      });

      const result = await apiClient.createPaymentIntent(10000);

      expect(mockPoolRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          path: '/v1/payment_intents',
          method: 'POST',
          body: JSON.stringify({
            data: {
              attributes: {
                amount: 10000,
                payment_method_allowed: ['card', 'gcash', 'paymaya'],
                currency: 'PHP',
              },
            },
          }),
        })
      );
      expect(result).toEqual(mockPaymentIntent);
    });

    it('should create payment intent with all parameters', async () => {
      mockPoolRequest.mockResolvedValue({
        statusCode: 200,
        headers: { 'content-type': 'application/json' },
        body: {
          json: () => Promise.resolve({ data: mockPaymentIntent }),
          text: () => Promise.resolve(''),
        },
      });

      await apiClient.createPaymentIntent(50000, 'USD', 'Test payment', ['card']);

      expect(mockPoolRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          path: '/v1/payment_intents',
          method: 'POST',
          body: JSON.stringify({
            data: {
              attributes: {
                amount: 50000,
                payment_method_allowed: ['card'],
                currency: 'USD',
                description: 'Test payment',
              },
            },
          }),
        })
      );
    });
  });

  describe('attachPaymentIntent', () => {
    const paymentIntentId = 'pi_123';
    const paymentMethodId = 'pm_456';
    const returnUrl = 'https://example.com/return';
    const mockConfirmedIntent = { id: paymentIntentId, attributes: { status: 'succeeded' } };

    it('should attach payment method to payment intent', async () => {
      mockPoolRequest.mockResolvedValue({
        statusCode: 200,
        headers: { 'content-type': 'application/json' },
        body: {
          json: () => Promise.resolve({ data: mockConfirmedIntent }),
          text: () => Promise.resolve(''),
        },
      });

      const result = await apiClient.attachPaymentIntent(paymentIntentId, paymentMethodId);

      expect(mockPoolRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          path: `/v1/payment_intents/${paymentIntentId}/attach`,
          method: 'POST',
          body: JSON.stringify({
            data: {
              attributes: {
                payment_method: paymentMethodId,
              },
            },
          }),
        })
      );
      expect(result).toEqual(mockConfirmedIntent);
    });

    it('should attach payment method with return URL', async () => {
      mockPoolRequest.mockResolvedValue({
        statusCode: 200,
        headers: { 'content-type': 'application/json' },
        body: {
          json: () => Promise.resolve({ data: mockConfirmedIntent }),
          text: () => Promise.resolve(''),
        },
      });

      await apiClient.attachPaymentIntent(paymentIntentId, paymentMethodId, returnUrl);

      expect(mockPoolRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          path: `/v1/payment_intents/${paymentIntentId}/attach`,
          method: 'POST',
          body: JSON.stringify({
            data: {
              attributes: {
                payment_method: paymentMethodId,
                return_url: returnUrl,
              },
            },
          }),
        })
      );
    });
  });

  describe('capturePaymentIntent', () => {
    const paymentIntentId = 'pi_123';
    const mockCapturedIntent = { id: paymentIntentId, attributes: { status: 'succeeded' } };

    it('should capture payment intent', async () => {
      mockPoolRequest.mockResolvedValue({
        statusCode: 200,
        headers: { 'content-type': 'application/json' },
        body: {
          json: () => Promise.resolve({ data: mockCapturedIntent }),
          text: () => Promise.resolve(''),
        },
      });

      const result = await apiClient.capturePaymentIntent(paymentIntentId);

      expect(mockPoolRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          path: `/v1/payment_intents/${paymentIntentId}/capture`,
          method: 'POST',
        })
      );
      expect(result).toEqual(mockCapturedIntent);
    });
  });

  describe('createRefund', () => {
    const paymentId = 'pay_123';
    const mockRefund = { id: 'ref_456', attributes: { amount: 5000 } };

    it('should create refund with payment ID only', async () => {
      mockPoolRequest.mockResolvedValue({
        statusCode: 200,
        headers: { 'content-type': 'application/json' },
        body: {
          json: () => Promise.resolve({ data: mockRefund }),
          text: () => Promise.resolve(''),
        },
      });

      const result = await apiClient.createRefund(paymentId);

      expect(mockPoolRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          path: '/v1/refunds',
          method: 'POST',
          body: JSON.stringify({
            data: {
              attributes: {
                payment_id: paymentId,
              },
            },
          }),
        })
      );
      expect(result).toEqual(mockRefund);
    });

    it('should create refund with amount', async () => {
      mockPoolRequest.mockResolvedValue({
        statusCode: 200,
        headers: { 'content-type': 'application/json' },
        body: {
          json: () => Promise.resolve({ data: mockRefund }),
          text: () => Promise.resolve(''),
        },
      });

      await apiClient.createRefund(paymentId, 5000);

      expect(mockPoolRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          path: '/v1/refunds',
          method: 'POST',
          body: JSON.stringify({
            data: {
              attributes: {
                payment_id: paymentId,
                amount: 5000,
              },
            },
          }),
        })
      );
    });

    it('should create refund with reason', async () => {
      mockPoolRequest.mockResolvedValue({
        statusCode: 200,
        headers: { 'content-type': 'application/json' },
        body: {
          json: () => Promise.resolve({ data: mockRefund }),
          text: () => Promise.resolve(''),
        },
      });

      await apiClient.createRefund(paymentId, undefined, 'fraudulent');

      expect(mockPoolRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          path: '/v1/refunds',
          method: 'POST',
          body: JSON.stringify({
            data: {
              attributes: {
                payment_id: paymentId,
                reason: 'fraudulent',
              },
            },
          }),
        })
      );
    });

    it('should create refund with amount and reason', async () => {
      mockPoolRequest.mockResolvedValue({
        statusCode: 200,
        headers: { 'content-type': 'application/json' },
        body: {
          json: () => Promise.resolve({ data: mockRefund }),
          text: () => Promise.resolve(''),
        },
      });

      await apiClient.createRefund(paymentId, 7500, 'requested_by_customer');

      expect(mockPoolRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          path: '/v1/refunds',
          method: 'POST',
          body: JSON.stringify({
            data: {
              attributes: {
                payment_id: paymentId,
                amount: 7500,
                reason: 'requested_by_customer',
              },
            },
          }),
        })
      );
    });
  });
});
