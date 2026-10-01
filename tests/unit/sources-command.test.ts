import chalk from 'chalk';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PayMongoConfig, SourceData } from '../../src/types/paymongo.js';
import { CommandError } from '../../src/utils/errors.js';
import { testConfig } from '../fixtures/config.js';

const m = vi.hoisted(() => ({
  load: vi.fn<() => Promise<PayMongoConfig | null>>(),
  create: vi.fn<() => Promise<SourceData>>(),
  get: vi.fn<() => Promise<SourceData>>(),
  start: vi.fn(),
  succeed: vi.fn(),
  fail: vi.fn(),
  stop: vi.fn(),
  info: vi.fn(),
}));
vi.mock('../../src/services/config/manager.js', () => ({
  default: vi.fn().mockImplementation(() => ({ load: m.load })),
}));
vi.mock('../../src/services/api/client.js', () => ({
  default: vi.fn().mockImplementation(() => ({ createSource: m.create, getSource: m.get })),
}));
vi.mock('../../src/utils/spinner.js', () => ({
  default: vi.fn().mockImplementation(() => m),
}));
const { createAction, showAction, listAction } = await import(
  '../../src/commands/sources/index.js'
);
const { getStatusColor } = await import('../../src/commands/sources/helpers.js');

function source(): SourceData {
  return {
    id: 'src_fixture',
    type: 'source',
    attributes: {
      amount: 10000,
      currency: 'PHP',
      type: 'gcash',
      status: 'awaiting_payment',
      livemode: false,
      created_at: 1700000000,
      updated_at: 1700000001,
    },
  };
}
function output() {
  return vi
    .mocked(console.log)
    .mock.calls.map((call) => call.join(' '))
    .join('\n');
}

// These test legacy CLI behavior, not provider availability or API contract certification.
describe('Legacy Sources command behavior (API mocked)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.load.mockReset().mockResolvedValue(testConfig());
    m.create.mockReset().mockResolvedValue(source());
    m.get.mockReset().mockResolvedValue(source());
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it('creates with existing defaults and reports availability without claiming success', async () => {
    await createAction({});
    expect(m.create).toHaveBeenCalledWith(10000, 'gcash', 'PHP', undefined);
    expect(output()).toContain('awaiting_payment');
    expect(output()).toContain('100.00');
    expect(output()).toContain('N/A');
  });
  it('passes supplied values and optional display fields through the compatibility command', async () => {
    const data = source();
    data.attributes.description = 'Fixture order';
    data.attributes.reference_number = 'fixture-reference';
    data.attributes.checkout_url = 'https://example.com/fixture';
    m.create.mockResolvedValue(data);
    await createAction({
      amount: '20000',
      type: 'gcash',
      currency: 'PHP',
      description: 'Fixture order',
    });
    expect(m.create).toHaveBeenCalledWith(20000, 'gcash', 'PHP', 'Fixture order');
    expect(output()).toContain('https://example.com/fixture');
    expect(output()).toContain('fixture-reference');
  });
  it('serializes the legacy mock resource as JSON', async () => {
    await createAction({ json: true });
    expect(console.log).toHaveBeenCalledWith(JSON.stringify(source(), null, 2));
  });
  it.each([
    '0',
    '-1',
    'not-a-number',
  ])('rejects invalid amount %s without mutation', async (amount) => {
    await expect(createAction({ amount })).rejects.toBeInstanceOf(CommandError);
    expect(m.create).not.toHaveBeenCalled();
    expect(m.stop).toHaveBeenCalled();
  });
  it('rejects an unknown type rather than sending it to the API', async () => {
    await expect(createAction({ type: 'unknown' })).rejects.toBeInstanceOf(CommandError);
    expect(m.create).not.toHaveBeenCalled();
  });
  it('displays existing test and live resources distinctly', async () => {
    await showAction('src_fixture', {});
    expect(m.get).toHaveBeenCalledWith('src_fixture');
    expect(output()).toContain('TEST');
    expect(output()).not.toContain('undefined');
    const data = source();
    data.attributes.livemode = true;
    data.attributes.description = 'Fixture description';
    data.attributes.reference_number = 'fixture-reference';
    data.attributes.checkout_url = 'https://example.com/fixture';
    m.get.mockResolvedValue(data);
    await showAction('src_fixture', {});
    expect(output()).toContain('LIVE');
    expect(output()).toContain('Fixture description');
    expect(output()).toContain('fixture-reference');
    expect(output()).toContain('https://example.com/fixture');
  });
  it.each([
    'create',
    'show',
  ])('redacts sensitive fields from legacy %s JSON without modifying the resource', async (action) => {
    const data = {
      ...source(),
      attributes: {
        ...source().attributes,
        billing: { email: 'private@example.com' },
        client_key: 'private-client-key',
        metadata: { secret_key: 'private-secret' },
      },
    };
    m.create.mockResolvedValue(data);
    m.get.mockResolvedValue(data);
    if (action === 'create') await createAction({ json: true });
    else await showAction('src_fixture', { json: true });
    expect(output()).not.toContain('private');
    expect(data.attributes.billing.email).toBe('private@example.com');
  });
  it('retrieves JSON without pretty output', async () => {
    await showAction('src_fixture', { json: true });
    expect(console.log).toHaveBeenCalledExactlyOnceWith(JSON.stringify(source(), null, 2));
  });
  it('explains the unsupported list operation without an API call', async () => {
    await listAction({});
    expect(m.info).toHaveBeenCalled();
    expect(output()).toContain('not supported');
    expect(m.get).not.toHaveBeenCalled();
    expect(m.create).not.toHaveBeenCalled();
  });
  it.each([
    'create',
    'show',
    'list',
  ])('does not execute %s when configuration is absent', async (action) => {
    m.load.mockResolvedValue(null);
    if (action === 'create') await createAction({});
    else if (action === 'show') await showAction('src_fixture', {});
    else await listAction({});
    expect(m.fail).toHaveBeenCalledWith('No configuration found');
    expect(m.create).not.toHaveBeenCalled();
    expect(m.get).not.toHaveBeenCalled();
  });
  it.each(['create', 'show', 'list'])('propagates configuration errors for %s', async (action) => {
    m.load.mockRejectedValue(new Error('Fixture load failure'));
    const operation =
      action === 'create'
        ? createAction({})
        : action === 'show'
          ? showAction('src_fixture', {})
          : listAction({});
    await expect(operation).rejects.toBeInstanceOf(CommandError);
    expect(console.error).toHaveBeenCalledWith(expect.any(String), 'Fixture load failure');
  });
  it.each(['create', 'show'])('does not claim success after %s API failure', async (action) => {
    m.create.mockRejectedValue(new Error('Fixture API failure'));
    m.get.mockRejectedValue(new Error('Fixture API failure'));
    await expect(
      action === 'create' ? createAction({}) : showAction('src_fixture', {})
    ).rejects.toBeInstanceOf(CommandError);
    expect(m.succeed).not.toHaveBeenCalledWith('Source created');
    expect(m.succeed).not.toHaveBeenCalledWith('Source details loaded');
  });
  it.each([
    ['paid', 'green'],
    ['chargeable', 'green'],
    ['processed', 'green'],
    ['pending', 'yellow'],
    ['awaiting_payment', 'yellow'],
    ['failed', 'red'],
    ['expired', 'red'],
    ['unknown', 'white'],
  ] as const)('uses the display color for %s', (status, color) => {
    expect(getStatusColor(status)).toBe(chalk[color]);
  });
});
