import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CommandError } from '../../src/utils/errors.js';

const mocks = vi.hoisted(() => ({
  loadConfig: vi.fn(),
  createClient: vi.fn(),
  confirm: vi.fn(),
  readJsonInput: vi.fn(),
  spinner: { start: vi.fn(), succeed: vi.fn(), stop: vi.fn(), fail: vi.fn() },
  api: {
    createPaymentMethod: vi.fn(),
    getPaymentMethod: vi.fn(),
    createCheckoutSession: vi.fn(),
    getCheckoutSession: vi.fn(),
    expireCheckoutSession: vi.fn(),
    close: vi.fn(),
  },
}));
vi.mock('../../src/services/api/client.js', () => ({
  default: function ApiClient() {
    mocks.createClient();
    return mocks.api;
  },
}));
vi.mock('../../src/services/config/manager.js', () => ({
  default: class ConfigManager {
    load = mocks.loadConfig;
  },
}));
vi.mock('../../src/utils/spinner.js', () => ({
  default: function Spinner() {
    return mocks.spinner;
  },
}));
vi.mock('@inquirer/prompts', () => ({ confirm: mocks.confirm }));
vi.mock('../../src/commands/shared/json-input.js', () => ({ readJsonInput: mocks.readJsonInput }));

const { createPaymentMethodsCommand } = await import('../../src/commands/payment-methods/index.js');
const { createCheckoutCommand } = await import('../../src/commands/checkout/index.js');

const method = {
  id: 'pm_123',
  type: 'payment_method',
  attributes: { type: 'gcash', livemode: false, created_at: 1710000000, updated_at: 1710000000 },
};
const session = {
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

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  mocks.loadConfig.mockResolvedValue({ environment: 'test' });
  mocks.readJsonInput.mockReset().mockResolvedValue(undefined);
  mocks.confirm.mockResolvedValue(true);
  mocks.api.close.mockReset().mockResolvedValue(undefined);
  mocks.api.createPaymentMethod.mockReset().mockResolvedValue(method);
  mocks.api.getPaymentMethod.mockReset().mockResolvedValue(method);
  mocks.api.createCheckoutSession.mockReset().mockResolvedValue(session);
  mocks.api.getCheckoutSession.mockReset().mockResolvedValue(session);
  mocks.api.expireCheckoutSession.mockReset().mockResolvedValue({
    ...session,
    attributes: { ...session.attributes, status: 'expired' },
  });
});
afterEach(() => vi.restoreAllMocks());

function output(): string {
  return vi
    .mocked(console.log)
    .mock.calls.map((call) => call.join(' '))
    .join('\n');
}
function errors(): string {
  return vi
    .mocked(console.error)
    .mock.calls.map((call) => call.join(' '))
    .join('\n');
}

