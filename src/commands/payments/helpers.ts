import chalk from 'chalk';
import type ConfigManager from '../../services/config/manager.js';
import { PaymentSimulator } from '../../services/payments/simulator.js';
import type { PayMongoConfig } from '../../types/paymongo.js';
import type Spinner from '../../utils/spinner.js';
import {
  createCommandContext,
  createApiClient as createSharedApiClient,
  failCommand,
  loadCommandConfig,
} from '../shared/runtime.js';

export function createPaymentsContext(): {
  spinner: Spinner;
  configManager: ConfigManager;
} {
  return createCommandContext();
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
  return loadCommandConfig(spinner, configManager);
}

export function createApiClient(config: PayMongoConfig) {
  return createSharedApiClient(config);
}

export function createPaymentSimulator(): PaymentSimulator {
  return new PaymentSimulator();
}

export function handlePaymentsError(prefix: string, spinner: Spinner, error: unknown): never {
  return failCommand(prefix, error, spinner);
}

export function parseBoundedInt(
  value: string | undefined,
  fallback: string,
  errorMessage: string,
  validate: (parsed: number) => boolean
): number {
  const parsed = parseInt(value || fallback, 10);
  if (Number.isNaN(parsed) || !validate(parsed)) {
    throw new Error(errorMessage);
  }

  return parsed;
}
