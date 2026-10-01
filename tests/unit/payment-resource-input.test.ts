import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readJsonInput } from '../../src/commands/shared/json-input.js';
import {
  CheckoutSessionCreateSchema,
  PaymentMethodCreateSchema,
  parseApiInput,
} from '../../src/types/schemas.js';
import { ConfigError, ValidationError } from '../../src/utils/errors.js';
import { redactPaymentResource } from '../../src/utils/payment-resource.js';

const item = { amount: 10000, currency: 'PHP', name: 'Order', quantity: 1 };
const checkoutInput = { line_items: [item], payment_method_types: ['card'] };

describe('Payment resource input schemas', () => {
  it.each([
    ['dob', 'bpi'],
    ['dob', 'ubp'],
    ['dob', 'test_bank_one'],
    ['dob', 'test_bank_two'],
    ['brankas', 'bdo'],
    ['brankas', 'metrobank'],
    ['brankas', 'landbank'],
  ])('accepts documented bank selection %s/%s', (type, bankCode) => {
    expect(
      PaymentMethodCreateSchema.safeParse({ type, details: { bank_code: bankCode } }).success
    ).toBe(true);
  });

  it.each([
    { type: 'gcash', billing: { address: { country_code: 'PH' } } },
    { type: 'gcash', billing: { address: { country: 'Philippines' } } },
    { type: 'gcash', billing: { email: 'not-an-email' } },
    { type: 'gcash', billing: { card_number: 'private-card' } },
    { type: 'gcash', metadata: { amount: 100 } },
    { type: 'gcash', metadata: { nested: { order: '123' } } },
    { type: 'gcash', details: { cvc: 'private-cvc' } },
  ])('rejects invalid or unsupported method fields', (input) => {
    expect(() => parseApiInput(PaymentMethodCreateSchema, input)).toThrow(ValidationError);
  });

  it('does not echo rejected input values', () => {
    try {
      parseApiInput(PaymentMethodCreateSchema, {
        type: 'gcash',
        billing: { email: 'private-invalid-email' },
      });
      throw new Error('Expected validation to reject input');
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      expect((error as Error).message).not.toContain('private-invalid-email');
    }
  });

  it('accepts documented line-item boundaries and a single image', () => {
    const input = {
      ...checkoutInput,
      line_items: [
        {
          ...item,
          quantity: 1000000000,
          description: 'a'.repeat(255),
          images: ['https://example.com/item.png'],
        },
      ],
    };
    expect(CheckoutSessionCreateSchema.safeParse(input).success).toBe(true);
    expect(
      CheckoutSessionCreateSchema.safeParse({
        ...checkoutInput,
        line_items: Array.from({ length: 999 }, () => item),
      }).success
    ).toBe(true);
  });

  it.each([
    { items: [] },
    { items: [{ ...item, amount: 100.5 }] },
    { items: [{ ...item, quantity: 0 }] },
    { items: [{ ...item, quantity: 1000000001 }] },
    { items: [{ ...item, description: 'a'.repeat(256) }] },
    { items: [{ ...item, images: ['https://example.com/1', 'https://example.com/2'] }] },
    { items: [{ ...item, images: ['file:///private/image.png'] }] },
    { items: [{ ...item, images: ['https://user:secret@example.com/image.png'] }] },
    { items: [{ ...item, currency: 'USD' }] },
    { items: [{ ...item, name: '   ' }] },
    { items: [{ ...item, amount: Number.MAX_SAFE_INTEGER, quantity: 2 }] },
    { items: Array.from({ length: 1000 }, () => item) },
  ])('rejects invalid line-item arrays', ({ items }) => {
    expect(
      CheckoutSessionCreateSchema.safeParse({ ...checkoutInput, line_items: items }).success
    ).toBe(false);
  });

  it.each([
    { payment_method_types: [] },
    { payment_method_types: ['brankas'] },
    { payment_method_types: ['maya'] },
    { metadata: { total: 100 } },
    { success_url: 'javascript:alert(1)' },
    { cancel_url: 'https://user:secret@example.com' },
    { unsupported_option: true },
    { show_description: 'false' },
  ])('rejects invalid checkout attributes', (attributes) => {
    expect(CheckoutSessionCreateSchema.safeParse({ ...checkoutInput, ...attributes }).success).toBe(
      false
    );
  });
});

describe('Bounded JSON file input', () => {
  let directory: string;
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'paymongo-json-'));
  });
  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it('returns undefined when no file is supplied', async () => {
    expect(await readJsonInput()).toBeUndefined();
  });
  it('reads arrays and objects without executing input', async () => {
    const path = join(directory, 'items.json');
    await writeFile(path, JSON.stringify([item]));
    expect(await readJsonInput(path)).toEqual([item]);
    await writeFile(path, JSON.stringify({ order: '123' }));
    expect(await readJsonInput(path)).toEqual({ order: '123' });
  });
  it('reports malformed JSON without exposing file contents', async () => {
    const path = join(directory, 'invalid.json');
    await writeFile(path, '{"secret": "private-value" broken');
    await expect(readJsonInput(path)).rejects.toThrow(ValidationError);
    await expect(readJsonInput(path)).rejects.not.toThrow('private-value');
  });
  it('reports missing files using ConfigError', async () => {
    await expect(readJsonInput(join(directory, 'missing.json'))).rejects.toThrow(ConfigError);
  });
  it('rejects non-files and oversized input', async () => {
    await expect(readJsonInput(directory)).rejects.toThrow(ValidationError);
    const path = join(directory, 'large.json');
    await writeFile(path, ' '.repeat(1024 * 1024 + 1));
    await expect(readJsonInput(path)).rejects.toThrow('at most 1 MiB');
  });
});

describe('Sanitized payment resource JSON', () => {
  it('removes sensitive fields recursively without mutating the response', () => {
    const resource = {
      id: 'cs_123',
      attributes: {
        checkout_url: 'https://checkout.paymongo.com/cs_123',
        client_key: 'private-client-key',
        billing: { email: 'private@example.com' },
        payments: [
          {
            attributes: {
              billing: { name: 'Customer' },
              details: { last4: '4242', cvc: 'private-cvc', card_number: 'private-card' },
            },
          },
        ],
        metadata: {
          order: '123',
          api_key: 'private-api-key',
          secret_key: 'private-webhook-secret',
          secret: 'private-secret',
        },
      },
    };
    const sanitized = redactPaymentResource(resource);
    expect(sanitized).toEqual({
      id: 'cs_123',
      attributes: {
        checkout_url: 'https://checkout.paymongo.com/cs_123',
        payments: [{ attributes: { details: { last4: '4242' } } }],
        metadata: { order: '123' },
      },
    });
    expect(resource.attributes.client_key).toBe('private-client-key');
    expect(resource.attributes.billing.email).toBe('private@example.com');
  });
  it('preserves nulls and non-sensitive scalar fields', () => {
    expect(redactPaymentResource([null, false, 100, 'active'])).toEqual([
      null,
      false,
      100,
      'active',
    ]);
  });
});
