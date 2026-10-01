import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StoredWebhookEvent } from '../../src/utils/webhook-store.js';

const m = vi.hoisted(() => ({
  mkdir: vi.fn(),
  read: vi.fn(),
  write: vi.fn(),
  unlink: vi.fn(),
}));
vi.mock('node:os', () => ({ homedir: () => '/fixture-home' }));
vi.mock('node:fs/promises', () => ({
  default: { mkdir: m.mkdir, readFile: m.read, writeFile: m.write, unlink: m.unlink },
}));
const { default: WebhookEventStore } = await import('../../src/utils/webhook-store.js');

function event(id = 'evt_fixture', type = 'payment.paid'): StoredWebhookEvent {
  return {
    id,
    event: type,
    url: 'http://127.0.0.1/webhooks',
    timestamp: 1700000000,
    status: 'delivered',
    payload: { data: { id, type: 'event', attributes: { type, livemode: false } } },
  };
}
describe('Webhook event store persistence', () => {
  let store: WebhookEventStore;
  const storePath = path.join('/fixture-home', '.paymongo', 'webhook-events.json');
  beforeEach(() => {
    vi.clearAllMocks();
    m.read.mockReset().mockResolvedValue('[]');
    m.mkdir.mockReset().mockResolvedValue(undefined);
    m.write.mockReset().mockResolvedValue(undefined);
    m.unlink.mockReset().mockResolvedValue(undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    store = new WebhookEventStore();
  });
  afterEach(() => vi.restoreAllMocks());
  it('creates the directory and appends an event without discarding history', async () => {
    const previous = event('evt_previous');
    m.read.mockResolvedValue(JSON.stringify([previous]));
    await store.storeEvent(event());
    expect(m.mkdir).toHaveBeenCalledWith(path.dirname(storePath), { recursive: true, mode: 0o700 });
    expect(m.write).toHaveBeenCalledWith(storePath, JSON.stringify([previous, event()], null, 2), {
      mode: 0o600,
    });
  });
  it('retains the newest 1000 events in chronological order', async () => {
    const previous = Array.from({ length: 1000 }, (_, index) => event(`evt_${index}`));
    m.read.mockResolvedValue(JSON.stringify(previous));
    await store.storeEvent(event('evt_new'));
    const saved = JSON.parse(m.write.mock.calls[0]?.[1] ?? '[]') as StoredWebhookEvent[];
    expect(saved).toHaveLength(1000);
    expect(saved[0]?.id).toBe('evt_1');
    expect(saved.at(-1)?.id).toBe('evt_new');
  });
  it.each([
    Object.assign(new Error('Missing'), { code: 'ENOENT' }),
    Object.assign(new Error('Denied'), { code: 'EACCES' }),
    'non-error failure',
  ])('returns an empty history after read failure', async (error) => {
    m.read.mockRejectedValue(error);
    expect(await store.loadEvents()).toEqual([]);
  });
  it('ignores malformed JSON rather than preventing local development', async () => {
    m.read.mockResolvedValue('{broken');
    expect(await store.loadEvents()).toEqual([]);
  });
  it.each([
    'null',
    '{}',
    '1',
    '"fixture"',
  ])('ignores a non-array JSON store %s', async (contents) => {
    m.read.mockResolvedValue(contents);
    expect(await store.loadEvents()).toEqual([]);
    expect(await store.getEventById('evt_fixture')).toBeNull();
  });
  it.each([
    null,
    'fixture',
    [],
    {},
    { ...event(), id: 1 },
    { ...event(), event: null },
    { ...event(), url: false },
    { ...event(), timestamp: 'bad' },
    { ...event(), timestamp: Infinity },
    { ...event(), status: 'unknown' },
    { ...event(), payload: null },
    { ...event(), payload: { data: null } },
    { ...event(), payload: { data: { id: 1, type: 'event', attributes: {} } } },
    { ...event(), payload: { data: { id: 'evt_fixture', type: 1, attributes: {} } } },
    { ...event(), payload: { data: { id: 'evt_fixture', type: 'event', attributes: [] } } },
    { ...event(), response: 'invalid' },
    { ...event(), error: 42 },
  ])('filters an invalid history entry while preserving valid events', async (entry) => {
    m.read.mockResolvedValue(JSON.stringify([entry, event()]));
    expect(await store.loadEvents()).toEqual([event()]);
  });
  it('rejects a timestamp that overflows into infinity when parsed', async () => {
    m.read.mockResolvedValue(`[${JSON.stringify(event()).replace('1700000000', '1e309')}]`);
    expect(await store.loadEvents()).toEqual([]);
  });
  it('preserves valid failure details and optional response records', async () => {
    const failed = {
      ...event(),
      status: 'failed' as const,
      error: 'Fixture error',
      response: { accepted: false },
    };
    m.read.mockResolvedValue(JSON.stringify([failed]));
    expect(await store.loadEvents()).toEqual([failed]);
  });
  it('finds an exact event id or null', async () => {
    m.read.mockResolvedValue(JSON.stringify([event('evt_1'), event('evt_2')]));
    expect(await store.getEventById('evt_2')).toEqual(event('evt_2'));
    expect(await store.getEventById('missing')).toBeNull();
  });
  it('filters by event type and returns only the newest requested records', async () => {
    const previous = Array.from({ length: 12 }, (_, index) => event(`evt_${index}`));
    m.read.mockResolvedValue(JSON.stringify([event('evt_failed', 'payment.failed'), ...previous]));
    expect(await store.getEventsByType('payment.paid')).toEqual(previous.slice(-10));
    expect(await store.getEventsByType('payment.paid', 2)).toEqual(previous.slice(-2));
    expect(await store.getEventsByType('missing')).toEqual([]);
  });
  it.each([
    0,
    -1,
    0.5,
    Number.NaN,
    Number.POSITIVE_INFINITY,
  ])('returns no records for invalid limit %s', async (limit) => {
    expect(await store.getEventsByType('payment.paid', limit)).toEqual([]);
    expect(m.read).not.toHaveBeenCalled();
  });
  it.each([
    'mkdir',
    'write',
  ] as const)('reports %s failures without rejecting delivery', async (step) => {
    const error = new Error('Fixture storage failure');
    m[step].mockRejectedValue(error);
    await expect(store.storeEvent(event())).resolves.toBeUndefined();
    expect(console.warn).toHaveBeenCalledWith('Failed to store webhook event:', error);
  });
  it('unlinks the store on clear', async () => {
    await store.clearEvents();
    expect(m.unlink).toHaveBeenCalledWith(storePath);
  });
  it('tolerates an already absent store', async () => {
    m.unlink.mockRejectedValue(Object.assign(new Error('Missing'), { code: 'ENOENT' }));
    await store.clearEvents();
    expect(console.warn).not.toHaveBeenCalled();
  });
  it.each([
    new Error('Denied'),
    'non-error failure',
  ])('warns on an unexpected clear failure', async (error) => {
    m.unlink.mockRejectedValue(error);
    await store.clearEvents();
    expect(console.warn).toHaveBeenCalledWith('Failed to clear webhook events:', error);
  });
});
