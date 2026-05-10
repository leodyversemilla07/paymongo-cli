/**
 * Webhook Signature Verification Utility
 *
 * Verifies PayMongo webhook signatures using HMAC SHA256.
 *
 * @example
 * ```typescript
 * import { verifyWebhookSignature } from './webhook-verifier.js';
 *
 * const payload = JSON.stringify(requestBody);
 * const signature = request.headers['paymongo-signature'];
 * const secret = 'whsec_xxx';
 *
 * const isValid = verifyWebhookSignature(payload, signature, secret);
 * ```
 */

import * as crypto from 'node:crypto';

export interface SignatureVerificationOptions {
  /**
   * The raw request body as a string
   */
  payload: string;
  /**
   * The signature header from PayMongo
   * Format: t=<timestamp>,te=<test-signature>,li=<live-signature>
   */
  signatureHeader: string;
  /**
   * The webhook signing secret from PayMongo
   * Format: whsec_xxx
   */
  secret: string;
  /**
   * Whether to use the live signature (true) or test signature (false)
   * @default false
   */
  livemode?: boolean;
}

export interface ParsedSignature {
  timestamp: string;
  signature: string;
  isLivemode: boolean;
}

/**
 * Parse the PayMongo signature header into its components
 *
 * @param signatureHeader - The raw signature header
 * @param livemode - Whether to use live signature
 * @returns Parsed signature components
 */
export function parseSignatureHeader(
  signatureHeader: string,
  livemode: boolean = false
): ParsedSignature | null {
  if (!signatureHeader || typeof signatureHeader !== 'string') {
    return null;
  }

  const parts = signatureHeader.split(',');
  const timestampPart = parts.find((p) => p.startsWith('t='));
  const testSigPart = parts.find((p) => p.startsWith('te='));
  const liveSigPart = parts.find((p) => p.startsWith('li='));

  const timestamp = timestampPart?.split('=')[1];
  const testSignature = testSigPart?.split('=')[1];
  const liveSignature = liveSigPart?.split('=')[1];

  if (!timestamp) {
    return null;
  }

  // Select signature based on livemode
  const signature = livemode ? liveSignature : testSignature || liveSignature;

  if (!signature) {
    return null;
  }

  return {
    timestamp,
    signature,
    isLivemode: livemode,
  };
}

/**
 * Compute the expected HMAC SHA256 signature for a webhook payload
 *
 * PayMongo signature format: HMAC-SHA256(secret, "${timestamp}.${payload}")
 *
 * @param payload - The raw request body
 * @param timestamp - The timestamp from the signature header
 * @param secret - The webhook signing secret
 * @returns The computed signature as a hex string
 */
export function computeSignature(payload: string, timestamp: string, secret: string): string {
  const signedPayload = `${timestamp}.${payload}`;
  return crypto.createHmac('sha256', secret).update(signedPayload, 'utf8').digest('hex');
}

/**
 * Verify a PayMongo webhook signature using timing-safe comparison
 *
 * @param options - Verification options
 * @returns True if signature is valid, false otherwise
 */
export function verifyWebhookSignature(options: SignatureVerificationOptions): boolean {
  const { payload, signatureHeader, secret, livemode = false } = options;

  if (!payload || !signatureHeader || !secret) {
    return false;
  }

  const parsed = parseSignatureHeader(signatureHeader, livemode);
  if (!parsed) {
    return false;
  }

  const expectedSignature = computeSignature(payload, parsed.timestamp, secret);

  try {
    // Use timing-safe comparison to prevent timing attacks
    const isValid = crypto.timingSafeEqual(
      Buffer.from(parsed.signature, 'hex'),
      Buffer.from(expectedSignature, 'hex')
    );
    return isValid;
  } catch {
    // Handle case where signature format is invalid
    return false;
  }
}

/**
 * Extract livemode from webhook payload
 *
 * @param payload - The parsed webhook payload
 * @returns true if this is a live webhook, false for test
 */
export function extractLivemode(payload: unknown): boolean {
  if (!payload || typeof payload !== 'object') {
    return false;
  }

  const data = (payload as { data?: { attributes?: { livemode?: boolean } } }).data;
  if (!data?.attributes) {
    return false;
  }

  return Boolean(data.attributes.livemode);
}

/**
 * Verify a webhook request with automatic livemode detection from payload
 *
 * @param payload - The raw request body as string
 * @param signatureHeader - The PayMongo signature header
 * @param secret - The webhook signing secret
 * @param rawPayload - The parsed payload object (for livemode detection)
 * @returns True if signature is valid
 */
export function verifyWebhook(
  payload: string,
  signatureHeader: string,
  secret: string,
  rawPayload?: unknown
): boolean {
  const livemode = rawPayload ? extractLivemode(rawPayload) : false;
  return verifyWebhookSignature({
    payload,
    signatureHeader,
    secret,
    livemode,
  });
}

/**
 * Generate a test webhook signature for local testing
 *
 * @param payload - The test payload
 * @param secret - The webhook signing secret
 * @param timestamp - Optional timestamp (defaults to current time)
 * @returns A test signature header
 */
export function generateTestSignature(payload: string, secret: string, timestamp?: number): string {
  const ts = timestamp || Math.floor(Date.now() / 1000);
  const signature = computeSignature(payload, ts.toString(), secret);
  return `t=${ts},te=${signature},li=${signature}`;
}

export default {
  verifyWebhookSignature,
  verifyWebhook,
  parseSignatureHeader,
  computeSignature,
  extractLivemode,
  generateTestSignature,
};
