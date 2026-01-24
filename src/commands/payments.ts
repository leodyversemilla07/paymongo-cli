import { Command } from 'commander';
import chalk from 'chalk';
import ConfigManager from '../services/config/manager';
import ApiClient from '../services/api/client';
import Spinner from '../utils/spinner';

const command = new Command('payments');

command
  .description('Manage PayMongo payments')
  .addCommand(
    new Command('list')
      .description('List recent payments')
      .option('-l, --limit <number>', 'Number of payments to show', '10')
      .option('-j, --json', 'Output as JSON')
      .action(async (options) => {
        const spinner = new Spinner();
        const configManager = new ConfigManager();

        try {
          spinner.start('Loading configuration...');
          const config = await configManager.load();

          if (!config) {
            spinner.fail('No configuration found');
            console.log(chalk.yellow('No PayMongo configuration found.'));
            console.log(chalk.gray("Run 'paymongo init' to set up your project first."));
            return;
          }

          spinner.succeed('Configuration loaded');

          spinner.start('Fetching payments...');
          const apiClient = new ApiClient({ config });
          const payments = await apiClient.listPayments(parseInt(options.limit));
          spinner.succeed(`Found ${payments.length} payments`);

          if (options.json) {
            console.log(JSON.stringify(payments, null, 2));
            return;
          }

          if (payments.length === 0) {
            console.log(chalk.gray('No payments found.'));
            return;
          }

          console.log('\n' + chalk.bold('Recent Payments'));
          console.log(chalk.gray('─'.repeat(80)));

          payments.forEach((payment: any) => {
            const amount = (payment.attributes.amount / 100).toFixed(2);
            const currency = payment.attributes.currency;
            const status = payment.attributes.status;
            const created = new Date(payment.attributes.created_at * 1000).toLocaleDateString();

            console.log(
              `${chalk.bold(payment.id)} ${chalk.cyan(`₱${amount}`)} ${chalk.gray(currency)} ${getStatusColor(status)(status)} ${chalk.gray(created)}`
            );
          });

          console.log('');
        } catch (error: any) {
          spinner.stop();
          console.error(chalk.red('❌ Failed to fetch payments:'), error.message);
          process.exit(1);
        }
      })
  )

  .addCommand(
    new Command('show')
      .description('Show payment details (for completed payments, not payment intents)')
      .arguments('<id>')
      .option('-j, --json', 'Output as JSON')
      .action(async (id, options) => {
        const spinner = new Spinner();
        const configManager = new ConfigManager();

        try {
          spinner.start('Loading configuration...');
          const config = await configManager.load();

          if (!config) {
            spinner.fail('No configuration found');
            console.log(chalk.yellow('No PayMongo configuration found.'));
            console.log(chalk.gray("Run 'paymongo init' to set up your project first."));
            return;
          }

          spinner.succeed('Configuration loaded');

          spinner.start('Fetching payment details...');
          const apiClient = new ApiClient({ config });
          const payment = await apiClient.getPayment(id);
          spinner.succeed('Payment details loaded');

          if (options.json) {
            console.log(JSON.stringify(payment, null, 2));
            return;
          }

          const attrs = payment.attributes;
          const amount = (attrs.amount / 100).toFixed(2);
          const fees = attrs.fees ? (attrs.fees / 100).toFixed(2) : '0.00';
          const netAmount = attrs.net_amount ? (attrs.net_amount / 100).toFixed(2) : '0.00';

          console.log('\n' + chalk.bold('Payment Details'));
          console.log(chalk.gray('─'.repeat(50)));
          console.log(`${chalk.bold('ID:')} ${payment.id}`);
          console.log(`${chalk.bold('Amount:')} ₱${amount} ${attrs.currency}`);
          console.log(`${chalk.bold('Status:')} ${getStatusColor(attrs.status)(attrs.status)}`);
          console.log(`${chalk.bold('Description:')} ${attrs.description || 'N/A'}`);
          console.log(
            `${chalk.bold('External Reference:')} ${attrs.external_reference_number || 'N/A'}`
          );
          console.log(
            `${chalk.bold('Paid At:')} ${attrs.paid_at ? new Date(attrs.paid_at * 1000).toLocaleString() : 'N/A'}`
          );
          console.log(
            `${chalk.bold('Created:')} ${new Date(attrs.created_at * 1000).toLocaleString()}`
          );
          console.log(
            `${chalk.bold('Updated:')} ${new Date(attrs.updated_at * 1000).toLocaleString()}`
          );

          if (attrs.fees) {
            console.log(`${chalk.bold('Fees:')} ₱${fees}`);
            console.log(`${chalk.bold('Net Amount:')} ₱${netAmount}`);
          }

          if (attrs.source) {
            console.log(`${chalk.bold('Payment Method:')} ${attrs.source.attributes.type}`);
          }

          console.log(`${chalk.bold('Payment Intent:')} ${attrs.payment_intent_id}`);

          console.log('');
          console.log(
            chalk.gray(`View in dashboard: https://dashboard.paymongo.com/payments/${payment.id}`)
          );
        } catch (error: any) {
          spinner.stop();
          console.error(chalk.red('❌ Failed to fetch payment:'), error.message);
          process.exit(1);
        }
      })
  )

  .addCommand(
    new Command('create-intent')
      .description('Create a payment intent')
      .option('-a, --amount <amount>', 'Amount in centavos (e.g., 10000 for ₱100.00)', '10000')
      .option('-c, --currency <currency>', 'Currency code', 'PHP')
      .option('-d, --description <description>', 'Payment description')
      .option('-j, --json', 'Output as JSON')
      .action(async (options) => {
        const spinner = new Spinner();
        const configManager = new ConfigManager();

        try {
          spinner.start('Loading configuration...');
          const config = await configManager.load();

          if (!config) {
            spinner.fail('No configuration found');
            console.log(chalk.yellow('No PayMongo configuration found.'));
            console.log(chalk.gray("Run 'paymongo init' to set up your project first."));
            return;
          }

          spinner.succeed('Configuration loaded');

          const amount = parseInt(options.amount);
          if (isNaN(amount) || amount <= 0) {
            throw new Error('Amount must be a positive number in centavos');
          }

          spinner.start('Creating payment intent...');
          const apiClient = new ApiClient({ config });
          const paymentIntent = await apiClient.createPaymentIntent(
            amount,
            options.currency,
            options.description
          );
          spinner.succeed('Payment intent created');

          if (options.json) {
            console.log(JSON.stringify(paymentIntent, null, 2));
            return;
          }

          const attrs = paymentIntent.attributes;
          const displayAmount = (attrs.amount / 100).toFixed(2);

          console.log('\n' + chalk.bold('Payment Intent Created'));
          console.log(chalk.gray('─'.repeat(50)));
          console.log(`${chalk.bold('ID:')} ${paymentIntent.id}`);
          console.log(`${chalk.bold('Amount:')} ₱${displayAmount} ${attrs.currency}`);
          console.log(`${chalk.bold('Status:')} ${getStatusColor(attrs.status)(attrs.status)}`);
          console.log(`${chalk.bold('Description:')} ${attrs.description || 'N/A'}`);
          console.log(
            `${chalk.bold('Created:')} ${new Date(attrs.created_at * 1000).toLocaleString()}`
          );

          console.log('');
          console.log(
            chalk.gray(`Use this ID to attach a payment method and confirm the payment.`)
          );
        } catch (error: any) {
          spinner.stop();
          console.error(chalk.red('❌ Failed to create payment intent:'), error.message);
          process.exit(1);
        }
      })
  );

function getStatusColor(status: string) {
  switch (status) {
    case 'paid':
      return chalk.green;
    case 'pending':
      return chalk.yellow;
    case 'failed':
      return chalk.red;
    case 'cancelled':
      return chalk.gray;
    default:
      return chalk.white;
  }
}

export default command;
