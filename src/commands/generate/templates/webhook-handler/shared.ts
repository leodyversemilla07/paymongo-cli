/** Generate a standalone verifier following PayMongo's raw-body signing contract. */
export function signatureTemplate(typescript = false): string {
  const parameters = typescript
    ? 'payload: string, signatureHeader: string | undefined, secret: string, livemode: boolean'
    : 'payload, signatureHeader, secret, livemode';
  return `function verifySignature(${parameters})${typescript ? ': boolean' : ''} {
  if (typeof signatureHeader !== 'string') return false;
  const parts = signatureHeader.split(',').map((part) => part.trim());
  const timestamp = parts.find((part) => part.startsWith('t='))?.split('=')[1];
  const testSignature = parts.find((part) => part.startsWith('te='))?.split('=')[1];
  const liveSignature = parts.find((part) => part.startsWith('li='))?.split('=')[1];
  const signature = livemode ? liveSignature : testSignature;
  if (!timestamp || !signature || !/^[a-f0-9]{64}$/i.test(signature)) return false;
  const expected = crypto.createHmac('sha256', secret)
    .update(timestamp + '.' + payload, 'utf8').digest();
  return crypto.timingSafeEqual(Buffer.from(signature, 'hex'), expected);
}`;
}

export function eventHandlersTemplate(events: string[]): string {
  return events
    .map(
      (event) => `
      case '${event}':
        // Add your ${event} handling logic here. Avoid logging sensitive payment data.
        break;`
    )
    .join('');
}

export const PAYLOAD_INTERFACE = `interface PayMongoWebhookPayload {
  data: {
    id: string;
    type: 'event';
    attributes: {
      type: string;
      livemode: boolean;
      created_at: number;
      updated_at: number;
      data: Record<string, unknown>;
    };
  };
}`;
