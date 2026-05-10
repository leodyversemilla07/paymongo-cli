import chalk from 'chalk';
import {
  createApiClient,
  createSourcesContext,
  getStatusColor,
  handleSourcesError,
  loadSourcesConfig,
} from './helpers.js';

export async function createAction(options: {
  amount?: string;
  type?: string;
  currency?: string;
  description?: string;
  json?: boolean;
}) {
  const { spinner, configManager } = createSourcesContext();

  try {
    const config = await loadSourcesConfig(spinner, configManager);
    if (!config) {
      return;
    }

    const amount = parseInt(options.amount || '10000', 10);
    if (Number.isNaN(amount) || amount <= 0) {
      throw new Error('Amount must be a positive number in centavos');
    }

    const type = options.type || 'gcash';
    const validTypes = ['gcash', 'paymaya', 'grabpay', 'card', 'bancomer'];
    if (!validTypes.includes(type)) {
      throw new Error(`Invalid payment type. Valid types: ${validTypes.join(', ')}`);
    }

    spinner.start(`Creating ${type} source...`);
    const source = await createApiClient(config).createSource(
      amount,
      type,
      options.currency || 'PHP',
      options.description
    );
    spinner.succeed('Source created');

    if (options.json) {
      console.log(JSON.stringify(source, null, 2));
      return;
    }

    const attrs = source.attributes;
    console.log(`\n${chalk.bold('Source Created')}`);
    console.log(chalk.gray('─'.repeat(50)));
    console.log(`${chalk.bold('ID:')} ${source.id}`);
    console.log(`${chalk.bold('Type:')} ${attrs.type}`);
    console.log(`${chalk.bold('Amount:')} ₱${(attrs.amount / 100).toFixed(2)} ${attrs.currency}`);
    console.log(`${chalk.bold('Status:')} ${getStatusColor(attrs.status)(attrs.status)}`);
    console.log(`${chalk.bold('Description:')} ${attrs.description || 'N/A'}`);
    console.log(`${chalk.bold('Created:')} ${new Date(attrs.created_at * 1000).toLocaleString()}`);

    if (attrs.checkout_url) {
      console.log('');
      console.log(`${chalk.bold('Checkout URL:')} ${chalk.cyan(attrs.checkout_url)}`);
      console.log(chalk.gray('Share this URL with the customer to complete payment'));
    }

    if (attrs.reference_number) {
      console.log(`${chalk.bold('Reference Number:')} ${attrs.reference_number}`);
    }

    console.log('');
    console.log(chalk.gray('Use paymongo sources show <id> to check payment status'));
  } catch (error) {
    handleSourcesError('❌ Failed to create source:', spinner, error);
  }
}

export async function showAction(id: string, options: { json?: boolean }) {
  const { spinner, configManager } = createSourcesContext();

  try {
    const config = await loadSourcesConfig(spinner, configManager);
    if (!config) {
      return;
    }

    spinner.start('Fetching source details...');
    const source = await createApiClient(config).getSource(id);
    spinner.succeed('Source details loaded');

    if (options.json) {
      console.log(JSON.stringify(source, null, 2));
      return;
    }

    const attrs = source.attributes;
    console.log(`\n${chalk.bold('Source Details')}`);
    console.log(chalk.gray('─'.repeat(50)));
    console.log(`${chalk.bold('ID:')} ${source.id}`);
    console.log(`${chalk.bold('Type:')} ${attrs.type}`);
    console.log(`${chalk.bold('Amount:')} ₱${(attrs.amount / 100).toFixed(2)} ${attrs.currency}`);
    console.log(`${chalk.bold('Status:')} ${getStatusColor(attrs.status)(attrs.status)}`);
    console.log(
      `${chalk.bold('Mode:')} ${attrs.livemode ? chalk.red('LIVE') : chalk.yellow('TEST')}`
    );

    if (attrs.description) {
      console.log(`${chalk.bold('Description:')} ${attrs.description}`);
    }

    if (attrs.reference_number) {
      console.log(`${chalk.bold('Reference Number:')} ${attrs.reference_number}`);
    }

    if (attrs.checkout_url) {
      console.log(`${chalk.bold('Checkout URL:')} ${chalk.cyan(attrs.checkout_url)}`);
    }

    console.log(`${chalk.bold('Created:')} ${new Date(attrs.created_at * 1000).toLocaleString()}`);
    console.log(`${chalk.bold('Updated:')} ${new Date(attrs.updated_at * 1000).toLocaleString()}`);
    console.log('');
    console.log(
      chalk.gray(`View in dashboard: https://dashboard.paymongo.com/sources/${source.id}`)
    );
  } catch (error) {
    handleSourcesError('❌ Failed to fetch source:', spinner, error);
  }
}

export async function listAction(_options: { json?: boolean }) {
  const { spinner, configManager } = createSourcesContext();

  try {
    const config = await loadSourcesConfig(spinner, configManager);
    if (!config) {
      return;
    }

    // Note: PayMongo API doesn't have a list sources endpoint
    // This is a placeholder for future implementation
    spinner.info('Note: PayMongo API does not support listing sources');
    console.log(chalk.yellow('⚠️  Listing all sources is not supported by the PayMongo API.'));
    console.log(chalk.gray('You can use "paymongo sources show <id>" to check a specific source.'));
    console.log(
      chalk.gray('For webhook-based payment tracking, use "paymongo dev" to receive events.')
    );
  } catch (error) {
    handleSourcesError('❌ Failed to list sources:', spinner, error);
  }
}
