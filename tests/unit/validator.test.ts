import { validateApiKey, validateWebhookUrl } from '../../src/utils/validator';

describe('Validator Utils', () => {
  describe('validateApiKey', () => {
    it('should validate correct public key format', () => {
      expect(validateApiKey('pk_test_1234567890123456789012345', 'public')).toBe(true);
      expect(validateApiKey('pk_live_1234567890123456789012345', 'public')).toBe(true);
    });

    it('should validate correct secret key format', () => {
      expect(validateApiKey('sk_test_1234567890123456789012345', 'secret')).toBe(true);
      expect(validateApiKey('sk_live_1234567890123456789012345', 'secret')).toBe(true);
    });

    it('should reject invalid key formats', () => {
      expect(validateApiKey('invalid_key', 'public')).toBe(false);
      expect(validateApiKey('pk_test_short', 'public')).toBe(false);
      expect(validateApiKey('', 'public')).toBe(false);
      expect(validateApiKey(null as any, 'public')).toBe(false);
    });

    it('should reject mismatched key types', () => {
      expect(validateApiKey('sk_test_1234567890123456789012345', 'public')).toBe(false);
      expect(validateApiKey('pk_test_1234567890123456789012345', 'secret')).toBe(false);
    });
  });

  describe('validateWebhookUrl', () => {
    it('should validate HTTPS URLs', () => {
      expect(validateWebhookUrl('https://example.com/webhook')).toBe(true);
    });

    it('should allow localhost URLs', () => {
      expect(validateWebhookUrl('http://localhost:3000/webhook')).toBe(true);
      expect(validateWebhookUrl('http://127.0.0.1:3000/webhook')).toBe(true);
    });

    it('should reject HTTP URLs in production', () => {
      expect(validateWebhookUrl('http://example.com/webhook')).toBe(false);
    });

    it('should reject invalid URLs', () => {
      expect(validateWebhookUrl('not-a-url')).toBe(false);
      expect(validateWebhookUrl('')).toBe(false);
    });
  });
});