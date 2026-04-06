import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import chalk from 'chalk';
import { Command } from 'commander';
import type { PayMongoConfig } from '../types/paymongo.js';
import { ApiKeyError, CommandError, NetworkError, PayMongoError } from '../utils/errors.js';
import { validateApiKey } from '../utils/validator.js';
import { createCredentialValidationConfig } from './shared/auth.js';
import { createApiClient, createCommandContext } from './shared/runtime.js';

interface LoginAnswers {
  environment: 'test' | 'live';
  secretKey: string;
  publicKey?: string | undefined;
}

class CredentialManager {
  private credentialsPath: string;
  private encryptionKey: Buffer;

  constructor() {
    // Use OS-specific credential storage location
    const homeDir = os.homedir();
    const configDir = path.join(homeDir, '.paymongo');

    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true, mode: 0o700 });
    }

    this.credentialsPath = path.join(configDir, 'credentials.enc');
    this.encryptionKey = this.deriveEncryptionKey();
  }

  private deriveEncryptionKey(): Buffer {
    const machineId = os.hostname() + os.userInfo().username;
    const saltPath = path.join(path.dirname(this.credentialsPath), 'credentials.salt');
    let salt: Buffer;

    try {
      if (fs.existsSync(saltPath)) {
        const saltHex = fs.readFileSync(saltPath, 'utf8').trim();
        salt = Buffer.from(saltHex, 'hex');
      } else {
        salt = crypto.randomBytes(16);
        fs.writeFileSync(saltPath, salt.toString('hex'), { mode: 0o600 });
      }
    } catch {
      salt = crypto.randomBytes(16);
    }

    return crypto.scryptSync(machineId, salt, 32);
  }

  async saveCredentials(credentials: {
    environment: string;
    secretKey: string;
    publicKey?: string;
  }): Promise<void> {
    const data = JSON.stringify(credentials);
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.encryptionKey, iv);
    const encrypted = Buffer.concat([cipher.update(data, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();

    const payload = {
      v: 2,
      iv: iv.toString('hex'),
      tag: tag.toString('hex'),
      data: encrypted.toString('hex'),
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
      if (payload.v === 2 && payload.iv && payload.tag && payload.data) {
        const iv = Buffer.from(payload.iv, 'hex');
        const tag = Buffer.from(payload.tag, 'hex');
        const decipher = crypto.createDecipheriv('aes-256-gcm', this.encryptionKey, iv);
        decipher.setAuthTag(tag);

        const decrypted = Buffer.concat([
          decipher.update(Buffer.from(payload.data, 'hex')),
          decipher.final(),
        ]).toString('utf8');

        return JSON.parse(decrypted);
      }

      if (payload.iv && payload.data) {
        const legacyKey = crypto
          .createHash('sha256')
          .update(os.hostname() + os.userInfo().username)
          .digest('hex')
          .substring(0, 32);
        const iv = Buffer.from(payload.iv, 'hex');
        const decipher = crypto.createDecipheriv('aes-256-cbc', legacyKey, iv);
        let decrypted = decipher.update(payload.data, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        const credentials = JSON.parse(decrypted);
        await this.saveCredentials(credentials);
        return credentials;
      }

      return null;
    } catch (_error) {
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
    const { spinner, configManager } = createCommandContext();
    const credentialManager = new CredentialManager();

    try {
      if (options.logout) {
        spinner.start('Clearing credentials...');
        await credentialManager.clearCredentials();
        spinner.succeed('Credentials cleared');

        // Also clear from current config if it exists
        try {
          await configManager.delete();
        } catch (_error) {
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

        const { select, password } = await import('@inquirer/prompts');

        const environment = await select({
          message: 'Environment:',
          choices: [
            { name: 'Test (recommended for development)', value: 'test' as const },
            { name: 'Live (for production)', value: 'live' as const },
          ],
          default: options.env || storedCredentials?.environment || 'test',
        });

        const secretKey = await password({
          message: 'Secret API key:',
          validate: (input) => {
            if (!input) {
              return 'Secret API key is required';
            }
            if (!validateApiKey(input, 'secret')) {
              return 'Invalid secret API key format';
            }
            return true;
          },
        });

        const publicKey = await password({
          message: 'Public API key (optional):',
          validate: (input) => {
            if (!input) {
              return true;
            } // Optional
            if (!validateApiKey(input, 'public')) {
              return 'Invalid public API key format';
            }
            return true;
          },
        });

        answers = {
          environment: environment as 'test' | 'live',
          secretKey,
          publicKey: publicKey || undefined,
        };
      }

      // Validate API key
      spinner.start('Validating API key...');

      const tempConfig = createCredentialValidationConfig({
        environment: answers.environment,
        publicKey: answers.publicKey || '',
        secretKey: answers.secretKey,
      });

      const apiClient = createApiClient(tempConfig);

      try {
        await apiClient.validateApiKey();
        spinner.succeed('API key validated');
      } catch (error) {
        spinner.fail('API key validation failed');

        if (error instanceof ApiKeyError) {
          console.error(chalk.red('❌ Invalid API key. Please check your key and try again.'));
          console.log(
            chalk.gray('Get your API keys from: https://dashboard.paymongo.com/developers')
          );
        } else if (error instanceof NetworkError) {
          console.error(
            chalk.red('❌ Network error. Please check your internet connection and try again.')
          );
        } else if (error instanceof PayMongoError) {
          if (error.statusCode && error.statusCode >= 500) {
            console.error(
              chalk.red('❌ PayMongo API is currently unavailable. Please try again later.')
            );
          } else if (error.statusCode && error.statusCode === 429) {
            console.error(chalk.red('❌ Too many requests. Please wait a moment and try again.'));
          } else {
            console.error(chalk.red(`❌ API error: ${error.message}`));
          }
        } else {
          console.error(chalk.red('❌ Unexpected error during validation. Please try again.'));
        }

        throw new CommandError();
      }

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
      let config: PayMongoConfig | null;
      try {
        config = await configManager.load();
      } catch (_error) {
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
      console.log(`\n${chalk.green('🔐 PayMongo Login Successful')}`);
      console.log(`\n${chalk.bold('Current configuration:')}`);
      console.log(`  Environment: ${answers.environment}`);
      console.log(`  Secret Key: ${'*'.repeat(20)}...${answers.secretKey.slice(-4)}`);
      if (answers.publicKey) {
        console.log(`  Public Key: ${'*'.repeat(20)}...${answers.publicKey.slice(-4)}`);
      }

      console.log(`\n${chalk.gray("Use 'paymongo config show' to view settings")}`);
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

      throw new CommandError();
    }
  });

export { CredentialManager, command };
