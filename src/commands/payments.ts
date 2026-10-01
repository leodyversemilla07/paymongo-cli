import { Command } from 'commander';
import {
  attachAction,
  captureAction,
  confirmAction,
  createIntentAction,
  exportAction,
  importAction,
  listAction,
  refundAction,
  showAction,
} from './payments/actions.js';
import {
  addPaymentIntentAttachOptions,
  addPaymentIntentCaptureOptions,
  addPaymentIntentCreateOptions,
} from './shared/payment-intents.js';

const command = new Command('payments');

command
  .description('Manage PayMongo payments')
  .addCommand(
    new Command('export')
      .description('Export payments to JSON file')
      .option('-f, --file <filename>', 'Output filename (auto-generated if not specified)')
      .option('-l, --limit <number>', 'Maximum number of payments to export', '100')
      .action(exportAction)
  )
  .addCommand(
    new Command('import')
      .description(
        'Import payments from JSON file (Note: Can only import payment metadata, not recreate actual payments)'
      )
      .argument('<filename>', 'JSON file to import from')
      .option('-j, --json', 'Output imported data as JSON')
      .action(importAction)
  )
  .addCommand(
    new Command('list')
      .description('List recent payments')
      .option('-l, --limit <number>', 'Number of payments to show', '10')
      .option('-j, --json', 'Output as JSON')
      .action(listAction)
  )
  .addCommand(
    new Command('show')
      .description('Show payment details (for completed payments, not payment intents)')
      .arguments('<id>')
      .option('-j, --json', 'Output as JSON')
      .action(showAction)
  )
  .addCommand(
    addPaymentIntentCreateOptions(
      new Command('create-intent').description('Create a payment intent')
    ).action(createIntentAction)
  )
  .addCommand(
    addPaymentIntentAttachOptions(
      new Command('attach')
        .alias('confirm')
        .description('Attach a payment method to a payment intent')
        .argument('<intentId>')
    ).action(attachAction)
  )
  .addCommand(
    addPaymentIntentCaptureOptions(
      new Command('capture')
        .description('Capture an authorized payment intent')
        .argument('<intentId>')
    ).action(captureAction)
  )
  .addCommand(
    new Command('refund')
      .description('Create a refund for a payment')
      .arguments('<paymentId>')
      .requiredOption('-a, --amount <amount>', 'Refund amount in centavos (integer, minimum 100)')
      .requiredOption(
        '-r, --reason <reason>',
        'Refund reason: duplicate, fraudulent, requested_by_customer, others'
      )
      .option('-j, --json', 'Output as JSON')
      .action(refundAction)
  );

export {
  attachAction,
  captureAction,
  confirmAction,
  createIntentAction,
  exportAction,
  importAction,
  listAction,
  refundAction,
  showAction,
};

export default command;
