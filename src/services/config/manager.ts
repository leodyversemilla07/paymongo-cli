import * as fs from 'fs';
import * as path from 'path';
import { cosmiconfig } from 'cosmiconfig';
import { ConfigManagerOptions, PayMongoConfig } from '../../types/paymongo';
import { ConfigError, ValidationError } from '../../utils/errors';

const CONFIG_FILE_NAME = '.paymongo';

export class ConfigManager {
  private explorer = cosmiconfig('paymongo');
  private configPath: string;
  private configCache: Map<string, { config: PayMongoConfig; mtime: number }> = new Map();

  constructor(options: ConfigManagerOptions = {}) {
    this.configPath = options.configPath || path.join(process.cwd(), CONFIG_FILE_NAME);
  }

  async load(): Promise<PayMongoConfig | null> {
    try {
      // Check if we have a cached version
      const cached = this.configCache.get(this.configPath);
      if (cached) {
        // Check if file has been modified since caching
        try {
          const stats = fs.statSync(this.configPath);
          if (stats.mtime.getTime() === cached.mtime) {
            return cached.config;
          }
        } catch {
          // File might not exist, continue with loading
        }
      }

      const result = await this.explorer.load(this.configPath);
      const config = result?.config;

      if (!config) {
        return null;
      }

      // Validate required fields
      this.validateConfig(config);

      // Cache the config with file modification time
      try {
        const stats = fs.statSync(this.configPath);
        this.configCache.set(this.configPath, {
          config,
          mtime: stats.mtime.getTime(),
        });
      } catch {
        // If we can't get stats, just don't cache
      }

      return config;
    } catch (error) {
      if ((error as any).code === 'ENOENT') {
        return null;
      }

      // If it's already a ConfigError or ValidationError, re-throw
      if (error instanceof ConfigError || error instanceof ValidationError) {
        throw error;
      }

      throw new ConfigError(`Failed to load config: ${(error as Error).message}`, this.configPath);
    }
  }

  async save(config: PayMongoConfig): Promise<void> {
    try {
      // Ensure directory exists
      const dir = path.dirname(this.configPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      // Write config file
      const configContent = JSON.stringify(config, null, 2);
      fs.writeFileSync(this.configPath, configContent, 'utf-8');

      // Update cache with new modification time
      try {
        const stats = fs.statSync(this.configPath);
        this.configCache.set(this.configPath, {
          config,
          mtime: stats.mtime.getTime(),
        });
      } catch {
        // If we can't get stats, clear cache
        this.configCache.delete(this.configPath);
      }
    } catch (error) {
      throw new ConfigError(`Failed to save config: ${(error as Error).message}`, this.configPath);
    }
  }

  async exists(): Promise<boolean> {
    try {
      await fs.promises.access(this.configPath);
      return true;
    } catch {
      return false;
    }
  }

  async delete(): Promise<void> {
    try {
      if (await this.exists()) {
        fs.unlinkSync(this.configPath);
      }
    } catch (error) {
      throw new ConfigError(
        `Failed to delete config: ${(error as Error).message}`,
        this.configPath
      );
    }
  }

  getDefaultConfig(): PayMongoConfig {
    return {
      version: '1.0',
      projectName: 'PayMongo Project',
      environment: 'test',
      apiKeys: {},
      webhooks: {
        url: `http://localhost:3000/webhook`,
        events: ['payment.paid', 'payment.failed'],
      },
      webhookSecrets: {},
      dev: {
        port: 3000,
        autoRegisterWebhook: true,
        verifyWebhookSignatures: false, // Default to false for development ease
      },
    };
  }

  private validateConfig(config: any): void {
    // Check required fields
    if (!config.version) {
      throw new ValidationError('Config file is missing required "version" field', 'version');
    }

    if (!config.projectName) {
      throw new ValidationError(
        'Config file is missing required "projectName" field',
        'projectName'
      );
    }

    if (!config.environment || !['test', 'live'].includes(config.environment)) {
      throw new ValidationError(
        'Config file has invalid "environment" field (must be "test" or "live")',
        'environment'
      );
    }

    // Check API keys structure
    if (!config.apiKeys || typeof config.apiKeys !== 'object') {
      throw new ValidationError('Config file is missing or has invalid "apiKeys" field', 'apiKeys');
    }

    const env = config.environment;
    if (!config.apiKeys[env]) {
      throw new ValidationError(
        `Config file is missing API keys for environment "${env}"`,
        `apiKeys.${env}`
      );
    }

    if (!config.apiKeys[env].secret) {
      throw new ValidationError(
        `Config file is missing secret API key for environment "${env}"`,
        `apiKeys.${env}.secret`
      );
    }

    // Check dev configuration
    if (!config.dev || typeof config.dev !== 'object') {
      throw new ValidationError('Config file is missing or has invalid "dev" field', 'dev');
    }
  }

  mergeConfig(base: PayMongoConfig, updates: Partial<PayMongoConfig>): PayMongoConfig {
    return {
      ...base,
      ...updates,
      apiKeys: {
        ...base.apiKeys,
        ...updates.apiKeys,
      },
      webhooks: {
        ...base.webhooks,
        ...updates.webhooks,
      },
      webhookSecrets: {
        ...base.webhookSecrets,
        ...updates.webhookSecrets,
      },
      dev: {
        ...base.dev,
        ...updates.dev,
      },
    };
  }
}

export default ConfigManager;
