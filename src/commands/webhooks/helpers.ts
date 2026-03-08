import chalk from 'chalk';
import ApiClient from '../../services/api/client.js';
import ConfigManager from '../../services/config/manager.js';
import Spinner from '../../utils/spinner.js';
import { CommandError } from '../../utils/errors.js';
import { PayMongoConfig } from '../../types/paymongo.js';

export function createWebhooksContext(): {
  spinner: Spinner;
  configManager: ConfigManager;
} {
  return {
    spinner: new Spinner(),
    configManager: new ConfigManager(),
  };
}

export async function loadWebhooksConfig(
  spinner: Spinner,
  configManager: ConfigManager
): Promise<PayMongoConfig | null> {
  spinner.start('Loading configuration...');
  const config = await configManager.load();

  if (!config) {
    spinner.fail('No configuration found');
    console.log(chalk.yellow('No PayMongo configuration found.'));
    console.log(chalk.gray("Run 'paymongo init' to set up your project first."));
    return null;
  }

  spinner.succeed('Configuration loaded');
  return config;
}

export function createApiClient(config: PayMongoConfig): ApiClient {
  return new ApiClient({ config });
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
  spinner.stop();
  const err = error as Error;
  console.error(chalk.red(prefix), err.message);
  throw new CommandError();
}
