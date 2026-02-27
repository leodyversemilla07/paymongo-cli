import { Command } from 'commander';
import chalk from 'chalk';
import * as fs from 'fs';
import * as path from 'path';
import ConfigManager from '../services/config/manager.js';
import Spinner from '../utils/spinner.js';
import { PayMongoConfig } from '../types/paymongo.js';
import { validateConfig as zodValidateConfig } from '../types/schemas.js';
import { CommandError } from '../utils/errors.js';

function validateImportedConfig(config: unknown): asserts config is PayMongoConfig {
  if (typeof config !== 'object' || config === null) {
    throw new Error('Configuration must be an object');
  }

  const cfg = config as Record<string, unknown>;

  // Required fields
  const requiredFields = ['version', 'projectName', 'environment', 'apiKeys', 'webhooks', 'dev'];

  for (const field of requiredFields) {
    if (!(field in cfg)) {
      throw new Error(`Missing required field: ${field}`);
    }
  }

  // Validate version
  if (typeof cfg.version !== 'string') {
    throw new Error('Version must be a string');
  }

  // Validate projectName
  if (typeof cfg.projectName !== 'string' || cfg.projectName.trim() === '') {
    throw new Error('Project name must be a non-empty string');
  }

  // Validate environment
  if (cfg.environment !== 'test' && cfg.environment !== 'live') {
    throw new Error('Environment must be either "test" or "live"');
  }

  // Validate API keys structure
  if (typeof cfg.apiKeys !== 'object' || cfg.apiKeys === null) {
    throw new Error('API keys must be an object');
  }

  // Validate webhooks structure
  if (typeof cfg.webhooks !== 'object' || cfg.webhooks === null) {
    throw new Error('Webhooks must be an object');
  }

  const webhooks = cfg.webhooks as Record<string, unknown>;
  if (!Array.isArray(webhooks.events)) {
    throw new Error('Webhook events must be an array');
  }

  // Validate dev config
  if (typeof cfg.dev !== 'object' || cfg.dev === null) {
    throw new Error('Dev config must be an object');
  }

  const dev = cfg.dev as Record<string, unknown>;
  if (typeof dev.port !== 'number' || dev.port < 1 || dev.port > 65535) {
    throw new Error('Dev port must be a valid port number (1-65535)');
  }
}

function checkConfigConflicts(existing: PayMongoConfig, imported: PayMongoConfig): string[] {
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

export async function showAction(options: { json?: boolean }) {
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

    // Rate Limiting section
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
  const spinner = new Spinner();
  const configManager = new ConfigManager();

  // Map user-friendly dot notation to actual config keys
  const keyMappings: Record<string, string> = {
    'project.name': 'projectName',
    'webhook.url': 'webhooks.url',
    'webhook.events': 'webhooks.events',
    'dev.port': 'dev.port',
    'dev.autoRegister': 'dev.autoRegisterWebhook',
    'dev.verifySignatures': 'dev.verifyWebhookSignatures',
    'rateLimit.enabled': 'rateLimiting.enabled',
    'rateLimit.maxRequests': 'rateLimiting.maxRequests',
    'rateLimit.windowMs': 'rateLimiting.windowMs',
  };

  // Apply key mapping if exists
  const mappedKey = keyMappings[key] || key;

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

    const keys = mappedKey.split('.');
    let current: Record<string, unknown> = config as unknown as Record<string, unknown>;

    // Navigate to the parent object
    for (let i = 0; i < keys.length - 1; i++) {
      const k = keys[i];
      if (k && !current[k]) {
        current[k] = {};
      }
      if (k) {
        current = current[k] as Record<string, unknown>;
      }
    }

    // Set the value with type coercion
    const finalKey = keys[keys.length - 1];
    if (!finalKey) {
      throw new Error('Invalid key path');
    }
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
    throw new CommandError();
  }
}

export async function backupAction(options: { directory?: string; name?: string }) {
  const spinner = new Spinner();
  const configManager = new ConfigManager();

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

    throw new CommandError();
  }
}

export async function resetAction() {
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
    throw new CommandError();
  }
}

