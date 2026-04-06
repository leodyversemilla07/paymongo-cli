import chalk from 'chalk';
import Table from 'cli-table3';
import { BulkOperations } from '../../utils/bulk.js';
import { CommandError } from '../../utils/errors.js';
import { validateEventTypes, validateWebhookUrl } from '../../utils/validator.js';
import {
  createApiClient,
  createWebhooksContext,
  getWebhookStatusColor,
  handleWebhooksError,
  loadWebhooksConfig,
} from './helpers.js';

export async function exportAction(options: { file?: string }) {
  const { spinner, configManager } = createWebhooksContext();

  try {
    const config = await loadWebhooksConfig(spinner, configManager);
    if (!config) {
      return;
    }

    spinner.start('Fetching webhooks...');
    const webhooks = await createApiClient(config).listWebhooks();
    spinner.succeed(`Found ${webhooks.length} webhook${webhooks.length !== 1 ? 's' : ''}`);

    if (webhooks.length === 0) {
      console.log(chalk.yellow('No webhooks found to export.'));
      return;
    }

    const filename = options.file
      ? BulkOperations.ensureJsonExtension(options.file)
      : BulkOperations.generateFilename('webhooks', config.environment);

    spinner.start(`Exporting to ${filename}...`);
    await BulkOperations.exportWebhooks(webhooks, filename, config.environment);
    spinner.succeed('Export completed');

    console.log(`\n${chalk.green('✅ Webhooks exported successfully!')}`);
    console.log('');
    console.log(`${chalk.bold('File:')} ${filename}`);
    console.log(`${chalk.bold('Webhooks:')} ${webhooks.length}`);
    console.log(`${chalk.bold('Environment:')} ${config.environment}`);

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
    handleWebhooksError('❌ Failed to export webhooks:', spinner, error);
  }
}

export async function importAction(
  filename: string,
  options: { dryRun?: boolean; json?: boolean }
) {
  const { spinner, configManager } = createWebhooksContext();

  try {
    spinner.start(`Loading webhooks from ${filename}...`);
    const { webhooks, metadata } = await BulkOperations.importWebhooks(filename);
    spinner.succeed(`Loaded ${webhooks.length} webhooks from export`);

    if (options.json) {
      console.log(JSON.stringify({ webhooks, metadata }, null, 2));
      return;
    }

    console.log(`\n${chalk.green('✅ Webhooks loaded successfully!')}`);
    console.log('');
    console.log(`${chalk.bold('Source:')} ${filename}`);
    console.log(`${chalk.bold('Webhooks:')} ${webhooks.length}`);
    console.log(`${chalk.bold('Exported from:')} ${metadata.environment} environment`);
    console.log(`${chalk.bold('Export date:')} ${new Date(metadata.exported_at).toLocaleString()}`);

    if (webhooks.length === 0) {
      console.log(chalk.yellow('No webhooks found in the export file.'));
      return;
    }

    console.log(`\n${chalk.bold('Webhooks to import:')}`);
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

    const config = await configManager.load();
    if (!config) {
      throw new Error('Configuration lost during import process');
    }

    const apiClient = createApiClient(config);
    const results: Array<
      | {
          success: true;
          webhook: Awaited<ReturnType<typeof apiClient.createWebhook>>;
          original: (typeof webhooks)[number];
        }
      | { success: false; error: Error; original: (typeof webhooks)[number] }
    > = [];

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

    const successful = results.filter((result) => result.success).length;
    const failed = results.filter((result) => !result.success).length;

    console.log(`\n${chalk.bold('Import Results:')}`);
    console.log(chalk.gray('─'.repeat(50)));
    console.log(`${chalk.green('Successful:')} ${successful}`);
    if (failed > 0) {
      console.log(`${chalk.red('Failed:')} ${failed}`);
    }

    if (successful > 0) {
      console.log(`\n${chalk.green('✅ Successfully created webhooks:')}`);
      results
        .filter(
          (result): result is Extract<(typeof results)[number], { success: true }> => result.success
        )
        .forEach((result, index) => {
          console.log(`  ${index + 1}. ${result.webhook.id} - ${result.webhook.attributes.url}`);
        });
    }

    if (failed > 0) {
      console.log(`\n${chalk.red('❌ Failed webhooks:')}`);
      results
        .filter(
          (result): result is Extract<(typeof results)[number], { success: false }> =>
            !result.success
        )
        .forEach((result, index) => {
          console.log(
            `  ${index + 1}. ${result.original.attributes.url} - ${result.error.message}`
          );
        });
    }
  } catch (error) {
    handleWebhooksError('❌ Failed to import webhooks:', spinner, error);
  }
}

