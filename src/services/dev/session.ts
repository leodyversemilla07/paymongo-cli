import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import chalk from 'chalk';
import type { PayMongoConfig, TunnelInfo, WebhookDataWithSecret } from '../../types/paymongo.js';
import { CommandError, ValidationError, withRetry } from '../../utils/errors.js';
import type Spinner from '../../utils/spinner.js';
import ApiClient from '../api/client.js';
import type ConfigManager from '../config/manager.js';
import {
  DEFAULT_FORWARD_TIMEOUT_MS,
  validateForwardTarget,
  validateForwardTimeout,
} from './forwarder.js';
import { DevProcessManager } from './process-manager.js';
import DevServer from './server.js';

export interface DevOptions {
  port?: string;
  register?: boolean;
  events?: string;
  ngrokToken?: string;
  forwardTo?: string;
  forwardTimeout?: string;
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
    let devServer: DevServer | undefined;
    let stateWriteStarted = false;

    try {
      const port = this.getPort(options);
      const forwardTimeoutMs = validateForwardTimeout(
        Number(options.forwardTimeout ?? DEFAULT_FORWARD_TIMEOUT_MS)
      );
      if (options.forwardTo !== undefined) validateForwardTarget(options.forwardTo, port);
      if (await this.handleDetachedStart(options)) return;
      const config = await this.loadConfig();
      if (!config) {
        return;
      }

      tunnel = await this.createTunnelWithStatus(port, options.ngrokToken);
      const tunnelUrl = tunnel.url() ?? '';

      if (options.forwardTo !== undefined)
        validateForwardTarget(options.forwardTo, port, tunnelUrl);
      devServer =
        options.forwardTo !== undefined
          ? new DevServer(port, config, { forwardTo: options.forwardTo, forwardTimeoutMs })
          : new DevServer(port, config);
      await devServer.start();

      if (options.register !== false && config.dev.autoRegisterWebhook !== false) {
        await this.cleanupStaleWebhooks(config);
      }
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

      stateWriteStarted = true;
      await this.saveState(
        config,
        options,
        port,
        tunnelUrl,
        webhookId,
        webhookUrl || externalWebhookUrl,
        localWebhookUrl
      );

      const activeServer = devServer;
      await new Promise<void>((resolve) => {
        const cleanup = this.createCleanupHandler(
          {
            config,
            devServer: activeServer,
            tunnel,
            webhookId,
          },
          () => {
            process.off('SIGINT', onSignal);
            process.off('SIGTERM', onSignal);
            resolve();
          }
        );
        const onSignal = () => {
          void cleanup();
        };
        process.once('SIGINT', onSignal);
        process.once('SIGTERM', onSignal);
      });
    } catch (error) {
      this.spinner.stop();
      const err = error as Error;
      if (err.message.includes('ngrok') || err.message.includes('tunnel'))
        this.printTunnelError(err);
      else console.error(chalk.red('Failed to start development session:'), err.message);
      await this.cleanupAfterStartupFailure(tunnel, devServer, stateWriteStarted);
      throw new CommandError();
    }
  }

  private getPort(options: DevOptions): number {
    const port = Number(options.port ?? '3000');
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new ValidationError('Listener port must be an integer between 1 and 65535');
    }
    return port;
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
    if (options.register === false) {
      args.push('--no-register');
    }
    if (options.events) {
      args.push('--events', options.events);
    }
    if (options.forwardTo !== undefined) {
      args.push('--forward-to', options.forwardTo);
      args.push('--forward-timeout', options.forwardTimeout ?? String(DEFAULT_FORWARD_TIMEOUT_MS));
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
    const shouldRegister = options.register !== false && config.dev.autoRegisterWebhook !== false;
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

      if (webhook.attributes?.secret_key) {
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
    if (webhook.attributes?.secret_key) {
      config.webhookSecrets = config.webhookSecrets || {};
      config.webhookSecrets[webhook.id] = webhook.attributes.secret_key;
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
    console.log(chalk.gray('  └─'), chalk.cyan('Local (CLI listener receives here):'));
    console.log(chalk.gray('     '), chalk.green(localWebhookUrl));
    console.log('');
    console.log(chalk.bold('Tunnel delivery:'));
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
        options.forwardTo !== undefined
          ? `Application forwarding enabled (timeout ${options.forwardTimeout ?? DEFAULT_FORWARD_TIMEOUT_MS}ms; original body/signature preserved)`
          : '💡 Tip: The tunnel delivers to this CLI listener. Use --forward-to to deliver to your application'
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
      ...(options.forwardTo !== undefined && {
        forwardingEnabled: true,
        forwardTimeoutMs: Number(options.forwardTimeout ?? DEFAULT_FORWARD_TIMEOUT_MS),
      }),
    });
  }

  private createCleanupHandler(
    { config, devServer, tunnel, webhookId }: CleanupResources,
    onComplete?: (() => void) | undefined
  ): () => Promise<void> {
    let cleanedUp = false;

    return async () => {
      if (cleanedUp) {
        return;
      }
      cleanedUp = true;

      console.log(`\n${chalk.yellow('Shutting down...')}`);
      const localCleanup = await Promise.allSettled([
        Promise.resolve().then(() => DevProcessManager.clearState()),
        Promise.resolve().then(() => tunnel?.close()),
        Promise.resolve().then(() => devServer.stop()),
      ]);
      if (tunnel && localCleanup[1]?.status === 'fulfilled')
        console.log(chalk.yellow('✓'), 'Tunnel closed');
      if (localCleanup.some((result) => result.status === 'rejected')) {
        console.error(chalk.yellow('Some local cleanup tasks may not have completed'));
      }

      try {
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

  private async cleanupAfterStartupFailure(
    tunnel?: TunnelInfo,
    devServer?: DevServer,
    clearState = false
  ): Promise<void> {
    await Promise.allSettled([
      Promise.resolve().then(() => (clearState ? DevProcessManager.clearState() : undefined)),
      Promise.resolve().then(() => devServer?.stop()),
      Promise.resolve().then(() => tunnel?.close()),
    ]);
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
