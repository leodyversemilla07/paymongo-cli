import type ApiClient from '../../services/api/client.js';
import type { CommandOptions, PayMongoConfig } from '../../types/paymongo.js';
import { redactPaymentResource } from '../../utils/payment-resource.js';
import { createCommandContext, failCommand, loadCommandConfig, withApiClient } from './runtime.js';

/** Validate before creating a client, then release connections after the request. */
export async function runResourceCommand<T>(
  options: CommandOptions,
  message: string,
  prepare: () => Promise<((client: ApiClient) => Promise<T>) | undefined>,
  display: (resource: T) => void,
  approve?: (config: PayMongoConfig) => Promise<boolean>
): Promise<void> {
  const context = createCommandContext();
  try {
    const operation = await prepare();
    if (!operation) return;
    const config = await loadCommandConfig(context.spinner, context.configManager);
    if (!config) return;
    if (approve && !(await approve(config))) return;
    context.spinner.start(message);
    const resource = await withApiClient(config, operation);
    context.spinner.stop();
    if (options.json) console.log(JSON.stringify(redactPaymentResource(resource), null, 2));
    else display(resource);
  } catch (error) {
    failCommand('Payment resource operation failed:', error, context.spinner);
  }
}
