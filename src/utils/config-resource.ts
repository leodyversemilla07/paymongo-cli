import type { PayMongoConfig } from '../types/paymongo.js';

/** Preserve diagnostic shape without exposing API or webhook signing credentials. */
export function redactConfigSecrets(config: PayMongoConfig): Record<string, unknown> {
  return {
    ...config,
    apiKeys: Object.fromEntries(
      Object.entries(config.apiKeys).map(([environment, keys]) => [
        environment,
        keys ? Object.fromEntries(Object.keys(keys).map((key) => [key, '[REDACTED]'])) : keys,
      ])
    ),
    ...(config.webhookSecrets && {
      webhookSecrets: Object.fromEntries(
        Object.keys(config.webhookSecrets).map((id) => [id, '[REDACTED]'])
      ),
    }),
  };
}
