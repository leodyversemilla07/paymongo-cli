import { createHmac } from 'node:crypto';
import { createRequire } from 'node:module';
import { Readable } from 'node:stream';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';
import { getWebhookHandlerTemplate as jsTemplate } from '../../src/commands/generate/templates/webhook-handler/javascript.js';
import { getWebhookHandlerTemplate as tsTemplate } from '../../src/commands/generate/templates/webhook-handler/typescript.js';

const secret = 'whsk_contract_secret';
const payload =
  '{ "data": { "id": "evt_123", "type": "event", "attributes": { "type": "payment.paid", "livemode": false, "data": {} } } }';
const timestamp = '1710000000';
const signature = createHmac('sha256', secret).update(`${timestamp}.${payload}`).digest('hex');
const header = `t=${timestamp},te=${signature},li=`;

function evaluate(code: string): Record<string, unknown> {
  const module = { exports: {} };
  runInNewContext(code, {
    require: createRequire(import.meta.url),
    module,
    exports: module.exports,
    Buffer,
    process: { env: { PAYMONGO_WEBHOOK_SECRET: secret } },
  });
  return module.exports;
}

describe('Generated webhook handlers follow the PayMongo signature contract', () => {
  it('Node handler verifies the raw stream even when JSON formatting differs', async () => {
    const handler = evaluate(jsTemplate(['payment.paid'], 'generic')).handleWebhook as (
      request: Readable & { headers: Record<string, string> },
      response: unknown
    ) => Promise<void>;
    const request = Object.assign(Readable.from([payload.slice(0, 20), payload.slice(20)]), {
      headers: { 'paymongo-signature': header },
    });
    const response = { writeHead: vi.fn(), end: vi.fn() };
    await handler(request, response);
    expect(response.writeHead).toHaveBeenCalledWith(200, { 'Content-Type': 'application/json' });
    expect(response.end).toHaveBeenCalledWith(JSON.stringify({ received: true }));
  });

  it.each([
    undefined,
    `t=${timestamp},te=,li=${signature}`,
    `t=${timestamp},te=${signature}zz,li=`,
  ])('Node handler rejects missing, wrong-mode, or malformed signatures', async (signatureHeader) => {
    const handler = evaluate(jsTemplate(['payment.paid'], 'generic')).handleWebhook as (
      request: Readable & { headers: Record<string, string> },
      response: unknown
    ) => Promise<void>;
    const request = Object.assign(Readable.from([payload]), {
      headers: signatureHeader ? { 'paymongo-signature': signatureHeader } : {},
    });
    const response = { writeHead: vi.fn(), end: vi.fn() };
    await handler(request, response);
    expect(response.writeHead).toHaveBeenCalledWith(401, { 'Content-Type': 'application/json' });
  });

  it('TypeScript generic handler accepts raw bodies and rejects missing signatures', () => {
    const source = tsTemplate(['payment.paid'], 'generic');
    const { outputText } = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    });
    const handler = evaluate(outputText).handleWebhook as (
      rawBody: string,
      signature?: string
    ) => { received: boolean };
    expect(handler(payload, header)).toEqual({ received: true });
    expect(() => handler(payload)).toThrow('Invalid signature');
    expect(() => handler(JSON.stringify(JSON.parse(payload)), header)).toThrow('Invalid signature');
  });

  it('Express and Fastify templates retain raw request bodies', () => {
    expect(jsTemplate([], 'express')).toContain("express.raw({ type: 'application/json' })");
    expect(tsTemplate([], 'express')).toContain("express.raw({ type: 'application/json' })");
    expect(jsTemplate([], 'fastify')).toContain("{ parseAs: 'string' }");
    for (const code of [
      jsTemplate([], 'express'),
      tsTemplate([], 'express'),
      jsTemplate([], 'fastify'),
    ]) {
      expect(code).not.toContain('testSignature || liveSignature');
      expect(code).not.toContain('JSON.stringify(req.body)');
      expect(code).not.toContain('JSON.stringify(request.body)');
    }
  });
});
