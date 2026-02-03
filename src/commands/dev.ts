import { Command } from 'commander';
import * as fs from 'fs';
import { spawn } from 'child_process';
import chalk from 'chalk';
import ConfigManager from '../services/config/manager.js';
import ApiClient from '../services/api/client.js';
import Spinner from '../utils/spinner.js';
import { withRetry } from '../utils/errors.js';
import { TunnelInfo } from '../types/paymongo.js';
import { DevProcessManager } from '../services/dev/process-manager.js';
import { DevServer } from '../services/dev/server.js';

// Import subcommands
import statusCommand from './dev/status.js';
import stopCommand from './dev/stop.js';
import logsCommand from './dev/logs.js';

interface DevOptions {
  port?: string;
  noRegister?: boolean;
  events?: string;
  ngrokToken?: string;
  detach?: boolean;
}

const command = new Command('dev');

command
  .description('Start local development server')
  .option('-p, --port <port>', 'Port to run the webhook server on', '3000')
  .option('--no-register', 'Skip automatic webhook registration')
  .option(
    '-e, --events <events>',
    'Comma-separated events to listen for',
    'payment.paid,payment.failed'
  )
  .option('--ngrok-token <token>', 'ngrok authtoken (if not set in environment)')
  .option('-d, --detach', 'Run server in background (detached mode)')
  .action(async (options: DevOptions) => {
    const spinner = new Spinner();
    const configManager = new ConfigManager();
    let tunnel: TunnelInfo | undefined;

    // Check if detach mode is requested
    if (options.detach) {
      // Check if already running
      const existingState = DevProcessManager.loadState();
      if (existingState && DevProcessManager.isProcessRunning(existingState.pid)) {
        console.log(chalk.yellow('⚠️  Dev server is already running in background'));
        console.log('');
        console.log(chalk.bold('Status:'));
        console.log(chalk.gray('  PID:'), existingState.pid);
        console.log(chalk.gray('  Port:'), existingState.port);
        console.log(chalk.gray('  Tunnel:'), existingState.tunnelUrl);
        console.log(
          chalk.gray('  Uptime:'),
          DevProcessManager.formatUptime(existingState.startedAt)
        );
        console.log('');
        console.log(chalk.gray('Use "paymongo dev stop" to stop the server first.'));
        return;
      }

      // Spawn detached process
      const args = ['dist/index.js', 'dev', '--port', options.port || '3000'];
      if (options.noRegister) {
        args.push('--no-register');
      }
      if (options.events) {
        args.push('--events', options.events);
      }
      if (options.ngrokToken) {
        args.push('--ngrok-token', options.ngrokToken);
      }

      const logFile = DevProcessManager.getLogFile();
      const out = fs.openSync(logFile, 'a');
      const err = fs.openSync(logFile, 'a');

      const child = spawn(process.execPath, args, {
        detached: true,
        stdio: ['ignore', out, err],
        cwd: process.cwd(),
        env: { ...process.env, FORCE_COLOR: '1' },
      });

      child.unref();

      console.log(chalk.green('✓'), 'Dev server starting in background...');
      console.log(chalk.gray('  PID:'), child.pid);
      console.log(chalk.gray('  Logs:'), logFile);
      console.log('');
      console.log(chalk.gray('Use "paymongo dev status" to check server status'));
      console.log(chalk.gray('Use "paymongo dev stop" to stop the server'));
      console.log(chalk.gray('Use "paymongo dev logs" to view server logs'));

      // Give the server a moment to start, then exit
      await new Promise((resolve) => setTimeout(resolve, 500));
      return;
    }

    try {
      // Load configuration
      spinner.start('Loading configuration...');
      const config = await configManager.load();

      if (!config) {
        spinner.fail('No configuration found');
        console.log(chalk.yellow('No PayMongo configuration found.'));
        console.log(chalk.gray("Run 'paymongo init' to set up your project first."));
        return;
      }

      spinner.succeed('Configuration loaded');

      // Start ngrok tunnel
      spinner.start('Creating tunnel...');
      const port = parseInt(options.port || '3000');

      // Lazy load ngrok to reduce startup time
      const { default: ngrok } = await import('@ngrok/ngrok');

      const tunnelUrl = await withRetry(
        async () => {
          try {
            // Try to get authtoken from command line option or environment
            const authtoken = options.ngrokToken || process.env.NGROK_AUTHTOKEN;

            if (!authtoken) {
              throw new Error(
                'ngrok authtoken not found. Please either:\n' +
                '  1. Set NGROK_AUTHTOKEN environment variable, or\n' +
                '  2. Use --ngrok-token option: paymongo dev --ngrok-token YOUR_TOKEN\n' +
                '  Get your token from: https://dashboard.ngrok.com/get-started/your-authtoken'
              );
            }

            tunnel = await ngrok.forward({
              addr: port,
              authtoken: authtoken,
            });
            return tunnel.url();
          } catch (error) {
            console.log(chalk.yellow('Debug: ngrok error details:'), (error as Error).message);
            throw error;
          }
        },
        {
          maxRetries: 3,
          delayMs: 2000,
          retryCondition: (error: Error) => {
            // Retry on network errors and common ngrok issues
            return (
              error.message.includes('connection') ||
              error.message.includes('timeout') ||
              error.message.includes('tunnel') ||
              error.message.includes('ngrok') ||
              error.message.includes('authtoken')
            );
          },
        }
      );
      spinner.succeed('Tunnel created');

      // Start webhook server
      const devServer = new DevServer(port, config);
      await devServer.start();

      // Clean up any stale webhooks from previous sessions
      if (config.registeredWebhooks && config.registeredWebhooks.length > 0) {
        spinner.start('Cleaning up stale webhooks...');
        const apiClient = new ApiClient({ config });
        let cleanedCount = 0;
        for (const webhook of config.registeredWebhooks) {
          try {
            await apiClient.deleteWebhook(webhook.id);
            cleanedCount++;
          } catch {
            // Webhook may already be deleted, ignore errors
          }
        }
        config.registeredWebhooks = [];
        await configManager.save(config);
        if (cleanedCount > 0) {
          spinner.succeed(`Cleaned up ${cleanedCount} stale webhook(s)`);
        } else {
          spinner.succeed('No stale webhooks to clean up');
        }
      }

      // Register webhook (unless disabled)
      let webhookId: string | undefined;
      const shouldRegister = !options.noRegister && config.dev.autoRegisterWebhook !== false;
      if (shouldRegister) {
        spinner.start('Registering webhook...');
        const events = (options.events || 'payment.paid,payment.failed').split(',');
        // Use project-specific webhook path
        const projectSlug = config.projectName.toLowerCase().replace(/[^a-z0-9]/g, '-');
        const webhookUrl = `${tunnelUrl}/webhook/${projectSlug}`;

        try {
          const webhook = await new ApiClient({ config }).createWebhook(webhookUrl, events);
          webhookId = webhook.id;

          // Store webhook secret and track registered webhook
          if (webhook.attributes?.secret) {
            config.webhookSecrets = config.webhookSecrets || {};
            config.webhookSecrets[webhook.id] = webhook.attributes.secret;
          }

          // Track this webhook for project-specific cleanup
          config.registeredWebhooks = config.registeredWebhooks || [];
          config.registeredWebhooks.push({
            id: webhook.id,
            url: webhookUrl,
            createdAt: Date.now(),
          });
          await configManager.save(config);

          if (webhook.attributes?.secret) {
            spinner.succeed(`Webhook registered: ${webhookId} (with signature verification)`);
          } else {
            spinner.succeed(`Webhook registered: ${webhookId}`);
          }
        } catch (error) {
          const err = error as Error;
          spinner.warn('Webhook registration failed - server will start without webhook');

          console.log(chalk.yellow('⚠️'), 'Webhook registration failed:', err.message);
          console.log('');
          console.log(chalk.blue('ℹ️'), 'You can still test webhooks manually:');
          console.log(chalk.gray(`   Webhook URL: ${webhookUrl}`));
          console.log(chalk.gray('   Copy this URL to your PayMongo dashboard'));
          console.log('');

          if (err.message.includes('API key') || err.message.includes('unauthorized')) {
            console.log(chalk.yellow('💡 To fix webhook registration:'));
            console.log(chalk.gray('   1. Run "paymongo login" to update your API keys'));
            console.log(chalk.gray('   2. Restart the development server'));
          }
        }
      }

      // Display status
      const projectSlug = config.projectName.toLowerCase().replace(/[^a-z0-9]/g, '-');
      const localWebhookUrl = `http://localhost:${port}/webhook/${projectSlug}`;
      const externalWebhookUrl = `${tunnelUrl}/webhook/${projectSlug}`;

      console.log('\n' + chalk.green('🚀 PayMongo Development Server'));
      console.log('');
      console.log(chalk.bold('URLs:'));
      console.log(chalk.gray('  ├─'), chalk.cyan('External (PayMongo sends here):'));
      console.log(chalk.gray('  │  '), chalk.yellow(externalWebhookUrl));
      console.log(chalk.gray('  │'));
      console.log(chalk.gray('  └─'), chalk.cyan('Local (Your server receives here):'));
      console.log(chalk.gray('     '), chalk.green(localWebhookUrl));
      console.log('');
      console.log(chalk.bold('Forwarding:'));
      console.log(
        chalk.gray('  '),
        `${chalk.yellow(tunnelUrl)} ${chalk.gray('→')} ${chalk.green(`http://localhost:${port}`)}`
      );
      console.log('');
      if (webhookId) {
        console.log(chalk.bold('Webhook ID:'), chalk.gray(webhookId));
      }
      console.log(
        chalk.bold('Events:'),
        (options.events || 'payment.paid,payment.failed').split(',').join(', ')
      );
      console.log('');
      console.log(
        chalk.gray(
          '💡 Tip: Use the External URL in PayMongo dashboard, requests will forward to your local server'
        )
      );
      console.log(chalk.gray('Press Ctrl+C to stop'));

      // Save state for background process management
      DevProcessManager.saveState({
        pid: process.pid,
        port,
        tunnelUrl: tunnelUrl ?? '',
        webhookId,
        webhookUrl: externalWebhookUrl,
        localUrl: localWebhookUrl,
        events: (options.events || 'payment.paid,payment.failed').split(','),
        startedAt: Date.now(),
        projectName: config.projectName,
      });

      // Handle cleanup on exit
      const cleanup = async () => {
        console.log('\n' + chalk.yellow('Shutting down...'));

        // Clear saved state
        DevProcessManager.clearState();

        try {
          // Disconnect ngrok
          if (tunnel) {
            await tunnel.close();
            console.log(chalk.yellow('✓'), 'Tunnel closed');
          }

          // Stop server
          await devServer.stop();

          // Delete webhook and remove from tracked list
          if (webhookId) {
            spinner.start('Cleaning up webhook...');
            await new ApiClient({ config }).deleteWebhook(webhookId);

            // Remove from tracked webhooks
            if (config.registeredWebhooks) {
              config.registeredWebhooks = config.registeredWebhooks.filter(
                (w) => w.id !== webhookId
              );
              delete config.webhookSecrets[webhookId];
              await configManager.save(config);
            }
            spinner.succeed('Webhook deleted');
          }
        } catch (error) {
          console.error(chalk.red('Error during cleanup:'), (error as Error).message);
          console.log(chalk.yellow('⚠️'), 'Some cleanup tasks may not have completed');
        }

        process.exit(0);
      };

      process.on('SIGINT', cleanup);
      process.on('SIGTERM', cleanup);

      // Keep the process running
      await new Promise(() => { }); // Never resolves
    } catch (error) {
      spinner.stop();
      const err = error as Error;

      // Provide actionable error messages based on error type
      if (err.message.includes('ngrok') || err.message.includes('tunnel')) {
        console.error(chalk.red('❌ Failed to create tunnel:'), err.message);
        console.log('');
        console.log(chalk.yellow('💡 Troubleshooting suggestions:'));
        console.log(chalk.gray('• Check your internet connection'));
        console.log(chalk.gray('• Make sure ngrok is not blocked by firewall/antivirus'));
        console.log(chalk.gray('• Set up ngrok authentication: export NGROK_AUTHTOKEN=your_token'));
        console.log(
          chalk.gray(
            '• Get your authtoken from: https://dashboard.ngrok.com/get-started/your-authtoken'
          )
        );
        console.log(chalk.gray('• Try a different port: paymongo dev --port 3001'));
        console.log(chalk.gray('• Visit https://ngrok.com for status updates'));
      }

      // Cleanup on error
      DevProcessManager.clearState();
      try {
        if (tunnel) {
          await tunnel.close();
        }
      } catch {
        // Ignore cleanup errors during shutdown
      }

      process.exit(1);
    }
  });

// Register subcommands
command.addCommand(statusCommand);
command.addCommand(stopCommand);
command.addCommand(logsCommand);

export { command, DevServer };
