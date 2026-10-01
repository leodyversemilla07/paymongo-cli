import { Command } from 'commander';
import type { CommandOptions } from '../../types/paymongo.js';
import { NON_CARD_PAYMENT_METHOD_TYPES } from '../../utils/constants.js';
import { createAction, type PaymentMethodCreateCommandOptions, showAction } from './actions.js';

export function createPaymentMethodsCommand(): Command {
  const command = new Command('payment-methods').description(
    'Create non-card Payment Methods and retrieve existing methods'
  );
  command
    .command('create')
    .description('Create a non-card method; raw card tokenization belongs in your application')
    .requiredOption('--type <type>', `Method: ${NON_CARD_PAYMENT_METHOD_TYPES.join(', ')}`)
    .option('--bank-code <code>', 'Bank code for dob or brankas')
    .option('--expiry-seconds <seconds>', 'Custom expiry after attachment, for qrph or shopee_pay')
    .option('--billing-file <path>', 'Billing attributes from a JSON object')
    .option('--metadata-file <path>', 'String-valued metadata from a JSON object')
    .option('--json', 'Output sanitized resource JSON')
    .action(async (options: PaymentMethodCreateCommandOptions) => createAction(options));
  command
    .command('show')
    .description('Retrieve an existing Payment Method, including tokenized card methods')
    .argument('<id>', 'Payment Method ID (pm_...)')
    .option('--json', 'Output sanitized resource JSON')
    .action(async (id: string, options: CommandOptions) => showAction(id, options));
  return command;
}

export const paymentMethodsCommand = createPaymentMethodsCommand();
export default paymentMethodsCommand;
