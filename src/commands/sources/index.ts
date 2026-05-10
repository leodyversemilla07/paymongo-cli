import { Command } from 'commander';
import { createAction, listAction, showAction } from './actions.js';

const command = new Command('sources');

command
  .description('Manage PayMongo payment sources (one-time payments)')
  .addCommand(
    new Command('create')
      .description('Create a one-time payment source')
      .option('-a, --amount <amount>', 'Amount in centavos (e.g., 10000 for ₱100.00)', '10000')
      .option(
        '-t, --type <type>',
        'Payment type (gcash, paymaya, grabpay, card, bancomer)',
        'gcash'
      )
      .option('-c, --currency <currency>', 'Currency code', 'PHP')
      .option('-d, --description <description>', 'Payment description')
      .option('-j, --json', 'Output as JSON')
      .action(createAction)
  )
  .addCommand(
    new Command('show')
      .description('Show source details')
      .arguments('<id>')
      .option('-j, --json', 'Output as JSON')
      .action(showAction)
  )
  .addCommand(
    new Command('list')
      .description('List sources (limited by PayMongo API)')
      .option('-j, --json', 'Output as JSON')
      .action(listAction)
  );

export { createAction, listAction, showAction };

export default command;
