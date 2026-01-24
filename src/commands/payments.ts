import { Command } from 'commander';
import chalk from 'chalk';
import ConfigManager from '../services/config/manager.js';
import ApiClient from '../services/api/client.js';
import { PaymentSimulator, SimulationOptions } from '../services/payments/simulator.js';
import { BulkOperations } from '../utils/bulk.js';
import Spinner from '../utils/spinner.js';
import { PaymentDataFull } from '../types/paymongo.js';

const command = new Command('payments');

command
  .description('Manage PayMongo payments')
  .addCommand(
    new Command('export')
      .description('Export payments to JSON file')
      .option('-f, --file <filename>', 'Output filename (auto-generated if not specified)')
      .option('-l, --limit <number>', 'Maximum number of payments to export', '100')
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

          const limit = parseInt(options.limit);
          if (isNaN(limit) || limit < 1 || limit > 1000) {
            throw new Error('Limit must be a number between 1 and 1000');
          }

          spinner.start(`Fetching up to ${limit} payments...`);
          const apiClient = new ApiClient({ config });
          const payments = await apiClient.listPayments(limit);
          spinner.succeed(`Found ${payments.length} payments`);

          if (payments.length === 0) {
            console.log(chalk.yellow('No payments found to export.'));
            return;
          }

          // Generate filename if not provided
          let filename = options.file;
          if (!filename) {
            filename = BulkOperations.generateFilename('payments', config.environment);
          } else {
            filename = BulkOperations.ensureJsonExtension(filename);
          }

          spinner.start(`Exporting to ${filename}...`);
          await BulkOperations.exportPayments(payments, filename, config.environment);
          spinner.succeed('Export completed');

          console.log('\n' + chalk.green('✅ Payments exported successfully!'));
          console.log('');
          console.log(`${chalk.bold('File:')} ${filename}`);
          console.log(`${chalk.bold('Payments:')} ${payments.length}`);
          console.log(`${chalk.bold('Environment:')} ${config.environment}`);
          console.log(`${chalk.bold('Total size:')} ${payments.length} payments`);
        } catch (error) {
          spinner.stop();
          const err = error as Error;
          console.error(chalk.red('❌ Failed to export payments:'), err.message);
          process.exit(1);
        }
      })
  )
  .addCommand(
    new Command('import')
      .description(
        'Import payments from JSON file (Note: Can only import payment metadata, not recreate actual payments)'
      )
      .argument('<filename>', 'JSON file to import from')
      .option('-j, --json', 'Output imported data as JSON')
      .action(async (filename, options) => {
        const spinner = new Spinner();

        try {
          spinner.start(`Importing payments from ${filename}...`);
          const { payments, metadata } = await BulkOperations.importPayments(filename);
          spinner.succeed(`Loaded ${payments.length} payments from export`);

          if (options.json) {
            console.log(JSON.stringify({ payments, metadata }, null, 2));
            return;
          }

          console.log('\n' + chalk.green('✅ Payments imported successfully!'));
          console.log('');
          console.log(`${chalk.bold('Source:')} ${filename}`);
          console.log(`${chalk.bold('Payments:')} ${payments.length}`);
          console.log(`${chalk.bold('Exported from:')} ${metadata.environment} environment`);
          console.log(
            `${chalk.bold('Export date:')} ${new Date(metadata.exported_at).toLocaleString()}`
          );

          console.log('\n' + chalk.yellow('⚠️  Important Notes:'));
          console.log(chalk.gray('• Payment data imported for reference only'));
          console.log(chalk.gray('• Actual payments cannot be recreated through the API'));
          console.log(chalk.gray('• Use this for data analysis, migration planning, or testing'));

          if (payments.length > 0) {
            console.log('\n' + chalk.bold('Sample Payment IDs:'));
            payments.slice(0, 5).forEach((payment: PaymentDataFull, index: number) => {
              const amount = (payment.attributes.amount / 100).toFixed(2);
              console.log(
                `  ${index + 1}. ${payment.id} - ₱${amount} ${payment.attributes.currency}`
              );
            });

            if (payments.length > 5) {
              console.log(chalk.gray(`  ... and ${payments.length - 5} more`));
            }
          }
        } catch (error) {
          spinner.stop();
          const err = error as Error;
          console.error(chalk.red('❌ Failed to import payments:'), err.message);
          process.exit(1);
        }
      })
  )
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

          payments.forEach((payment: PaymentDataFull) => {
            const amount = (payment.attributes.amount / 100).toFixed(2);
            const currency = payment.attributes.currency;
            const status = payment.attributes.status;
            const created = new Date(payment.attributes.created_at * 1000).toLocaleDateString();

            console.log(
              `${chalk.bold(payment.id)} ${chalk.cyan(`₱${amount}`)} ${chalk.gray(currency)} ${getStatusColor(status)(status)} ${chalk.gray(created)}`
            );
          });

          console.log('');
        } catch (error) {
          spinner.stop();
          const err = error as Error;
          console.error(chalk.red('❌ Failed to fetch payments:'), err.message);
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
        } catch (error) {
          spinner.stop();
          const err = error as Error;
          console.error(chalk.red('❌ Failed to fetch payment:'), err.message);
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
        } catch (error) {
          spinner.stop();
          const err = error as Error;
          console.error(chalk.red('❌ Failed to create payment intent:'), err.message);
          process.exit(1);
        }
      })
  )
  .addCommand(
    new Command('confirm')
      .description('Confirm a payment intent with a payment method')
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
      .action(async (intentId, options) => {
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

          // Validate required options based on mode
          if (options.simulate) {
            if (!options.method) {
              throw new Error(
                'Payment method is required for simulation. Use --method <gcash|maya|grabpay>'
              );
            }
          } else {
            if (!options.paymentMethod) {
              throw new Error('Payment method ID is required. Use --payment-method <id>');
            }
          }
          if (options.simulate) {
            const validMethods = ['gcash', 'maya', 'grabpay'];
            const validOutcomes = ['success', 'failure', 'timeout'];

            if (!options.method || !validMethods.includes(options.method)) {
              throw new Error(
                `Invalid or missing payment method for simulation. Must be one of: ${validMethods.join(', ')}`
              );
            }

            if (!validOutcomes.includes(options.outcome)) {
              throw new Error(
                `Invalid simulation outcome. Must be one of: ${validOutcomes.join(', ')}`
              );
            }

            const delayMs = options.delay ? parseInt(options.delay) : undefined;
            if (options.delay && (delayMs === undefined || isNaN(delayMs) || delayMs <= 0)) {
              throw new Error('Simulation delay must be a positive number in milliseconds');
            }

            console.log('\n' + chalk.bold('🧪 Payment Simulation Mode'));
            console.log(chalk.gray('─'.repeat(50)));
            console.log(`${chalk.bold('Method:')} ${options.method.toUpperCase()}`);
            console.log(`${chalk.bold('Outcome:')} ${options.outcome}`);
            console.log(
              `${chalk.bold('Delay:')} ${delayMs ? `${delayMs}ms` : 'Default for method/outcome'}`
            );

            spinner.start(`Simulating ${options.method} payment...`);

            const simulator = new PaymentSimulator();
            const simulationOptions: SimulationOptions = {
              paymentMethod: options.method as 'gcash' | 'maya' | 'grabpay',
              outcome: options.outcome as 'success' | 'failure' | 'timeout',
              ...(delayMs !== undefined && { delayMs }),
            };

            const result = await simulator.simulatePaymentConfirmation(intentId, simulationOptions);

            spinner.succeed(`Simulation completed (${result.delayApplied}ms)`);

            if (options.json) {
              console.log(JSON.stringify(result.paymentIntent, null, 2));
              return;
            }

            const attrs = result.paymentIntent.attributes;
            const displayAmount = (attrs.amount / 100).toFixed(2);

            console.log('\n' + chalk.bold('Payment Intent Confirmed (Simulated)'));
            console.log(chalk.gray('─'.repeat(50)));
            console.log(`${chalk.bold('ID:')} ${result.paymentIntent.id}`);
            console.log(`${chalk.bold('Amount:')} ₱${displayAmount} ${attrs.currency}`);
            console.log(`${chalk.bold('Status:')} ${getStatusColor(attrs.status)(attrs.status)}`);
            console.log(`${chalk.bold('Description:')} ${attrs.description || 'N/A'}`);
            console.log(
              `${chalk.bold('Created:')} ${new Date(attrs.created_at * 1000).toLocaleString()}`
            );
            console.log(
              `${chalk.bold('Updated:')} ${new Date(attrs.updated_at * 1000).toLocaleString()}`
            );

            console.log('');
            console.log(chalk.yellow('⚠️ This was a simulation - no real payment was processed'));
            console.log(
              chalk.gray(
                `Simulation type: ${result.simulationType} (${result.delayApplied}ms delay)`
              )
            );

            return;
          }

          spinner.start('Confirming payment intent...');
          const apiClient = new ApiClient({ config });
          const result = await apiClient.confirmPaymentIntent(
            intentId,
            options.paymentMethod,
            options.returnUrl
          );
          spinner.succeed('Payment intent confirmed');

          if (options.json) {
            console.log(JSON.stringify(result, null, 2));
            return;
          }

          const attrs = result.attributes;
          const displayAmount = (attrs.amount / 100).toFixed(2);

          console.log('\n' + chalk.bold('Payment Intent Confirmed'));
          console.log(chalk.gray('─'.repeat(50)));
          console.log(`${chalk.bold('ID:')} ${result.id}`);
          console.log(`${chalk.bold('Amount:')} ₱${displayAmount} ${attrs.currency}`);
          console.log(`${chalk.bold('Status:')} ${getStatusColor(attrs.status)(attrs.status)}`);
          console.log(`${chalk.bold('Description:')} ${attrs.description || 'N/A'}`);
          console.log(
            `${chalk.bold('Created:')} ${new Date(attrs.created_at * 1000).toLocaleString()}`
          );
          console.log(
            `${chalk.bold('Updated:')} ${new Date(attrs.updated_at * 1000).toLocaleString()}`
          );

          console.log('');
          console.log(
            chalk.gray(
              `Payment will be processed. Check status with: paymongo payments show-intent ${result.id}`
            )
          );
        } catch (error) {
          spinner.stop();
          const err = error as Error;
          console.error(chalk.red('❌ Failed to confirm payment intent:'), err.message);
          process.exit(1);
        }
      })
  )
  .addCommand(
    new Command('capture')
      .description('Capture an authorized payment intent')
      .arguments('<intentId>')
      .option('-j, --json', 'Output as JSON')
      .action(async (intentId, options) => {
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

          spinner.start('Capturing payment intent...');
          const apiClient = new ApiClient({ config });
          const result = await apiClient.capturePaymentIntent(intentId);
          spinner.succeed('Payment intent captured');

          if (options.json) {
            console.log(JSON.stringify(result, null, 2));
            return;
          }

          const attrs = result.attributes;
          const displayAmount = (attrs.amount / 100).toFixed(2);

          console.log('\n' + chalk.bold('Payment Intent Captured'));
          console.log(chalk.gray('─'.repeat(50)));
          console.log(`${chalk.bold('ID:')} ${result.id}`);
          console.log(`${chalk.bold('Amount:')} ₱${displayAmount} ${attrs.currency}`);
          console.log(`${chalk.bold('Status:')} ${getStatusColor(attrs.status)(attrs.status)}`);
          console.log(`${chalk.bold('Description:')} ${attrs.description || 'N/A'}`);
          console.log(
            `${chalk.bold('Updated:')} ${new Date(attrs.updated_at * 1000).toLocaleString()}`
          );

          console.log('');
          console.log(chalk.green('✅ Payment has been captured and will be settled'));
        } catch (error) {
          spinner.stop();
          const err = error as Error;
          console.error(chalk.red('❌ Failed to capture payment intent:'), err.message);
          process.exit(1);
        }
      })
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
      .action(async (paymentId, options) => {
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

          // Validate reason if provided
          const validReasons = ['duplicate', 'fraudulent', 'requested_by_customer'];
          if (options.reason && !validReasons.includes(options.reason)) {
            throw new Error(`Invalid reason. Must be one of: ${validReasons.join(', ')}`);
          }

          spinner.start('Creating refund...');
          const apiClient = new ApiClient({ config });
          const refund = await apiClient.createRefund(
            paymentId,
            options.amount ? parseInt(options.amount) : undefined,
            options.reason
          );
          spinner.succeed('Refund created');

          if (options.json) {
            console.log(JSON.stringify(refund, null, 2));
            return;
          }

          const attrs = refund.attributes;
          const displayAmount = (attrs.amount / 100).toFixed(2);

          console.log('\n' + chalk.bold('Refund Created'));
          console.log(chalk.gray('─'.repeat(50)));
          console.log(`${chalk.bold('ID:')} ${refund.id}`);
          console.log(`${chalk.bold('Payment ID:')} ${attrs.payment_id}`);
          console.log(`${chalk.bold('Amount:')} ₱${displayAmount} ${attrs.currency}`);
          console.log(`${chalk.bold('Status:')} ${getStatusColor(attrs.status)(attrs.status)}`);
          console.log(`${chalk.bold('Reason:')} ${attrs.reason || 'N/A'}`);
          console.log(
            `${chalk.bold('Created:')} ${new Date(attrs.created_at * 1000).toLocaleString()}`
          );

          console.log('');
          console.log(chalk.yellow('⚠️ Refund processing may take a few minutes'));
          console.log(chalk.gray(`Check status: paymongo payments show-refund ${refund.id}`));
        } catch (error) {
          spinner.stop();
          const err = error as Error;
          console.error(chalk.red('❌ Failed to create refund:'), err.message);
          process.exit(1);
        }
      })
  );

function getStatusColor(status: string) {
  switch (status) {
    case 'paid':
    case 'succeeded':
    case 'processed':
      return chalk.green;
    case 'pending':
    case 'awaiting_payment_method':
    case 'awaiting_next_action':
    case 'processing':
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
