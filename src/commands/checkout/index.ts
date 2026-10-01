import { Command } from 'commander';
import type { CommandOptions } from '../../types/paymongo.js';
import {
  CHECKOUT_PAYMENT_METHOD_TYPES,
  DEFAULT_PAYMENT_INTENT_METHODS,
} from '../../utils/constants.js';
import {
  type CheckoutCreateCommandOptions,
  type CheckoutExpireCommandOptions,
  createAction,
  expireAction,
  showAction,
} from './actions.js';

export function createCheckoutCommand(): Command {
  const command = new Command('checkout').description(
    'Create, retrieve, and expire Hosted Checkout Sessions (v1 API)'
  );
  command
    .command('create')
    .description('Create a hosted payment page using the documented v1 endpoint')
    .option('--items-file <path>', 'JSON array of line items (amount, currency, name, quantity)')
    .option('-a, --amount <centavos>', 'Positive integer unit price for a single item')
    .option('--name <name>', 'Name of the single item')
    .option('--quantity <quantity>', 'Single-item quantity (default: 1)')
    .option('-c, --currency <currency>', 'Single-item currency (PHP only)')
    .option(
      '--methods <methods>',
      `Comma-separated methods: ${CHECKOUT_PAYMENT_METHOD_TYPES.join(', ')}`,
      DEFAULT_PAYMENT_INTENT_METHODS.join(',')
    )
    .option('-d, --description <description>', 'Checkout description')
    .option('--reference-number <reference>', 'Your external order reference')
    .option('--success-url <url>', 'HTTP(S) redirect after payment; not proof of payment')
    .option('--cancel-url <url>', 'HTTP(S) return URL; does not cancel the session')
    .option('--billing-file <path>', 'Billing attributes from a JSON object')
    .option('--metadata-file <path>', 'String-valued metadata from a JSON object')
    .option('--send-email-receipt', 'Send a payment confirmation email receipt')
    .option('--no-send-email-receipt', 'Do not send an email receipt')
    .option('--show-description', 'Display the checkout description')
    .option('--no-show-description', 'Hide the checkout description')
    .option('--show-line-items', 'Display checkout line items')
    .option('--no-show-line-items', 'Hide checkout line items')
    .option('--json', 'Output sanitized resource JSON')
    .action(async (options: CheckoutCreateCommandOptions) => createAction(options));
  command
    .command('show')
    .description('Retrieve a session; active does not mean paid')
    .argument('<id>', 'Checkout Session ID (cs_...)')
    .option('--json', 'Output sanitized resource JSON')
    .action(async (id: string, options: CommandOptions) => showAction(id, options));
  command
    .command('expire')
    .description('Disable a checkout URL; this is not a refund')
    .argument('<id>', 'Checkout Session ID (cs_...)')
    .option('-y, --yes', 'Skip the expiration confirmation')
    .option('--json', 'Output sanitized resource JSON')
    .action(async (id: string, options: CheckoutExpireCommandOptions) => expireAction(id, options));
  return command;
}

export const checkoutCommand = createCheckoutCommand();
export default checkoutCommand;
