import { Command } from 'commander';
import inquirer from 'inquirer';
import chalk from 'chalk';
import ConfigManager from '../services/config/manager';
import ApiClient from '../services/api/client';
import Spinner from '../utils/spinner';
import { validateWebhookUrl, validateEventTypes } from '../utils/validator';

const command = new Command('webhooks');

command
  .description('Manage webhooks')
  .addCommand(
    new Command('create')
      .description('Create a new webhook')
      .option('-u, --url <url>', 'Webhook URL')
      .option('-e, --events <events>', 'Comma-separated events to listen for')
      .action(async (options) => {
        const spinner = new Spinner();
        const configManager = new ConfigManager();

        try {
          // Load configuration
          spinner.start('Loading configuration...');
          const config = await configManager.load();

          if (!config) {
            spinner.fail('No configuration found');
            console.log(chalk.yellow('No PayMongo configuration found.'));
            console.log(chalk.gray('Run \'paymongo init\' to set up your project first.'));
            return;
          }

          spinner.succeed('Configuration loaded');

          let answers: { url: string; events: string[] };

          if (options.url && options.events) {
            // Non-interactive mode
            answers = {
              url: options.url,
              events: options.events.split(','),
            };
          } else {
            // Interactive mode
            answers = await inquirer.prompt([
              {
                type: 'input',
                name: 'url',
                message: 'Webhook URL:',
                default: options.url,
                validate: (input) => {
                  if (!input) return 'Webhook URL is required';
                  if (!validateWebhookUrl(input)) return 'Invalid webhook URL. Must be HTTPS or localhost';
                  return true;
                },
              },
              {
                type: 'checkbox',
                name: 'events',
                message: 'Select events to listen for:',
                choices: [
                  { name: 'payment.paid - Payment successful', value: 'payment.paid', checked: true },
                  { name: 'payment.failed - Payment failed', value: 'payment.failed', checked: true },
                  { name: 'payment.refunded - Payment refunded', value: 'payment.refunded' },
                  { name: 'source.chargeable - Source ready for charging', value: 'source.chargeable' },
                  { name: 'checkout_session.payment.paid - Checkout payment successful', value: 'checkout_session.payment.paid' },
                  { name: 'qrph.expired - QR Ph expired', value: 'qrph.expired' },
                ],
                default: options.events ? options.events.split(',') : ['payment.paid', 'payment.failed'],
                validate: (input) => {
                  if (input.length === 0) return 'At least one event must be selected';
                  try {
                    validateEventTypes(input);
                    return true;
                  } catch {
                    return 'Invalid event types selected';
                  }
                },
              },
            ]);
          }

          // Validate inputs
          if (!validateWebhookUrl(answers.url)) {
            throw new Error('Invalid webhook URL');
          }

          try {
            validateEventTypes(answers.events);
          } catch {
            throw new Error('Invalid event types');
          }

          // Create webhook
          spinner.start('Creating webhook...');
          const apiClient = new ApiClient({ config });
          const webhook = await apiClient.createWebhook(answers.url, answers.events);
          spinner.succeed('Webhook created successfully');

          // Store webhook secret if available
          if (webhook.attributes?.secret) {
            config.webhookSecrets = config.webhookSecrets || {};
            config.webhookSecrets[webhook.id] = webhook.attributes.secret;
            await configManager.save(config);
          }

          // Display result
          console.log('\n' + chalk.green('✓ Webhook created successfully!'));
          console.log('');
          console.log(chalk.bold('ID:'), webhook.id);
          console.log(chalk.bold('URL:'), webhook.attributes.url);
          console.log(chalk.bold('Events:'), webhook.attributes.events.join(', '));
          console.log(chalk.bold('Status:'), webhook.attributes.status);
          if (webhook.attributes?.secret) {
            console.log(chalk.bold('Signature:'), 'Enabled (secret stored securely)');
          }

        } catch (error) {
          spinner.stop();
          const err = error as Error;

          if (err.message.includes('API key') || err.message.includes('unauthorized')) {
            console.error(chalk.red('❌ Authentication failed:'), err.message);
            console.log('');
            console.log(chalk.yellow('💡 Solutions:'));
            console.log(chalk.gray('• Run "paymongo login" to update your API keys'));
            console.log(chalk.gray('• Check that your API keys are valid in the PayMongo dashboard'));
          } else if (err.message.includes('Network') || err.message.includes('connection')) {
            console.error(chalk.red('❌ Network error:'), err.message);
            console.log('');
            console.log(chalk.yellow('💡 Try again:'));
            console.log(chalk.gray('• Check your internet connection'));
            console.log(chalk.gray('• PayMongo API might be temporarily unavailable'));
          } else if (err.message.includes('url') || err.message.includes('webhook')) {
            console.error(chalk.red('❌ Webhook error:'), err.message);
            console.log('');
            console.log(chalk.yellow('💡 Check:'));
            console.log(chalk.gray('• Webhook URL must be HTTPS in production'));
            console.log(chalk.gray('• Localhost URLs only work with ngrok tunnels'));
            console.log(chalk.gray('• URL must be accessible from PayMongo\'s servers'));
          } else {
            console.error(chalk.red('❌ Failed to create webhook:'), err.message);
            console.log('');
            console.log(chalk.yellow('💡 For help, visit: https://developers.paymongo.com/docs/webhooks'));
          }

          process.exit(1);
        }
      })
  )
  .addCommand(
    new Command('list')
      .description('List all webhooks')
      .option('-j, --json', 'Output as JSON')
      .option('-s, --status <status>', 'Filter by status (enabled/disabled)')
      .action(async (options) => {
        const spinner = new Spinner();
        const configManager = new ConfigManager();

        try {
          // Load configuration
          spinner.start('Loading configuration...');
          const config = await configManager.load();

          if (!config) {
            spinner.fail('No configuration found');
            console.log(chalk.yellow('No PayMongo configuration found.'));
            console.log(chalk.gray('Run \'paymongo init\' to set up your project first.'));
            return;
          }

          spinner.succeed('Configuration loaded');

          // List webhooks
          spinner.start('Fetching webhooks...');
          const apiClient = new ApiClient({ config });
          const webhooks = await apiClient.listWebhooks();
          spinner.succeed(`Found ${webhooks.length} webhook${webhooks.length !== 1 ? 's' : ''}`);

          if (webhooks.length === 0) {
            console.log(chalk.gray('No webhooks found.'));
            console.log(chalk.gray('Create one with: paymongo webhooks create'));
            return;
          }

          // Filter by status if specified
          let filteredWebhooks = webhooks;
          if (options.status) {
            filteredWebhooks = webhooks.filter(w => w.attributes.status === options.status);
          }

          if (options.json) {
            console.log(JSON.stringify(filteredWebhooks, null, 2));
            return;
          }

          // Display table
          console.log('\nWebhooks (' + filteredWebhooks.length + ' total)');
          console.log('');
          console.log('┌──────────────┬─────────────────────────┬───────────┬──────────────────────┐');
          console.log('│ ID           │ URL                     │ Status    │ Events               │');
          console.log('├──────────────┼─────────────────────────┼───────────┼──────────────────────┤');

          filteredWebhooks.forEach(webhook => {
            const id = webhook.id.substring(0, 12) + '...';
            const url = webhook.attributes.url.length > 23
              ? webhook.attributes.url.substring(0, 20) + '...'
              : webhook.attributes.url;
            const status = webhook.attributes.status;
            const events = webhook.attributes.events.length > 1
              ? `${webhook.attributes.events[0]} +${webhook.attributes.events.length - 1} more`
              : webhook.attributes.events[0] || 'None';

            console.log(`│ ${id.padEnd(12)} │ ${url.padEnd(23)} │ ${status.padEnd(9)} │ ${events.padEnd(20)} │`);
          });

          console.log('└──────────────┴─────────────────────────┴───────────┴──────────────────────┘');
          console.log('');
          console.log(chalk.gray('Use \'paymongo webhooks show <id>\' for details'));

        } catch (error) {
          spinner.stop();
          const err = error as Error;

          if (err.message.includes('API key') || err.message.includes('unauthorized')) {
            console.error(chalk.red('❌ Authentication failed:'), err.message);
            console.log('');
            console.log(chalk.yellow('💡 Solutions:'));
            console.log(chalk.gray('• Run "paymongo login" to update your API keys'));
            console.log(chalk.gray('• Check that your API keys are valid in the PayMongo dashboard'));
          } else if (err.message.includes('Network') || err.message.includes('connection')) {
            console.error(chalk.red('❌ Network error:'), err.message);
            console.log('');
            console.log(chalk.yellow('💡 Try again:'));
            console.log(chalk.gray('• Check your internet connection'));
            console.log(chalk.gray('• PayMongo API might be temporarily unavailable'));
          } else {
            console.error(chalk.red('❌ Failed to list webhooks:'), err.message);
          }

          process.exit(1);
        }
      })
  )
  .addCommand(
    new Command('delete')
      .description('Delete a webhook')
      .argument('<id>', 'Webhook ID to delete')
      .option('-y, --yes', 'Skip confirmation prompt')
      .action(async (id, options) => {
        const spinner = new Spinner();
        const configManager = new ConfigManager();

        try {
          // Load configuration
          spinner.start('Loading configuration...');
          const config = await configManager.load();

          if (!config) {
            spinner.fail('No configuration found');
            console.log(chalk.yellow('No PayMongo configuration found.'));
            console.log(chalk.gray('Run \'paymongo init\' to set up your project first.'));
            return;
          }

          spinner.succeed('Configuration loaded');

          // Confirm deletion
          if (!options.yes) {
            const { confirm } = await inquirer.prompt([
              {
                type: 'confirm',
                name: 'confirm',
                message: `This will permanently delete webhook ${id}. Continue?`,
                default: false,
              },
            ]);

            if (!confirm) {
              console.log(chalk.yellow('Webhook deletion cancelled.'));
              return;
            }
          }

          // Delete webhook
          spinner.start('Deleting webhook...');
          const apiClient = new ApiClient({ config });
          await apiClient.deleteWebhook(id);
          spinner.succeed('Webhook deleted successfully');

          console.log(chalk.green('✓ Webhook deleted successfully'));

        } catch (error) {
          spinner.stop();
          const err = error as Error;

          if (err.message.includes('API key') || err.message.includes('unauthorized')) {
            console.error(chalk.red('❌ Authentication failed:'), err.message);
            console.log('');
            console.log(chalk.yellow('💡 Solutions:'));
            console.log(chalk.gray('• Run "paymongo login" to update your API keys'));
            console.log(chalk.gray('• Check that your API keys are valid in the PayMongo dashboard'));
          } else if (err.message.includes('not found') || err.message.includes('404')) {
            console.error(chalk.red('❌ Webhook not found:'), err.message);
            console.log('');
            console.log(chalk.yellow('💡 Check:'));
            console.log(chalk.gray('• Verify the webhook ID is correct'));
            console.log(chalk.gray('• Use "paymongo webhooks list" to see available webhooks'));
          } else {
            console.error(chalk.red('❌ Failed to delete webhook:'), err.message);
          }

          process.exit(1);
        }
      })
  )
  .addCommand(
    new Command('show')
      .description('Show webhook details')
      .argument('<id>', 'Webhook ID to show')
      .action(async (id) => {
        const spinner = new Spinner();
        const configManager = new ConfigManager();

        try {
          // Load configuration
          spinner.start('Loading configuration...');
          const config = await configManager.load();

          if (!config) {
            spinner.fail('No configuration found');
            console.log(chalk.yellow('No PayMongo configuration found.'));
            console.log(chalk.gray('Run \'paymongo init\' to set up your project first.'));
            return;
          }

          spinner.succeed('Configuration loaded');

          // Get webhook details
          spinner.start('Fetching webhook details...');
          const apiClient = new ApiClient({ config });
          const webhook = await apiClient.getWebhook(id);
          spinner.succeed('Webhook details loaded');

          // Display details
          console.log('\n' + chalk.bold('Webhook Details'));
          console.log('═'.repeat(50));
          console.log(chalk.bold('ID:'), webhook.id);
          console.log(chalk.bold('URL:'), webhook.attributes.url);
          console.log(chalk.bold('Status:'), webhook.attributes.status);
          console.log(chalk.bold('Created:'), new Date(webhook.attributes.created_at * 1000).toLocaleString());
          console.log(chalk.bold('Updated:'), new Date(webhook.attributes.updated_at * 1000).toLocaleString());
          console.log('');
          console.log(chalk.bold('Events:'));
          webhook.attributes.events.forEach((event: string) => {
            console.log(`  • ${event}`);
          });

        } catch (error) {
          spinner.stop();
          const err = error as Error;

          if (err.message.includes('API key') || err.message.includes('unauthorized')) {
            console.error(chalk.red('❌ Authentication failed:'), err.message);
            console.log('');
            console.log(chalk.yellow('💡 Solutions:'));
            console.log(chalk.gray('• Run "paymongo login" to update your API keys'));
            console.log(chalk.gray('• Check that your API keys are valid in the PayMongo dashboard'));
          } else if (err.message.includes('not found') || err.message.includes('404')) {
            console.error(chalk.red('❌ Webhook not found:'), err.message);
            console.log('');
            console.log(chalk.yellow('💡 Check:'));
            console.log(chalk.gray('• Verify the webhook ID is correct'));
            console.log(chalk.gray('• Use "paymongo webhooks list" to see available webhooks'));
          } else {
            console.error(chalk.red('❌ Failed to get webhook details:'), err.message);
          }

          process.exit(1);
        }
      })
  );

export default command;