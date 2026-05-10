import type ConfigManager from '../../services/config/manager.js';
import type { PayMongoConfig } from '../../types/paymongo.js';
import type Spinner from '../../utils/spinner.js';
import {
  createCommandContext,
  createApiClient as createSharedApiClient,
  failCommand,
  loadCommandConfig,
} from '../shared/runtime.js';

export function createPaymentLinksContext(): {
  spinner: Spinner;
  configManager: ConfigManager;
} {
  return createCommandContext();
}

export async function loadPaymentLinksConfig(
  spinner: Spinner,
  configManager: ConfigManager
): Promise<PayMongoConfig | null> {
  return loadCommandConfig(spinner, configManager);
}

export function createApiClient(config: PayMongoConfig) {
  return createSharedApiClient(config);
}

export function handlePaymentLinksError(prefix: string, spinner: Spinner, error: unknown): never {
  return failCommand(prefix, error, spinner);
}
