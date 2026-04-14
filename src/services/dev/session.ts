import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import chalk from 'chalk';
import type { PayMongoConfig, TunnelInfo, WebhookDataWithSecret } from '../../types/paymongo.js';
import { CommandError, withRetry } from '../../utils/errors.js';
import type Spinner from '../../utils/spinner.js';
import ApiClient from '../api/client.js';
import type ConfigManager from '../config/manager.js';
import { DevProcessManager } from './process-manager.js';
import DevServer from './server.js';

export interface DevOptions {
  port?: string;
  noRegister?: boolean;
  events?: string;
  ngrokToken?: string;
  detach?: boolean;
}

export interface DevSessionServiceDependencies {
  spinner: Spinner;
  configManager: ConfigManager;
  onMissingConfig?: (() => void) | undefined;
}

interface RegisteredWebhookResult {
  webhookId?: string;
  webhookUrl?: string;
}

interface CleanupResources {
  config: PayMongoConfig;
  devServer: DevServer;
  tunnel: TunnelInfo | undefined;
  webhookId: string | undefined;
}

export class DevSessionService {
  private readonly spinner: Spinner;
  private readonly configManager: ConfigManager;
  private readonly onMissingConfig: (() => void) | undefined;

  constructor({ spinner, configManager, onMissingConfig }: DevSessionServiceDependencies) {
    this.spinner = spinner;
    this.configManager = configManager;
    this.onMissingConfig = onMissingConfig;
  }

  async run(options: DevOptions): Promise<void> {
    let tunnel: TunnelInfo | undefined;

    if (await this.handleDetachedStart(options)) {
      return;
    }

    try {
      const config = await this.loadConfig();
      if (!config) {
        return;
      }

      const port = this.getPort(options);
      tunnel = await this.createTunnelWithStatus(port, options.ngrokToken);
      const tunnelUrl = tunnel.url() ?? '';

      const devServer = new DevServer(port, config);
      await devServer.start();

      await this.cleanupStaleWebhooks(config);
      const { webhookId, webhookUrl } = await this.registerWebhookIfNeeded(
        config,
        options,
        tunnelUrl
      );

      const { localWebhookUrl, externalWebhookUrl } = this.printStatus(
        config,
        options,
        port,
        tunnelUrl,
        webhookId
      );

      await this.saveState(
        config,
        options,
        port,
        tunnelUrl,
        webhookId,
        webhookUrl || externalWebhookUrl,
        localWebhookUrl
      );

      await new Promise<void>((resolve) => {
        const cleanup = this.createCleanupHandler(
          {
            config,
            devServer,
            tunnel,
            webhookId,
          },
          resolve
        );

        process.once('SIGINT', () => {
          void cleanup();
        });
        process.once('SIGTERM', () => {
          void cleanup();
        });
      });
    } catch (error) {
      this.spinner.stop();
      const err = error as Error;
      this.printTunnelError(err);
      await this.cleanupAfterStartupFailure(tunnel);
      throw new CommandError();
    }
  }

  private getPort(options: DevOptions): number {
    return parseInt(options.port || '3000', 10);
  }

  private getEvents(options: DevOptions): string[] {
    return (options.events || 'payment.paid,payment.failed').split(',');
  }

  private getProjectSlug(projectName: string): string {
    return projectName.toLowerCase().replace(/[^a-z0-9]/g, '-');
  }

  private buildWebhookUrls(projectName: string, port: number, tunnelUrl: string) {
    const projectSlug = this.getProjectSlug(projectName);
    return {
      localWebhookUrl: `http://localhost:${port}/webhook/${projectSlug}`,
      externalWebhookUrl: `${tunnelUrl}/webhook/${projectSlug}`,
    };
  }

  private async handleDetachedStart(options: DevOptions): Promise<boolean> {
    if (!options.detach) {
      return false;
    }

    const existingState = await DevProcessManager.loadState();
    if (existingState && DevProcessManager.isProcessRunning(existingState.pid)) {
      console.log(chalk.yellow('⚠️  Dev server is already running in background'));
      console.log('');
      console.log(chalk.bold('Status:'));
      console.log(chalk.gray('  PID:'), existingState.pid);
      console.log(chalk.gray('  Port:'), existingState.port);
      console.log(chalk.gray('  Tunnel:'), existingState.tunnelUrl);
      console.log(chalk.gray('  Uptime:'), DevProcessManager.formatUptime(existingState.startedAt));
      console.log('');
      console.log(chalk.gray('Use "paymongo dev stop" to stop the server first.'));
      return true;
    }

    const entryScript = process.argv[1];
    if (!entryScript) {
      throw new Error('Unable to determine the current CLI entrypoint for detached mode');
    }

    const args = [entryScript, 'dev', '--port', options.port || '3000'];
    if (options.noRegister) {
      args.push('--no-register');
    }
    if (options.events) {
      args.push('--events', options.events);
    }
    if (options.ngrokToken) {
      args.push('--ngrok-token', options.ngrokToken);
    }

    const logFile = await DevProcessManager.getLogFile();
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

    await new Promise((resolve) => {
      setTimeout(resolve, 500);
    });

    return true;
  }

