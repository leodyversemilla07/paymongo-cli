import type { WebhookData } from '../types/paymongo.js';

/** Remove signing credentials before webhook resources are printed or exported. */
export function redactWebhookSecret(webhook: WebhookData): WebhookData {
  const { secret_key: _secret, ...attributes } = webhook.attributes;
  return { ...webhook, attributes };
}
