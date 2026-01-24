import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// Create mock cache
const mockCache = {
  get: jest.fn<() => Promise<any>>().mockResolvedValue(null),
  set: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  invalidate: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  clear: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
};

// Create mock Cache class
const MockCache = jest.fn(() => mockCache);

// Create mock axios instance
const mockAxiosInstance = {
  get: jest.fn<() => Promise<unknown>>(),
  post: jest.fn<() => Promise<unknown>>(),
  put: jest.fn<() => Promise<unknown>>(),
  delete: jest.fn<() => Promise<unknown>>(),
  interceptors: {
    request: { use: jest.fn() },
    response: { use: jest.fn() },
  },
};

// Create mock axios
const mockAxios = {
  create: jest.fn(() => mockAxiosInstance),
};

// Mock modules before importing ApiClient
jest.unstable_mockModule('axios', () => ({
  default: mockAxios,
}));

jest.unstable_mockModule('../../src/utils/cache.js', () => ({
  default: MockCache,
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
    mockAxiosInstance.get.mockReset();
    mockAxiosInstance.post.mockReset();
    mockAxiosInstance.put.mockReset();
    mockAxiosInstance.delete.mockReset();
    mockAxios.create.mockReturnValue(mockAxiosInstance as any);

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

  describe('error handling', () => {
    it('should handle network errors and return false for validateApiKey', async () => {
      // Use a non-retryable error to avoid retry delays
      const authError = new Error('401 Unauthorized');
      mockAxiosInstance.get.mockRejectedValue(authError);

      await expect(apiClient.validateApiKey()).resolves.toBe(false);
    });

    it('should handle generic errors', async () => {
      const genericError = new Error('Something went wrong');
      mockAxiosInstance.get.mockRejectedValue(genericError);

      await expect(apiClient.validateApiKey()).resolves.toBe(false);
    });
  });
});