  private async loadConfig(): Promise<PayMongoConfig | null> {
    this.spinner.start('Loading configuration...');
    const config = await this.configManager.load();

    if (!config) {
      this.spinner.fail('No configuration found');
      this.onMissingConfig?.();
      return null;
    }

    this.spinner.succeed('Configuration loaded');
    return config;
  }

  private async createTunnelWithStatus(port: number, ngrokToken?: string): Promise<TunnelInfo> {
    this.spinner.start('Creating tunnel...');
    const tunnel = await this.createTunnel(port, ngrokToken);
    this.spinner.succeed('Tunnel created');
    return tunnel;
  }

  private async createTunnel(port: number, ngrokToken?: string): Promise<TunnelInfo> {
    const { default: ngrok } = await import('@ngrok/ngrok');

    return withRetry(
      async () => {
        const authtoken = ngrokToken || process.env.NGROK_AUTHTOKEN;

        if (!authtoken) {
          throw new Error(
            'ngrok authtoken not found. Please either:\n' +
              '  1. Set NGROK_AUTHTOKEN environment variable, or\n' +
              '  2. Use --ngrok-token option: paymongo dev --ngrok-token YOUR_TOKEN\n' +
              '  Get your token from: https://dashboard.ngrok.com/get-started/your-authtoken'
          );
        }

        const tunnel = await ngrok.forward({
          addr: port,
          authtoken,
        });

        return tunnel as TunnelInfo;
      },
      {
        maxRetries: 3,
        delayMs: 2000,
        retryCondition: (error: Error) => {
          return (
            error.message.includes('connection') ||
            error.message.includes('timeout') ||
            error.message.includes('tunnel') ||
            error.message.includes('ngrok')
          );
        },
      }
    );
  }

  private async cleanupStaleWebhooks(config: PayMongoConfig): Promise<void> {
    if (!config.registeredWebhooks || config.registeredWebhooks.length === 0) {
      return;
    }

    this.spinner.start('Cleaning up stale webhooks...');
    const apiClient = new ApiClient({ config });
    let cleanedCount = 0;

    for (const webhook of config.registeredWebhooks) {
      try {
        await apiClient.disableWebhook(webhook.id);
        cleanedCount++;
      } catch {
        // Webhook may already be disabled, ignore errors
      }
    }

    config.registeredWebhooks = [];
    await this.configManager.save(config);

    if (cleanedCount > 0) {
      this.spinner.succeed(`Cleaned up ${cleanedCount} stale webhook(s)`);
    } else {
      this.spinner.succeed('No stale webhooks to clean up');
    }
  }

  private async registerWebhookIfNeeded(
    config: PayMongoConfig,
    options: DevOptions,
    tunnelUrl: string
  ): Promise<RegisteredWebhookResult> {
    const shouldRegister = !options.noRegister && config.dev.autoRegisterWebhook !== false;
    if (!shouldRegister) {
      return {};
    }

    this.spinner.start('Registering webhook...');
    const events = this.getEvents(options);
    const { externalWebhookUrl } = this.buildWebhookUrls(
      config.projectName,
      this.getPort(options),
      tunnelUrl
    );

    try {
      const webhook = (await new ApiClient({ config }).createWebhook(
        externalWebhookUrl,
        events
      )) as WebhookDataWithSecret;

      await this.persistRegisteredWebhook(config, webhook, externalWebhookUrl);

      if (webhook.attributes?.secret) {
        this.spinner.succeed(`Webhook registered: ${webhook.id} (with signature verification)`);
      } else {
        this.spinner.succeed(`Webhook registered: ${webhook.id}`);
      }

      return {
        webhookId: webhook.id,
        webhookUrl: externalWebhookUrl,
      };
    } catch (error) {
      const err = error as Error;
      this.spinner.warn('Webhook registration failed - server will start without webhook');
      this.printWebhookRegistrationFailure(err, externalWebhookUrl, config);
      return {
        webhookUrl: externalWebhookUrl,
      };
    }
  }

