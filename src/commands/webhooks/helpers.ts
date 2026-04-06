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

export function createWebhooksContext(): {
  spinner: Spinner;
  configManager: ConfigManager;
} {
  return createCommandContext();
}

export async function loadWebhooksConfig(
  spinner: Spinner,
  configManager: ConfigManager
): Promise<PayMongoConfig | null> {
  return loadCommandConfig(spinner, configManager);
}

export function createApiClient(config: PayMongoConfig) {
  return createSharedApiClient(config);
}

export function getWebhookStatusColor(status: string) {
  switch (status) {
    case 'enabled':
      return chalk.green;
    case 'disabled':
      return chalk.red;
    default:
      return chalk.white;
  }
}

export function handleWebhooksError(prefix: string, spinner: Spinner, error: unknown): never {
  return failCommand(prefix, error, spinner);
}
