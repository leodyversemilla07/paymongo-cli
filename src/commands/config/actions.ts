import * as fs from 'node:fs';
import * as path from 'node:path';
import chalk from 'chalk';
import type { PayMongoConfig } from '../../types/paymongo.js';
import { CommandError } from '../../utils/errors.js';
import {
  checkConfigConflicts,
  createConfigContext,
  handleCommandFailure,
  loadRequiredConfig,
  setConfigValue,
  validateImportedConfig,
  validateImportedConfigWithSchema,
} from './helpers.js';

export async function showAction(options: { json?: boolean }) {
  const { spinner, configManager } = createConfigContext();

  try {
    spinner.start('Loading configuration...');
    const config = await configManager.load();

    if (!config) {
      spinner.fail('No configuration found');
      console.log(chalk.yellow('No PayMongo configuration found.'));
      console.log(chalk.gray("Run 'paymongo init' to set up your project."));
      return;
    }

    spinner.succeed('Configuration loaded');

    if (options.json) {
      console.log(JSON.stringify(config, null, 2));
      return;
    }

    console.log(`\n${chalk.bold('Configuration (.paymongo)')}`);
    console.log('');
    console.log(chalk.bold('Project:'), config.projectName);
    console.log(chalk.bold('Environment:'), config.environment);
    console.log(chalk.bold('Version:'), config.version);
    console.log('');

    console.log(chalk.bold('Webhook URL:'), config.webhooks.url || 'Not set');
    console.log(chalk.bold('Webhook Events:'), config.webhooks.events.join(', ') || 'None');
    console.log('');

    console.log(chalk.bold('Dev Port:'), config.dev.port);
    console.log(
      chalk.bold('Auto Register Webhook:'),
      config.dev.autoRegisterWebhook ? 'Yes' : 'No'
    );
    console.log(
      chalk.bold('Verify Webhook Signatures:'),
      config.dev.verifyWebhookSignatures ? 'Yes' : 'No'
    );
    console.log('');

    if (config.analytics) {
      console.log(chalk.bold('Analytics:'), config.analytics.enabled ? 'Enabled' : 'Disabled');
      console.log('');
    }

    if (config.rateLimiting) {
      console.log(chalk.bold('Rate Limiting:'));
      console.log(
        chalk.bold('  Enabled:'),
        config.rateLimiting.enabled ? chalk.green('Yes') : chalk.red('No')
      );
      if (config.rateLimiting.enabled) {
        console.log(
          `  Max Requests: ${config.rateLimiting.maxRequests} per ${(config.rateLimiting.windowMs || 60000) / 1000}s`
        );
        console.log(`  Live Multiplier: ${config.rateLimiting.environmentMultiplier || 0.5}x`);
        if (
          config.rateLimiting.endpoints &&
          Object.keys(config.rateLimiting.endpoints).length > 0
        ) {
          console.log(
            `  Endpoint Overrides: ${Object.keys(config.rateLimiting.endpoints).length} configured`
          );
        }
      }
      console.log('');
    }

    console.log(chalk.bold('API Keys:'));
    const env = config.environment;
    const apiKeys = config.apiKeys[env];

    if (apiKeys) {
      if (apiKeys.public) {
        console.log(`  Public (${env}):`, apiKeys.public.replace(/(.{10}).*/, '$1***'));
      }
      if (apiKeys.secret) {
        console.log(`  Secret (${env}):`, apiKeys.secret.replace(/(.{10}).*/, '$1***'));
      }
    } else {
      console.log(`  No API keys configured for ${env} environment`);
      console.log(chalk.gray("  Run 'paymongo login' to set API keys"));
    }

    console.log('');
    console.log(chalk.gray("Use 'paymongo config set <key> <value>' to modify"));
    console.log(chalk.gray("Use 'paymongo config reset' to reset to defaults"));
  } catch (error) {
    spinner.stop();
    const err = error as Error;

    if (err.message.includes('No configuration') || err.message.includes('not found')) {
      console.error(chalk.red('❌ No configuration found:'), err.message);
      console.log('');
      console.log(chalk.yellow('💡 Solutions:'));
      console.log(chalk.gray('• Run "paymongo init" to create a new configuration'));
      console.log(chalk.gray("• Check if you're in the correct project directory"));
    } else if (err.message.includes('Failed to load') || err.message.includes('parse')) {
      console.error(chalk.red('❌ Configuration file corrupted:'), err.message);
      console.log('');
      console.log(chalk.yellow('💡 Recovery options:'));
      console.log(chalk.gray('• Run "paymongo config reset" to create a fresh configuration'));
      console.log(chalk.gray('• Check the .paymongo file for syntax errors'));
      console.log(chalk.gray('• Run "paymongo init" to recreate the configuration'));
    } else {
      console.error(chalk.red('❌ Failed to load configuration:'), err.message);
    }

    throw new CommandError();
  }
}

export async function setAction(key: string, value: string) {
  const { spinner, configManager } = createConfigContext();

  try {
    const config = await loadRequiredConfig(spinner, configManager);
    if (!config) {
      return;
    }

    spinner.start('Updating configuration...');
    setConfigValue(config, key, value);
    await configManager.save(config);
    spinner.succeed('Configuration updated');

    console.log(chalk.green(`✓ Set ${key} = ${value}`));
  } catch (error) {
    spinner.stop();
    handleCommandFailure('❌ Failed to update configuration:', error);
  }
}

