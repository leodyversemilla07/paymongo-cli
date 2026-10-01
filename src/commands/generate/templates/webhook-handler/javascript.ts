import { eventHandlersTemplate, signatureTemplate } from './shared.js';

/** Express handler: preserve the raw body before any JSON middleware. */
export function expressTemplate(events: string[]): string {
  return `const express = require('express');
const crypto = require('crypto');

const app = express();
// PayMongo returns this as attributes.secret_key (whsk_...).
const WEBHOOK_SECRET = process.env.PAYMONGO_WEBHOOK_SECRET;

${signatureTemplate()}

// Mount before any middleware that parses or changes the body.
app.post('/webhooks/paymongo', express.raw({ type: 'application/json' }), (req, res) => {
  try {
    if (!Buffer.isBuffer(req.body)) throw new Error('Raw request body is required');
    const payload = req.body.toString('utf8');
    const body = JSON.parse(payload);
    const signature = req.headers['paymongo-signature'];
    if (WEBHOOK_SECRET && !verifySignature(payload, signature, WEBHOOK_SECRET, body.data.attributes.livemode)) {
      return res.status(401).json({ error: 'Invalid signature' });
    }
    const { data } = body;
    const eventType = data.attributes.type;
    switch (eventType) {${eventHandlersTemplate(events)}
      default:
        break;
    }
    return res.status(200).json({ received: true });
  } catch {
    return res.status(400).json({ error: 'Invalid webhook payload' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(\`Webhook server running on port \${PORT}\`);
});`;
}

/** Fastify handler with a string parser to preserve the signed payload. */
export function fastifyTemplate(events: string[]): string {
  return `const fastify = require('fastify')({ logger: true });
const crypto = require('crypto');
const WEBHOOK_SECRET = process.env.PAYMONGO_WEBHOOK_SECRET;

${signatureTemplate()}

// Keep JSON as the raw string for signature verification, then parse in the route.
fastify.removeContentTypeParser('application/json');
fastify.addContentTypeParser('application/json', { parseAs: 'string' }, (_request, body, done) => {
  done(null, body);
});
fastify.post('/webhooks/paymongo', async (request, reply) => {
  try {
    const payload = request.body;
    const body = JSON.parse(payload);
    const signature = request.headers['paymongo-signature'];
    if (WEBHOOK_SECRET && !verifySignature(payload, signature, WEBHOOK_SECRET, body.data.attributes.livemode)) {
      return reply.code(401).send({ error: 'Invalid signature' });
    }
    const { data } = body;
    const eventType = data.attributes.type;
    switch (eventType) {${eventHandlersTemplate(events)}
      default:
        break;
    }
    return reply.code(200).send({ received: true });
  } catch {
    return reply.code(400).send({ error: 'Invalid webhook payload' });
  }
});

fastify.listen({ port: Number(process.env.PORT || 3000) }).catch((error) => {
  fastify.log.error(error);
  process.exitCode = 1;
});`;
}

/** Node HTTP handler that reads and verifies the original request stream. */
export function genericTemplate(events: string[]): string {
  return `const crypto = require('crypto');
const WEBHOOK_SECRET = process.env.PAYMONGO_WEBHOOK_SECRET;

${signatureTemplate()}

async function handleWebhook(request, response) {
  try {
    const chunks = [];
    let size = 0;
    for await (const chunk of request) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += buffer.length;
      if (size > 1024 * 1024) {
        response.writeHead(413, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ error: 'Payload too large' }));
        return;
      }
      chunks.push(buffer);
    }
    const payload = Buffer.concat(chunks).toString('utf8');
    const body = JSON.parse(payload);
    const signature = request.headers['paymongo-signature'];
    if (WEBHOOK_SECRET && !verifySignature(payload, signature, WEBHOOK_SECRET, body.data.attributes.livemode)) {
      response.writeHead(401, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ error: 'Invalid signature' }));
      return;
    }
    const { data } = body;
    const eventType = data.attributes.type;
    switch (eventType) {${eventHandlersTemplate(events)}
      default:
        break;
    }
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ received: true }));
  } catch {
    response.writeHead(400, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ error: 'Invalid webhook payload' }));
  }
}

module.exports = { handleWebhook };`;
}

export function getWebhookHandlerTemplate(events: string[], framework: string): string {
  switch (framework) {
    case 'express':
      return expressTemplate(events);
    case 'fastify':
      return fastifyTemplate(events);
    default:
      return genericTemplate(events);
  }
}
