import crypto from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('undici', () => ({ request: m.request }));
const {
  AVAILABLE_TRIGGER_EVENTS,
  buildSignatureHeader,
  generateId,
  generateWebhookPayload,
  printJsonResponse,
  sendWebhookRequest,
} = await import('../../src/commands/trigger/helpers.js');

describe('Synthetic trigger helper implementations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(Date, 'now').mockReturnValue(1700000000000);
    m.request.mockReset().mockResolvedValue({ statusCode: 200 });
  });
  afterEach(() => vi.restoreAllMocks());
  it('generates high-entropy hexadecimal local ids', () => {
    const ids = Array.from({ length: 100 }, () => generateId());
    expect(ids.every((id) => /^[a-f0-9]{32}$/.test(id))).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
  });
  // Only assert the shared envelope. Legacy resource fixtures are not API contract certification.
  it.each(
    AVAILABLE_TRIGGER_EVENTS
  )('wraps synthetic %s in the test-mode event envelope', (type) => {
    const payload = generateWebhookPayload(type);
    expect(payload.data.id).toMatch(/^evt_[a-f0-9]{32}$/);
    expect(payload.data.type).toBe('event');
    expect(payload.data.attributes).toMatchObject({
      type,
      livemode: false,
      created_at: 1700000000,
      updated_at: 1700000000,
    });
    expect(payload.data.attributes.data).toHaveProperty('id');
    expect(payload.data.attributes.data).not.toHaveProperty('id', payload.data.id);
  });
  it('can create a local generic fixture without performing an API request', () => {
    expect(generateWebhookPayload('fixture.event').data.attributes.type).toBe('fixture.event');
    expect(m.request).not.toHaveBeenCalled();
  });
  it.each([
    null,
    {},
    { webhookSecrets: {} },
  ])('omits signing when secrets are not configured', (config) => {
    expect(buildSignatureHeader(config, 'http://127.0.0.1/hooks', '{}', false)).toBeUndefined();
  });
  it('does not sign using an empty secret', () => {
    expect(
      buildSignatureHeader(
        { webhookSecrets: { hook_fixture: '' } },
        'http://127.0.0.1/hooks',
        '{}',
        false
      )
    ).toBeUndefined();
  });
  it('selects the secret for the registered destination over another stored secret', () => {
    const target = 'http://127.0.0.1/hooks';
    const header = buildSignatureHeader(
      {
        webhookSecrets: {
          hook_other: 'other-fixture-secret',
          hook_match: 'matching-fixture-secret',
        },
        registeredWebhooks: [{ id: 'hook_match', url: target }],
      },
      target,
      '{"original":"bytes"}',
      false
    );
    const expected = crypto
      .createHmac('sha256', 'matching-fixture-secret')
      .update('1700000000.{"original":"bytes"}')
      .digest('hex');
    expect(header).toBe(`t=1700000000,te=${expected},li=`);
  });
  it('supports the legacy single-secret local signing fallback', () => {
    const expected = crypto
      .createHmac('sha256', 'fixture-secret')
      .update('1700000000.{}')
      .digest('hex');
    expect(
      buildSignatureHeader(
        { webhookSecrets: { hook_fixture: 'fixture-secret' } },
        'http://127.0.0.1/hooks',
        '{}',
        true
      )
    ).toBe(`t=1700000000,te=,li=${expected}`);
  });
  it.each([
    false,
    true,
  ])('posts the exact serialized payload with mode-specific signing, livemode=%s', async (livemode) => {
    const target = 'http://127.0.0.1/hooks';
    const payload = generateWebhookPayload('payment.paid');
    payload.data.attributes.livemode = livemode;
    await sendWebhookRequest(
      { webhookSecrets: { hook_fixture: 'fixture-secret' } },
      target,
      payload
    );
    const body = JSON.stringify(payload);
    expect(m.request).toHaveBeenCalledWith(
      target,
      expect.objectContaining({
        method: 'POST',
        body,
        signal: expect.any(AbortSignal),
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          'paymongo-signature': buildSignatureHeader(
            { webhookSecrets: { hook_fixture: 'fixture-secret' } },
            target,
            body,
            livemode
          ),
        }),
      })
    );
  });
  it('does not add a fabricated signature for an unsigned fixture', async () => {
    await sendWebhookRequest(
      null,
      'http://127.0.0.1/hooks',
      generateWebhookPayload('payment.paid')
    );
    expect(m.request.mock.calls[0]?.[1].headers).not.toHaveProperty('paymongo-signature');
  });
  it('handles an envelope without mode attributes as test-mode local transport', async () => {
    await sendWebhookRequest(null, 'http://127.0.0.1/hooks', {
      data: { id: 'evt_fixture', type: 'event', attributes: {} },
    });
    expect(m.request).toHaveBeenCalledOnce();
  });
  it('reads JSON responses when the content type declares JSON', async () => {
    const json = vi.fn().mockResolvedValue({ accepted: true });
    const response = {
      headers: { 'content-type': 'application/json; charset=utf-8' },
      body: { json },
    };
    expect(await printJsonResponse(response as Parameters<typeof printJsonResponse>[0])).toEqual({
      accepted: true,
    });
    expect(json).toHaveBeenCalledOnce();
  });
  it.each([
    {},
    { 'content-type': 'text/plain' },
  ])('does not parse other response formats as JSON', async (headers) => {
    const json = vi.fn();
    expect(
      await printJsonResponse({ headers, body: { json } } as Parameters<
        typeof printJsonResponse
      >[0])
    ).toBeNull();
    expect(json).not.toHaveBeenCalled();
  });
});
