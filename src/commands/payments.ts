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
    new Command('create-intent')
      .description('Create a payment intent')
      .option('-a, --amount <amount>', 'Amount in centavos (e.g., 10000 for ₱100.00)', '10000')
      .option('-c, --currency <currency>', 'Currency code', 'PHP')
      .option('-d, --description <description>', 'Payment description')
      .option('-j, --json', 'Output as JSON')
      .action(createIntentAction)
  )
  .addCommand(
    new Command('attach')
      .alias('confirm')
      .description('Attach a payment method to a payment intent')
      .arguments('<intentId>')
      .option(
        '-p, --payment-method <id>',
        'Payment method ID to attach (required unless --simulate)'
      )
      .option('-r, --return-url <url>', 'Return URL after payment processing')
      .option('-j, --json', 'Output as JSON')
      .option('-s, --simulate', 'Enable payment simulation mode')
      .option('-m, --method <method>', 'Payment method for simulation (gcash, maya, grabpay)')
      .option(
        '-o, --outcome <outcome>',
        'Simulation outcome (success, failure, timeout)',
        'success'
      )
      .option('-d, --delay <ms>', 'Custom simulation delay in milliseconds')
      .action(attachAction)
  )
  .addCommand(
    new Command('capture')
      .description('Capture an authorized payment intent')
      .arguments('<intentId>')
      .option('-j, --json', 'Output as JSON')
      .action(captureAction)
  )
  .addCommand(
    new Command('refund')
      .description('Create a refund for a payment')
      .arguments('<paymentId>')
      .option('-a, --amount <amount>', 'Refund amount in centavos (defaults to full amount)')
      .option(
        '-r, --reason <reason>',
        'Refund reason: duplicate, fraudulent, requested_by_customer'
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