  private async persistRegisteredWebhook(
    config: PayMongoConfig,
    webhook: WebhookDataWithSecret,
    webhookUrl: string
  ): Promise<void> {
    if (webhook.attributes?.secret) {
      config.webhookSecrets = config.webhookSecrets || {};
      config.webhookSecrets[webhook.id] = webhook.attributes.secret;
    }

    config.registeredWebhooks = config.registeredWebhooks || [];
    config.registeredWebhooks.push({
      id: webhook.id,
      url: webhookUrl,
      createdAt: Date.now(),
    });

    await this.configManager.save(config);
  }

  private printWebhookRegistrationFailure(
    error: Error,
    webhookUrl: string,
    config: PayMongoConfig
  ): void {
    console.log(chalk.yellow('⚠️'), 'Webhook registration failed:', error.message);
    console.log('');
    console.log(chalk.blue('ℹ️'), 'You can still test webhooks manually:');
    console.log(chalk.gray(`   Webhook URL: ${webhookUrl}`));
    console.log(chalk.gray('   Copy this URL to your PayMongo dashboard'));

    if (config.dev.verifyWebhookSignatures) {
      console.log(chalk.gray('   Signature verification is currently enabled'));
      console.log(
        chalk.gray(
          '   For manual unsigned testing, run: paymongo config set dev.verifyWebhookSignatures false'
        )
      );
    }

    console.log('');

    if (error.message.includes('API key') || error.message.includes('unauthorized')) {
      console.log(chalk.yellow('💡 To fix webhook registration:'));
      console.log(chalk.gray('   1. Run "paymongo login" to update your API keys'));
      console.log(chalk.gray('   2. Restart the development server'));
    }
  }

  private printStatus(
    config: PayMongoConfig,
    options: DevOptions,
    port: number,
    tunnelUrl: string,
    webhookId?: string
  ): { localWebhookUrl: string; externalWebhookUrl: string } {
    const { localWebhookUrl, externalWebhookUrl } = this.buildWebhookUrls(
      config.projectName,
      port,
      tunnelUrl
    );

    console.log(`\n${chalk.green('🚀 PayMongo Development Server')}`);
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

    console.log(chalk.bold('Events:'), this.getEvents(options).join(', '));
    console.log('');
    console.log(
      chalk.gray(
        '💡 Tip: Use the External URL in PayMongo dashboard, requests will forward to your local server'
      )
    );
    console.log(chalk.gray('Press Ctrl+C to stop'));

    return { localWebhookUrl, externalWebhookUrl };
  }

  private async saveState(
    config: PayMongoConfig,
    options: DevOptions,
    port: number,
    tunnelUrl: string,
    webhookId: string | undefined,
    webhookUrl: string,
    localUrl: string
  ): Promise<void> {
    await DevProcessManager.saveState({
      pid: process.pid,
      port,
      tunnelUrl,
      webhookId,
      webhookUrl,
      localUrl,
      events: this.getEvents(options),
      startedAt: Date.now(),
      projectName: config.projectName,
    });
  }

  private createCleanupHandler(
    {
      config,
      devServer,
      tunnel,
      webhookId,
    }: CleanupResources,
    onComplete?: (() => void) | undefined
  ): () => Promise<void> {
    let cleanedUp = false;

    return async () => {
      if (cleanedUp) {
        return;
      }
      cleanedUp = true;

      console.log(`\n${chalk.yellow('Shutting down...')}`);
      await DevProcessManager.clearState();

      try {
        if (tunnel) {
          await tunnel.close();
          console.log(chalk.yellow('✓'), 'Tunnel closed');
        }

        await devServer.stop();

        if (webhookId) {
          this.spinner.start('Cleaning up webhook...');
          await new ApiClient({ config }).disableWebhook(webhookId);

          if (config.registeredWebhooks) {
            config.registeredWebhooks = config.registeredWebhooks.filter((webhook) => {
              return webhook.id !== webhookId;
            });
            if (config.webhookSecrets) {
              delete config.webhookSecrets[webhookId];
            }
            await this.configManager.save(config);
          }

          this.spinner.succeed('Webhook disabled');
        }
      } catch (error) {
        console.error(chalk.red('Error during cleanup:'), (error as Error).message);
        console.log(chalk.yellow('⚠️'), 'Some cleanup tasks may not have completed');
      }

      onComplete?.();
    };
  }

  private async cleanupAfterStartupFailure(tunnel?: TunnelInfo): Promise<void> {
    await DevProcessManager.clearState();

    try {
      if (tunnel) {
        await tunnel.close();
      }
    } catch {
      // Ignore cleanup errors during shutdown
    }
  }

  private printTunnelError(error: Error): void {
    if (!error.message.includes('ngrok') && !error.message.includes('tunnel')) {
      return;
    }

    console.error(chalk.red('❌ Failed to create tunnel:'), error.message);
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
}

export default DevSessionService;