export async function createAction(options: { url?: string; events?: string }) {
  const { spinner, configManager } = createWebhooksContext();

  try {
    const config = await loadWebhooksConfig(spinner, configManager);
    if (!config) {
      return;
    }

    let answers: { url: string; events: string[] };

    if (options.url && options.events) {
      answers = {
        url: options.url,
        events: options.events.split(','),
      };
    } else {
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
          { name: 'source.chargeable - Source ready for charging', value: 'source.chargeable' },
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
            validateEventTypes(
              value.map((entry) => (typeof entry === 'string' ? entry : String(entry)))
            );
            return true;
          } catch {
            return 'Invalid event types selected';
          }
        },
      });

      answers = { url, events };
    }

    if (!validateWebhookUrl(answers.url)) {
      throw new Error('Invalid webhook URL');
    }

    try {
      validateEventTypes(answers.events);
    } catch {
      throw new Error('Invalid event types');
    }

    spinner.start('Creating webhook...');
    const webhook = await createApiClient(config).createWebhook(answers.url, answers.events);
    spinner.succeed('Webhook created successfully');

    if (webhook.attributes?.secret) {
      config.webhookSecrets = config.webhookSecrets || {};
      config.webhookSecrets[webhook.id] = webhook.attributes.secret;
      await configManager.save(config);
    }

    console.log(`\n${chalk.green('✓ Webhook created successfully!')}`);
    console.log('');
    console.log(chalk.bold('ID:'), webhook.id);
    console.log(chalk.bold('URL:'), webhook.attributes.url);
    console.log(chalk.bold('Events:'), webhook.attributes.events.join(', '));
    console.log(chalk.bold('Status:'), webhook.attributes.status);
    if (webhook.attributes?.secret) {
      console.log(chalk.bold('Signature:'), 'Enabled (secret stored in .paymongo)');
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
  const { spinner, configManager } = createWebhooksContext();

  try {
    const config = await loadWebhooksConfig(spinner, configManager);
    if (!config) {
      return;
    }

    spinner.start('Fetching webhooks...');
    const webhooks = await createApiClient(config).listWebhooks();
    spinner.succeed(`Found ${webhooks.length} webhook${webhooks.length !== 1 ? 's' : ''}`);

    if (webhooks.length === 0) {
      console.log(chalk.gray('No webhooks found.'));
      console.log(chalk.gray('Create one with: paymongo webhooks create'));
      return;
    }

    let filteredWebhooks = webhooks;
    if (options.status) {
      filteredWebhooks = filteredWebhooks.filter(
        (webhook) => webhook.attributes.status === options.status
      );
    }
    if (options.events) {
      const eventFilter = options.events.toLowerCase();
      filteredWebhooks = filteredWebhooks.filter((webhook) =>
        webhook.attributes.events.some((event) => event.toLowerCase().includes(eventFilter))
      );
    }

    if (options.json) {
      console.log(JSON.stringify(filteredWebhooks, null, 2));
      return;
    }

    console.log(`\n${chalk.bold('Webhooks')}`);
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
          ? `${webhook.attributes.url.substring(0, 27)}...`
          : webhook.attributes.url;
      const events =
        webhook.attributes.events.length > 1
          ? `${webhook.attributes.events[0]} +${webhook.attributes.events.length - 1} more`
          : webhook.attributes.events[0] || 'None';

      table.push([
        chalk.cyan(id),
        chalk.yellow(url),
        getWebhookStatusColor(webhook.attributes.status)(webhook.attributes.status),
        chalk.white(events),
      ]);
    });

    console.log(table.toString());
    console.log(chalk.gray(`Total: ${filteredWebhooks.length} webhooks`));

    if (filteredWebhooks.some((webhook) => webhook.attributes.url.includes('ngrok'))) {
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

export async function disableAction(id: string, options: { yes?: boolean }) {
  const { spinner, configManager } = createWebhooksContext();

  try {
    const config = await loadWebhooksConfig(spinner, configManager);
    if (!config) {
      return;
    }

    if (!options.yes) {
      const { confirm } = await import('@inquirer/prompts');
      const shouldDisable = await confirm({
        message: `This will disable webhook ${id}. Continue?`,
        default: false,
      });

      if (!shouldDisable) {
        console.log(chalk.yellow('Webhook disable cancelled.'));
        return;
      }
    }

    spinner.start('Disabling webhook...');
    await createApiClient(config).disableWebhook(id);
    spinner.succeed('Webhook disabled successfully');
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
      console.error(chalk.red('❌ Failed to disable webhook:'), err.message);
    }

    throw new CommandError();
  }
}

export async function enableAction(id: string) {
  const { spinner, configManager } = createWebhooksContext();

  try {
    const config = await loadWebhooksConfig(spinner, configManager);
    if (!config) {
      return;
    }

    spinner.start('Enabling webhook...');
    await createApiClient(config).enableWebhook(id);
    spinner.succeed('Webhook enabled successfully');
  } catch (error) {
    spinner.stop();
    const err = error as Error;

    if (err.message.includes('API key') || err.message.includes('unauthorized')) {
      console.error(chalk.red('❌ Authentication failed:'), err.message);
    } else if (err.message.includes('not found') || err.message.includes('404')) {
      console.error(chalk.red('❌ Webhook not found:'), err.message);
    } else {
      console.error(chalk.red('❌ Failed to enable webhook:'), err.message);
    }

    throw new CommandError();
  }
}

export const deleteAction = disableAction;

export async function showAction(id: string) {
  const { spinner, configManager } = createWebhooksContext();

  try {
    const config = await loadWebhooksConfig(spinner, configManager);
    if (!config) {
      return;
    }

    spinner.start('Fetching webhook details...');
    const webhook = await createApiClient(config).getWebhook(id);
    spinner.succeed('Webhook details loaded');

    console.log(`\n${chalk.bold('Webhook Details')}`);
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
