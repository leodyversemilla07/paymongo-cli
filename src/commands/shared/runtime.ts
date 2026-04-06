import chalk from 'chalk';
import ApiClient from '../../services/api/client.js';
import ConfigManager from '../../services/config/manager.js';
import type { PayMongoConfig } from '../../types/paymongo.js';
import { CommandError } from '../../utils/errors.js';
import Spinner from '../../utils/spinner.js';

export interface CommandContext {
  spinner: Spinner;
  configManager: ConfigManager;
}

export function createCommandContext(): CommandContext {
  return {
    spinner: new Spinner(),
    configManager: new ConfigManager(),
  };
}

export function showNoConfigMessage(
  message: string = "Run 'paymongo init' to set up your project first."
): void {
  console.log(chalk.yellow('No PayMongo configuration found.'));
  console.log(chalk.gray(message));
}

export async function loadCommandConfig(
  spinner: Spinner,
  configManager: ConfigManager,
  loadingText: string = 'Loading configuration...',
  missingMessage?: string
): Promise<PayMongoConfig | null> {
  spinner.start(loadingText);
  const config = await configManager.load();

  if (!config) {
    spinner.fail('No configuration found');
    showNoConfigMessage(missingMessage);
    return null;
  }

  spinner.succeed('Configuration loaded');
  return config;
}

export function createApiClient(config: PayMongoConfig): ApiClient {
  return new ApiClient({ config });
}

export function failCommand(prefix: string, error: unknown, spinner?: Spinner): never {
  spinner?.stop();
  const err = error as Error;
  console.error(chalk.red(prefix), err.message);
  throw new CommandError();
}
