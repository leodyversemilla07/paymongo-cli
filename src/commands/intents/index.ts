import { Command } from 'commander';
import { attachAction, captureAction } from '../payments/actions.js';
import {
  addPaymentIntentAttachOptions,
  addPaymentIntentCaptureOptions,
  addPaymentIntentCreateOptions,
} from '../shared/payment-intents.js';
import { cancelAction, createAction, listAction, showAction } from './actions.js';

/** Create a fresh command tree, including the documented intent lifecycle. */
export function createIntentsCommand(): Command {
  return new Command('intents')
    .description('Manage PayMongo payment intents')
    .addCommand(
      addPaymentIntentCreateOptions(
        new Command('create').description('Create a new payment intent')
      ).action(createAction)
    )
    .addCommand(
      new Command('show')
        .description('Show payment intent details')
        .argument('<id>')
        .option('-j, --json', 'Output as JSON')
        .action(showAction)
    )
    .addCommand(
      addPaymentIntentAttachOptions(
        new Command('attach')
          .description('Attach a payment method to an intent')
          .argument('<intentId>')
      ).action(attachAction)
    )
    .addCommand(
      addPaymentIntentCaptureOptions(
        new Command('capture')
          .description('Capture a manually authorized card payment')
          .argument('<intentId>')
      ).action(captureAction)
    )
    .addCommand(
      new Command('cancel')
        .description('Cancel a payment intent')
        .argument('<id>')
        .option('-j, --json', 'Output as JSON')
        .action(cancelAction)
    )
    .addCommand(
      new Command('list')
        .description('Explain why remote Payment Intent listing is unavailable')
        .option('-l, --limit <number>', 'Reserved compatibility option', '10')
        .option('-j, --json', 'Reserved compatibility option')
        .action(listAction)
    );
}

export { attachAction, cancelAction, captureAction, createAction, listAction, showAction };
export default createIntentsCommand();
