import chalk from 'chalk';
import type ConfigManager from '../../services/config/manager.js';
import type { PayMongoConfig } from '../../types/paymongo.js';
import type Spinner from '../../utils/spinner.js';
import {
  createCommandContext,
  createApiClient as createSharedApiClient,
  failCommand,
  loadCommandConfig,
} from '../shared/runtime.js';

export function createSourcesContext(): {
  spinner: Spinner;
  configManager: ConfigManager;
} {
  return createCommandContext();
}

export async function loadSourcesConfig(
  spinner: Spinner,
  configManager: ConfigManager
): Promise<PayMongoConfig | null> {
  return loadCommandConfig(spinner, configManager);
}

export function createApiClient(config: PayMongoConfig) {
  return createSharedApiClient(config);
}

export function handleSourcesError(prefix: string, spinner: Spinner, error: unknown): never {
  return failCommand(prefix, error, spinner);
}

export function getStatusColor(status: string) {
  switch (status) {
    case 'paid':
    case 'chargeable':
    case 'processed':
      return chalk.green;
    case 'pending':
    case 'awaiting_payment':
      return chalk.yellow;
    case 'failed':
    case 'expired':
      return chalk.red;
    default:
      return chalk.white;
  }
}
