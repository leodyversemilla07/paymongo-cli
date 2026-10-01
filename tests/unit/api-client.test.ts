import { beforeEach, describe, expect, it, vi as jest } from 'vitest';
import type { PaymentLinkData } from '../../src/types/paymongo.js';
import { ApiKeyError, PayMongoError, ValidationError } from '../../src/utils/errors.js';

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
  destroy: jest.fn<() => Promise<void>>(),
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

  describe('authentication mode safety', () => {
    it.each([
      'test',
      'live',
    ] as const)('rejects mismatched %s keys before reads, mutations, or cache access', async (environment) => {
      const wrongMode = environment === 'test' ? 'live' : 'test';
      const secret = `sk_${wrongMode}_synthetic_fixture`;
      const config = {
        ...validConfig,
        environment,
        apiKeys: { [environment]: { public: '', secret } },
      };
      const client = new ApiClient({ config });
      await expect(client.getPaymentMethod('pm_fixture')).rejects.toBeInstanceOf(ApiKeyError);
      await expect(client.createPaymentMethod('gcash')).rejects.toThrow('configured environment');
      // Even an existing cache entry must not bypass the credential guard.
      mockCache.get.mockResolvedValue({ id: 'hook_fixture', attributes: {} });
      await expect(client.listWebhooks()).rejects.toThrow('configured environment');
      await expect(client.getWebhook('hook_fixture')).rejects.toThrow('configured environment');
      expect(mockPoolRequest).not.toHaveBeenCalled();
      expect(mockCache.get).not.toHaveBeenCalled();
      await client.close();
    });
    it.each([
      'list',
      'show',
    ] as const)('isolates %s webhook cache entries by mode and account', async (operation) => {
      mockPoolRequest.mockResolvedValue({
        statusCode: 200,
        headers: { 'content-type': 'application/json' },
        body: { json: async () => ({ data: operation === 'list' ? [] : { id: 'hook_fixture' } }) },
      });
      const keys: string[] = [];
      for (const [environment, secret] of [
        ['test', 'sk_test_merchant_one_fixture'],
        ['test', 'sk_test_merchant_two_fixture'],
        ['live', 'sk_live_merchant_one_fixture'],
      ] as const) {
        const client = new ApiClient({
          config: {
            ...validConfig,
            environment,
            apiKeys: { [environment]: { public: '', secret } },
          },
        });
        try {
          if (operation === 'list') await client.listWebhooks();
          else await client.getWebhook('hook_fixture');
          const key = mockCache.get.mock.lastCall?.[0];
          expect(key).toMatch(new RegExp(`^webhooks?_${environment}_[a-f0-9]{64}`));
          expect(key).not.toContain(secret);
          expect(mockCache.set.mock.lastCall?.[0]).toBe(key);
          if (key) keys.push(key);
          if (operation === 'show') {
            await client.enableWebhook('hook_fixture');
            expect(mockCache.invalidate).toHaveBeenCalledWith(key);
            expect(mockCache.invalidate).toHaveBeenCalledWith(
              key?.replace(/^webhook_/, 'webhooks_').replace(/_hook_fixture$/, '')
            );
          }
        } finally {
          await client.close();
        }
      }
      expect(new Set(keys).size).toBe(3);
    });
    it('uses the explicitly configured live key when its prefix matches (transport mocked)', async () => {
      const secret = 'sk_live_synthetic_fixture';
      const client = new ApiClient({
        config: {
          ...validConfig,
          environment: 'live',
          apiKeys: { live: { public: '', secret } },
        },
      });
      mockPoolRequest.mockResolvedValue({
        statusCode: 200,
        headers: { 'content-type': 'application/json' },
        body: { json: async () => ({ data: [] }) },
      });
      await client.validateApiKey();
      expect(mockPoolRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: `Basic ${Buffer.from(`${secret}:`).toString('base64')}`,
          }),
        })
      );
      await client.close();
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

      await apiClient.createPaymentIntent(50000, 'PHP', 'Test payment', ['card']);

      expect(mockPoolRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          path: '/v1/payment_intents',
          method: 'POST',
          body: JSON.stringify({
            data: {
              attributes: {
                amount: 50000,
                payment_method_allowed: ['card'],
                currency: 'PHP',
                description: 'Test payment',
              },
            },
          }),
        })
      );
    });
  });

  describe('documented intent creation constraints and manual capture', () => {
    function respond() {
      mockPoolRequest.mockResolvedValue({
        statusCode: 200,
        headers: { 'content-type': 'application/json' },
        body: {
          json: async () => ({ data: { id: 'pi_123', type: 'payment_intent', attributes: {} } }),
        },
      });
    }

    it('sends manual capture and card 3DS options in the documented fields', async () => {
      respond();
      await apiClient.createPaymentIntent(50000, 'PHP', 'Order #9012', ['card'], {
        captureType: 'manual',
        threeDSecure: 'any',
      });
      const request = mockPoolRequest.mock.calls[0]?.[0];
      expect(JSON.parse(request.body)).toEqual({
        data: {
          attributes: {
            amount: 50000,
            currency: 'PHP',
            description: 'Order #9012',
            payment_method_allowed: ['card'],
            capture_type: 'manual',
            payment_method_options: { card: { request_three_d_secure: 'any' } },
          },
        },
      });
    });

    it.each([
      99,
      100.5,
      Number.NaN,
      Number.POSITIVE_INFINITY,
    ])('rejects invalid amount %s without API calls', async (amount) => {
      await expect(apiClient.createPaymentIntent(amount)).rejects.toBeInstanceOf(ValidationError);
      expect(mockPoolRequest).not.toHaveBeenCalled();
    });

    it('accepts the minimum documented amount', async () => {
      respond();
      await apiClient.createPaymentIntent(100, 'PHP', undefined, ['gcash']);
      expect(mockPoolRequest).toHaveBeenCalledTimes(1);
    });

    it('rejects non-PHP currency and provider display names used as API method types', async () => {
      await expect(apiClient.createPaymentIntent(10000, 'USD')).rejects.toBeInstanceOf(
        ValidationError
      );
      for (const methods of [[], ['maya'], ['grabpay'], ['unsupported']]) {
        await expect(
          apiClient.createPaymentIntent(10000, 'PHP', undefined, methods)
        ).rejects.toBeInstanceOf(ValidationError);
      }
      expect(mockPoolRequest).not.toHaveBeenCalled();
    });

    it('restricts manual capture to cards and card options to allowed cards', async () => {
      await expect(
        apiClient.createPaymentIntent(10000, 'PHP', undefined, ['gcash'], { captureType: 'manual' })
      ).rejects.toBeInstanceOf(ValidationError);
      await expect(
        apiClient.createPaymentIntent(10000, 'PHP', undefined, ['gcash'], { threeDSecure: 'any' })
      ).rejects.toBeInstanceOf(ValidationError);
      expect(mockPoolRequest).not.toHaveBeenCalled();
    });

    it('rejects invalid path IDs before capture, cancellation, or retrieval', async () => {
      for (const id of ['pi_123/attach', '../webhooks', '', 'pay_123', 'pi_123?mode=live']) {
        await expect(apiClient.capturePaymentIntent(id)).rejects.toBeInstanceOf(ValidationError);
        await expect(apiClient.cancelPaymentIntent(id)).rejects.toBeInstanceOf(ValidationError);
        await expect(apiClient.getPaymentIntent(id)).rejects.toBeInstanceOf(ValidationError);
      }
      expect(mockPoolRequest).not.toHaveBeenCalled();
    });

    it.each(['pm_123/attach', '', 'pi_123'])('rejects invalid method ID %s', async (id) => {
      await expect(apiClient.attachPaymentIntent('pi_123', id)).rejects.toBeInstanceOf(
        ValidationError
      );
      expect(mockPoolRequest).not.toHaveBeenCalled();
    });

    it.each([
      'javascript:alert(1)',
      'ftp://example.com',
      'https://user:pass@example.com',
      'not-a-url',
    ])('rejects unsafe return URL %s', async (url) => {
      await expect(apiClient.attachPaymentIntent('pi_123', 'pm_456', url)).rejects.toBeInstanceOf(
        ValidationError
      );
      expect(mockPoolRequest).not.toHaveBeenCalled();
    });

    it('sends a partial capture amount with data.attributes', async () => {
      respond();
      await apiClient.capturePaymentIntent('pi_123', 25000);
      expect(mockPoolRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          path: '/v1/payment_intents/pi_123/capture',
          method: 'POST',
          body: JSON.stringify({ data: { attributes: { amount: 25000 } } }),
        })
      );
    });

    it.each([0, -1, 1.5, Number.NaN])('rejects invalid partial capture %s', async (amount) => {
      await expect(apiClient.capturePaymentIntent('pi_123', amount)).rejects.toBeInstanceOf(
        ValidationError
      );
      expect(mockPoolRequest).not.toHaveBeenCalled();
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

  describe('documented Payment Links contract', () => {
    const link: PaymentLinkData = {
      id: 'link_123',
      amount: 10000,
      currency: 'PHP',
      description: 'Order #123',
      remarks: 'Internal note',
      status: 'active',
      livemode: false,
      url: 'https://pm.link/store/abc',
      reference_number: 'abc',
      metadata: {},
      created_at: '2026-05-21T08:00:00Z',
      updated_at: '2026-05-21T08:00:00Z',
    };

    function respond(data: unknown, statusCode = 200) {
      mockPoolRequest.mockResolvedValue({
        statusCode,
        headers: { 'content-type': 'application/json' },
        body: { json: async () => data, text: async () => '' },
      });
    }

    it('creates a link with top-level fields and returns the flat resource', async () => {
      respond({ data: link }, 201);
      expect(
        await apiClient.createPaymentLink(10000, 'Order #123', 'PHP', 'Internal note', {
          order: '123',
        })
      ).toEqual(link);
      expect(mockPoolRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          path: '/v1/payment_links',
          method: 'POST',
          body: JSON.stringify({
            amount: 10000,
            currency: 'PHP',
            description: 'Order #123',
            remarks: 'Internal note',
            metadata: { order: '123' },
          }),
        })
      );
    });

    it('retrieves a flat payment link', async () => {
      respond({ data: link });
      expect(await apiClient.getPaymentLink(link.id)).toEqual(link);
      expect(mockPoolRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          path: '/v1/payment_links/link_123',
          method: 'GET',
        })
      );
    });

    it('applies the display limit locally without an undocumented query parameter', async () => {
      respond({ data: [link, { ...link, id: 'link_456' }], has_more: false });
      expect(await apiClient.listPaymentLinks(1)).toEqual([link]);
      expect(mockPoolRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          path: '/v1/payment_links',
          method: 'GET',
        })
      );
    });

    it.each([
      0,
      99,
      100.5,
      1000000000,
      Number.NaN,
    ])('rejects invalid amount %s before requesting', async (amount) => {
      await expect(apiClient.createPaymentLink(amount, 'Order')).rejects.toBeInstanceOf(
        ValidationError
      );
      expect(mockPoolRequest).not.toHaveBeenCalled();
    });

    it.each([100, 999999999])('accepts documented amount boundary %s', async (amount) => {
      respond({ data: { ...link, amount } }, 201);
      await expect(apiClient.createPaymentLink(amount, 'Order')).resolves.toMatchObject({ amount });
    });

    it.each([0, 101, 1.5, Number.NaN])('rejects invalid display limit %s', async (limit) => {
      await expect(apiClient.listPaymentLinks(limit)).rejects.toBeInstanceOf(ValidationError);
      expect(mockPoolRequest).not.toHaveBeenCalled();
    });

    it('rejects unsupported currency format and overlong descriptions', async () => {
      await expect(apiClient.createPaymentLink(100, 'Order', 'php')).rejects.toBeInstanceOf(
        ValidationError
      );
      await expect(apiClient.createPaymentLink(100, 'x'.repeat(1001))).rejects.toBeInstanceOf(
        ValidationError
      );
      expect(mockPoolRequest).not.toHaveBeenCalled();
    });

    it('preserves API validation codes/statuses without retrying as network errors', async () => {
      respond({ errors: [{ code: 'invalid_request_body', detail: 'amount is required' }] }, 400);
      await expect(apiClient.createPaymentLink(100, 'Order')).rejects.toMatchObject({
        name: 'PayMongoError',
        code: 'invalid_request_body',
        statusCode: 400,
      });
      expect(mockPoolRequest).toHaveBeenCalledTimes(1);
    });

    it('preserves authentication failures without retrying', async () => {
      respond({ errors: [{ code: 'unauthorized', detail: 'Unauthorized' }] }, 401);
      await expect(apiClient.listPaymentLinks()).rejects.toBeInstanceOf(ApiKeyError);
      expect(mockPoolRequest).toHaveBeenCalledTimes(1);
    });

    it('preserves not-found API failures', async () => {
      respond({ errors: [] }, 404);
      await expect(apiClient.getPaymentLink('link_missing')).rejects.toBeInstanceOf(PayMongoError);
      expect(mockPoolRequest).toHaveBeenCalledTimes(1);
    });
  });

  describe('Payment Methods and Hosted Checkout contracts', () => {
    const method = {
      id: 'pm_123',
      type: 'payment_method',
      attributes: {
        type: 'gcash',
        livemode: false,
        created_at: 1710000000,
        updated_at: 1710000000,
      },
    };
    const checkout = {
      id: 'cs_123',
      type: 'checkout_session',
      attributes: {
        checkout_url: 'https://checkout.paymongo.com/cs_123',
        status: 'active',
        livemode: false,
        created_at: 1710000000,
        updated_at: 1710000000,
      },
    };
    const checkoutInput = {
      line_items: [{ amount: 10000, currency: 'PHP' as const, name: 'Order', quantity: 1 }],
      payment_method_types: ['card' as const, 'gcash' as const],
    };

    function respond(resource: unknown) {
      mockPoolRequest.mockResolvedValue({
        statusCode: 200,
        headers: { 'content-type': 'application/json' },
        body: { json: async () => ({ data: resource }) },
      });
    }

    it('creates a non-card method in a data.attributes envelope', async () => {
      respond(method);
      expect(
        await apiClient.createPaymentMethod(
          'gcash',
          {
            email: 'customer@example.com',
            address: { country: 'PH' },
          },
          { order: '123' }
        )
      ).toEqual(method);
      expect(mockPoolRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          path: '/v1/payment_methods',
          method: 'POST',
          body: JSON.stringify({
            data: {
              attributes: {
                type: 'gcash',
                billing: { address: { country: 'PH' }, email: 'customer@example.com' },
                metadata: { order: '123' },
              },
            },
          }),
        })
      );
    });

    it('sends banking details under details.bank_code', async () => {
      respond(method);
      await apiClient.createPaymentMethod('dob', undefined, undefined, { bankCode: 'bpi' });
      expect(mockPoolRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          path: '/v1/payment_methods',
          method: 'POST',
          body: JSON.stringify({
            data: { attributes: { type: 'dob', details: { bank_code: 'bpi' } } },
          }),
        })
      );
    });

    it('sends QR Ph expiry as an integer attribute', async () => {
      respond(method);
      await apiClient.createPaymentMethod('qrph', undefined, undefined, { expirySeconds: 600 });
      expect(mockPoolRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          body: JSON.stringify({ data: { attributes: { type: 'qrph', expiry_seconds: 600 } } }),
        })
      );
    });

    it.each([
      ['card', {}],
      ['unknown', {}],
      ['dob', {}],
      ['brankas', { bankCode: 'bpi' }],
      ['gcash', { bankCode: 'bpi' }],
      ['gcash', { expirySeconds: 60 }],
      ['qrph', { expirySeconds: 59 }],
      ['qrph', { expirySeconds: 9001 }],
      ['shopee_pay', { expirySeconds: 3601 }],
    ])('rejects unsupported method inputs before HTTP: %s', async (type, options) => {
      await expect(
        apiClient.createPaymentMethod(type, undefined, undefined, options)
      ).rejects.toBeInstanceOf(ValidationError);
      expect(mockPoolRequest).not.toHaveBeenCalled();
    });

    it('retrieves a method without inventing a status field', async () => {
      respond(method);
      expect(await apiClient.getPaymentMethod('pm_123')).toEqual(method);
      expect(mockPoolRequest).toHaveBeenCalledWith(
        expect.objectContaining({ path: '/v1/payment_methods/pm_123', method: 'GET' })
      );
    });

    it('creates Checkout using the explicit v1 endpoint and required arrays', async () => {
      respond(checkout);
      expect(await apiClient.createCheckoutSession(checkoutInput)).toEqual(checkout);
      expect(mockPoolRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          path: '/v1/checkout_sessions',
          method: 'POST',
          body: JSON.stringify({ data: { attributes: checkoutInput } }),
        })
      );
    });

    it('preserves explicit false checkout flags', async () => {
      respond(checkout);
      const attributes = {
        ...checkoutInput,
        send_email_receipt: false,
        show_description: false,
        show_line_items: false,
      };
      await apiClient.createCheckoutSession(attributes);
      expect(mockPoolRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          body: JSON.stringify({ data: { attributes } }),
        })
      );
    });

    it('retrieves and expires a session at documented endpoints', async () => {
      respond(checkout);
      expect(await apiClient.getCheckoutSession('cs_123')).toEqual(checkout);
      expect(mockPoolRequest).toHaveBeenLastCalledWith(
        expect.objectContaining({ method: 'GET', path: '/v1/checkout_sessions/cs_123' })
      );
      respond({ ...checkout, attributes: { ...checkout.attributes, status: 'expired' } });
      expect((await apiClient.expireCheckoutSession('cs_123')).attributes.status).toBe('expired');
      expect(mockPoolRequest).toHaveBeenLastCalledWith(
        expect.objectContaining({
          method: 'POST',
          path: '/v1/checkout_sessions/cs_123/expire',
          body: null,
        })
      );
    });

    it.each([
      '../other',
      'cs_123/expire',
      'pm_123',
      'cs_',
    ])('rejects unsafe or wrong session IDs: %s', async (id) => {
      await expect(apiClient.getCheckoutSession(id)).rejects.toBeInstanceOf(ValidationError);
      await expect(apiClient.expireCheckoutSession(id)).rejects.toBeInstanceOf(ValidationError);
      expect(mockPoolRequest).not.toHaveBeenCalled();
    });

    it('validates method IDs before interpolating paths', async () => {
      await expect(apiClient.getPaymentMethod('pm_123/other')).rejects.toBeInstanceOf(
        ValidationError
      );
      expect(mockPoolRequest).not.toHaveBeenCalled();
    });

    it('rejects invalid checkout input before HTTP', async () => {
      await expect(
        apiClient.createCheckoutSession({ ...checkoutInput, line_items: [] })
      ).rejects.toBeInstanceOf(ValidationError);
      expect(mockPoolRequest).not.toHaveBeenCalled();
    });

    it.each([
      'method',
      'checkout',
      'expire',
    ])('does not replay new mutations after network failure: %s', async (operation) => {
      mockPoolRequest.mockRejectedValue(
        Object.assign(new Error('Connection lost'), { code: 'ECONNRESET' })
      );
      const request =
        operation === 'method'
          ? apiClient.createPaymentMethod('gcash')
          : operation === 'checkout'
            ? apiClient.createCheckoutSession(checkoutInput)
            : apiClient.expireCheckoutSession('cs_123');
      await expect(request).rejects.toThrow();
      expect(mockPoolRequest).toHaveBeenCalledTimes(1);
    });

    it('forces pool teardown if graceful closure fails', async () => {
      const pool = MockPool.mock.results[0]?.value;
      pool.close.mockRejectedValueOnce(new Error('Pool shutdown failed'));
      await apiClient.close();
      expect(pool.close).toHaveBeenCalledOnce();
      expect(pool.destroy).toHaveBeenCalledOnce();
    });

    it('releases the underlying connection pool', async () => {
      const pool = MockPool.mock.results[0]?.value;
      await apiClient.close();
      expect(pool.close).toHaveBeenCalledOnce();
    });
  });

  describe('createRefund', () => {
    const paymentId = 'pay_123';
    const mockRefund = { id: 'ref_456', attributes: { amount: 5000 } };

    it.each([
      { amount: undefined, reason: undefined },
      { amount: 5000, reason: undefined },
      { amount: undefined, reason: 'fraudulent' as const },
      { amount: 99, reason: 'others' as const },
      { amount: 100.5, reason: 'duplicate' as const },
    ])('rejects incomplete or invalid refunds before requesting: %s', async ({
      amount,
      reason,
    }) => {
      await expect(apiClient.createRefund(paymentId, amount, reason)).rejects.toBeInstanceOf(
        ValidationError
      );
      expect(mockPoolRequest).not.toHaveBeenCalled();
    });

    it('accepts the documented others reason at the minimum amount', async () => {
      mockPoolRequest.mockResolvedValue({
        statusCode: 200,
        headers: { 'content-type': 'application/json' },
        body: { json: async () => ({ data: mockRefund }) },
      });
      await apiClient.createRefund(paymentId, 100, 'others');
      expect(mockPoolRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          body: JSON.stringify({
            data: { attributes: { payment_id: paymentId, amount: 100, reason: 'others' } },
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
