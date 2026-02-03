/**
 * TypeScript webhook handler templates for PayMongo integrations
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
 * Express.js TypeScript webhook handler template
 */
export function expressTemplate(events: string[]): string {
    const eventHandlers = generateEventHandlers(events);

    return `import express, { Request, Response } from 'express';
import crypto from 'crypto';

const app = express();
app.use(express.json());

// Webhook secret from PayMongo dashboard
const WEBHOOK_SECRET = process.env.PAYMONGO_WEBHOOK_SECRET;

interface PayMongoWebhookPayload {
  data: {
    id: string;
    type: string;
    attributes: {
      type: string;
      livemode: boolean;
      created_at: number;
      updated_at: number;
      data: any;
    };
  };
}

function verifySignature(payload: string, signatureHeader: string, secret: string): boolean {
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

app.post('/webhooks/paymongo', (req: Request, res: Response) => {
  try {
    const signature = req.headers['paymongo-signature'] as string;
    const payload = JSON.stringify(req.body);

    // Verify webhook signature (optional but recommended)
    if (WEBHOOK_SECRET && !verifySignature(payload, signature, WEBHOOK_SECRET)) {
      console.log('Invalid signature');
      return res.status(400).json({ error: 'Invalid signature' });
    }

    const { data }: PayMongoWebhookPayload = req.body;
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
 * Generic TypeScript webhook handler template
 */
export function genericTemplate(events: string[]): string {
    const eventHandlers = generateEventHandlers(events);

    return `// TypeScript webhook handler for ${events.join(', ')}

import crypto from 'crypto';

const WEBHOOK_SECRET = process.env.PAYMONGO_WEBHOOK_SECRET;

interface PayMongoWebhookPayload {
  data: {
    id: string;
    type: string;
    attributes: {
      type: string;
      livemode: boolean;
      created_at: number;
      updated_at: number;
      data: any;
    };
  };
}

function verifySignature(payload: string, signatureHeader: string, secret: string): boolean {
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

export function handleWebhook(body: PayMongoWebhookPayload, signature?: string): { received: boolean } {
  try {
    const payload = JSON.stringify(body);

    // Verify webhook signature (optional but recommended)
    if (WEBHOOK_SECRET && signature && !verifySignature(payload, signature, WEBHOOK_SECRET)) {
      console.log('Invalid signature');
      throw new Error('Invalid signature');
    }

    const { data } = body;
    const eventType = data.attributes.type;

    switch (eventType) {${eventHandlers}
      default:
        console.log('Unhandled event type:', eventType);
    }

    return { received: true };
  } catch (error) {
    console.error('Webhook processing error:', error);
    throw error;
  }
}`;
}

/**
 * Get TypeScript webhook handler template by framework
 */
export function getWebhookHandlerTemplate(events: string[], framework: string): string {
    switch (framework) {
        case 'express':
            return expressTemplate(events);
        default:
            return genericTemplate(events);
    }
}
