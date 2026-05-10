import { describe, expect, it } from 'vitest';
import {
  computeSignature,
  extractLivemode,
  generateTestSignature,
  parseSignatureHeader,
  verifyWebhook,
  verifyWebhookSignature,
} from '../../src/utils/webhook-verifier.js';

describe('Webhook Verifier', () => {
  const testSecret = 'whsec_test_secret_key_12345678901234567890';
  const testPayload = JSON.stringify({ data: { id: 'evt_test', type: 'payment.paid' } });
  const testTimestamp = '1704000000';
  const testSignature = computeSignature(testPayload, testTimestamp, testSecret);

  describe('parseSignatureHeader', () => {
    it('should parse a valid signature header', () => {
      const header = `t=${testTimestamp},te=${testSignature},li=${testSignature}`;
      const result = parseSignatureHeader(header, false);

      expect(result).not.toBeNull();
      expect(result?.timestamp).toBe(testTimestamp);
      expect(result?.signature).toBe(testSignature);
      expect(result?.isLivemode).toBe(false);
    });

    it('should use live signature when livemode is true', () => {
      const testSig = 'test_sig_abc123';
      const liveSig = 'live_sig_xyz789';
      const header = `t=${testTimestamp},te=${testSig},li=${liveSig}`;
      const result = parseSignatureHeader(header, true);

      expect(result?.signature).toBe(liveSig);
      expect(result?.isLivemode).toBe(true);
    });

    it('should fall back to live signature when test signature is missing', () => {
      const liveSig = 'live_sig_xyz789';
      const header = `t=${testTimestamp},li=${liveSig}`;
      const result = parseSignatureHeader(header, false);

      expect(result?.signature).toBe(liveSig);
    });

    it('should return null for invalid header', () => {
      expect(parseSignatureHeader('', false)).toBeNull();
      expect(parseSignatureHeader('invalid', false)).toBeNull();
      expect(parseSignatureHeader(null as unknown as string, false)).toBeNull();
    });

    it('should return null when timestamp is missing', () => {
      const header = `te=${testSignature}`;
      expect(parseSignatureHeader(header, false)).toBeNull();
    });
  });

  describe('computeSignature', () => {
    it('should compute consistent HMAC SHA256 signature', () => {
      const sig1 = computeSignature(testPayload, testTimestamp, testSecret);
      const sig2 = computeSignature(testPayload, testTimestamp, testSecret);

      expect(sig1).toBe(sig2);
      expect(sig1).toMatch(/^[a-f0-9]{64}$/); // SHA256 hex is 64 chars
    });

    it('should produce different signatures for different payloads', () => {
      const sig1 = computeSignature(testPayload, testTimestamp, testSecret);
      const sig2 = computeSignature('different payload', testTimestamp, testSecret);

      expect(sig1).not.toBe(sig2);
    });

    it('should produce different signatures for different secrets', () => {
      const sig1 = computeSignature(testPayload, testTimestamp, testSecret);
      const sig2 = computeSignature(testPayload, testTimestamp, 'different_secret');

      expect(sig1).not.toBe(sig2);
    });

    it('should produce different signatures for different timestamps', () => {
      const sig1 = computeSignature(testPayload, testTimestamp, testSecret);
      const sig2 = computeSignature(testPayload, '1704000001', testSecret);

      expect(sig1).not.toBe(sig2);
    });
  });

  describe('verifyWebhookSignature', () => {
    it('should verify valid signature', () => {
      const header = `t=${testTimestamp},te=${testSignature},li=${testSignature}`;
      const result = verifyWebhookSignature({
        payload: testPayload,
        signatureHeader: header,
        secret: testSecret,
      });

      expect(result).toBe(true);
    });

    it('should reject invalid signature', () => {
      const invalidSig = 'a'.repeat(64);
      const header = `t=${testTimestamp},te=${invalidSig}`;
      const result = verifyWebhookSignature({
        payload: testPayload,
        signatureHeader: header,
        secret: testSecret,
      });

      expect(result).toBe(false);
    });

    it('should reject wrong secret', () => {
      const header = `t=${testTimestamp},te=${testSignature}`;
      const result = verifyWebhookSignature({
        payload: testPayload,
        signatureHeader: header,
        secret: 'wrong_secret',
      });

      expect(result).toBe(false);
    });

    it('should reject tampered payload', () => {
      const header = `t=${testTimestamp},te=${testSignature}`;
      const result = verifyWebhookSignature({
        payload: '{"tampered": true}',
        signatureHeader: header,
        secret: testSecret,
      });

      expect(result).toBe(false);
    });

    it('should handle missing parameters gracefully', () => {
      expect(
        verifyWebhookSignature({
          payload: '',
          signatureHeader: '',
          secret: testSecret,
        })
      ).toBe(false);

      expect(
        verifyWebhookSignature({
          payload: testPayload,
          signatureHeader: '',
          secret: testSecret,
        })
      ).toBe(false);

      expect(
        verifyWebhookSignature({
          payload: testPayload,
          signatureHeader: `t=${testTimestamp},te=${testSignature}`,
          secret: '',
        })
      ).toBe(false);
    });

    it('should respect livemode flag', () => {
      const liveSig = computeSignature(testPayload, testTimestamp, 'live_secret');
      const testSig = computeSignature(testPayload, testTimestamp, 'test_secret');
      const header = `t=${testTimestamp},te=${testSig},li=${liveSig}`;

      // Test mode (livemode=false) - should use test signature
      const testResult = verifyWebhookSignature({
        payload: testPayload,
        signatureHeader: header,
        secret: 'test_secret',
        livemode: false,
      });
      expect(testResult).toBe(true);

      // Live mode (livemode=true) - should use live signature
      const liveResult = verifyWebhookSignature({
        payload: testPayload,
        signatureHeader: header,
        secret: 'live_secret',
        livemode: true,
      });
      expect(liveResult).toBe(true);
    });
  });

  describe('extractLivemode', () => {
    it('should extract livemode from payload', () => {
      const payload = {
        data: {
          attributes: {
            livemode: true,
          },
        },
      };
      expect(extractLivemode(payload)).toBe(true);

      const testPayload = {
        data: {
          attributes: {
            livemode: false,
          },
        },
      };
      expect(extractLivemode(testPayload)).toBe(false);
    });

    it('should return false for invalid payload', () => {
      expect(extractLivemode(null)).toBe(false);
      expect(extractLivemode(undefined)).toBe(false);
      expect(extractLivemode({})).toBe(false);
      expect(extractLivemode({ data: {} })).toBe(false);
    });
  });

  describe('verifyWebhook (with auto livemode detection)', () => {
    it('should auto-detect livemode from payload', () => {
      const payload = {
        data: {
          attributes: {
            livemode: true,
            amount: 10000,
          },
        },
      };
      const payloadStr = JSON.stringify(payload);
      const sig = computeSignature(payloadStr, testTimestamp, testSecret);
      const header = `t=${testTimestamp},te=${sig},li=${sig}`;

      const result = verifyWebhook(payloadStr, header, testSecret, payload);
      expect(result).toBe(true);
    });
  });

  describe('generateTestSignature', () => {
    it('should generate a valid test signature header', () => {
      const header = generateTestSignature(testPayload, testSecret);

      expect(header).toContain('t=');
      expect(header).toContain('te=');
      expect(header).toContain('li=');

      // Verify the generated signature can be validated
      const result = verifyWebhookSignature({
        payload: testPayload,
        signatureHeader: header,
        secret: testSecret,
      });
      expect(result).toBe(true);
    });

    it('should use provided timestamp', () => {
      const customTimestamp = 1700000000;
      const header = generateTestSignature(testPayload, testSecret, customTimestamp);

      expect(header).toContain(`t=${customTimestamp}`);
    });
  });
});
