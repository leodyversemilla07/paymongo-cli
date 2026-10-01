import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PayMongoConfig } from '../../src/types/paymongo.js';
import { CommandError } from '../../src/utils/errors.js';
import type { StoredWebhookEvent } from '../../src/utils/webhook-store.js';
import { testConfig } from '../fixtures/config.js';

const m = vi.hoisted(() => ({
  load: vi.fn<() => Promise<PayMongoConfig | null>>(),
  store: vi.fn(),
  events: vi.fn<() => Promise<StoredWebhookEvent[]>>(),
  get: vi.fn<() => Promise<StoredWebhookEvent | null>>(),
  request: vi.fn(),
  select: vi.fn(),
  input: vi.fn(),
  start: vi.fn(),
  succeed: vi.fn(),
  fail: vi.fn(),
  stop: vi.fn(),
  error: vi.fn(),
  json: vi.fn(),
}));
vi.mock('../../src/services/config/manager.js', () => ({
  default: vi.fn().mockImplementation(() => ({ load: m.load })),
}));
vi.mock('../../src/utils/spinner.js', () => ({ default: vi.fn().mockImplementation(() => m) }));
vi.mock('../../src/utils/logger.js', () => ({
  default: vi.fn().mockImplementation(() => ({ error: m.error })),
}));
vi.mock('../../src/utils/webhook-store.js', () => ({
  default: vi
    .fn()
    .mockImplementation(() => ({ storeEvent: m.store, loadEvents: m.events, getEventById: m.get })),
}));
vi.mock('@inquirer/prompts', () => ({ select: m.select, input: m.input }));
vi.mock('undici', () => ({ request: m.request }));
const { sendWebhookEvent, replayWebhookEvent } = await import(
  '../../src/commands/trigger/actions.js'
);

function event(id = 'evt_fixture', type = 'payment.paid'): StoredWebhookEvent {
  return {
    id,
    event: type,
    url: 'http://127.0.0.1:3000/webhooks',
    timestamp: 1700000000,
    status: 'delivered',
    payload: { data: { id, type: 'event', attributes: { type, livemode: false } } },
  };
}
const output = () =>
  vi
    .mocked(console.log)
    .mock.calls.map((call) => call.join(' '))
    .join('\n');
function response(status = 200, json = true) {
  return {
    statusCode: status,
    headers: json ? { 'content-type': 'application/json' } : {},
    body: { json: m.json },
  };
}

