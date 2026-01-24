import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const { RateLimiter } = await import('../../src/services/api/rate-limiter.js');

describe('RateLimiter', () => {
  let rateLimiter: InstanceType<typeof RateLimiter>;
  const mockConfig = {
    version: '1.0.0',
    projectName: 'test-project',
    environment: 'test' as const,
    apiKeys: {
      test: { public: 'pk_test_123', secret: 'sk_test_123' },
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

  const defaultRateLimitConfig = {
    default: {
      maxRequests: 10,
      windowMs: 1000, // 1 second for testing
    },
    endpoints: {
      '/expensive': {
        maxRequests: 5,
        windowMs: 1000,
      },
    },
    environments: {
      live: {
        environmentMultiplier: 0.5,
      },
    },
  };

  beforeEach(() => {
    rateLimiter = new RateLimiter(mockConfig, defaultRateLimitConfig);
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('checkLimit', () => {
    it('should allow requests under the limit', () => {
      for (let i = 0; i < 10; i++) {
        const result = rateLimiter.checkLimit('/test');
        expect(result.allowed).toBe(true);
        rateLimiter.recordCall('/test');
      }
    });

    it('should block requests over the limit', () => {
      // Use up all requests
      for (let i = 0; i < 10; i++) {
        rateLimiter.recordCall('/test');
      }

      const result = rateLimiter.checkLimit('/test');
      expect(result.allowed).toBe(false);
      expect(result.backoffMs).toBeDefined();
    });

    it('should reset limits after time window', () => {
      // Use up all requests
      for (let i = 0; i < 10; i++) {
        rateLimiter.recordCall('/test');
      }

      // Advance time past the window
      jest.advanceTimersByTime(1001);

      const result = rateLimiter.checkLimit('/test');
      expect(result.allowed).toBe(true);
    });

    it('should apply endpoint-specific limits', () => {
      // Use up expensive endpoint limit
      for (let i = 0; i < 5; i++) {
        rateLimiter.recordCall('/expensive');
      }

      const result = rateLimiter.checkLimit('/expensive');
      expect(result.allowed).toBe(false);
    });

    it('should apply environment multipliers', () => {
      const liveConfig = {
        ...mockConfig,
        environment: 'live' as const,
        apiKeys: {
          ...mockConfig.apiKeys,
          live: { public: 'pk_live_123', secret: 'sk_live_123' },
        },
      };
      const liveRateLimiter = new RateLimiter(liveConfig, defaultRateLimitConfig);

      // Live environment should have 5 requests (10 * 0.5)
      for (let i = 0; i < 5; i++) {
        const result = liveRateLimiter.checkLimit('/test');
        expect(result.allowed).toBe(true);
        liveRateLimiter.recordCall('/test');
      }

      const result = liveRateLimiter.checkLimit('/test');
      expect(result.allowed).toBe(false);
    });
  });

  describe('recordCall', () => {
    it('should record calls for rate limiting', () => {
      rateLimiter.recordCall('/test');

      const status = rateLimiter.getStatus('/test');
      expect(status.currentCalls).toBe(1);
    });

    it('should maintain separate counters for different endpoints', () => {
      rateLimiter.recordCall('/test1');
      rateLimiter.recordCall('/test2');

      expect(rateLimiter.getStatus('/test1').currentCalls).toBe(1);
      expect(rateLimiter.getStatus('/test2').currentCalls).toBe(1);
    });
  });

  describe('getStatus', () => {
    it('should return correct status information', () => {
      const status = rateLimiter.getStatus('/test');

      expect(status).toEqual({
        policy: expect.objectContaining({
          maxRequests: 10,
          windowMs: 1000,
        }),
        currentCalls: 0,
        remainingRequests: 10,
        nextAvailableInMs: undefined,
      });
    });

    it('should show next available time when limit exceeded', () => {
      // Use up all requests
      for (let i = 0; i < 10; i++) {
        rateLimiter.recordCall('/test');
      }

      const status = rateLimiter.getStatus('/test');
      expect(status.nextAvailableInMs).toBeDefined();
      expect(status.remainingRequests).toBe(0);
    });
  });

  describe('reset', () => {
    it('should clear all call history', () => {
      rateLimiter.recordCall('/test');
      expect(rateLimiter.getStatus('/test').currentCalls).toBe(1);

      rateLimiter.reset();
      expect(rateLimiter.getStatus('/test').currentCalls).toBe(0);
    });
  });
});
