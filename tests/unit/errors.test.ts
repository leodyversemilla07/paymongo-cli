import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import {
  PayMongoError,
  ConfigError,
  ApiKeyError,
  NetworkError,
  ValidationError,
  WebhookError,
  withRetry,
} from '../../src/utils/errors';

// Type alias for async operation mock
type AsyncOperationMock = jest.Mock<() => Promise<unknown>>;

describe('Custom Error Classes', () => {
  describe('PayMongoError', () => {
    it('should create error with message only', () => {
      const error = new PayMongoError('Payment failed');
      expect(error.message).toBe('Payment failed');
      expect(error.name).toBe('PayMongoError');
      expect(error.code).toBeUndefined();
      expect(error.statusCode).toBeUndefined();
    });

    it('should create error with all properties', () => {
      const error = new PayMongoError('Payment failed', 'PAYMENT_ERROR', 400);
      expect(error.message).toBe('Payment failed');
      expect(error.code).toBe('PAYMENT_ERROR');
      expect(error.statusCode).toBe(400);
    });

    it('should be instanceof Error', () => {
      const error = new PayMongoError('Test');
      expect(error).toBeInstanceOf(Error);
    });
  });

  describe('ConfigError', () => {
    it('should create error with message only', () => {
      const error = new ConfigError('Config not found');
      expect(error.message).toBe('Config not found');
      expect(error.name).toBe('ConfigError');
      expect(error.configPath).toBeUndefined();
    });

    it('should create error with config path', () => {
      const error = new ConfigError('Config not found', '/path/to/config');
      expect(error.message).toBe('Config not found');
      expect(error.configPath).toBe('/path/to/config');
    });
  });

  describe('ApiKeyError', () => {
    it('should create error with message only', () => {
      const error = new ApiKeyError('Invalid key');
      expect(error.message).toBe('Invalid key');
      expect(error.name).toBe('ApiKeyError');
      expect(error.keyType).toBeUndefined();
    });

    it('should create error with key type', () => {
      const error = new ApiKeyError('Invalid public key', 'public');
      expect(error.message).toBe('Invalid public key');
      expect(error.keyType).toBe('public');
    });
  });

  describe('NetworkError', () => {
    it('should create error with message only', () => {
      const error = new NetworkError('Connection refused');
      expect(error.message).toBe('Connection refused');
      expect(error.name).toBe('NetworkError');
      expect(error.originalError).toBeUndefined();
    });

    it('should create error with original error', () => {
      const originalError = new Error('ECONNREFUSED');
      const error = new NetworkError('Connection refused', originalError);
      expect(error.message).toBe('Connection refused');
      expect(error.originalError).toBe(originalError);
    });
  });

  describe('ValidationError', () => {
    it('should create error with message only', () => {
      const error = new ValidationError('Invalid input');
      expect(error.message).toBe('Invalid input');
      expect(error.name).toBe('ValidationError');
      expect(error.field).toBeUndefined();
    });

    it('should create error with field', () => {
      const error = new ValidationError('Invalid email', 'email');
      expect(error.message).toBe('Invalid email');
      expect(error.field).toBe('email');
    });
  });

  describe('WebhookError', () => {
    it('should create error with message only', () => {
      const error = new WebhookError('Webhook failed');
      expect(error.message).toBe('Webhook failed');
      expect(error.name).toBe('WebhookError');
      expect(error.webhookId).toBeUndefined();
    });

    it('should create error with webhook ID', () => {
      const error = new WebhookError('Webhook failed', 'hook_123');
      expect(error.message).toBe('Webhook failed');
      expect(error.webhookId).toBe('hook_123');
    });
  });
});