describe('Payment Method commands', () => {
  it('creates GCash and explains attachment without claiming payment', async () => {
    await createPaymentMethodsCommand().parseAsync(['create', '--type', 'gcash'], { from: 'user' });
    expect(mocks.api.createPaymentMethod).toHaveBeenCalledWith('gcash', undefined, undefined, {});
    expect(output()).toContain('pm_123');
    expect(output()).toContain('Attach this method');
    expect(output()).not.toContain('Payment successful');
    expect(mocks.api.close).toHaveBeenCalledOnce();
  });

  it('passes bank selection and JSON attributes', async () => {
    mocks.readJsonInput.mockImplementation(async (path?: string) => {
      if (path === 'billing.json') return { name: 'Customer', address: { country: 'PH' } };
      if (path === 'metadata.json') return { order: '123' };
      return undefined;
    });
    await createPaymentMethodsCommand().parseAsync(
      [
        'create',
        '--type',
        'dob',
        '--bank-code',
        'bpi',
        '--billing-file',
        'billing.json',
        '--metadata-file',
        'metadata.json',
      ],
      { from: 'user' }
    );
    expect(mocks.api.createPaymentMethod).toHaveBeenCalledWith(
      'dob',
      { name: 'Customer', address: { country: 'PH' } },
      { order: '123' },
      { bankCode: 'bpi' }
    );
  });

  it.each([
    ['qrph', '60'],
    ['qrph', '9000'],
    ['shopee_pay', '1'],
    ['shopee_pay', '3600'],
  ])('accepts expiry boundary %s/%s', async (type, expiry) => {
    await createPaymentMethodsCommand().parseAsync(
      ['create', '--type', type, '--expiry-seconds', expiry],
      { from: 'user' }
    );
    expect(mocks.api.createPaymentMethod).toHaveBeenCalledWith(type, undefined, undefined, {
      expirySeconds: Number(expiry),
    });
  });

  it.each([
    ['card'],
    ['maya'],
    ['dob'],
    ['brankas', '--bank-code', 'bpi'],
    ['gcash', '--bank-code', 'bpi'],
    ['gcash', '--expiry-seconds', '600'],
    ['qrph', '--expiry-seconds', '59'],
    ['qrph', '--expiry-seconds', '9001'],
    ['qrph', '--expiry-seconds', '100abc'],
    ['qrph', '--expiry-seconds', '100.5'],
    ['shopee_pay', '--expiry-seconds', '0'],
    ['shopee_pay', '--expiry-seconds', '3601'],
  ])('rejects invalid methods before configuration or client creation: %s', async (...args) => {
    await expect(
      createPaymentMethodsCommand().parseAsync(['create', '--type', ...args], { from: 'user' })
    ).rejects.toBeInstanceOf(CommandError);
    expect(mocks.loadConfig).not.toHaveBeenCalled();
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it('retrieves tokenized cards without printing billing or raw card data', async () => {
    mocks.api.getPaymentMethod.mockResolvedValue({
      ...method,
      attributes: {
        ...method.attributes,
        type: 'card',
        billing: { email: 'private@example.com' },
        details: { last4: '4242', card_number: 'raw-card-number', cvc: 'raw-cvc' },
      },
    });
    await createPaymentMethodsCommand().parseAsync(['show', 'pm_123', '--json'], { from: 'user' });
    const resource = JSON.parse(output());
    expect(resource.attributes.details).toEqual({ last4: '4242' });
    expect(resource.attributes.billing).toBeUndefined();
    expect(output()).not.toContain('private@example.com');
    expect(output()).not.toContain('raw-card-number');
    expect(output()).not.toContain('raw-cvc');
    expect(mocks.api.getPaymentMethod).toHaveBeenCalledWith('pm_123');
  });

  it('does not create a client without configuration', async () => {
    mocks.loadConfig.mockResolvedValueOnce(null);
    await createPaymentMethodsCommand().parseAsync(['create', '--type', 'gcash'], { from: 'user' });
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(mocks.api.close).not.toHaveBeenCalled();
  });

  it('closes the client when a request fails', async () => {
    mocks.api.getPaymentMethod.mockRejectedValueOnce(new Error('API unavailable'));
    await expect(
      createPaymentMethodsCommand().parseAsync(['show', 'pm_123'], { from: 'user' })
    ).rejects.toBeInstanceOf(CommandError);
    expect(mocks.api.close).toHaveBeenCalledOnce();
    expect(errors()).toContain('API unavailable');
  });

  it('retains completed resource output if cleanup fails', async () => {
    mocks.api.close.mockRejectedValueOnce(new Error('Pool shutdown failed'));
    await createPaymentMethodsCommand().parseAsync(['create', '--type', 'gcash', '--json'], {
      from: 'user',
    });
    expect(JSON.parse(output()).id).toBe('pm_123');
    expect(errors()).toContain('could not release API connections');
  });

  it('preserves the original API error if cleanup also fails', async () => {
    mocks.api.getPaymentMethod.mockRejectedValueOnce(new Error('API unavailable'));
    mocks.api.close.mockRejectedValueOnce(new Error('Pool shutdown failed'));
    await expect(
      createPaymentMethodsCommand().parseAsync(['show', 'pm_123'], { from: 'user' })
    ).rejects.toBeInstanceOf(CommandError);
    expect(errors()).toContain('API unavailable');
    expect(errors()).not.toContain('Pool shutdown failed');
  });

  it('rejects unsafe method IDs without a client', async () => {
    await expect(
      createPaymentMethodsCommand().parseAsync(['show', 'pm_123/other'], { from: 'user' })
    ).rejects.toBeInstanceOf(CommandError);
    expect(mocks.createClient).not.toHaveBeenCalled();
  });
});

describe('Hosted Checkout commands', () => {
  it('creates a single item and omits server defaults', async () => {
    await createCheckoutCommand().parseAsync(['create', '--amount', '50000', '--name', 'Order'], {
      from: 'user',
    });
    expect(mocks.api.createCheckoutSession).toHaveBeenCalledWith(
      expect.objectContaining({
        line_items: [{ amount: 50000, currency: 'PHP', name: 'Order', quantity: 1 }],
        payment_method_types: ['card', 'gcash', 'paymaya'],
      })
    );
    const [attributes] = mocks.api.createCheckoutSession.mock.calls[0] ?? [];
    expect(attributes.show_description).toBeUndefined();
    expect(attributes.show_line_items).toBeUndefined();
    expect(attributes.send_email_receipt).toBeUndefined();
    expect(output()).toContain('not payment success');
    expect(output()).toContain('https://checkout.paymongo.com/cs_123');
    expect(mocks.api.close).toHaveBeenCalledOnce();
  });

  it('passes multiple items, bank-specific methods, URLs, and false flags', async () => {
    const items = [
      { amount: 10000, currency: 'PHP', name: 'Coffee', quantity: 2 },
      { amount: 15000, currency: 'PHP', name: 'Tea', quantity: 1 },
    ];
    mocks.readJsonInput.mockImplementation(async (path?: string) =>
      path === 'items.json' ? items : undefined
    );
    await createCheckoutCommand().parseAsync(
      [
        'create',
        '--items-file',
        'items.json',
        '--methods',
        'card, dob_ubp,brankas_bdo',
        '--success-url',
        'https://example.com/success',
        '--cancel-url',
        'https://example.com/cancel',
        '--reference-number',
        'order-123',
        '--send-email-receipt',
        '--no-show-description',
        '--no-show-line-items',
        '--json',
      ],
      { from: 'user' }
    );
    expect(mocks.api.createCheckoutSession).toHaveBeenCalledWith(
      expect.objectContaining({
        line_items: items,
        payment_method_types: ['card', 'dob_ubp', 'brankas_bdo'],
        success_url: 'https://example.com/success',
        cancel_url: 'https://example.com/cancel',
        reference_number: 'order-123',
        send_email_receipt: true,
        show_description: false,
        show_line_items: false,
      })
    );
    expect(JSON.parse(output())).toEqual(session);
  });

  it.each([
    ['--amount', '100.5', '--name', 'Order'],
    ['--amount', '100abc', '--name', 'Order'],
    ['--amount', '0', '--name', 'Order'],
    ['--amount', '100'],
    ['--amount', '100', '--name', ''],
    ['--amount', '100', '--name', 'Order', '--quantity', '0'],
    ['--amount', '100', '--name', 'Order', '--quantity', '1000000001'],
    ['--amount', '100', '--name', 'Order', '--currency', 'USD'],
    ['--amount', '100', '--name', 'Order', '--methods', 'brankas'],
    ['--amount', '100', '--name', 'Order', '--methods', 'card,'],
    ['--amount', '100', '--name', 'Order', '--success-url', 'javascript:alert(1)'],
    ['--amount', '100', '--name', 'Order', '--cancel-url', 'https://user:password@example.com'],
    ['--items-file', 'items.json', '--amount', '100'],
    ['--items-file', 'items.json', '--quantity', '2'],
  ])('rejects invalid checkout flags without a client: %s', async (...args) => {
    await expect(
      createCheckoutCommand().parseAsync(['create', ...args], { from: 'user' })
    ).rejects.toBeInstanceOf(CommandError);
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it('shows independent session and intent statuses', async () => {
    mocks.api.getCheckoutSession.mockResolvedValue({
      ...session,
      attributes: {
        ...session.attributes,
        payment_intent: { attributes: { status: 'succeeded' } },
      },
    });
    await createCheckoutCommand().parseAsync(['show', 'cs_123'], { from: 'user' });
    expect(mocks.api.getCheckoutSession).toHaveBeenCalledWith('cs_123');
    expect(output()).toContain('Session status: active');
    expect(output()).toContain('Payment Intent status: succeeded');
    expect(output()).toContain('verified webhooks');
    expect(output()).toContain('checkout_session.payment.paid');
  });

  it('redacts nested billing and client keys from JSON', async () => {
    mocks.api.getCheckoutSession.mockResolvedValue({
      ...session,
      attributes: {
        ...session.attributes,
        client_key: 'private-client-key',
        billing: { name: 'Customer' },
        payment_intent: {
          attributes: {
            client_key: 'nested-client-key',
            payments: [{ attributes: { billing: { email: 'private@example.com' } } }],
          },
        },
      },
    });
    await createCheckoutCommand().parseAsync(['show', 'cs_123', '--json'], { from: 'user' });
    expect(output()).not.toContain('private-client-key');
    expect(output()).not.toContain('nested-client-key');
    expect(output()).not.toContain('private@example.com');
    expect(JSON.parse(output()).attributes.status).toBe('active');
  });

  it('expires with confirmation and reports the returned status', async () => {
    await createCheckoutCommand().parseAsync(['expire', 'cs_123'], { from: 'user' });
    expect(mocks.confirm).toHaveBeenCalledWith(expect.objectContaining({ default: false }));
    expect(mocks.api.expireCheckoutSession).toHaveBeenCalledWith('cs_123');
    expect(output()).toContain('Session status: expired');
    expect(mocks.api.close).toHaveBeenCalledOnce();
  });

  it('does not prompt for expiration without configuration', async () => {
    mocks.loadConfig.mockResolvedValueOnce(null);
    await createCheckoutCommand().parseAsync(['expire', 'cs_123'], { from: 'user' });
    expect(mocks.confirm).not.toHaveBeenCalled();
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it('identifies the configured environment in the expiration prompt', async () => {
    mocks.loadConfig.mockResolvedValueOnce({ environment: 'live' });
    await createCheckoutCommand().parseAsync(['expire', 'cs_123'], { from: 'user' });
    expect(mocks.confirm).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('LIVE mode') })
    );
  });

  it('supports noninteractive expiration with --yes', async () => {
    await createCheckoutCommand().parseAsync(['expire', 'cs_123', '--yes', '--json'], {
      from: 'user',
    });
    expect(mocks.confirm).not.toHaveBeenCalled();
    expect(JSON.parse(output()).attributes.status).toBe('expired');
  });

  it('does not send expiration if confirmation is declined', async () => {
    mocks.confirm.mockResolvedValueOnce(false);
    await createCheckoutCommand().parseAsync(['expire', 'cs_123'], { from: 'user' });
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(output()).toContain('cancelled');
  });

  it.each(['show', 'expire'])('validates IDs before %s', async (action) => {
    await expect(
      createCheckoutCommand().parseAsync([action, 'cs_123/expire'], { from: 'user' })
    ).rejects.toBeInstanceOf(CommandError);
    expect(mocks.confirm).not.toHaveBeenCalled();
    expect(mocks.createClient).not.toHaveBeenCalled();
  });
});
