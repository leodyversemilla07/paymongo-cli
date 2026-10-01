import { eventHandlersTemplate, PAYLOAD_INTERFACE, signatureTemplate } from './shared.js';

/** Express handler: mount this raw-body route before any express.json middleware. */
export function expressTemplate(events: string[]): string {
  return `import express, { Request, Response } from 'express';
import crypto from 'node:crypto';

const app = express();
// PayMongo returns this as attributes.secret_key (whsk_...).
const WEBHOOK_SECRET = process.env.PAYMONGO_WEBHOOK_SECRET;

${PAYLOAD_INTERFACE}

${signatureTemplate(true)}

// Mount before any middleware that parses or changes the body.
app.post('/webhooks/paymongo', express.raw({ type: 'application/json' }), (req: Request, res: Response) => {
  try {
    if (!Buffer.isBuffer(req.body)) throw new Error('Raw request body is required');
    const payload = req.body.toString('utf8');
    const body: PayMongoWebhookPayload = JSON.parse(payload);
    const signature = req.headers['paymongo-signature'];
    if (WEBHOOK_SECRET && !verifySignature(
      payload, typeof signature === 'string' ? signature : undefined,
      WEBHOOK_SECRET, body.data.attributes.livemode
    )) {
      return res.status(401).json({ error: 'Invalid signature' });
    }

    const { data } = body;
    const eventType = data.attributes.type;
    switch (eventType) {${eventHandlersTemplate(events)}
      default:
        // Ignore events this integration does not handle.
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

/** Framework-neutral handler: callers must pass the original raw body. */
export function genericTemplate(events: string[]): string {
  return `import crypto from 'node:crypto';

const WEBHOOK_SECRET = process.env.PAYMONGO_WEBHOOK_SECRET;

${PAYLOAD_INTERFACE}

${signatureTemplate(true)}

// Pass the original request body, not JSON.stringify(parsedBody).
export function handleWebhook(rawBody: string, signature?: string): { received: boolean } {
  const body: PayMongoWebhookPayload = JSON.parse(rawBody);
  if (WEBHOOK_SECRET && !verifySignature(rawBody, signature, WEBHOOK_SECRET, body.data.attributes.livemode)) {
    throw new Error('Invalid signature');
  }
  const { data } = body;
  const eventType = data.attributes.type;
  switch (eventType) {${eventHandlersTemplate(events)}
    default:
      break;
  }
  return { received: true };
}`;
}

export function getWebhookHandlerTemplate(events: string[], framework: string): string {
  return framework === 'express' ? expressTemplate(events) : genericTemplate(events);
}