describe('withRetry', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    // Suppress console.log during tests
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('should return result on first successful attempt', async () => {
    const operation = jest.fn<() => Promise<unknown>>().mockResolvedValue('success');

    const resultPromise = withRetry(operation);
    const result = await resultPromise;

    expect(result).toBe('success');
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('should retry on failure and succeed', async () => {
    const operation = jest
      .fn<() => Promise<unknown>>()
      .mockRejectedValueOnce(new NetworkError('Network error'))
      .mockResolvedValueOnce('success');

    const resultPromise = withRetry(operation, { maxRetries: 3, delayMs: 100 });
    
    // Fast-forward through the delay
    await jest.advanceTimersByTimeAsync(100);
    
    const result = await resultPromise;

    expect(result).toBe('success');
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it('should throw after max retries exceeded', async () => {
    const error = new NetworkError('Persistent network error');
    const operation = jest.fn<() => Promise<unknown>>().mockRejectedValue(error);

    // Use real timers for this test since we want to verify the final throw behavior
    jest.useRealTimers();

    await expect(
      withRetry(operation, { maxRetries: 2, delayMs: 10, backoffMultiplier: 1 })
    ).rejects.toThrow('Persistent network error');
    expect(operation).toHaveBeenCalledTimes(3); // Initial + 2 retries

    // Restore fake timers for other tests
    jest.useFakeTimers();
  });

  it('should not retry on non-retryable errors by default', async () => {
    const error = new Error('401 Unauthorized');
    const operation = jest.fn<() => Promise<unknown>>().mockRejectedValue(error);

    await expect(withRetry(operation)).rejects.toThrow('401 Unauthorized');
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('should retry on NetworkError', async () => {
    const operation = jest
      .fn<() => Promise<unknown>>()
      .mockRejectedValueOnce(new NetworkError('Connection failed'))
      .mockResolvedValueOnce('success');

    const resultPromise = withRetry(operation, { delayMs: 100 });
    await jest.advanceTimersByTimeAsync(100);
    
    const result = await resultPromise;

    expect(result).toBe('success');
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it('should retry on timeout errors', async () => {
    const error = new Error('Request timeout');
    const operation = jest
      .fn<() => Promise<unknown>>()
      .mockRejectedValueOnce(error)
      .mockResolvedValueOnce('success');

    const resultPromise = withRetry(operation, { delayMs: 100 });
    await jest.advanceTimersByTimeAsync(100);
    
    const result = await resultPromise;

    expect(result).toBe('success');
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it('should retry on ECONNRESET errors', async () => {
    const error = new Error('ECONNRESET');
    const operation = jest
      .fn<() => Promise<unknown>>()
      .mockRejectedValueOnce(error)
      .mockResolvedValueOnce('success');

    const resultPromise = withRetry(operation, { delayMs: 100 });
    await jest.advanceTimersByTimeAsync(100);
    
    const result = await resultPromise;

    expect(result).toBe('success');
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it('should use custom retry condition', async () => {
    const customError = new Error('Custom retryable error');
    const operation = jest
      .fn<() => Promise<unknown>>()
      .mockRejectedValueOnce(customError)
      .mockResolvedValueOnce('success');

    const customCondition = (error: Error) => error.message.includes('Custom');

    const resultPromise = withRetry(operation, {
      delayMs: 100,
      retryCondition: customCondition,
    });
    await jest.advanceTimersByTimeAsync(100);
    
    const result = await resultPromise;

    expect(result).toBe('success');
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it('should not retry when custom condition returns false', async () => {
    const error = new Error('Non-retryable');
    const operation = jest.fn<() => Promise<unknown>>().mockRejectedValue(error);

    const customCondition = () => false;

    await expect(
      withRetry(operation, { retryCondition: customCondition })
    ).rejects.toThrow('Non-retryable');
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('should apply exponential backoff', async () => {
    const operation = jest
      .fn<() => Promise<unknown>>()
      .mockRejectedValueOnce(new NetworkError('Error 1'))
      .mockRejectedValueOnce(new NetworkError('Error 2'))
      .mockResolvedValueOnce('success');

    const resultPromise = withRetry(operation, {
      maxRetries: 3,
      delayMs: 100,
      backoffMultiplier: 2,
    });

    // First delay: 100ms
    await jest.advanceTimersByTimeAsync(100);
    expect(operation).toHaveBeenCalledTimes(2);

    // Second delay: 200ms (100 * 2)
    await jest.advanceTimersByTimeAsync(200);
    
    const result = await resultPromise;
    expect(result).toBe('success');
    expect(operation).toHaveBeenCalledTimes(3);
  });

  it('should use default options when none provided', async () => {
    const operation = jest.fn<() => Promise<unknown>>().mockResolvedValue('success');

    const result = await withRetry(operation);

    expect(result).toBe('success');
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('should not retry 401 errors even with Network error in message', async () => {
    const error = new Error('Network error 401');
    const operation = jest.fn<() => Promise<unknown>>().mockRejectedValue(error);

    await expect(withRetry(operation)).rejects.toThrow('Network error 401');
    expect(operation).toHaveBeenCalledTimes(1);
  });
});
