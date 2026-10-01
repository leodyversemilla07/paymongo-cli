import { createHmac } from 'node:crypto';
import * as http from 'node:http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FORWARDING_HOP_HEADER } from '../../src/services/dev/forwarder.js';
import { DevServer, type DevServerOptions } from '../../src/services/dev/server.js';
import type { PayMongoConfig } from '../../src/types/paymongo.js';
import { verifyWebhook } from '../../src/utils/webhook-verifier.js';

const secret = 'whsk_forwarding_fixture';
const body = Buffer.from(
  ' {\n "data": {"id":"evt_123","type":"event","attributes":{"type":"payment.paid","livemode":false,"data":{"id":"pay_456","type":"payment","attributes":{"amount":10000,"status":"paid","metadata":{"label":"Café 🌱"}}}}}\n}\n'
);
const timestamp = String(Math.floor(Date.now() / 1000));
const signature = `t=${timestamp},te=${createHmac('sha256', secret)
  .update(`${timestamp}.`)
  .update(body)
  .digest('hex')},li=`;

function config(verify = true): PayMongoConfig {
  return {
    version: '1.0',
    projectName: 'forward-test',
    environment: 'test',
    apiKeys: {},
    webhooks: { url: '', events: ['payment.paid'] },
    webhookSecrets: { hook_123: secret },
    dev: { port: 4000, autoRegisterWebhook: false, verifyWebhookSignatures: verify },
    analytics: { enabled: false },
  };
}
function portOf(server: http.Server): number {
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing test server address');
  return address.port;
}
async function listen(server: http.Server): Promise<number> {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return portOf(server);
}
async function post(
  port: number,
  chunks: Buffer[] = [body],
  headers: http.OutgoingHttpHeaders = { 'paymongo-signature': signature }
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const request = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path: '/webhook/forward-test',
        method: 'POST',
        agent: false,
        headers: { 'content-type': 'application/json', ...headers },
      },
      (response) => {
        const received: Buffer[] = [];
        response.on('data', (chunk: Buffer) => received.push(chunk));
        response.on('end', () =>
          resolve({ status: response.statusCode ?? 0, body: Buffer.concat(received).toString() })
        );
        response.on('error', reject);
      }
    );
    request.on('error', reject);
    for (const chunk of chunks) request.write(chunk);
    request.end();
  });
}

