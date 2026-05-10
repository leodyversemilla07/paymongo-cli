import { Command } from 'commander';
import { cancelAction, createAction, listAction, showAction } from './actions.js';

const command = new Command('intents');

command
  .description('Manage PayMongo payment intents')
  .addCommand(
    new Command('create')
      .description('Create a new payment intent')
      .option('-a, --amount <amount>', 'Amount in centavos (e.g., 10000 for ₱100.00)', '10000')
      .option('-c, --currency <currency>', 'Currency code', 'PHP')
      .option('-d, --description <description>', 'Payment description')
      .option('-j, --json', 'Output as JSON')
      .action(createAction)
  )
  .addCommand(
    new Command('show')
      .description('Show payment intent details')
      .arguments('<id>')
      .option('-j, --json', 'Output as JSON')
      .action(showAction)
  )
  .addCommand(
    new Command('cancel')
      .description('Cancel a payment intent')
      .arguments('<id>')
      .option('-j, --json', 'Output as JSON')
      .action(cancelAction)
  )
  .addCommand(
    new Command('list')
      .description('List payment intents (limited by PayMongo API)')
      .option('-l, --limit <number>', 'Number of intents to show', '10')
      .option('-j, --json', 'Output as JSON')
      .action(listAction)
  );

export { cancelAction, createAction, listAction, showAction };

export default command;
