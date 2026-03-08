import chalk from 'chalk';
import { validateConfig as zodValidateConfig } from '../../types/schemas.js';
import { PayMongoConfig } from '../../types/paymongo.js';
import ConfigManager from '../../services/config/manager.js';
import Spinner from '../../utils/spinner.js';
import { CommandError } from '../../utils/errors.js';

export const CONFIG_KEY_MAPPINGS: Record<string, string> = {
  'project.name': 'projectName',
  'webhook.url': 'webhooks.url',
  'webhook.events': 'webhooks.events',
  'dev.port': 'dev.port',
  'dev.autoRegister': 'dev.autoRegisterWebhook',
  'dev.verifySignatures': 'dev.verifyWebhookSignatures',
  'rateLimit.enabled': 'rateLimiting.enabled',
  'rateLimit.maxRequests': 'rateLimiting.maxRequests',
  'rateLimit.windowMs': 'rateLimiting.windowMs',
};

export function createConfigContext(): { spinner: Spinner; configManager: ConfigManager } {
  return {
    spinner: new Spinner(),
    configManager: new ConfigManager(),
  };
}

export function showNoConfigMessage(
  message: string = "Run 'paymongo init' to set up your project first."
): void {
  console.log(chalk.yellow('No PayMongo configuration found.'));
  console.log(chalk.gray(message));
}

export async function loadRequiredConfig(
  spinner: Spinner,
  configManager: ConfigManager,
  loadingText: string = 'Loading configuration...'
): Promise<PayMongoConfig | null> {
  spinner.start(loadingText);
  const config = await configManager.load();
  if (!config) {
    spinner.fail('No configuration found');
    showNoConfigMessage();
    return null;
  }

  spinner.succeed('Configuration loaded');
  return config;
}

export function handleCommandFailure(prefix: string, error: unknown): never {
  const err = error as Error;
  console.error(chalk.red(prefix), err.message);
  throw new CommandError();
}

export function validateImportedConfig(config: unknown): asserts config is PayMongoConfig {
  if (typeof config !== 'object' || config === null) {
    throw new Error('Configuration must be an object');
  }

  const cfg = config as Record<string, unknown>;
  const requiredFields = ['version', 'projectName', 'environment', 'apiKeys', 'webhooks', 'dev'];

  for (const field of requiredFields) {
    if (!(field in cfg)) {
      throw new Error(`Missing required field: ${field}`);
    }
  }

  if (typeof cfg.version !== 'string') {
    throw new Error('Version must be a string');
  }

  if (typeof cfg.projectName !== 'string' || cfg.projectName.trim() === '') {
    throw new Error('Project name must be a non-empty string');
  }

  if (cfg.environment !== 'test' && cfg.environment !== 'live') {
    throw new Error('Environment must be either "test" or "live"');
  }

  if (typeof cfg.apiKeys !== 'object' || cfg.apiKeys === null) {
    throw new Error('API keys must be an object');
  }

  if (typeof cfg.webhooks !== 'object' || cfg.webhooks === null) {
    throw new Error('Webhooks must be an object');
  }

  const webhooks = cfg.webhooks as Record<string, unknown>;
  if (!Array.isArray(webhooks.events)) {
    throw new Error('Webhook events must be an array');
  }

  if (typeof cfg.dev !== 'object' || cfg.dev === null) {
    throw new Error('Dev config must be an object');
  }

  const dev = cfg.dev as Record<string, unknown>;
  if (typeof dev.port !== 'number' || dev.port < 1 || dev.port > 65535) {
    throw new Error('Dev port must be a valid port number (1-65535)');
  }
}

export function validateImportedConfigWithSchema(config: unknown): string[] {
  const validation = zodValidateConfig(config);
  return validation.success ? [] : (validation.errors ?? []);
}

export function checkConfigConflicts(existing: PayMongoConfig, imported: PayMongoConfig): string[] {
  const conflicts: string[] = [];

  if (existing.apiKeys && imported.apiKeys) {
    if (existing.apiKeys.test?.public !== imported.apiKeys.test?.public) {
      conflicts.push('Test environment public API key differs');
    }
    if (existing.apiKeys.test?.secret !== imported.apiKeys.test?.secret) {
      conflicts.push('Test environment secret API key differs');
    }
    if (existing.apiKeys.live?.public !== imported.apiKeys.live?.public) {
      conflicts.push('Live environment public API key differs');
    }
    if (existing.apiKeys.live?.secret !== imported.apiKeys.live?.secret) {
      conflicts.push('Live environment secret API key differs');
    }
  }

  if (existing.webhooks?.url !== imported.webhooks?.url) {
    conflicts.push('Webhook URL differs');
  }

  if (existing.environment !== imported.environment) {
    conflicts.push('Environment setting differs');
  }

  if (existing.projectName !== imported.projectName) {
    conflicts.push('Project name differs');
  }

  return conflicts;
}

export function setConfigValue(config: PayMongoConfig, key: string, value: string): void {
  const mappedKey = CONFIG_KEY_MAPPINGS[key] || key;
  const keys = mappedKey.split('.');
  let current: Record<string, unknown> = config as unknown as Record<string, unknown>;

  for (let i = 0; i < keys.length - 1; i++) {
    const segment = keys[i];
    if (segment && !current[segment]) {
      current[segment] = {};
    }
    if (segment) {
      current = current[segment] as Record<string, unknown>;
    }
  }

  const finalKey = keys[keys.length - 1];
  if (!finalKey) {
    throw new Error('Invalid key path');
  }

  current[finalKey] = coerceConfigValue(value);
}

export function coerceConfigValue(value: string): boolean | number | string {
  if (value === 'true') {
    return true;
  }
  if (value === 'false') {
    return false;
  }
  if (!isNaN(Number(value))) {
    return Number(value);
  }
  return value;
}

export function ensureRateLimitingConfig(
  config: PayMongoConfig
): NonNullable<PayMongoConfig['rateLimiting']> {
  if (!config.rateLimiting) {
    config.rateLimiting = {
      enabled: true,
      maxRequests: 100,
      windowMs: 60000,
      environmentMultiplier: 0.5,
    };
  }

  return config.rateLimiting;
}