describe('Application webhook forwarding over local HTTP', () => {
  let application: http.Server | undefined;
  let listener: DevServer | undefined;
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(async () => {
    await listener?.stop();
    if (application) {
      application.closeAllConnections();
      await new Promise<void>((resolve) => application?.close(() => resolve()));
    }
    listener = undefined;
    application = undefined;
    vi.restoreAllMocks();
  });

  async function startListener(options: DevServerOptions = {}, verify = true): Promise<number> {
    listener = new DevServer(0, config(verify), options);
    await listener.start();
    return portOf((listener as unknown as { server: http.Server }).server);
  }
  function output(): string {
    return [...vi.mocked(console.log).mock.calls, ...vi.mocked(console.error).mock.calls]
      .flat()
      .join(' ');
  }

  it('preserves exact UTF-8 bytes, whitespace, signature, and query without leaking credentials', async () => {
    let receivedBody = Buffer.alloc(0);
    let receivedHeaders: http.IncomingHttpHeaders = {};
    let receivedUrl: string | undefined;
    application = http.createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (chunk: Buffer) => chunks.push(chunk));
      req.on('end', () => {
        receivedBody = Buffer.concat(chunks);
        receivedHeaders = req.headers;
        receivedUrl = req.url;
        res.writeHead(202);
        res.end('private-application-response');
      });
    });
    const appPort = await listen(application);
    const sourcePort = await startListener({
      forwardTo: `http://127.0.0.1:${appPort}/hooks?token=private-query`,
    });
    const split = body.indexOf(Buffer.from('é')) + 1;
    const response = await post(sourcePort, [body.subarray(0, split), body.subarray(split)], {
      'paymongo-signature': signature,
      authorization: 'private-auth',
      cookie: 'private-cookie',
    });
    expect(response.status).toBe(200);
    expect(JSON.parse(response.body)).toMatchObject({
      success: true,
      forwarded: true,
      downstreamStatus: 202,
    });
    expect(JSON.parse(response.body).durationMs).toBeGreaterThanOrEqual(0);
    expect(receivedBody).toEqual(body);
    expect(receivedHeaders['paymongo-signature']).toBe(signature);
    expect(receivedHeaders['content-type']).toBe('application/json');
    expect(receivedHeaders[FORWARDING_HOP_HEADER]).toBe('1');
    expect(receivedHeaders.authorization).toBeUndefined();
    expect(receivedHeaders.cookie).toBeUndefined();
    expect(receivedUrl).toBe('/hooks?token=private-query');
    expect(verifyWebhook(receivedBody.toString('utf8'), signature, secret)).toBe(true);
    expect(output()).toMatch(/Application delivery: HTTP 202 \(\d+ms\)/);
    for (const value of [
      secret,
      signature,
      'private-query',
      'private-application-response',
      'private-auth',
      'private-cookie',
    ]) {
      expect(output()).not.toContain(value);
      expect(response.body).not.toContain(value);
    }
  });

  it.each([
    400, 500, 302,
  ])('reports downstream HTTP %s as a failed delivery without redirects/retries', async (status) => {
    let calls = 0;
    application = http.createServer((req, res) => {
      calls++;
      req.resume();
      res.writeHead(status, { location: '/redirect-target' });
      res.end('private-error-details');
    });
    const appPort = await listen(application);
    const sourcePort = await startListener({ forwardTo: `http://127.0.0.1:${appPort}/hooks` });
    const response = await post(sourcePort);
    expect(response.status).toBe(502);
    expect(JSON.parse(response.body)).toMatchObject({
      success: false,
      forwarded: false,
      downstreamStatus: status,
    });
    expect(calls).toBe(1);
    expect(output()).toContain(`Application delivery: HTTP ${status}`);
    expect(response.body).not.toContain('private-error-details');
  });

  it('times out an unresponsive application without replaying', async () => {
    let calls = 0;
    application = http.createServer((req) => {
      calls++;
      req.resume();
    });
    const appPort = await listen(application);
    const sourcePort = await startListener({
      forwardTo: `http://127.0.0.1:${appPort}/hooks`,
      forwardTimeoutMs: 500,
    });
    const response = await post(sourcePort);
    expect(response.status).toBe(504);
    expect(JSON.parse(response.body).error).toBe('Application delivery timed out');
    expect(calls).toBe(1);
  });

  it('returns a delivery failure, not Invalid JSON, after a connection reset', async () => {
    let calls = 0;
    application = http.createServer((req) => {
      calls++;
      req.socket.destroy();
    });
    const appPort = await listen(application);
    const sourcePort = await startListener({ forwardTo: `http://127.0.0.1:${appPort}/hooks` });
    const response = await post(sourcePort);
    expect(response.status).toBe(502);
    expect(JSON.parse(response.body).error).toBe('Application delivery failed');
    expect(calls).toBe(1);
  });

  it.each([
    'invalid-signature',
    'malformed-json',
    'oversized',
    'forwarded-hop',
  ])('does not deliver rejected inbound requests: %s', async (kind) => {
    let calls = 0;
    application = http.createServer((req, res) => {
      calls++;
      req.resume();
      res.end('ok');
    });
    const appPort = await listen(application);
    const sourcePort = await startListener({ forwardTo: `http://127.0.0.1:${appPort}/hooks` });
    const payload =
      kind === 'malformed-json'
        ? Buffer.from('{"private":"private-invalid-content" broken')
        : kind === 'oversized'
          ? Buffer.alloc(1024 * 1024 + 1, 'a')
          : body;
    const headers: http.OutgoingHttpHeaders = {
      'paymongo-signature': kind === 'invalid-signature' ? 'invalid' : signature,
    };
    if (kind === 'forwarded-hop') headers[FORWARDING_HOP_HEADER] = '1';
    const response = await post(sourcePort, [payload], headers);
    const expected = {
      'invalid-signature': 401,
      'malformed-json': 400,
      oversized: 413,
      'forwarded-hop': 508,
    };
    expect(response.status).toBe(expected[kind as keyof typeof expected]);
    expect(calls).toBe(0);
    expect(output()).not.toContain('private-invalid-content');
  });

  it('does not invent a signature for unsigned local testing', async () => {
    let receivedSignature: string | string[] | undefined;
    application = http.createServer((req, res) => {
      receivedSignature = req.headers['paymongo-signature'];
      req.resume();
      res.end('ok');
    });
    const appPort = await listen(application);
    const sourcePort = await startListener(
      { forwardTo: `http://127.0.0.1:${appPort}/hooks` },
      false
    );
    expect((await post(sourcePort, [body], {})).status).toBe(200);
    expect(receivedSignature).toBeUndefined();
  });

  it('preserves listener-only acknowledgment when forwarding is absent', async () => {
    const sourcePort = await startListener();
    const response = await post(sourcePort);
    expect(response.status).toBe(200);
    expect(JSON.parse(response.body)).toEqual({ success: true });
    expect(output()).not.toContain('Application delivery:');
  });

  it('bounds shutdown when a client never finishes uploading', async () => {
    const sourcePort = await startListener();
    const server = (listener as unknown as { server: http.Server }).server;
    const accepted = new Promise<void>((resolve) => server.once('request', () => resolve()));
    const request = http.request({
      hostname: '127.0.0.1',
      port: sourcePort,
      path: '/webhook/forward-test',
      method: 'POST',
      agent: false,
    });
    const closed = new Promise<void>((resolve) => request.once('error', () => resolve()));
    request.write('{"data":');
    await accepted;
    await listener?.stop();
    await closed;
    request.destroy();
  });

  it('aborts an in-flight application delivery during shutdown', async () => {
    let notifyReceived: () => void = () => {};
    const received = new Promise<void>((resolve) => {
      notifyReceived = resolve;
    });
    application = http.createServer((req) => {
      req.resume();
      notifyReceived();
    });
    const appPort = await listen(application);
    const sourcePort = await startListener({ forwardTo: `http://127.0.0.1:${appPort}/hooks` });
    const response = post(sourcePort);
    await received;
    await listener?.stop();
    expect((await response).status).toBe(502);
  });
});