describe('Actual synthetic webhook send/replay actions (transport mocked)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.load.mockReset().mockResolvedValue(testConfig());
    m.store.mockReset().mockResolvedValue(undefined);
    m.events.mockReset().mockResolvedValue([]);
    m.get.mockReset().mockResolvedValue(event());
    m.json.mockReset().mockResolvedValue({ accepted: true });
    m.request.mockReset().mockResolvedValue(response());
    m.select.mockReset().mockResolvedValue('payment.paid');
    m.input.mockReset().mockResolvedValue('http://127.0.0.1:3000/webhooks');
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it('sends the generated envelope to the configured URL and records delivery after transport success', async () => {
    m.request.mockImplementation(async () => {
      expect(m.store).not.toHaveBeenCalled();
      return response();
    });
    await sendWebhookEvent({ event: 'payment.paid' });
    expect(m.request).toHaveBeenCalledExactlyOnceWith(
      testConfig().webhooks.url,
      expect.objectContaining({ method: 'POST' })
    );
    const body = JSON.parse(m.request.mock.calls[0]?.[1].body ?? '{}');
    expect(body.data.attributes.type).toBe('payment.paid');
    expect(body.data.attributes.livemode).toBe(false);
    expect(m.store).toHaveBeenCalledWith(
      expect.objectContaining({ id: body.data.id, payload: body, status: 'delivered' })
    );
    expect(m.succeed).toHaveBeenCalledWith('Webhook delivered successfully (HTTP 200)');
    expect(m.json).toHaveBeenCalledOnce();
  });
  it('honors an explicit target instead of the configured URL', async () => {
    await sendWebhookEvent({ event: 'payment.paid', url: 'http://127.0.0.1:1234/override' });
    expect(m.request).toHaveBeenCalledWith('http://127.0.0.1:1234/override', expect.any(Object));
  });
  it('JSON mode generates a local envelope without sending or persisting it', async () => {
    await sendWebhookEvent({ event: 'payment.paid', json: true });
    const payload = JSON.parse(vi.mocked(console.log).mock.calls[0]?.[0] ?? '{}');
    expect(payload.data.type).toBe('event');
    expect(payload.data.attributes.type).toBe('payment.paid');
    expect(m.request).not.toHaveBeenCalled();
    expect(m.store).not.toHaveBeenCalled();
  });
  it('prompts for a type and target using the real input validation callback', async () => {
    await sendWebhookEvent({});
    expect(m.select).toHaveBeenCalledWith(
      expect.objectContaining({
        choices: expect.arrayContaining([{ name: 'payment.paid', value: 'payment.paid' }]),
      })
    );
    const validate = m.input.mock.calls[0]?.[0].validate as (value: string) => boolean | string;
    expect(validate('http://127.0.0.1/webhooks')).toBe(true);
    expect(validate('not-a-url')).toBe('Please enter a valid URL');
  });
  it('uses an existing target when the prompted target is empty', async () => {
    m.input.mockResolvedValue('');
    await sendWebhookEvent({});
    expect(m.request).toHaveBeenCalledWith(testConfig().webhooks.url, expect.any(Object));
  });
  it('can send a fixture without project config when a target is supplied', async () => {
    m.load.mockResolvedValue(null);
    await sendWebhookEvent({ event: 'payment.paid', url: 'http://127.0.0.1/webhooks' });
    expect(m.request).toHaveBeenCalled();
  });
  it('prompts with an empty default when configuration has no target', async () => {
    m.load.mockResolvedValue(null);
    await sendWebhookEvent({});
    expect(m.input).toHaveBeenCalledWith(expect.objectContaining({ default: '' }));
  });
  it('fails without a target rather than performing a request', async () => {
    m.load.mockResolvedValue(null);
    await expect(sendWebhookEvent({ event: 'payment.paid' })).rejects.toBeInstanceOf(CommandError);
    expect(m.request).not.toHaveBeenCalled();
  });
  it('fails without a selected event rather than generating a fictitious one', async () => {
    m.select.mockResolvedValue('');
    await expect(sendWebhookEvent({})).rejects.toBeInstanceOf(CommandError);
    expect(m.request).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('No event selected'));
  });
  it('accepts an empty non-JSON HTTP acknowledgment without reading JSON', async () => {
    m.request.mockResolvedValue(response(204, false));
    await sendWebhookEvent({ event: 'payment.paid' });
    expect(m.json).not.toHaveBeenCalled();
    expect(m.store).toHaveBeenCalledWith(expect.objectContaining({ status: 'delivered' }));
  });
  it.each([
    404, 401, 500, 302,
  ])('rejects HTTP %s and stores failed rather than delivered', async (status) => {
    m.request.mockResolvedValue(response(status));
    await expect(sendWebhookEvent({ event: 'payment.paid' })).rejects.toBeInstanceOf(CommandError);
    expect(m.store).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ status: 'failed' }));
    expect(m.succeed).not.toHaveBeenCalledWith(expect.stringContaining('delivered successfully'));
    expect(m.fail.mock.calls.map((call) => call[0]).join(' ')).toContain(String(status));
  });
  it.each([400, 503])('handles non-JSON error acknowledgments for HTTP %s', async (status) => {
    m.request.mockResolvedValue(response(status, false));
    await expect(sendWebhookEvent({ event: 'payment.paid' })).rejects.toBeInstanceOf(CommandError);
    expect(m.json).not.toHaveBeenCalled();
  });
  it.each([
    ['ECONNREFUSED', 'refused', 'Connection refused'],
    ['ENOTFOUND', 'unresolved', 'Host not found'],
    ['ETIMEDOUT', 'expired', 'Request timed out'],
    ['UND_ERR_CONNECT_TIMEOUT', 'connection timeout', 'Request timed out'],
    ['OTHER', 'fixture transport failure', 'Webhook delivery failed'],
    ['', 'fixture transport failure', 'Webhook delivery failed'],
  ])('handles transport failure %s with one failed history entry', async (code, message, expected) => {
    m.request.mockRejectedValue(Object.assign(new Error(message), code ? { code } : {}));
    await expect(sendWebhookEvent({ event: 'payment.paid' })).rejects.toBeInstanceOf(CommandError);
    expect(m.store).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ status: 'failed' }));
    expect(m.fail).toHaveBeenCalledWith(expect.stringContaining(expected));
    expect(m.request).toHaveBeenCalledOnce();
  });
  it('surfaces send configuration failures without sending or recording', async () => {
    m.load.mockRejectedValue(new Error('Fixture config failure'));
    await expect(sendWebhookEvent({ event: 'payment.paid' })).rejects.toBeInstanceOf(CommandError);
    expect(m.request).not.toHaveBeenCalled();
    expect(m.store).not.toHaveBeenCalled();
    expect(m.error).toHaveBeenCalled();
  });
  it('lists an empty replay store without any network operation', async () => {
    await replayWebhookEvent(undefined, {});
    expect(output()).toContain('No webhook events stored');
    expect(m.request).not.toHaveBeenCalled();
  });
  it('returns complete history as JSON without a request', async () => {
    const events = [event(), event('evt_2', 'payment.failed')];
    m.events.mockResolvedValue(events);
    await replayWebhookEvent(undefined, { list: true, json: true });
    expect(console.log).toHaveBeenCalledExactlyOnceWith(JSON.stringify(events, null, 2));
    expect(m.request).not.toHaveBeenCalled();
  });
  it('bounds the table preview and reports additional events', async () => {
    const events = [
      event(),
      ...Array.from({ length: 11 }, (_, index) =>
        event(`evt_long_fixture_id_with_suffix_${index}`)
      ),
    ];
    m.events.mockResolvedValue(events);
    await replayWebhookEvent(undefined, { list: true });
    expect(output()).toContain('... and 2 more events');
    expect(output()).not.toContain('suffix_10');
    expect(m.request).not.toHaveBeenCalled();
  });
  it('reports no matches for a requested replay event type', async () => {
    await replayWebhookEvent(undefined, { event: 'payment.failed' });
    expect(output()).toContain('No events found for type: payment.failed');
    expect(m.request).not.toHaveBeenCalled();
  });
  it.each([
    false,
    true,
  ])('filters replay history with json=%s without delivering anything', async (json) => {
    const matching = [event('evt_paid_1'), event('evt_paid_2')];
    m.events.mockResolvedValue([...matching, event('evt_failed', 'payment.failed')]);
    await replayWebhookEvent(undefined, { event: 'payment.paid', json });
    if (json)
      expect(console.log).toHaveBeenCalledExactlyOnceWith(JSON.stringify(matching, null, 2));
    else {
      expect(output()).toContain('evt_paid_1');
      expect(output()).toContain('evt_paid_2');
      expect(output()).not.toContain('evt_failed');
    }
    expect(m.request).not.toHaveBeenCalled();
  });
  it('refuses to replay a missing id', async () => {
    m.get.mockResolvedValue(null);
    await expect(replayWebhookEvent('missing', {})).rejects.toBeInstanceOf(CommandError);
    expect(m.request).not.toHaveBeenCalled();
  });
  it('replays the exact original payload to its stored destination', async () => {
    await replayWebhookEvent('evt_fixture', {});
    expect(m.get).toHaveBeenCalledWith('evt_fixture');
    expect(m.request).toHaveBeenCalledWith(
      event().url,
      expect.objectContaining({ body: JSON.stringify(event().payload) })
    );
    expect(m.succeed).toHaveBeenCalledWith('Webhook replayed successfully (HTTP 200)');
    expect(m.store).not.toHaveBeenCalled();
  });
  it('overrides the replay target and hides the response display in JSON mode', async () => {
    await replayWebhookEvent('evt_fixture', { url: 'http://127.0.0.1/override', json: true });
    expect(m.request).toHaveBeenCalledWith('http://127.0.0.1/override', expect.any(Object));
    expect(output()).not.toContain('"accepted"');
  });
  it('replays a non-JSON acknowledgment', async () => {
    m.request.mockResolvedValue(response(204, false));
    await replayWebhookEvent('evt_fixture', {});
    expect(m.json).not.toHaveBeenCalled();
    expect(m.succeed).toHaveBeenCalledWith('Webhook replayed successfully (HTTP 204)');
  });
  it('rejects failed replay acknowledgments without claiming success', async () => {
    m.request.mockResolvedValue(response(500));
    await expect(replayWebhookEvent('evt_fixture', {})).rejects.toBeInstanceOf(CommandError);
    expect(m.succeed).not.toHaveBeenCalled();
  });
  it.each(['ECONNREFUSED', 'OTHER'])('reports replay transport failure %s', async (code) => {
    m.request.mockRejectedValue(Object.assign(new Error('Fixture error'), { code }));
    await expect(replayWebhookEvent('evt_fixture', {})).rejects.toBeInstanceOf(CommandError);
    expect(m.fail).toHaveBeenCalledWith('Webhook replay failed');
  });
  it('normalizes replay configuration failures to command errors', async () => {
    m.load.mockRejectedValue(new Error('Fixture config failure'));
    await expect(replayWebhookEvent('evt_fixture', {})).rejects.toBeInstanceOf(CommandError);
    expect(m.request).not.toHaveBeenCalled();
  });
  it('handles a failed history read without a delivery attempt', async () => {
    m.events.mockRejectedValue(new Error('Fixture store failure'));
    await expect(replayWebhookEvent(undefined, {})).rejects.toBeInstanceOf(CommandError);
    expect(m.request).not.toHaveBeenCalled();
  });
});
