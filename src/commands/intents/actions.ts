import chalk from 'chalk';
import {
  createApiClient,
  createIntentsContext,
  getStatusColor,
  handleIntentsError,
  loadIntentsConfig,
  parseBoundedInt,
} from './helpers.js';

export async function showAction(id: string, options: { json?: boolean }) {
  const { spinner, configManager } = createIntentsContext();

  try {
    const config = await loadIntentsConfig(spinner, configManager);
    if (!config) {
      return;
    }

    spinner.start('Fetching payment intent details...');
    const intent = await createApiClient(config).getPaymentIntent(id);
    spinner.succeed('Payment intent loaded');

    if (options.json) {
      console.log(JSON.stringify(intent, null, 2));
      return;
    }

    const attrs = intent.attributes;
    console.log(`\n${chalk.bold('Payment Intent Details')}`);
    console.log(chalk.gray('─'.repeat(50)));
    console.log(`${chalk.bold('ID:')} ${intent.id}`);
    console.log(`${chalk.bold('Type:')} ${intent.type}`);
    console.log(`${chalk.bold('Amount:')} ₱${(attrs.amount / 100).toFixed(2)} ${attrs.currency}`);
    console.log(`${chalk.bold('Status:')} ${getStatusColor(attrs.status)(attrs.status)}`);
    console.log(`${chalk.bold('Mode:')} ${chalk.yellow('TEST')}`);

    if (attrs.description) {
      console.log(`${chalk.bold('Description:')} ${attrs.description}`);
    }

    console.log(
      `${chalk.bold('Payment Methods Allowed:')} ${attrs.payment_method_allowed.join(', ')}`
    );
    console.log('');
    console.log(`${chalk.bold('Created:')} ${new Date(attrs.created_at * 1000).toLocaleString()}`);
    console.log(`${chalk.bold('Updated:')} ${new Date(attrs.updated_at * 1000).toLocaleString()}`);
    console.log('');
    console.log(
      chalk.gray(`View in dashboard: https://dashboard.paymongo.com/payment_intents/${intent.id}`)
    );
  } catch (error) {
    handleIntentsError('❌ Failed to fetch payment intent:', spinner, error);
  }
}

export async function cancelAction(id: string, options: { json?: boolean }) {
  const { spinner, configManager } = createIntentsContext();

  try {
    const config = await loadIntentsConfig(spinner, configManager);
    if (!config) {
      return;
    }

    spinner.start('Cancelling payment intent...');
    const intent = await createApiClient(config).cancelPaymentIntent(id);
    spinner.succeed('Payment intent cancelled');

    if (options.json) {
      console.log(JSON.stringify(intent, null, 2));
      return;
    }

    const attrs = intent.attributes;
    console.log(`\n${chalk.bold('Payment Intent Cancelled')}`);
    console.log(chalk.gray('─'.repeat(50)));
    console.log(`${chalk.bold('ID:')} ${intent.id}`);
    console.log(`${chalk.bold('Status:')} ${getStatusColor(attrs.status)(attrs.status)}`);
    console.log('');
    console.log(chalk.yellow('⚠️  This payment intent can no longer be used for payments.'));
  } catch (error) {
    handleIntentsError('❌ Failed to cancel payment intent:', spinner, error);
  }
}

export async function createAction(options: {
  amount?: string;
  currency?: string;
  description?: string;
  json?: boolean;
}) {
  const { spinner, configManager } = createIntentsContext();

  try {
    const config = await loadIntentsConfig(spinner, configManager);
    if (!config) {
      return;
    }

    const amount = parseBoundedInt(
      options.amount,
      '10000',
      'Amount must be a positive number in centavos',
      (parsed) => parsed > 0
    );

    spinner.start('Creating payment intent...');
    const intent = await createApiClient(config).createPaymentIntent(
      amount,
      options.currency || 'PHP',
      options.description
    );
    spinner.succeed('Payment intent created');

    if (options.json) {
      console.log(JSON.stringify(intent, null, 2));
      return;
    }

    const attrs = intent.attributes;
    console.log(`\n${chalk.bold('Payment Intent Created')}`);
    console.log(chalk.gray('─'.repeat(50)));
    console.log(`${chalk.bold('ID:')} ${intent.id}`);
    console.log(`${chalk.bold('Amount:')} ₱${(attrs.amount / 100).toFixed(2)} ${attrs.currency}`);
    console.log(`${chalk.bold('Status:')} ${getStatusColor(attrs.status)(attrs.status)}`);
    console.log(`${chalk.bold('Payment Methods:')} ${attrs.payment_method_allowed.join(', ')}`);
    console.log('');
    console.log(`${chalk.bold('Next Steps:')}`);
    console.log(chalk.gray('1. Attach a payment method:'));
    console.log(chalk.cyan(`   paymongo payments attach ${intent.id} --simulate`));
    console.log(chalk.gray('2. Or redirect to PayMongo checkout'));
  } catch (error) {
    handleIntentsError('❌ Failed to create payment intent:', spinner, error);
  }
}

export async function listAction(_options: { limit?: string; json?: boolean }) {
  const { spinner, configManager } = createIntentsContext();

  try {
    const config = await loadIntentsConfig(spinner, configManager);
    if (!config) {
      return;
    }

    // Note: PayMongo API doesn't have a list payment intents endpoint
    // This is a placeholder for future implementation
    spinner.info('Note: PayMongo API does not support listing payment intents');
    console.log(chalk.yellow('⚠️  Listing payment intents is not supported by the PayMongo API.'));
    console.log(chalk.gray('You can use "paymongo intents show <id>" to check a specific intent.'));
    console.log(chalk.gray('For webhook-based tracking, use "paymongo dev" to receive events.'));
  } catch (error) {
    handleIntentsError('❌ Failed to list payment intents:', spinner, error);
  }
}