export async function importAction(filePath: string, options: { force?: boolean }) {
  const spinner = new Spinner();
  const configManager = new ConfigManager();

  try {
    spinner.start('Reading import file...');

    // Read and parse the import file
    if (!fs.existsSync(filePath)) {
      spinner.fail('File not found');
      console.error(chalk.red(`❌ Import file not found: ${filePath}`));
      throw new CommandError();
    }

    const fileContent = fs.readFileSync(filePath, 'utf-8');
    let importedConfig;

    try {
      importedConfig = JSON.parse(fileContent);
    } catch (_parseError) {
      spinner.fail('Invalid JSON');
      console.error(chalk.red('❌ Invalid JSON in import file'));
      throw new CommandError();
    }

    spinner.succeed('File read');

    // Validate the imported config
    spinner.start('Validating configuration...');
    validateImportedConfig(importedConfig);
    const validation = zodValidateConfig(importedConfig);
    if (!validation.success) {
      spinner.fail('Invalid configuration');
      console.error(chalk.red('❌ Configuration validation failed:'));
      validation.errors?.forEach((err) => console.error(chalk.gray(`  • ${err}`)));
      throw new CommandError();
    }
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
        throw new CommandError();
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
    const err = error as Error;
    console.error(chalk.red('❌ Failed to import configuration:'), err.message);
    throw new CommandError();
  }
}

export async function rateLimitEnableAction() {
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

    if (!config.rateLimiting) {
      config.rateLimiting = {
        enabled: true,
        maxRequests: 100,
        windowMs: 60000, // 1 minute
        environmentMultiplier: 0.5,
      };
    } else {
      config.rateLimiting.enabled = true;
    }

    spinner.start('Enabling rate limiting...');
    await configManager.save(config);
    spinner.succeed('Rate limiting enabled');

    console.log(chalk.green('✓ Rate limiting enabled'));
    console.log(chalk.gray('Default limits: 100 requests/minute (live: 50)'));
  } catch (error) {
    spinner.stop();
    const err = error as Error;
    console.error(chalk.red('❌ Failed to enable rate limiting:'), err.message);
    throw new CommandError();
  }
}

export async function rateLimitDisableAction() {
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

    if (config.rateLimiting) {
      config.rateLimiting.enabled = false;
    }

    spinner.start('Disabling rate limiting...');
    await configManager.save(config);
    spinner.succeed('Rate limiting disabled');

    console.log(chalk.green('✓ Rate limiting disabled'));
    console.log(chalk.gray('API calls will no longer be rate limited'));
  } catch (error) {
    spinner.stop();
    const err = error as Error;
    console.error(chalk.red('❌ Failed to disable rate limiting:'), err.message);
    throw new CommandError();
  }
}

export async function rateLimitSetMaxRequestsAction(requestsStr: string) {
  const spinner = new Spinner();
  const configManager = new ConfigManager();

  try {
    const requests = parseInt(requestsStr, 10);
    if (isNaN(requests) || requests < 1) {
      console.error(chalk.red('❌ Invalid number of requests. Must be a positive integer.'));
      throw new CommandError();
    }

    spinner.start('Loading configuration...');
    const config = await configManager.load();
    if (!config) {
      spinner.fail('No configuration found');
      console.log(chalk.yellow('No PayMongo configuration found.'));
      console.log(chalk.gray("Run 'paymongo init' to set up your project first."));
      return;
    }

    spinner.succeed('Configuration loaded');

    if (!config.rateLimiting) {
      config.rateLimiting = {
        enabled: true,
        maxRequests: requests,
        windowMs: 60000,
        environmentMultiplier: 0.5,
      };
    } else {
      config.rateLimiting.maxRequests = requests;
    }

    spinner.start('Updating rate limit...');
    await configManager.save(config);
    spinner.succeed('Rate limit updated');

    console.log(chalk.green(`✓ Maximum requests set to ${requests} per minute`));
  } catch (error) {
    spinner.stop();
    const err = error as Error;
    console.error(chalk.red('❌ Failed to update rate limit:'), err.message);
    throw new CommandError();
  }
}

