import {
  validateApiKey,
  validateWebhookUrl,
  validateConfig,
  validateEventTypes,
  ValidationError,
} from '../../src/utils/validator';
import { PayMongoConfig } from '../../src/types/paymongo';

describe('Validator Utils - Extended', () => {
  describe('validateConfig', () => {
    const validConfig: Partial<PayMongoConfig> = {
      version: '1.0',
      projectName: 'Test Project',
      environment: 'test',
      apiKeys: {
        test: {
          public: 'pk_test_ABCDEFGHIJ0123456789',
          secret: 'sk_test_ABCDEFGHIJ0123456789',
        },
      },
      webhooks: {
        url: 'https://example.com/webhook',
        events: ['payment.paid'],
      },
      dev: {
        port: 3000,
        autoRegisterWebhook: true,
        verifyWebhookSignatures: false,
      },
    };

    it('should pass validation for valid config', () => {
      expect(() => validateConfig(validConfig)).not.toThrow();
    });

    it('should throw ValidationError for missing project name', () => {
      const config = { ...validConfig, projectName: '' };
      expect(() => validateConfig(config)).toThrow(ValidationError);
      expect(() => validateConfig(config)).toThrow('Project name is required');
    });

    it('should throw ValidationError for whitespace-only project name', () => {
      const config = { ...validConfig, projectName: '   ' };
      expect(() => validateConfig(config)).toThrow(ValidationError);
    });

    it('should throw ValidationError for missing version', () => {
      const config = { ...validConfig, version: undefined };
      expect(() => validateConfig(config)).toThrow(ValidationError);
      expect(() => validateConfig(config)).toThrow('Config version is required');
    });

    it('should throw ValidationError for invalid environment', () => {
      const config = { ...validConfig, environment: 'staging' as any };
      expect(() => validateConfig(config)).toThrow(ValidationError);
      expect(() => validateConfig(config)).toThrow('Environment must be either "test" or "live"');
    });

    it('should throw ValidationError for missing secret API key', () => {
      const config = {
        ...validConfig,
        apiKeys: {
          test: {
            public: 'pk_test_ABCDEFGHIJ0123456789',
            secret: '',
          },
        },
      };
      expect(() => validateConfig(config)).toThrow(ValidationError);
      expect(() => validateConfig(config)).toThrow('Secret API key for test environment is required');
    });

    it('should throw ValidationError for invalid public API key format', () => {
      const config = {
        ...validConfig,
        apiKeys: {
          test: {
            public: 'invalid_key',
            secret: 'sk_test_ABCDEFGHIJ0123456789',
          },
        },
      };
      expect(() => validateConfig(config)).toThrow(ValidationError);
      expect(() => validateConfig(config)).toThrow('Invalid public API key format');
    });

    it('should throw ValidationError for invalid secret API key format', () => {
      const config = {
        ...validConfig,
        apiKeys: {
          test: {
            public: 'pk_test_ABCDEFGHIJ0123456789',
            secret: 'invalid_secret',
          },
        },
      };
      expect(() => validateConfig(config)).toThrow(ValidationError);
      expect(() => validateConfig(config)).toThrow('Invalid secret API key format');
    });

    it('should throw ValidationError for invalid webhook URL', () => {
      const config = {
        ...validConfig,
        webhooks: {
          url: 'http://example.com/webhook', // HTTP instead of HTTPS
          events: ['payment.paid'],
        },
      };
      expect(() => validateConfig(config)).toThrow(ValidationError);
      expect(() => validateConfig(config)).toThrow('Invalid webhook URL');
    });

    it('should allow localhost webhook URL', () => {
      const config = {
        ...validConfig,
        webhooks: {
          url: 'http://localhost:3000/webhook',
          events: ['payment.paid'],
        },
      };
      expect(() => validateConfig(config)).not.toThrow();
    });

    it('should allow 127.0.0.1 webhook URL', () => {
      const config = {
        ...validConfig,
        webhooks: {
          url: 'http://127.0.0.1:3000/webhook',
          events: ['payment.paid'],
        },
      };
      expect(() => validateConfig(config)).not.toThrow();
    });

    it('should throw ValidationError for invalid port (too low)', () => {
      const config = {
        ...validConfig,
        dev: {
          port: 0,
          autoRegisterWebhook: true,
          verifyWebhookSignatures: false,
        },
      };
      expect(() => validateConfig(config)).toThrow(ValidationError);
      expect(() => validateConfig(config)).toThrow('Port must be between 1 and 65535');
    });

    it('should throw ValidationError for invalid port (too high)', () => {
      const config = {
        ...validConfig,
        dev: {
          port: 70000,
          autoRegisterWebhook: true,
          verifyWebhookSignatures: false,
        },
      };
      expect(() => validateConfig(config)).toThrow(ValidationError);
      expect(() => validateConfig(config)).toThrow('Port must be between 1 and 65535');
    });

    it('should validate live environment config', () => {
      const liveConfig: Partial<PayMongoConfig> = {
        ...validConfig,
        environment: 'live',
        apiKeys: {
          live: {
            public: 'pk_live_ABCDEFGHIJ0123456789',
            secret: 'sk_live_ABCDEFGHIJ0123456789',
          },
        },
      };
      expect(() => validateConfig(liveConfig)).not.toThrow();
    });

    it('should pass validation without optional webhook URL', () => {
      const config = {
        ...validConfig,
        webhooks: {
          url: '',
          events: [],
        },
      };
      expect(() => validateConfig(config)).not.toThrow();
    });

    it('should pass validation without optional public key', () => {
      const config = {
        ...validConfig,
        apiKeys: {
          test: {
            public: '',
            secret: 'sk_test_ABCDEFGHIJ0123456789',
          },
        },
      };
      expect(() => validateConfig(config)).not.toThrow();
    });
  });

  describe('validateEventTypes', () => {
    it('should pass for valid event types', () => {
      const validEvents = ['payment.paid', 'payment.failed', 'payment.refunded'];
      expect(() => validateEventTypes(validEvents)).not.toThrow();
    });

    it('should pass for all supported event types', () => {
      const allEvents = [
        'payment.paid',
        'payment.failed',
        'payment.refunded',
        'source.chargeable',
        'checkout_session.payment.paid',
        'qrph.expired',
      ];
      expect(() => validateEventTypes(allEvents)).not.toThrow();
    });

    it('should pass for single event type', () => {
      expect(() => validateEventTypes(['payment.paid'])).not.toThrow();
    });

    it('should pass for empty array', () => {
      expect(() => validateEventTypes([])).not.toThrow();
    });

    it('should throw ValidationError for invalid event type', () => {
      const events = ['payment.paid', 'invalid.event'];
      expect(() => validateEventTypes(events)).toThrow(ValidationError);
      expect(() => validateEventTypes(events)).toThrow('Invalid event types: invalid.event');
    });

    it('should list all invalid events in error message', () => {
      const events = ['invalid.one', 'invalid.two', 'payment.paid'];
      expect(() => validateEventTypes(events)).toThrow('Invalid event types: invalid.one, invalid.two');
    });

    it('should throw ValidationError for completely invalid events array', () => {
      const events = ['not.a.valid.event'];
      expect(() => validateEventTypes(events)).toThrow(ValidationError);
    });
  });

  describe('validateApiKey - edge cases', () => {
    it('should reject null key', () => {
      expect(validateApiKey(null as any, 'public')).toBe(false);
    });

    it('should reject undefined key', () => {
      expect(validateApiKey(undefined as any, 'public')).toBe(false);
    });

    it('should reject number as key', () => {
      expect(validateApiKey(12345 as any, 'public')).toBe(false);
    });

    it('should reject object as key', () => {
      expect(validateApiKey({} as any, 'public')).toBe(false);
    });

    it('should reject key with wrong prefix for type', () => {
      expect(validateApiKey('pk_test_ABCDEFGHIJ0123456789', 'secret')).toBe(false);
      expect(validateApiKey('sk_test_ABCDEFGHIJ0123456789', 'public')).toBe(false);
    });

    it('should reject key with invalid environment', () => {
      expect(validateApiKey('pk_staging_ABCDEFGHIJ0123456789', 'public')).toBe(false);
    });

    it('should reject key that is too short', () => {
      expect(validateApiKey('pk_test_short', 'public')).toBe(false);
    });

    it('should accept key with exactly 20 characters after prefix', () => {
      expect(validateApiKey('pk_test_12345678901234567890', 'public')).toBe(true);
    });

    it('should accept key with more than 20 characters after prefix', () => {
      expect(validateApiKey('pk_test_123456789012345678901234567890', 'public')).toBe(true);
    });
  });

  describe('validateWebhookUrl - edge cases', () => {
    it('should reject null URL', () => {
      expect(validateWebhookUrl(null as any)).toBe(false);
    });

    it('should reject undefined URL', () => {
      expect(validateWebhookUrl(undefined as any)).toBe(false);
    });

    it('should reject empty string', () => {
      expect(validateWebhookUrl('')).toBe(false);
    });

    it('should reject malformed URL', () => {
      expect(validateWebhookUrl('not a url')).toBe(false);
    });

    it('should reject FTP URL', () => {
      expect(validateWebhookUrl('ftp://example.com/webhook')).toBe(false);
    });

    it('should reject file URL', () => {
      expect(validateWebhookUrl('file:///etc/passwd')).toBe(false);
    });

    it('should accept HTTPS URL with port', () => {
      expect(validateWebhookUrl('https://example.com:8443/webhook')).toBe(true);
    });

    it('should accept HTTPS URL with query params', () => {
      expect(validateWebhookUrl('https://example.com/webhook?key=value')).toBe(true);
    });

    it('should accept localhost with different ports', () => {
      expect(validateWebhookUrl('http://localhost:3000/webhook')).toBe(true);
      expect(validateWebhookUrl('http://localhost:8080/webhook')).toBe(true);
      expect(validateWebhookUrl('http://localhost/webhook')).toBe(true);
    });

    it('should reject HTTP URL to public domain', () => {
      expect(validateWebhookUrl('http://mysite.com/webhook')).toBe(false);
    });
  });

  describe('ValidationError class', () => {
    it('should create error with message only', () => {
      const error = new ValidationError('Test error');
      expect(error.message).toBe('Test error');
      expect(error.name).toBe('ValidationError');
      expect(error.field).toBeUndefined();
    });

    it('should create error with field', () => {
      const error = new ValidationError('Invalid value', 'fieldName');
      expect(error.message).toBe('Invalid value');
      expect(error.field).toBe('fieldName');
    });

    it('should be instanceof Error', () => {
      const error = new ValidationError('Test');
      expect(error).toBeInstanceOf(Error);
    });
  });
});
