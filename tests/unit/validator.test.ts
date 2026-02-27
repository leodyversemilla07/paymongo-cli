import { validateApiKey, validateWebhookUrl } from '../../src/utils/validator';

describe('Validator Utils', () => {
  describe('validateApiKey', () => {
    it('should validate correct public key format', () => {
      // Test keys following PayMongo format: prefix_env_characters
      const publicTestKey = 'pk_' + 'test_' + 'ABCDEFGHIJ0123456789';
      const publicLiveKey = 'pk_' + 'live_' + 'ABCDEFGHIJ0123456789';
      expect(validateApiKey(publicTestKey, 'public')).toBe(true);
      expect(validateApiKey(publicLiveKey, 'public')).toBe(true);
    });

    it('should validate correct secret key format', () => {
      // Test keys following PayMongo format: prefix_env_characters
      const secretTestKey = 'sk_' + 'test_' + 'ABCDEFGHIJ0123456789';
      const secretLiveKey = 'sk_' + 'live_' + 'ABCDEFGHIJ0123456789';
      expect(validateApiKey(secretTestKey, 'secret')).toBe(true);
      expect(validateApiKey(secretLiveKey, 'secret')).toBe(true);
    });

    it('should reject invalid key formats', () => {
      expect(validateApiKey('invalid_key', 'public')).toBe(false);
      expect(validateApiKey('pk_test_short', 'public')).toBe(false);
      expect(validateApiKey('', 'public')).toBe(false);
      expect(validateApiKey(null as any, 'public')).toBe(false);
    });

    it('should reject mismatched key types', () => {
      expect(validateApiKey('sk_test_INVALID_FOR_TESTING_ONLY', 'public')).toBe(false);
      expect(validateApiKey('pk_test_INVALID_FOR_TESTING_ONLY', 'secret')).toBe(false);
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

    it('should reject URLs with embedded credentials', () => {
      expect(validateWebhookUrl('https://user:pass@example.com/webhook')).toBe(false);
      expect(validateWebhookUrl('https://user@example.com/webhook')).toBe(false);
    });

    it('should reject URLs exceeding max length', () => {
      const longPath = 'a'.repeat(2049);
      expect(validateWebhookUrl(`https://example.com/${longPath}`)).toBe(false);
    });

    it('should trim whitespace from URLs', () => {
      expect(validateWebhookUrl('  https://example.com/webhook  ')).toBe(true);
    });
  });
});
