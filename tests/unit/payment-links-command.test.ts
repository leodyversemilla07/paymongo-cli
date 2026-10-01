import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PaymentLinkData } from '../../src/types/paymongo.js';

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  get: vi.fn(),
  list: vi.fn(),
  start: vi.fn(),
  succeed: vi.fn(),
}));

vi.mock('../../src/commands/payment-links/helpers.js', () => ({
  createPaymentLinksContext: () => ({ spinner: mocks, configManager: {} }),
  loadPaymentLinksConfig: async () => ({ environment: 'test' }),
  createApiClient: () => ({
    createPaymentLink: mocks.create,
    getPaymentLink: mocks.get,
    listPaymentLinks: mocks.list,
  }),
  handlePaymentLinksError: (_prefix: string, _spinner: unknown, error: unknown) => {
    throw error;
  },
}));

const { createAction, showAction, listAction } = await import(
  '../../src/commands/payment-links/actions.js'
);

describe('Payment Links commands with documented flat responses', () => {
  const link: PaymentLinkData = {
    id: 'link_123',
    amount: 10000,
    currency: 'PHP',
    description: 'Order #123',
    status: 'active',
    livemode: false,
    url: 'https://pm.link/store/abc',
    reference_number: 'abc',
    metadata: {},
    created_at: '2026-05-21T08:00:00Z',
    updated_at: '2026-05-21T08:00:00Z',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    mocks.create.mockResolvedValue(link);
    mocks.get.mockResolvedValue(link);
    mocks.list.mockResolvedValue([link]);
  });

  afterEach(() => vi.restoreAllMocks());

  function output(): string {
    return vi
      .mocked(console.log)
      .mock.calls.map((call) => call.join(' '))
      .join('\n');
  }

  it('shows the shareable url and management status after creation', async () => {
    await createAction({ amount: '10000', description: 'Order #123' });
    expect(mocks.create).toHaveBeenCalledWith(10000, 'Order #123', 'PHP', undefined);
    expect(output()).toContain(link.url);
    expect(output()).toContain('active');
    expect(output()).not.toContain('undefined');
    expect(output()).not.toContain('NaN');
  });

  it('parses ISO timestamps and displays archived links', async () => {
    mocks.get.mockResolvedValue({ ...link, status: 'archived' });
    await showAction(link.id, {});
    expect(output()).toContain('archived');
    expect(output()).toContain(new Date(link.created_at).toLocaleString());
    expect(output()).not.toContain('Invalid Date');
  });

  it('renders a flat list without invalid amounts or dates', async () => {
    await listAction({ limit: '5' });
    expect(mocks.list).toHaveBeenCalledWith(5);
    expect(output()).toContain('100.00');
    expect(output()).not.toMatch(/NaN|Invalid Date|undefined/);
  });

  it.each([
    'create',
    'show',
    'list',
  ])('redacts credential metadata from %s JSON without modifying the response', async (action) => {
    const resource = { ...link, metadata: { secret_key: 'private-key', order: 'fixture' } };
    mocks.create.mockResolvedValue(resource);
    mocks.get.mockResolvedValue(resource);
    mocks.list.mockResolvedValue([resource]);
    if (action === 'create')
      await createAction({ amount: '10000', description: 'Order', json: true });
    else if (action === 'show') await showAction(link.id, { json: true });
    else await listAction({ json: true });
    expect(output()).not.toContain('private-key');
    expect(output()).toContain('fixture');
    expect(resource.metadata.secret_key).toBe('private-key');
  });

  it('outputs the documented resource unchanged as JSON', async () => {
    await showAction(link.id, { json: true });
    expect(console.log).toHaveBeenCalledWith(JSON.stringify(link, null, 2));
  });

  it.each([
    '99',
    '100.5',
    '100abc',
    '1000000000',
    '',
  ])('rejects invalid amount %s without API calls', async (amount) => {
    await expect(createAction({ amount, description: 'Order' })).rejects.toThrow();
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('requires a description and uppercase currency', async () => {
    await expect(createAction({ amount: '100' })).rejects.toThrow();
    await expect(
      createAction({ amount: '100', description: 'Order', currency: 'php' })
    ).rejects.toThrow();
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it.each(['0', '101', '2.5', '5abc'])('rejects invalid display limit %s', async (limit) => {
    await expect(listAction({ limit })).rejects.toThrow();
    expect(mocks.list).not.toHaveBeenCalled();
  });
});
