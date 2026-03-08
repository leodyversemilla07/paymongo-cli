import crypto from 'crypto';
import ConfigManager from '../../services/config/manager.js';
import Spinner from '../../utils/spinner.js';
import Logger from '../../utils/logger.js';
import WebhookEventStore, { StoredWebhookEvent } from '../../utils/webhook-store.js';
import { CLI_VERSION } from '../../utils/constants.js';
import { CommandError } from '../../utils/errors.js';

export interface WebhookPayload {
  data: {
    id: string;
    type: string;
    attributes: {
      type: string;
      livemode: boolean;
      created_at: number;
      updated_at: number;
      data: Record<string, unknown>;
    };
  };
}

export function createTriggerContext(): {
  spinner: Spinner;
  configManager: ConfigManager;
  logger: Logger;
  store: WebhookEventStore;
} {
  return {
    spinner: new Spinner(),
    configManager: new ConfigManager(),
    logger: new Logger(),
    store: new WebhookEventStore(),
  };
}

export const AVAILABLE_TRIGGER_EVENTS = [
  'payment.paid',
  'payment.failed',
  'payment.refunded',
  'payment.refund.updated',
  'source.chargeable',
  'checkout_session.payment.paid',
  'link.payment.paid',
  'qrph.expired',
] as const;

export function buildSignatureHeader(
  config: {
    webhookSecrets?: Record<string, string>;
    registeredWebhooks?: { id: string; url: string }[];
  } | null,
  webhookUrl: string,
  body: string,
  livemode: boolean
): string | undefined {
  if (!config?.webhookSecrets || Object.keys(config.webhookSecrets).length === 0) {
    return undefined;
  }

  const registered = config.registeredWebhooks || [];
  const match = registered.find((webhook) => webhook.url === webhookUrl);
  const webhookId = match?.id;

  let secret: string | undefined;
  if (webhookId && config.webhookSecrets[webhookId]) {
    secret = config.webhookSecrets[webhookId];
  } else {
    const secrets = Object.values(config.webhookSecrets).filter(
      (value) => typeof value === 'string' && value.length > 0
    );
    secret = secrets[0];
  }

  if (!secret) {
    return undefined;
  }

  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.${body}`)
    .digest('hex');
  const parts = [`t=${timestamp}`, livemode ? 'te=' : `te=${signature}`, livemode ? `li=${signature}` : 'li='];

  return parts.join(',');
}

export async function sendWebhookRequest(
  config: {
    webhookSecrets?: Record<string, string>;
    registeredWebhooks?: { id: string; url: string }[];
  } | null,
  webhookUrl: string,
  payload: WebhookPayload | StoredWebhookEvent['payload']
) {
  const { request } = await import('undici');
  const body = JSON.stringify(payload);
  const livemode =
    'data' in payload &&
    Boolean(
      (payload.data as { attributes?: { livemode?: boolean } }).attributes?.livemode
    );
  const signatureHeader = buildSignatureHeader(config, webhookUrl, body, livemode);

  return request(webhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': `PayMongo-CLI/${CLI_VERSION}`,
      ...(signatureHeader ? { 'paymongo-signature': signatureHeader } : {}),
    },
    body,
    signal: AbortSignal.timeout(10000),
  });
}

export function generateId(): string {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

export function generateWebhookPayload(eventType: string): WebhookPayload {
  const now = Math.floor(Date.now() / 1000);
  const basePayload: WebhookPayload = {
    data: {
      id: `evt_${generateId()}`,
      type: 'event',
      attributes: {
        type: eventType,
        livemode: false,
        created_at: now,
        updated_at: now,
        data: {},
      },
    },
  };

  switch (eventType) {
    case 'payment.paid':
      basePayload.data.attributes.data = {
        id: `pay_${generateId()}`,
        type: 'payment',
        attributes: {
          amount: 100000,
          currency: 'PHP',
          description: 'Test Payment',
          status: 'paid',
          external_reference_number: null,
          paid_at: now,
          created_at: now,
          updated_at: now,
          fees: 2950,
          net_amount: 97050,
          payment_intent_id: `pi_${generateId()}`,
          source: {
            id: `src_${generateId()}`,
            type: 'source',
            attributes: {
              amount: 100000,
              currency: 'PHP',
              status: 'paid',
              type: 'gcash',
              created_at: now,
              updated_at: now,
            },
          },
        },
      };
      break;
    case 'payment.failed':
      basePayload.data.attributes.data = {
        id: `pay_${generateId()}`,
        type: 'payment',
        attributes: {
          amount: 50000,
          currency: 'PHP',
          description: 'Failed Test Payment',
          status: 'failed',
          external_reference_number: null,
          created_at: now,
          updated_at: now,
          fees: 0,
          net_amount: 0,
          payment_intent_id: `pi_${generateId()}`,
          source: {
            id: `src_${generateId()}`,
            type: 'source',
            attributes: {
              amount: 50000,
              currency: 'PHP',
              status: 'failed',
              type: 'card',
              created_at: now,
              updated_at: now,
            },
          },
        },
      };
      break;
    case 'source.chargeable':
      basePayload.data.attributes.data = {
        id: `src_${generateId()}`,
        type: 'source',
        attributes: {
          amount: 150000,
          currency: 'PHP',
          status: 'chargeable',
          type: 'gcash',
          billing: {
            address: {
              city: 'Manila',
              country: 'PH',
              line1: '123 Test Street',
              line2: null,
              postal_code: '1000',
              state: 'Metro Manila',
            },
            email: 'test@example.com',
            name: 'Test User',
            phone: '+639123456789',
          },
          created_at: now,
          updated_at: now,
        },
      };
      break;
    case 'checkout_session.payment.paid':
      basePayload.data.attributes.data = {
        id: `cs_${generateId()}`,
        type: 'checkout_session',
        attributes: {
          amount: 200000,
          currency: 'PHP',
          description: 'Test Checkout Session',
          status: 'paid',
          payment_intent_id: `pi_${generateId()}`,
          created_at: now,
          updated_at: now,
        },
      };
      break;
    case 'link.payment.paid':
      basePayload.data.attributes.data = {
        id: `plink_${generateId()}`,
        type: 'link',
        attributes: {
          amount: 75000,
          currency: 'PHP',
          description: 'Test Payment Link',
          status: 'paid',
          archived: false,
          payment_intent_id: `pi_${generateId()}`,
          created_at: now,
          updated_at: now,
        },
      };
      break;
    default:
      basePayload.data.attributes.data = {
        id: `${eventType.split('.')[1]}_${generateId()}`,
        type: eventType.split('.')[0],
        attributes: {
          status: 'test',
          created_at: now,
          updated_at: now,
        },
      };
  }

  return basePayload;
}

export async function printJsonResponse(response: Awaited<ReturnType<typeof sendWebhookRequest>>) {
  const contentType = response.headers['content-type'];
  if (contentType && contentType.includes('application/json')) {
    return response.body.json();
  }
  return null;
}

export function failTriggerCommand(logger: Logger, spinner: Spinner, error: unknown): never {
  const err = error as Error;
  spinner.fail('Failed to trigger webhook event');
  logger.error('Trigger command error:', err.message);
  throw new CommandError();
}
