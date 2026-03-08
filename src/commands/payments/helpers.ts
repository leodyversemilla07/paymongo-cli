import chalk from 'chalk';
import ApiClient from '../../services/api/client.js';
import ConfigManager from '../../services/config/manager.js';
import Spinner from '../../utils/spinner.js';
import { PaymentSimulator } from '../../services/payments/simulator.js';
import { CommandError } from '../../utils/errors.js';
import { PayMongoConfig } from '../../types/paymongo.js';

export function createPaymentsContext(): {
  spinner: Spinner;
  configManager: ConfigManager;
} {
  return {
    spinner: new Spinner(),
    configManager: new ConfigManager(),
  };
}

export function getStatusColor(status: string) {
  switch (status) {
    case 'paid':
    case 'succeeded':
    case 'processed':
      return chalk.green;
    case 'pending':
    case 'awaiting_payment_method':
    case 'awaiting_next_action':
    case 'processing':
      return chalk.yellow;
    case 'failed':
      return chalk.red;
    case 'cancelled':
      return chalk.gray;
    default:
      return chalk.white;
  }
}

export async function loadPaymentsConfig(
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

export function createPaymentSimulator(): PaymentSimulator {
  return new PaymentSimulator();
}

export function handlePaymentsError(prefix: string, spinner: Spinner, error: unknown): never {
  spinner.stop();
  const err = error as Error;
  console.error(chalk.red(prefix), err.message);
  throw new CommandError();
}

export function parseBoundedInt(
  value: string | undefined,
  fallback: string,
  errorMessage: string,
  validate: (parsed: number) => boolean
): number {
  const parsed = parseInt(value || fallback, 10);
  if (isNaN(parsed) || !validate(parsed)) {
    throw new Error(errorMessage);
  }

  return parsed;
}
