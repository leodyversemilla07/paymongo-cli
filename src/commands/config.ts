import { Command } from 'commander';
import chalk from 'chalk';
import ConfigManager from '../services/config/manager';
import Spinner from '../utils/spinner';

// @ts-ignore - Used in export command
function configToEnv(config: any): string {
  const envVars: string[] = [];

  // Basic config
  envVars.push(`PAYMONGO_VERSION=${config.version}`);
  envVars.push(`PAYMONGO_PROJECT_NAME=${config.projectName}`);
  envVars.push(`PAYMONGO_ENVIRONMENT=${config.environment}`);

  // API Keys
  if (config.apiKeys.test) {
    envVars.push(`PAYMONGO_API_PUBLIC_TEST=${config.apiKeys.test.public}`);
    envVars.push(`PAYMONGO_API_SECRET_TEST=${config.apiKeys.test.secret}`);
  }

  if (config.apiKeys.live) {
    envVars.push(`PAYMONGO_API_PUBLIC_LIVE=${config.apiKeys.live.public}`);
    envVars.push(`PAYMONGO_API_SECRET_LIVE=${config.apiKeys.live.secret}`);
  }

  // Webhooks
  envVars.push(`PAYMONGO_WEBHOOK_URL=${config.webhooks.url}`);
  envVars.push(`PAYMONGO_WEBHOOK_EVENTS=${config.webhooks.events.join(',')}`);

  // Webhook secrets (if any)
  Object.entries(config.webhookSecrets || {}).forEach(([webhookId, secret]) => {
    envVars.push(`PAYMONGO_WEBHOOK_SECRET_${webhookId.toUpperCase()}=${secret}`);
  });

  // Dev config
  envVars.push(`PAYMONGO_DEV_PORT=${config.dev.port}`);
  envVars.push(`PAYMONGO_DEV_AUTO_REGISTER_WEBHOOK=${config.dev.autoRegisterWebhook}`);
  envVars.push(`PAYMONGO_DEV_VERIFY_WEBHOOK_SIGNATURES=${config.dev.verifyWebhookSignatures}`);

  return envVars.join('\n');
}

// @ts-ignore - Used in import command
function validateImportedConfig(config: any): void {
  // Required fields
  const requiredFields = ['version', 'projectName', 'environment', 'apiKeys', 'webhooks', 'dev'];

  for (const field of requiredFields) {
    if (!(field in config)) {
      throw new Error(`Missing required field: ${field}`);
    }
  }

  // Validate version
  if (typeof config.version !== 'string') {
    throw new Error('Version must be a string');
  }

  // Validate projectName
  if (typeof config.projectName !== 'string' || config.projectName.trim() === '') {
    throw new Error('Project name must be a non-empty string');
  }

  // Validate environment
  if (!['test', 'live'].includes(config.environment)) {
    throw new Error('Environment must be either "test" or "live"');
  }

  // Validate API keys structure
  if (typeof config.apiKeys !== 'object' || config.apiKeys === null) {
    throw new Error('API keys must be an object');
  }

  // Validate webhooks structure
  if (typeof config.webhooks !== 'object' || config.webhooks === null) {
    throw new Error('Webhooks must be an object');
  }

  if (!Array.isArray(config.webhooks.events)) {
    throw new Error('Webhook events must be an array');
  }

  // Validate dev config
  if (typeof config.dev !== 'object' || config.dev === null) {
    throw new Error('Dev config must be an object');
  }

  if (typeof config.dev.port !== 'number' || config.dev.port < 1 || config.dev.port > 65535) {
    throw new Error('Dev port must be a valid port number (1-65535)');
  }
}

