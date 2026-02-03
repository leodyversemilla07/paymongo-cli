/**
 * JavaScript webhook handler templates for PayMongo integrations
 */

/**
 * Generate event handler switch cases
 */
function generateEventHandlers(events: string[]): string {
    return events
        .map(
            (event) => `
  case '${event}':
    console.log('Processing ${event} event:', data);
    // Add your ${event} handling logic here
    break;`
        )
        .join('');
}

/**
 * Express.js webhook handler template
 */
export function expressTemplate(events: string[]): string {
    const eventHandlers = generateEventHandlers(events);

    return `const express = require('express');
const crypto = require('crypto');

const app = express();
app.use(express.json());

// Webhook secret from PayMongo dashboard
const WEBHOOK_SECRET = process.env.PAYMONGO_WEBHOOK_SECRET;

function verifySignature(payload, signatureHeader, secret) {
  if (!signatureHeader) {
    return false;
  }

  const parts = signatureHeader.split(',');
  const timestamp = parts.find((part) => part.startsWith('t='))?.split('=')[1];
  const signature = parts.find((part) => part.startsWith('te='))?.split('=')[1];

  if (!timestamp || !signature) {
    return false;
  }

  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(timestamp + '.' + payload, 'utf8')
    .digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(signature, 'hex'),
    Buffer.from(expectedSignature, 'hex')
  );
}

app.post('/webhooks/paymongo', (req, res) => {
  try {
    const signature = req.headers['paymongo-signature'];
    const payload = JSON.stringify(req.body);

    // Verify webhook signature (optional but recommended)
    if (WEBHOOK_SECRET && !verifySignature(payload, signature, WEBHOOK_SECRET)) {
      console.log('Invalid signature');
      return res.status(400).json({ error: 'Invalid signature' });
    }

    const { data } = req.body;
    const eventType = data.attributes.type;

    switch (eventType) {${eventHandlers}
      default:
        console.log('Unhandled event type:', eventType);
    }

    res.json({ received: true });
  } catch (error) {
    console.error('Webhook processing error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(\`Webhook server running on port \${PORT}\`);
});`;
}

/**
 * Fastify webhook handler template
 */
export function fastifyTemplate(events: string[]): string {
    const eventHandlers = generateEventHandlers(events);

    return `const fastify = require('fastify')({ logger: true });
const crypto = require('crypto');

// Webhook secret from PayMongo dashboard
const WEBHOOK_SECRET = process.env.PAYMONGO_WEBHOOK_SECRET;

function verifySignature(payload, signatureHeader, secret) {
  if (!signatureHeader) {
    return false;
  }

  const parts = signatureHeader.split(',');
  const timestamp = parts.find((part) => part.startsWith('t='))?.split('=')[1];
  const signature = parts.find((part) => part.startsWith('te='))?.split('=')[1];

  if (!timestamp || !signature) {
    return false;
  }

  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(timestamp + '.' + payload, 'utf8')
    .digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(signature, 'hex'),
    Buffer.from(expectedSignature, 'hex')
  );
}

fastify.post('/webhooks/paymongo', async (request, reply) => {
  try {
    const signature = request.headers['paymongo-signature'];
    const payload = JSON.stringify(request.body);

    // Verify webhook signature (optional but recommended)
    if (WEBHOOK_SECRET && !verifySignature(payload, signature, WEBHOOK_SECRET)) {
      console.log('Invalid signature');
      return reply.code(400).send({ error: 'Invalid signature' });
    }

    const { data } = request.body;
    const eventType = data.attributes.type;

    switch (eventType) {${eventHandlers}
      default:
        console.log('Unhandled event type:', eventType);
    }

    return { received: true };
  } catch (error) {
    console.error('Webhook processing error:', error);
    return reply.code(500).send({ error: 'Internal server error' });
  }
});

const start = async () => {
  try {
    await fastify.listen({ port: process.env.PORT || 3000 });
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();`;
}

/**
 * Generic/vanilla Node.js webhook handler template
 */
export function genericTemplate(events: string[]): string {
    const eventHandlers = generateEventHandlers(events);

    return `// Simple webhook handler for ${events.join(', ')}

const crypto = require('crypto');

// Webhook secret from PayMongo dashboard
const WEBHOOK_SECRET = process.env.PAYMONGO_WEBHOOK_SECRET;

function verifySignature(payload, signatureHeader, secret) {
  if (!signatureHeader) {
    return false;
  }

  const parts = signatureHeader.split(',');
  const timestamp = parts.find((part) => part.startsWith('t='))?.split('=')[1];
  const signature = parts.find((part) => part.startsWith('te='))?.split('=')[1];

  if (!timestamp || !signature) {
    return false;
  }

  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(timestamp + '.' + payload, 'utf8')
    .digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(signature, 'hex'),
    Buffer.from(expectedSignature, 'hex')
  );
}

function handleWebhook(request, response) {
  try {
    const signature = request.headers['paymongo-signature'];
    const payload = JSON.stringify(request.body);

    // Verify webhook signature (optional but recommended)
    if (WEBHOOK_SECRET && !verifySignature(payload, signature, WEBHOOK_SECRET)) {
      console.log('Invalid signature');
      response.writeHead(400, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ error: 'Invalid signature' }));
      return;
    }

    const { data } = request.body;
    const eventType = data.attributes.type;

    switch (eventType) {${eventHandlers}
      default:
        console.log('Unhandled event type:', eventType);
    }

    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ received: true }));
  } catch (error) {
    console.error('Webhook processing error:', error);
    response.writeHead(500, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ error: 'Internal server error' }));
  }
}

module.exports = { handleWebhook };`;
}

/**
 * Get JavaScript webhook handler template by framework
 */
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
