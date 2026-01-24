import { Command } from 'commander';
import { ConfigManager } from '../services/config/manager';
import { ApiClient } from '../services/api/client';
import { WebServer } from '../services/web/server';
import { AnalyticsService } from '../services/analytics/service';
import Spinner from '../utils/spinner';
import chalk from 'chalk';

const command = new Command('gui')
  .description('Start the PayMongo GUI dashboard')
  .option('-p, --port <port>', 'Port to run the GUI server on', '8080')
  .option('-h, --host <host>', 'Host to bind the GUI server to', 'localhost')
  .action(async (options) => {
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

      spinner.start('Starting GUI dashboard...');

      const apiClient = new ApiClient({ config });
      const analyticsService = new AnalyticsService();
      const webServer = new WebServer({
        port: parseInt(options.port),
        host: options.host,
        configManager,
        apiClient,
        analyticsService,
      });

      await webServer.start();

      spinner.succeed('GUI dashboard started');

      console.log('');
      console.log(chalk.green('✓ PayMongo GUI Dashboard is running!'));
      console.log(chalk.blue(`🌐 Open your browser to: http://${options.host}:${options.port}`));
      console.log('');
      console.log(chalk.gray('Features:'));
      console.log(chalk.gray('• Real-time webhook monitoring'));
      console.log(chalk.gray('• Configuration management'));
      console.log(chalk.gray('• Webhook event history'));
      console.log('');
      console.log(chalk.gray('Press Ctrl+C to stop the server'));

      // Handle graceful shutdown
      process.on('SIGINT', async () => {
        console.log('');
        console.log(chalk.yellow('Shutting down GUI dashboard...'));
        await webServer.stop();
        process.exit(0);
      });

      process.on('SIGTERM', async () => {
        console.log('');
        console.log(chalk.yellow('Shutting down GUI dashboard...'));
        await webServer.stop();
        process.exit(0);
      });
    } catch (error) {
      spinner.stop();
      const err = error as Error;
      console.error(chalk.red('❌ Failed to start GUI dashboard:'), err.message);
      process.exit(1);
    }
  });

export default command;