// @ts-ignore - Used in import command
function checkConfigConflicts(existing: any, imported: any): string[] {
  const conflicts: string[] = [];

  // Check for API key differences
  if (existing.apiKeys && imported.apiKeys) {
    if (existing.apiKeys.test?.public !== imported.apiKeys.test?.public) {
      conflicts.push('Test environment public API key differs');
    }
    if (existing.apiKeys.test?.secret !== imported.apiKeys.test?.secret) {
      conflicts.push('Test environment secret API key differs');
    }
    if (existing.apiKeys.live?.public !== imported.apiKeys.live?.public) {
      conflicts.push('Live environment public API key differs');
    }
    if (existing.apiKeys.live?.secret !== imported.apiKeys.live?.secret) {
      conflicts.push('Live environment secret API key differs');
    }
  }

  // Check for webhook URL differences
  if (existing.webhooks?.url !== imported.webhooks?.url) {
    conflicts.push('Webhook URL differs');
  }

  // Check for environment differences
  if (existing.environment !== imported.environment) {
    conflicts.push('Environment setting differs');
  }

  // Check for project name differences
  if (existing.projectName !== imported.projectName) {
    conflicts.push('Project name differs');
  }

  return conflicts;
}

const command = new Command('config');

command
  .description('View and modify configuration')
  .addCommand(
    new Command('show')
      .description('Show current configuration')
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
            console.log(chalk.gray("Run 'paymongo init' to set up your project."));
            return;
          }

          spinner.succeed('Configuration loaded');

          if (options.json) {
            console.log(JSON.stringify(config, null, 2));
            return;
          }

          // Pretty print configuration
          console.log('\n' + chalk.bold('Configuration (.paymongo)'));
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

          console.log(chalk.bold('API Keys:'));

          const env = config.environment;
          const apiKeys = config.apiKeys[env];

          if (apiKeys) {
            if (apiKeys.public) {
              const maskedPublic = apiKeys.public.replace(/(.{10}).*/, '$1***');
              console.log(`  Public (${env}):`, maskedPublic);
            }
            if (apiKeys.secret) {
              const maskedSecret = apiKeys.secret.replace(/(.{10}).*/, '$1***');
              console.log(`  Secret (${env}):`, maskedSecret);
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
            console.log(
              chalk.gray('• Run "paymongo config reset" to create a fresh configuration')
            );

            console.log(chalk.gray('• Check the .paymongo file for syntax errors'));
            console.log(chalk.gray('• Run "paymongo init" to recreate the configuration'));
          } else {
            console.error(chalk.red('❌ Failed to load configuration:'), err.message);
          }

          process.exit(1);
        }
      })
  )

  .addCommand(
    new Command('set')
      .description('Set configuration value')
      .arguments('<key> <value>')
      .action(async (key: string, value: string) => {
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

          // Parse and set the value
          spinner.start('Updating configuration...');

          const keys = key.split('.');
          let current: Record<string, any> = config;

          // Navigate to the parent object
          for (let i = 0; i < keys.length - 1; i++) {
            if (!current[keys[i]!]) {
              current[keys[i]!] = {};
            }
            current = current[keys[i]!] as Record<string, any>;
          }

          // Set the value with type coercion
          const finalKey = keys[keys.length - 1]!;
          if (value === 'true') {
            current[finalKey] = true;
          } else if (value === 'false') {
            current[finalKey] = false;
          } else if (!isNaN(Number(value))) {
            current[finalKey] = Number(value);
          } else {
            current[finalKey] = value;
          }

          await configManager.save(config);
          spinner.succeed('Configuration updated');

          console.log(chalk.green(`✓ Set ${key} = ${value}`));
        } catch (error) {
          spinner.stop();
          const err = error as Error;
          console.error(chalk.red('❌ Failed to update configuration:'), err.message);
          process.exit(1);
        }
      })
  )

  .addCommand(
    new Command('backup')
      .description('Create a timestamped backup of current configuration')
      .option('-d, --directory <dir>', 'Backup directory (defaults to current directory)')
      .option('-n, --name <name>', 'Custom backup filename prefix')
      .action(async (options) => {
        const spinner = new Spinner();
        const configManager = new ConfigManager();
        const fs = require('fs');
        const path = require('path');

        try {
          spinner.start('Loading current configuration...');

          // Load current configuration
          const config = await configManager.load();

          if (!config) {
            spinner.fail('No configuration found');
            console.log(chalk.yellow('No PayMongo configuration found.'));
            console.log(chalk.gray("Run 'paymongo init' to set up your project first."));
            return;
          }

          spinner.succeed('Configuration loaded');

          // Create backup directory if specified
          const backupDir = options.directory ? path.resolve(options.directory) : process.cwd();

          if (options.directory && !fs.existsSync(backupDir)) {
            fs.mkdirSync(backupDir, { recursive: true });
          }

          // Generate timestamp and filename
          const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
          const prefix = options.name || 'paymongo-config';
          const filename = `${prefix}-${timestamp}.json`;
          const backupPath = path.join(backupDir, filename);

          spinner.start('Creating backup...');

          // Write backup file
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

          process.exit(1);
        }
      })
  )

  .addCommand(
    new Command('reset').description('Reset configuration to defaults').action(async () => {
      const spinner = new Spinner();
      const configManager = new ConfigManager();

      try {
        spinner.start('Resetting configuration...');

        // Create default config
        const defaultConfig = configManager.getDefaultConfig();

        // Save it
        await configManager.save(defaultConfig);

        spinner.succeed('Configuration reset');

        console.log(chalk.green('✓ Configuration reset to defaults'));
        console.log(chalk.gray('Note: You will need to reconfigure API keys and other settings'));
      } catch (error) {
        spinner.stop();
        const err = error as Error;
        console.error(chalk.red('❌ Failed to reset configuration:'), err.message);
        process.exit(1);
      }
    })
  )

  .addCommand(
    new Command('import')
      .description('Import configuration from file')
      .arguments('<file>')
      .option('-f, --force', 'Overwrite existing configuration without confirmation')
      .action(async (filePath: string, options) => {
        const spinner = new Spinner();
        const configManager = new ConfigManager();
        const fs = require('fs');

        try {
          spinner.start('Reading import file...');

          // Read and parse the import file
          if (!fs.existsSync(filePath)) {
            spinner.fail('File not found');
            console.error(chalk.red(`❌ Import file not found: ${filePath}`));
            process.exit(1);
          }

          const fileContent = fs.readFileSync(filePath, 'utf-8');
          let importedConfig;

          try {
            importedConfig = JSON.parse(fileContent);
          } catch (parseError) {
            spinner.fail('Invalid JSON');
            console.error(chalk.red('❌ Invalid JSON in import file'));
            process.exit(1);
          }

          spinner.succeed('File read');

          // Validate the imported config
          spinner.start('Validating configuration...');
          validateImportedConfig(importedConfig);
          spinner.succeed('Configuration validated');

          // Check for existing config and conflicts
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
              process.exit(1);
            }

            spinner.succeed('No conflicts found');
          }

          // Create backup if existing config
          if (existingConfig) {
            spinner.start('Creating backup...');
            const backupConfig = configManager.mergeConfig(existingConfig, {});
            const backupPath = `.paymongo.backup.${Date.now()}.json`;
            fs.writeFileSync(backupPath, JSON.stringify(backupConfig, null, 2));
            spinner.succeed(`Backup created: ${backupPath}`);
          }

          // Import the configuration
          spinner.start('Importing configuration...');
          await configManager.save(importedConfig);
          spinner.succeed('Configuration imported');

          console.log(chalk.green('✓ Configuration imported successfully'));
          console.log(chalk.gray(`Imported from: ${filePath}`));
        } catch (error) {
          spinner.stop();
          const err = error as Error;
          console.error(chalk.red('❌ Failed to import configuration:'), err.message);
          process.exit(1);
        }
      })
  );

export default command;
