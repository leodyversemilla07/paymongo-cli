import Table from 'cli-table3';
import { Command } from 'commander';
import chalk from 'chalk';
import ConfigManager from '../services/config/manager.js';
import ApiClient from '../services/api/client.js';
import { BulkOperations } from '../utils/bulk.js';
import Spinner from '../utils/spinner.js';
import { validateWebhookUrl, validateEventTypes } from '../utils/validator.js';
import { CommandError } from '../utils/errors.js';

export async function exportAction(options: { file?: string }) {
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

    spinner.start('Fetching webhooks...');
    const apiClient = new ApiClient({ config });
    const webhooks = await apiClient.listWebhooks();
    spinner.succeed(`Found ${webhooks.length} webhook${webhooks.length !== 1 ? 's' : ''}`);

    if (webhooks.length === 0) {
      console.log(chalk.yellow('No webhooks found to export.'));
      return;
    }

    // Generate filename if not provided
    let filename = options.file;
    if (!filename) {
      filename = BulkOperations.generateFilename('webhooks', config.environment);
    } else {
      filename = BulkOperations.ensureJsonExtension(filename);
    }

    spinner.start(`Exporting to ${filename}...`);
    await BulkOperations.exportWebhooks(webhooks, filename, config.environment);
    spinner.succeed('Export completed');

    console.log('\n' + chalk.green('✅ Webhooks exported successfully!'));
    console.log('');
    console.log(`${chalk.bold('File:')} ${filename}`);
    console.log(`${chalk.bold('Webhooks:')} ${webhooks.length}`);
    console.log(`${chalk.bold('Environment:')} ${config.environment}`);

    // Show summary of webhook statuses
    const statusCounts = webhooks.reduce(
      (acc, webhook) => {
        acc[webhook.attributes.status] = (acc[webhook.attributes.status] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );

    console.log(
      `${chalk.bold('Status breakdown:')} ${Object.entries(statusCounts)
        .map(([status, count]) => `${status}: ${count}`)
        .join(', ')}`
    );
  } catch (error) {
    spinner.stop();
    const err = error as Error;
    console.error(chalk.red('❌ Failed to export webhooks:'), err.message);
    throw new CommandError();
  }
}

export async function importAction(
  filename: string,
  options: { dryRun?: boolean; json?: boolean }
) {
  const spinner = new Spinner();
  const configManager = new ConfigManager();

  try {
    spinner.start(`Loading webhooks from ${filename}...`);
    const { webhooks, metadata } = await BulkOperations.importWebhooks(filename);
    spinner.succeed(`Loaded ${webhooks.length} webhooks from export`);

    if (options.json) {
      console.log(JSON.stringify({ webhooks, metadata }, null, 2));
      return;
    }

    console.log('\n' + chalk.green('✅ Webhooks loaded successfully!'));
    console.log('');
    console.log(`${chalk.bold('Source:')} ${filename}`);
    console.log(`${chalk.bold('Webhooks:')} ${webhooks.length}`);
    console.log(`${chalk.bold('Exported from:')} ${metadata.environment} environment`);
    console.log(`${chalk.bold('Export date:')} ${new Date(metadata.exported_at).toLocaleString()}`);

    if (webhooks.length === 0) {
      console.log(chalk.yellow('No webhooks found in the export file.'));
      return;
    }

    // Show preview of webhooks to be imported
    console.log('\n' + chalk.bold('Webhooks to import:'));
    console.log(chalk.gray('─'.repeat(80)));

    webhooks.forEach((webhook, index) => {
      const status = options.dryRun ? chalk.gray('pending') : chalk.yellow('will create');
      console.log(`${(index + 1).toString().padStart(2)}. ${webhook.attributes.url}`);
      console.log(`    Events: ${webhook.attributes.events.join(', ')}`);
      console.log(`    Status: ${status}`);
      console.log('');
    });

    if (options.dryRun) {
      console.log(chalk.blue('ℹ️  Dry run mode - no webhooks were created'));
      console.log(chalk.gray('Remove --dry-run flag to actually import the webhooks'));
      return;
    }

    // Confirm before importing
    console.log(chalk.yellow('⚠️  This will create new webhooks in your PayMongo account'));
    const { confirm } = await import('@inquirer/prompts');
    const shouldImport = await confirm({
      message: `Import ${webhooks.length} webhook${webhooks.length !== 1 ? 's' : ''}?`,
      default: false,
    });

    if (!shouldImport) {
      console.log(chalk.yellow('Webhook import cancelled.'));
      return;
    }

    // Load config for API access
    const config = await configManager.load();
    if (!config) {
      throw new Error('Configuration lost during import process');
    }

    // Import webhooks one by one
    const apiClient = new ApiClient({ config });
    const results = [];

    for (const [index, webhook] of webhooks.entries()) {
      try {
        spinner.start(
          `Creating webhook ${index + 1}/${webhooks.length}: ${webhook.attributes.url}`
        );
        const createdWebhook = await apiClient.createWebhook(
          webhook.attributes.url,
          webhook.attributes.events
        );
        results.push({ success: true, webhook: createdWebhook, original: webhook });
        spinner.succeed(`Created webhook: ${createdWebhook.id}`);
      } catch (error) {
        results.push({ success: false, error: error as Error, original: webhook });
        spinner.fail(`Failed to create webhook: ${(error as Error).message}`);
      }
    }

    // Show results
    const successful = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;

    console.log('\n' + chalk.bold('Import Results:'));
    console.log(chalk.gray('─'.repeat(50)));
    console.log(`${chalk.green('Successful:')} ${successful}`);
    if (failed > 0) {
      console.log(`${chalk.red('Failed:')} ${failed}`);
    }

    if (successful > 0) {
      console.log('\n' + chalk.green('✅ Successfully created webhooks:'));
      results
        .filter((r) => r.success)
        .forEach((r, index) => {
          if (r.success && r.webhook) {
            console.log(`  ${index + 1}. ${r.webhook.id} - ${r.webhook.attributes.url}`);
          }
        });
    }

    if (failed > 0) {
      console.log('\n' + chalk.red('❌ Failed webhooks:'));
      results
        .filter((r) => !r.success)
        .forEach((r, index) => {
          if (!r.success && r.original && r.error) {
            console.log(`  ${index + 1}. ${r.original.attributes.url} - ${r.error.message}`);
          }
        });
    }
  } catch (error) {
    spinner.stop();
    const err = error as Error;
    console.error(chalk.red('❌ Failed to import webhooks:'), err.message);
    throw new CommandError();
  }
}

export async function createAction(options: { url?: string; events?: string }) {
  const spinner = new Spinner();
  const configManager = new ConfigManager();

  try {
    // Load configuration
    spinner.start('Loading configuration...');
    const config = await configManager.load();

    if (!config) {
      spinner.fail('No configuration found');
      console.log(chalk.yellow('No PayMongo configuration found.'));
      console.log(chalk.gray("Run 'paymongo init' to set up your project first."));
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
      const { input, checkbox } = await import('@inquirer/prompts');

      const url = await input({
        message: 'Webhook URL:',
        default: options.url || '',
        validate: (value) => {
          if (!value) {
            return 'Webhook URL is required';
          }
          if (!validateWebhookUrl(value)) {
            return 'Invalid webhook URL. Must be HTTPS or localhost';
          }
          return true;
        },
      });

      const events = await checkbox({
        message: 'Select events to listen for:',
        choices: [
          { name: 'payment.paid - Payment successful', value: 'payment.paid', checked: true },
          { name: 'payment.failed - Payment failed', value: 'payment.failed', checked: true },
          { name: 'payment.refunded - Payment refunded', value: 'payment.refunded' },
          {
            name: 'source.chargeable - Source ready for charging',
            value: 'source.chargeable',
          },
          {
            name: 'checkout_session.payment.paid - Checkout payment successful',
            value: 'checkout_session.payment.paid',
          },
          { name: 'qrph.expired - QR Ph expired', value: 'qrph.expired' },
        ],
        validate: (value) => {
          if (value.length === 0) {
            return 'At least one event must be selected';
          }
          try {
            // Extract string values from checkbox choices
            const eventStrings = value.map((v) => (typeof v === 'string' ? v : String(v)));
            validateEventTypes(eventStrings);
            return true;
          } catch {
            return 'Invalid event types selected';
          }
        },
      });

      answers = { url, events };
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
      console.log(chalk.gray("• URL must be accessible from PayMongo's servers"));
    } else {
      console.error(chalk.red('❌ Failed to create webhook:'), err.message);
      console.log('');
      console.log(
        chalk.yellow('💡 For help, visit: https://developers.paymongo.com/docs/webhooks')
      );
    }

    throw new CommandError();
  }
}

export async function listAction(options: { json?: boolean; status?: string; events?: string }) {
  const spinner = new Spinner();
  const configManager = new ConfigManager();

  try {
    // Load configuration
    spinner.start('Loading configuration...');
    const config = await configManager.load();

    if (!config) {
      spinner.fail('No configuration found');
      console.log(chalk.yellow('No PayMongo configuration found.'));
      console.log(chalk.gray("Run 'paymongo init' to set up your project first."));
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

    // Filter by status and events if specified
    let filteredWebhooks = webhooks;
    if (options.status) {
      filteredWebhooks = webhooks.filter((w) => w.attributes.status === options.status);
    }
    if (options.events) {
      const eventFilter = options.events.toLowerCase();
      filteredWebhooks = filteredWebhooks.filter((w) =>
        w.attributes.events.some((event) => event.toLowerCase().includes(eventFilter))
      );
    }

    if (options.json) {
      console.log(JSON.stringify(filteredWebhooks, null, 2));
      return;
    }

    // Display table
    console.log('\n' + chalk.bold('Webhooks'));
    console.log(chalk.gray('─'.repeat(95)));
    const table = new Table({
      head: [chalk.bold('ID'), chalk.bold('URL'), chalk.bold('Status'), chalk.bold('Events')],
      colWidths: [15, 35, 12, 25],
      style: {
        head: [],
        border: [],
      },
    });

    filteredWebhooks.forEach((webhook) => {
      const id = webhook.id.substring(0, 12) + (webhook.id.length > 12 ? '...' : '');
      const url =
        webhook.attributes.url.length > 30
          ? webhook.attributes.url.substring(0, 27) + '...'
          : webhook.attributes.url;
      const status = webhook.attributes.status;
      const events =
        webhook.attributes.events.length > 1
          ? `${webhook.attributes.events[0]} +${webhook.attributes.events.length - 1} more`
          : webhook.attributes.events[0] || 'None';

      table.push([
        chalk.cyan(id),
        chalk.yellow(url),
        getStatusColor(status)(status),
        chalk.white(events),
      ]);
    });

    console.log(table.toString());
    console.log(chalk.gray(`Total: ${filteredWebhooks.length} webhooks`));

    // Check if any webhooks are ngrok tunnels and add helpful note
    const hasNgrokUrls = filteredWebhooks.some((w) => w.attributes.url.includes('ngrok'));
    if (hasNgrokUrls) {
      console.log(
        chalk.yellow('ℹ️  Note: URLs containing "ngrok" are tunnels that forward to your localhost')
      );
      console.log(
        chalk.gray('   These are created by "paymongo dev" and cleaned up when the server stops.')
      );
      console.log('');
    }

    console.log(chalk.gray("Use 'paymongo webhooks show <id>' for details"));
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

    throw new CommandError();
  }
}

export async function deleteAction(id: string, options: { yes?: boolean }) {
  const spinner = new Spinner();
  const configManager = new ConfigManager();

  try {
    // Load configuration
    spinner.start('Loading configuration...');
    const config = await configManager.load();

    if (!config) {
      spinner.fail('No configuration found');
      console.log(chalk.yellow('No PayMongo configuration found.'));
      console.log(chalk.gray("Run 'paymongo init' to set up your project first."));
      return;
    }

    spinner.succeed('Configuration loaded');

    // Confirm deletion
    if (!options.yes) {
      const { confirm } = await import('@inquirer/prompts');
      const shouldDelete = await confirm({
        message: `This will permanently delete webhook ${id}. Continue?`,
        default: false,
      });

      if (!shouldDelete) {
        console.log(chalk.yellow('Webhook deletion cancelled.'));
        return;
      }
    }

    // Delete webhook
    spinner.start('Deleting webhook...');
    const apiClient = new ApiClient({ config });
    await apiClient.deleteWebhook(id);
    spinner.succeed('Webhook deleted successfully');
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

    throw new CommandError();
  }
}

export async function showAction(id: string) {
  const spinner = new Spinner();
  const configManager = new ConfigManager();

  try {
    // Load configuration
    spinner.start('Loading configuration...');
    const config = await configManager.load();

    if (!config) {
      spinner.fail('No configuration found');
      console.log(chalk.yellow('No PayMongo configuration found.'));
      console.log(chalk.gray("Run 'paymongo init' to set up your project first."));
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
    console.log(
      chalk.bold('Created:'),
      new Date(webhook.attributes.created_at * 1000).toLocaleString()
    );
    console.log(
      chalk.bold('Updated:'),
      new Date(webhook.attributes.updated_at * 1000).toLocaleString()
    );
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

    throw new CommandError();
  }
}

const command = new Command('webhooks')
  .description('Manage PayMongo webhooks')
  .addCommand(
    new Command('export')
      .description('Export webhooks to JSON file')
      .option('-f, --file <file>', 'Output file name')
      .action(async (options) => exportAction(options))
  )
  .addCommand(
    new Command('import')
      .description('Import webhooks from JSON file')
      .argument('<filename>', 'JSON file to import')
      .option('-d, --dry-run', 'Show what would be imported without creating')
      .option('-j, --json', 'Output as JSON')
      .action(async (filename, options) => importAction(filename, options))
  )
  .addCommand(
    new Command('create')
      .description('Create a new webhook')
      .option('-u, --url <url>', 'Webhook URL')
      .option('-e, --events <events>', 'Comma-separated events to listen for')
      .action(async (options) => createAction(options))
  )
  .addCommand(
    new Command('list')
      .description('List all webhooks')
      .option('-j, --json', 'Output as JSON')
      .option('-s, --status <status>', 'Filter by status (enabled/disabled)')
      .option('-e, --events <events>', 'Filter by event type (e.g., payment, source)')
      .action(async (options) => listAction(options))
  )
  .addCommand(
    new Command('delete')
      .description('Delete a webhook')
      .argument('<id>', 'Webhook ID to delete')
      .option('-y, --yes', 'Skip confirmation prompt')
      .action(async (id, options) => deleteAction(id, options))
  )
  .addCommand(
    new Command('show')
      .description('Show webhook details')
      .argument('<id>', 'Webhook ID to show')
      .action(async (id) => showAction(id))
  );

export default command;

function getStatusColor(status: string) {
  switch (status) {
    case 'enabled':
      return chalk.green;
    case 'disabled':
      return chalk.red;
    default:
      return chalk.white;
  }
}
