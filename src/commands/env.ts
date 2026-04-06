import chalk from 'chalk';
import { Command } from 'commander';
import { ApiKeyError, CommandError, NetworkError, PayMongoError } from '../utils/errors.js';
import {
  createApiClient,
  createCommandContext,
  loadCommandConfig,
  showNoConfigMessage,
} from './shared/runtime.js';

const command = new Command('env');

command
  .description('Manage PayMongo environments')
  .addCommand(
    new Command('switch')
      .description('Switch between test and live environments')
      .arguments('<environment>')
      .option('-f, --force', 'Skip API key validation')
      .action(async (environment, options) => {
        const { spinner, configManager } = createCommandContext();

        try {
          // Validate environment
          if (!['test', 'live'].includes(environment)) {
            console.error(chalk.red('❌ Invalid environment. Must be "test" or "live"'));
            throw new CommandError();
          }

          const config = await loadCommandConfig(spinner, configManager);
          if (!config) {
            return;
          }

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
            throw new CommandError();
          }

          // Validate API keys unless --force is used
          if (!options.force) {
            spinner.start('Validating API keys...');
            const testConfig = { ...config, environment: environment as 'test' | 'live' };
            const apiClient = createApiClient(testConfig);

            try {
              await apiClient.validateApiKey();
              spinner.succeed('API keys validated');
            } catch (error) {
              spinner.fail('API key validation failed');
              console.log('');
              console.log(chalk.red('❌ Invalid API keys for the target environment.'));

              if (error instanceof ApiKeyError) {
                console.log(chalk.gray('The API keys appear to be invalid or expired.'));
              } else if (error instanceof NetworkError) {
                console.log(
                  chalk.gray('Network connectivity issue. Please check your internet connection.')
                );
              } else if (error instanceof PayMongoError) {
                if (error.statusCode && error.statusCode >= 500) {
                  console.log(chalk.gray('PayMongo API is currently unavailable.'));
                } else if (error.statusCode && error.statusCode === 429) {
                  console.log(chalk.gray('Too many requests. Please wait a moment.'));
                } else {
                  console.log(chalk.gray(`API error: ${error.message}`));
                }
              } else {
                console.log(chalk.gray('Unexpected validation error.'));
              }

              console.log('');
              console.log(
                chalk.gray('Use --force to skip validation, but note that commands may fail.')
              );
              console.log('');
              console.log(
                chalk.yellow('💡 Get your API keys from: https://dashboard.paymongo.com/developers')
              );
              throw new CommandError();
            }
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
          throw new CommandError();
        }
      })
  )
  .addCommand(
    new Command('current').description('Show current environment').action(async () => {
      const { configManager } = createCommandContext();

      try {
        const config = await configManager.load();

        if (!config) {
          showNoConfigMessage();
          return;
        }

        const env = config.environment;
        const envConfig = config.apiKeys[env];

        console.log(chalk.bold('Current Environment:'));
        console.log(`Environment: ${chalk.cyan(env.toUpperCase())}`);
        console.log(
          `Public Key: ${envConfig?.public ? chalk.gray(`${envConfig.public.substring(0, 10)}...`) : chalk.red('Not set')}`
        );
        console.log(
          `Secret Key: ${envConfig?.secret ? chalk.gray(`${envConfig.secret.substring(0, 10)}...`) : chalk.red('Not set')}`
        );

        if (env === 'live') {
          console.log('');
          console.log(chalk.yellow('⚠️  You are using LIVE environment!'));
        }
      } catch (error) {
        const err = error as Error;
        console.error(chalk.red('❌ Failed to get current environment:'), err.message);
        throw new CommandError();
      }
    })
  );

export default command;
