import { Command } from 'commander';
import chalk from 'chalk';
import ConfigManager from '../services/config/manager.js';
import ApiClient from '../services/api/client.js';
import Spinner from '../utils/spinner.js';

const command = new Command('env');

command
  .description('Manage PayMongo environments')
  .addCommand(
    new Command('switch')
      .description('Switch between test and live environments')
      .arguments('<environment>')
      .option('-f, --force', 'Skip API key validation')
      .action(async (environment, options) => {
        const spinner = new Spinner();
        const configManager = new ConfigManager();

        try {
          // Validate environment
          if (!['test', 'live'].includes(environment)) {
            console.error(chalk.red('❌ Invalid environment. Must be "test" or "live"'));
            process.exit(1);
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

          // Check if API keys exist for the target environment
          const envConfig = config.apiKeys[environment as 'test' | 'live'];
          if (!envConfig?.secret || !envConfig?.public) {
            spinner.fail(`Missing API keys for ${environment} environment`);
            console.log('');
            console.log(chalk.yellow('💡 To add API keys for this environment:'));
            console.log(
              `1. Get your ${environment} API keys from https://dashboard.paymongo.com/developers`
            );
            console.log(
              `2. Run: paymongo config set apiKeys.${environment}.secret YOUR_SECRET_KEY`
            );
            console.log(
              `3. Run: paymongo config set apiKeys.${environment}.public YOUR_PUBLIC_KEY`
            );
            process.exit(1);
          }

          // Validate API keys unless --force is used
          if (!options.force) {
            spinner.start('Validating API keys...');
            const testConfig = { ...config, environment: environment as 'test' | 'live' };
            const apiClient = new ApiClient({ config: testConfig });
            const isValid = await apiClient.validateApiKey();

            if (!isValid) {
              spinner.fail('API key validation failed');
              console.log('');
              console.log(chalk.red('❌ Invalid API keys for the target environment.'));
              console.log(
                chalk.gray('Use --force to skip validation, but note that commands may fail.')
              );
              console.log('');
              console.log(
                chalk.yellow('💡 Get your API keys from: https://dashboard.paymongo.com/developers')
              );
              process.exit(1);
            }
            spinner.succeed('API keys validated');
          }

          // Update configuration
          spinner.start(`Switching to ${environment} environment...`);
          const updatedConfig = { ...config, environment: environment as 'test' | 'live' };
          await configManager.save(updatedConfig);
          spinner.succeed(`Switched to ${environment} environment`);

          console.log('');
          console.log(chalk.green(`✅ Successfully switched to ${environment} environment`));
          console.log('');
          console.log(chalk.bold('Current Configuration:'));
          console.log(`Environment: ${chalk.cyan(environment.toUpperCase())}`);
          console.log(`Public Key: ${chalk.gray(envConfig.public.substring(0, 10))}...`);
          console.log(`Secret Key: ${chalk.gray(envConfig.secret.substring(0, 10))}...`);

          if (environment === 'live') {
            console.log('');
            console.log(chalk.yellow('⚠️  You are now using LIVE environment!'));
            console.log(chalk.gray('All API calls will affect real payments.'));
          }
        } catch (error) {
          spinner.stop();
          const err = error as Error;
          console.error(chalk.red('❌ Failed to switch environment:'), err.message);
          process.exit(1);
        }
      })
  )
  .addCommand(
    new Command('current').description('Show current environment').action(async () => {
      const configManager = new ConfigManager();

      try {
        const config = await configManager.load();

        if (!config) {
          console.log(chalk.yellow('No PayMongo configuration found.'));
          console.log(chalk.gray("Run 'paymongo init' to set up your project first."));
          return;
        }

        const env = config.environment;
        const envConfig = config.apiKeys[env];

        console.log(chalk.bold('Current Environment:'));
        console.log(`Environment: ${chalk.cyan(env.toUpperCase())}`);
        console.log(
          `Public Key: ${envConfig?.public ? chalk.gray(envConfig.public.substring(0, 10) + '...') : chalk.red('Not set')}`
        );
        console.log(
          `Secret Key: ${envConfig?.secret ? chalk.gray(envConfig.secret.substring(0, 10) + '...') : chalk.red('Not set')}`
        );

        if (env === 'live') {
          console.log('');
          console.log(chalk.yellow('⚠️  You are using LIVE environment!'));
        }
      } catch (error) {
        const err = error as Error;
        console.error(chalk.red('❌ Failed to get current environment:'), err.message);
        process.exit(1);
      }
    })
  );

export default command;
