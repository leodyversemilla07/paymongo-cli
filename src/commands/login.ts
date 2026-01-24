import { Command } from 'commander';
import inquirer from 'inquirer';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import * as os from 'os';
import chalk from 'chalk';
import ConfigManager from '../services/config/manager';
import ApiClient from '../services/api/client';
import { validateApiKey } from '../utils/validator';
import Spinner from '../utils/spinner';

interface LoginAnswers {
  environment: 'test' | 'live';
  secretKey: string;
  publicKey?: string;
}

class CredentialManager {
  private credentialsPath: string;
  private encryptionKey: string;

  constructor() {
    // Use OS-specific credential storage location
    const homeDir = os.homedir();
    const configDir = path.join(homeDir, '.paymongo');

    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true, mode: 0o700 });
    }

    this.credentialsPath = path.join(configDir, 'credentials.enc');

    // Use a machine-specific key for encryption
    const machineId = os.hostname() + os.userInfo().username;
    this.encryptionKey = crypto
      .createHash('sha256')
      .update(machineId)
      .digest('hex')
      .substring(0, 32);
  }

  async saveCredentials(credentials: {
    environment: string;
    secretKey: string;
    publicKey?: string;
  }): Promise<void> {
    const data = JSON.stringify(credentials);
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', this.encryptionKey, iv);

    let encrypted = cipher.update(data, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const payload = {
      iv: iv.toString('hex'),
      data: encrypted,
    };

    fs.writeFileSync(this.credentialsPath, JSON.stringify(payload), { mode: 0o600 });
  }

  async loadCredentials(): Promise<{
    environment: string;
    secretKey: string;
    publicKey?: string;
  } | null> {
    try {
      if (!fs.existsSync(this.credentialsPath)) {
        return null;
      }

      const payload = JSON.parse(fs.readFileSync(this.credentialsPath, 'utf8'));
      const iv = Buffer.from(payload.iv, 'hex');
      const decipher = crypto.createDecipheriv('aes-256-cbc', this.encryptionKey, iv);

      let decrypted = decipher.update(payload.data, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      return JSON.parse(decrypted);
    } catch (error) {
      // If decryption fails, credentials are corrupted
      return null;
    }
  }

  async clearCredentials(): Promise<void> {
    if (fs.existsSync(this.credentialsPath)) {
      fs.unlinkSync(this.credentialsPath);
    }
  }
}

const command = new Command('login');

command
  .description('Manage API credentials')
  .option('-k, --key <key>', 'Secret API key')
  .option('--public-key <key>', 'Public API key')
  .option('-e, --env <environment>', 'Environment (test or live)', 'test')
  .option('--logout', 'Clear stored credentials')
  .action(async (options) => {
    const spinner = new Spinner();
    const configManager = new ConfigManager();
    const credentialManager = new CredentialManager();

    try {
      if (options.logout) {
        spinner.start('Clearing credentials...');
        await credentialManager.clearCredentials();
        spinner.succeed('Credentials cleared');

        // Also clear from current config if it exists
        try {
          await configManager.delete();
        } catch (error) {
          // Ignore errors during config deletion
        }

        console.log(chalk.green('✓ Successfully logged out'));
        return;
      }

      let answers: LoginAnswers;

      if (options.key) {
        // Non-interactive mode
        answers = {
          environment: options.env as 'test' | 'live',
          secretKey: options.key,
          publicKey: options.publicKey,
        };
      } else {
        // Interactive mode
        const storedCredentials = await credentialManager.loadCredentials();

        answers = await inquirer.prompt<LoginAnswers>([
          {
            type: 'list',
            name: 'environment',
            message: 'Environment:',
            choices: [
              { name: 'Test (recommended for development)', value: 'test' },
              { name: 'Live (for production)', value: 'live' },
            ],
            default: options.env || storedCredentials?.environment || 'test',
          },
          {
            type: 'password',
            name: 'secretKey',
            message: 'Secret API key:',
            default: options.key || storedCredentials?.secretKey,
            validate: (input) => {
              if (!input) return 'Secret API key is required';
              if (!validateApiKey(input, 'secret')) return 'Invalid secret API key format';
              return true;
            },
          },
          {
            type: 'password',
            name: 'publicKey',
            message: 'Public API key (optional):',
            default: options.publicKey || storedCredentials?.publicKey,
            validate: (input) => {
              if (!input) return true; // Optional
              if (!validateApiKey(input, 'public')) return 'Invalid public API key format';
              return true;
            },
          },
        ]);
      }

      // Validate API key
      spinner.start('Validating API key...');

      const tempConfig = {
        version: '1.0',
        projectName: 'temp',
        environment: answers.environment,
        apiKeys: {
          [answers.environment]: {
            public: answers.publicKey || '',
            secret: answers.secretKey,
          },
        },
        webhooks: { url: '', events: [] },
        dev: { port: 3000, autoRegisterWebhook: true },
      };

      const apiClient = new ApiClient({ config: tempConfig });
      const isValid = await apiClient.validateApiKey();

      if (!isValid) {
        spinner.fail('API key validation failed');
        console.error(chalk.red('❌ Invalid API key. Please check your key and try again.'));
        console.log(
          chalk.gray('Get your API keys from: https://dashboard.paymongo.com/developers')
        );
        process.exit(1);
      }

      spinner.succeed('API key validated');

      // Store credentials securely
      spinner.start('Storing credentials securely...');
      const credentials: { environment: string; secretKey: string; publicKey?: string } = {
        environment: answers.environment,
        secretKey: answers.secretKey,
      };
      if (answers.publicKey) {
        credentials.publicKey = answers.publicKey;
      }
      await credentialManager.saveCredentials(credentials);
      spinner.succeed('Credentials stored securely');

      // Update current project config if it exists
      let config;
      try {
        config = await configManager.load();
      } catch (error) {
        // If config exists but is invalid, create a new one
        console.log(chalk.yellow('⚠️  Creating new project configuration...'));
        config = configManager.getDefaultConfig();
      }

      if (config) {
        config.environment = answers.environment;
        // Ensure apiKeys object exists
        if (!config.apiKeys) {
          config.apiKeys = {};
        }
        config.apiKeys[answers.environment] = {
          public: answers.publicKey || '',
          secret: answers.secretKey,
        };
        await configManager.save(config);
      }

      // Success message
      console.log('\n' + chalk.green('🔐 PayMongo Login Successful'));
      console.log('\n' + chalk.bold('Current configuration:'));
      console.log(`  Environment: ${answers.environment}`);
      console.log(`  Secret Key: ${'*'.repeat(20)}...${answers.secretKey.slice(-4)}`);
      if (answers.publicKey) {
        console.log(`  Public Key: ${'*'.repeat(20)}...${answers.publicKey.slice(-4)}`);
      }

      console.log('\n' + chalk.gray("Use 'paymongo config show' to view settings"));
      console.log(chalk.gray("Use 'paymongo login --logout' to clear credentials"));
    } catch (error) {
      spinner.stop();
      const err = error as Error;

      // Provide actionable error messages based on error type
      if (err.message.includes('API key') || err.message.includes('unauthorized')) {
        console.error(chalk.red('❌ API key validation failed:'), err.message);
        console.log('');
        console.log(chalk.yellow('💡 Solutions:'));
        console.log(
          chalk.gray('• Double-check your API keys from https://dashboard.paymongo.com/developers')
        );
        console.log(chalk.gray("• Make sure you're using the correct environment (test/live)"));
        console.log(
          chalk.gray('• Test API keys are prefixed with "sk_test_", live keys with "sk_live_"')
        );
      } else if (err.message.includes('Network') || err.message.includes('connection')) {
        console.error(chalk.red('❌ Network error during validation:'), err.message);
        console.log('');
        console.log(chalk.yellow('💡 Options:'));
        console.log(chalk.gray('• Check your internet connection'));
        console.log(chalk.gray('• Use "paymongo login --key YOUR_KEY" to skip validation'));
        console.log(chalk.gray('• Validation can be skipped, but ensure your keys are correct'));
      } else if (err.message.includes('permission') || err.message.includes('access')) {
        console.error(chalk.red('❌ File system error:'), err.message);
        console.log('');
        console.log(chalk.yellow('💡 Try:'));
        console.log(chalk.gray('• Run the command with administrator/sudo privileges'));
        console.log(chalk.gray('• Check that the .paymongo directory is accessible'));
      } else {
        console.error(chalk.red('❌ Login failed:'), err.message);
        console.log('');
        console.log(chalk.yellow('💡 For help, visit: https://developers.paymongo.com'));
      }

      process.exit(1);
    }
  });

export default command;
