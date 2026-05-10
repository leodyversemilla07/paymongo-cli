import { Command } from 'commander';
import { createAction, listAction, showAction } from './actions.js';

const command = new Command('payment-links');

command
  .description('Manage PayMongo payment links (hosted checkout)')
  .addCommand(
    new Command('create')
      .description('Create a payment link')
      .option('-a, --amount <amount>', 'Amount in centavos (e.g., 10000 for ₱100.00)', '10000')
      .option('-d, --description <description>', 'Payment description (required)')
      .option('-c, --currency <currency>', 'Currency code', 'PHP')
      .option('-r, --remarks <remarks>', 'Internal remarks (not shown to customer)')
      .option('-j, --json', 'Output as JSON')
      .action(createAction)
  )
  .addCommand(
    new Command('show')
      .description('Show payment link details')
      .arguments('<id>')
      .option('-j, --json', 'Output as JSON')
      .action(showAction)
  )
  .addCommand(
    new Command('list')
      .description('List payment links')
      .option('-l, --limit <number>', 'Number of links to show', '10')
      .option('-j, --json', 'Output as JSON')
      .action(listAction)
  );

export { createAction, listAction, showAction };

export default command;