export async function rateLimitSetWindowAction(secondsStr: string) {
  const spinner = new Spinner();
  const configManager = new ConfigManager();

  try {
    const seconds = parseInt(secondsStr, 10);
    if (isNaN(seconds) || seconds < 1) {
      console.error(chalk.red('❌ Invalid time window. Must be a positive integer (seconds).'));
      throw new CommandError();
    }

    spinner.start('Loading configuration...');
    const config = await configManager.load();
    if (!config) {
      spinner.fail('No configuration found');
      console.log(chalk.yellow('No PayMongo configuration found.'));
      console.log(chalk.gray("Run 'paymongo init' to set up your project first."));
      return;
    }

    spinner.succeed('Configuration loaded');

    if (!config.rateLimiting) {
      config.rateLimiting = {
        enabled: true,
        maxRequests: 100,
        windowMs: seconds * 1000,
        environmentMultiplier: 0.5,
      };
    } else {
      config.rateLimiting.windowMs = seconds * 1000;
    }

    spinner.start('Updating rate limit window...');
    await configManager.save(config);
    spinner.succeed('Rate limit window updated');

    console.log(chalk.green(`✓ Rate limit window set to ${seconds} seconds`));
  } catch (error) {
    spinner.stop();
    const err = error as Error;
    console.error(chalk.red('❌ Failed to update rate limit window:'), err.message);
    throw new CommandError();
  }
}

export async function rateLimitStatusAction() {
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

    console.log('\n' + chalk.bold('Rate Limiting Status'));
    console.log('');

    if (!config.rateLimiting || !config.rateLimiting.enabled) {
      console.log(chalk.yellow('Status: Disabled'));
      console.log(chalk.gray('Rate limiting is not currently active'));
      console.log('');
      console.log(chalk.gray("Run 'paymongo config rate-limit enable' to enable"));
      return;
    }

    console.log(chalk.green('Status: Enabled'));
    console.log('');
    console.log(chalk.bold('Global Settings:'));
    console.log(
      `  Max Requests: ${config.rateLimiting.maxRequests} per ${(config.rateLimiting.windowMs || 60000) / 1000}s`
    );
    console.log(
      `  Live Environment Multiplier: ${config.rateLimiting.environmentMultiplier || 0.5}x`
    );

    if (config.rateLimiting.endpoints && Object.keys(config.rateLimiting.endpoints).length > 0) {
      console.log('');
      console.log(chalk.bold('Endpoint Overrides:'));
      Object.entries(config.rateLimiting.endpoints).forEach(([endpoint, limits]) => {
        console.log(`  ${endpoint}: ${limits.maxRequests} per ${limits.windowMs / 1000}s`);
      });
    }

    console.log('');
    console.log(chalk.gray('Commands:'));
    console.log(chalk.gray("• 'paymongo config rate-limit disable' - Disable rate limiting"));
    console.log(
      chalk.gray("• 'paymongo config rate-limit set-max-requests <n>' - Set max requests")
    );
    console.log(
      chalk.gray("• 'paymongo config rate-limit set-window <seconds>' - Set time window")
    );
  } catch (error) {
    spinner.stop();
    const err = error as Error;
    console.error(chalk.red('❌ Failed to check rate limiting status:'), err.message);
    throw new CommandError();
  }
}

const command = new Command('config');

command
  .description('View and modify configuration')
  .addCommand(
    new Command('show')
      .description('Show current configuration')
      .option('-j, --json', 'Output as JSON')
      .action(showAction)
  )

  .addCommand(
    new Command('set')
      .description('Set configuration value')
      .arguments('<key> <value>')
      .action(setAction)
  )

  .addCommand(
    new Command('backup')
      .description('Create a timestamped backup of current configuration')
      .option('-d, --directory <dir>', 'Backup directory (defaults to current directory)')
      .option('-n, --name <name>', 'Custom backup filename prefix')
      .action(backupAction)
  )

  .addCommand(
    new Command('reset').description('Reset configuration to defaults').action(resetAction)
  )

  .addCommand(
    new Command('import')
      .description('Import configuration from file')
      .arguments('<file>')
      .option('-f, --force', 'Overwrite existing configuration without confirmation')
      .action(importAction)
  )

  .addCommand(
    new Command('rate-limit')
      .description('Configure rate limiting settings')
      .addCommand(
        new Command('enable').description('Enable rate limiting').action(rateLimitEnableAction)
      )
      .addCommand(
        new Command('disable').description('Disable rate limiting').action(rateLimitDisableAction)
      )
      .addCommand(
        new Command('set-max-requests')
          .description('Set maximum requests per time window')
          .arguments('<requests>')
          .action(rateLimitSetMaxRequestsAction)
      )
      .addCommand(
        new Command('set-window')
          .description('Set rate limit time window in seconds')
          .arguments('<seconds>')
          .action(rateLimitSetWindowAction)
      )
      .addCommand(
        new Command('status')
          .description('Show current rate limiting status')
          .action(rateLimitStatusAction)
      )
  );

export default command;