export async function backupAction(options: { directory?: string; name?: string }) {
  const { spinner, configManager } = createConfigContext();

  try {
    const config = await loadRequiredConfig(
      spinner,
      configManager,
      'Loading current configuration...'
    );
    if (!config) {
      return;
    }

    const backupDir = options.directory ? path.resolve(options.directory) : process.cwd();
    if (options.directory && !fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const prefix = options.name || 'paymongo-config';
    const backupPath = path.join(backupDir, `${prefix}-${timestamp}.json`);

    spinner.start('Creating backup...');
    fs.writeFileSync(backupPath, JSON.stringify(config, null, 2), 'utf-8');
    spinner.succeed('Backup created');

    console.log(chalk.green(`✓ Configuration backup created: ${backupPath}`));
    console.log(chalk.gray('To restore this backup, use:'));
    console.log(chalk.gray(`  paymongo config import ${backupPath} --force`));
  } catch (error) {
    spinner.stop();
    const err = error as Error;

    if (err.message.includes('Failed to load') || err.message.includes('parse')) {
      console.error(chalk.red('❌ Failed to load configuration for backup:'), err.message);
      console.log('');
      console.log(chalk.yellow('💡 Check:'));
      console.log(chalk.gray('• Run "paymongo config show" to verify configuration'));
      console.log(chalk.gray('• Run "paymongo config reset" to recreate configuration'));
    } else if (err.message.includes('permission') || err.message.includes('EACCES')) {
      console.error(chalk.red('❌ Failed to create backup:'), err.message);
      console.log('');
      console.log(chalk.yellow('💡 Check:'));
      console.log(chalk.gray('• File permissions in the backup directory'));
      console.log(chalk.gray('• Available disk space'));
      console.log(chalk.gray('• Try running the command with administrator/sudo privileges'));
    } else {
      console.error(chalk.red('❌ Failed to create backup:'), err.message);
    }

    throw new CommandError();
  }
}

export async function resetAction() {
  const { spinner, configManager } = createConfigContext();

  try {
    spinner.start('Resetting configuration...');
    await configManager.save(configManager.getDefaultConfig());
    spinner.succeed('Configuration reset');

    console.log(chalk.green('✓ Configuration reset to defaults'));
    console.log(chalk.gray('Note: You will need to reconfigure API keys and other settings'));
  } catch (error) {
    spinner.stop();
    handleCommandFailure('❌ Failed to reset configuration:', error);
  }
}

export async function importAction(filePath: string, options: { force?: boolean }) {
  const { spinner, configManager } = createConfigContext();

  try {
    spinner.start('Reading import file...');

    if (!fs.existsSync(filePath)) {
      spinner.fail('File not found');
      console.error(chalk.red(`❌ Import file not found: ${filePath}`));
      throw new CommandError();
    }

    let importedConfig: PayMongoConfig;
    try {
      importedConfig = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as PayMongoConfig;
    } catch {
      spinner.fail('Invalid JSON');
      console.error(chalk.red('❌ Invalid JSON in import file'));
      throw new CommandError();
    }

    spinner.succeed('File read');

    spinner.start('Validating configuration...');
    validateImportedConfig(importedConfig);
    const validationErrors = validateImportedConfigWithSchema(importedConfig);
    if (validationErrors.length > 0) {
      spinner.fail('Invalid configuration');
      console.error(chalk.red('❌ Configuration validation failed:'));
      validationErrors.forEach((err) => {
        console.error(chalk.gray(`  • ${err}`));
      });
      throw new CommandError();
    }
    spinner.succeed('Configuration validated');

    const existingConfig = await configManager.load();
    if (existingConfig && !options.force) {
      spinner.start('Checking for conflicts...');
      const conflicts = checkConfigConflicts(existingConfig, importedConfig);

      if (conflicts.length > 0) {
        spinner.stop();
        console.log(chalk.yellow('⚠️  Configuration conflicts detected:'));
        conflicts.forEach((conflict) => {
          console.log(chalk.gray(`  • ${conflict}`));
        });
        console.log('');
        console.log(chalk.bold('Use --force to overwrite existing configuration'));
        throw new CommandError();
      }

      spinner.succeed('No conflicts found');
    }

    if (existingConfig) {
      spinner.start('Creating backup...');
      const backupPath = `.paymongo.backup.${Date.now()}.json`;
      fs.writeFileSync(
        backupPath,
        JSON.stringify(configManager.mergeConfig(existingConfig, {}), null, 2)
      );
      spinner.succeed(`Backup created: ${backupPath}`);
    }

    spinner.start('Importing configuration...');
    if (!importedConfig.apiKeys) {
      importedConfig.apiKeys = {};
    }
    if (!importedConfig.webhookSecrets) {
      importedConfig.webhookSecrets = {};
    }
    await configManager.save(importedConfig);
    spinner.succeed('Configuration imported');

    console.log(chalk.green('✓ Configuration imported successfully'));
    console.log(chalk.gray(`Imported from: ${filePath}`));
  } catch (error) {
    spinner.stop();
    handleCommandFailure('❌ Failed to import configuration:', error);
  }
}
