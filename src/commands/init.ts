import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';
import ConfigManager from '../services/config/manager.js';
import ApiClient from '../services/api/client.js';
import { validateApiKey } from '../utils/validator.js';
import Spinner from '../utils/spinner.js';

interface InitAnswers {
  projectName: string;
  environment: 'test' | 'live';
  publicKey: string;
  secretKey: string;
  webhookUrl?: string | undefined;
  events: string[];
  port: number;
}

const command = new Command('init');

command
  .description('Initialize a new PayMongo project')
  .option('-n, --name <name>', 'Project name')
  .option('-e, --env <environment>', 'Environment (test or live)', 'test')
  .option('-k, --key <key>', 'Secret API key')
  .option('--public-key <key>', 'Public API key')
  .option('-u, --url <url>', 'Webhook URL')
  .option('-p, --port <port>', 'Development port', '3000')
  .option('--events <events>', 'Comma-separated webhook events', 'payment.paid,payment.failed')
  .option('--non-interactive', 'Skip interactive prompts')
  .action(async (options) => {
    const spinner = new Spinner();
    const configManager = new ConfigManager();

    try {
      // Check if config already exists
      if (await configManager.exists()) {
        // Lazy load confirm only when needed
        const { confirm } = await import('@inquirer/prompts');
        const overwrite = await confirm({
          message: 'Configuration file already exists. Overwrite?',
          default: false,
        });

        if (!overwrite) {
          console.log(chalk.yellow('Initialization cancelled.'));
          return;
        }
      }

      let answers: InitAnswers;

      if (options.nonInteractive) {
        // Use provided options
        answers = {
          projectName: options.name || path.basename(process.cwd()),
          environment: options.env,
          publicKey: options.publicKey || '',
          secretKey: options.key,
          webhookUrl: options.url,
          events: options.events ? options.events.split(',') : ['payment.paid', 'payment.failed'],
          port: parseInt(options.port),
        };
      } else {
        // Interactive mode - lazy load @inquirer/prompts
        const { input, select, password, checkbox, number } = await import('@inquirer/prompts');

        const projectName = await input({
          message: 'Project name:',
          default: options.name || path.basename(process.cwd()),
          validate: (value) => value.trim().length > 0 || 'Project name is required',
        });

        const environment = await select({
          message: 'Environment:',
          choices: [
            { name: 'Test (recommended for development)', value: 'test' as const },
            { name: 'Live (for production)', value: 'live' as const },
          ],
          default: options.env || 'test',
        });

        const secretKey = await password({
          message: 'Secret API key:',
          validate: (value) => {
            if (!value) {return 'Secret API key is required';}
            if (!validateApiKey(value, 'secret')) {return 'Invalid secret API key format';}
            return true;
          },
        });

        const publicKey = await password({
          message: 'Public API key (optional):',
        });

        const webhookUrl = await input({
          message: 'Webhook URL (leave empty for local development):',
          default: options.url,
        });

        const events = await checkbox({
          message: 'Webhook events to listen for:',
          choices: [
            { name: 'payment.paid - Payment successful', value: 'payment.paid', checked: true },
            { name: 'payment.failed - Payment failed', value: 'payment.failed', checked: true },
            { name: 'payment.refunded - Payment refunded', value: 'payment.refunded' },
            { name: 'source.chargeable - Source ready for charging', value: 'source.chargeable' },
            { name: 'checkout_session.payment.paid - Checkout payment successful', value: 'checkout_session.payment.paid' },
            { name: 'qrph.expired - QR Ph expired', value: 'qrph.expired' },
          ],
        });

        const port = await number({
          message: 'Development server port:',
          default: parseInt(options.port) || 3000,
          validate: (value) => {
            if (value === undefined || value <= 0 || value >= 65536) {
              return 'Port must be between 1 and 65535';
            }
            return true;
          },
        });

        answers = {
          projectName,
          environment: environment as 'test' | 'live',
          publicKey: publicKey || '',
          secretKey,
          webhookUrl: webhookUrl || undefined,
          events: events.length > 0 ? events : ['payment.paid', 'payment.failed'],
          port: port || 3000,
        };
      }

      // Validate API keys
      spinner.start('Validating API keys...');

      const tempConfig = {
        version: '1.0',
        projectName: answers.projectName,
        environment: answers.environment,
        apiKeys: {
          [answers.environment]: {
            public: answers.publicKey,
            secret: answers.secretKey,
          },
        },
        webhooks: {
          url: answers.webhookUrl || `http://localhost:${answers.port}/webhook`,
          events: answers.events,
        },
        webhookSecrets: {},
        dev: {
          port: answers.port,
          autoRegisterWebhook: true,
          verifyWebhookSignatures: false, // Default to false for development ease
        },
      };

      const apiClient = new ApiClient({ config: tempConfig });
      const isValid = await apiClient.validateApiKey();

      if (!isValid) {
        spinner.fail('API key validation failed');
        console.error(chalk.red('❌ Invalid API keys. Please check your keys and try again.'));
        console.log(
          chalk.gray('Get your API keys from: https://dashboard.paymongo.com/developers')
        );
        process.exit(1);
      }

      spinner.succeed('API keys validated');

      // Save configuration
      spinner.start('Saving configuration...');
      await configManager.save(tempConfig);
      spinner.succeed('Configuration saved');

      // Create .env file
      const envPath = path.join(process.cwd(), '.env');
      const envContent = `# PayMongo API Keys
PAYMONGO_PUBLIC_KEY=${answers.publicKey || ''}
PAYMONGO_SECRET_KEY=${answers.secretKey}
PAYMONGO_ENVIRONMENT=${answers.environment}
`;

      fs.writeFileSync(envPath, envContent);
      spinner.succeed('.env file created');

      // Add to .gitignore if it exists
      const gitignorePath = path.join(process.cwd(), '.gitignore');
      if (fs.existsSync(gitignorePath)) {
        let gitignoreContent = fs.readFileSync(gitignorePath, 'utf-8');
        if (!gitignoreContent.includes('.env')) {
          gitignoreContent += '\n# PayMongo\n.env\n.paymongo\n';
          fs.writeFileSync(gitignorePath, gitignoreContent);
          console.log(chalk.green('✓ Added .env and .paymongo to .gitignore'));
        }
      }

      // Success message
      console.log('\n' + chalk.green('🎉 PayMongo project initialized!'));
      console.log('\n' + chalk.bold('Configuration saved to .paymongo'));
      console.log(chalk.bold('Environment variables saved to .env'));
      console.log('\n' + chalk.bold('Next steps:'));
      console.log('  1. Run ' + chalk.cyan('paymongo dev') + ' to start development server');
      console.log(
        '  2. Configure your webhook handler at ' +
          chalk.cyan(`http://localhost:${answers.port}/webhook`)
      );
      console.log(
        '  3. Visit ' + chalk.cyan('https://dashboard.paymongo.com') + ' to view transactions'
      );
      console.log('\n' + chalk.yellow('Happy building! 🚀'));
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
        console.error(chalk.red('❌ Network error:'), err.message);
        console.log('');
        console.log(chalk.yellow('💡 Try again:'));
        console.log(chalk.gray('• Check your internet connection'));
        console.log(chalk.gray('• PayMongo API might be temporarily unavailable'));
        console.log(chalk.gray('• Wait a moment and try again'));
      } else if (err.message.includes('permission') || err.message.includes('access')) {
        console.error(chalk.red('❌ File system error:'), err.message);
        console.log('');
        console.log(chalk.yellow('💡 Check permissions:'));
        console.log(chalk.gray('• Make sure you have write permissions in this directory'));
        console.log(chalk.gray('• Try running the command with sudo if on Linux/macOS'));
      } else {
        console.error(chalk.red('❌ Initialization failed:'), err.message);
        console.log('');
        console.log(chalk.yellow('💡 For help, visit: https://developers.paymongo.com/docs'));
      }

      process.exit(1);
    }
  });

export default command;
