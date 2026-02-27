import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

// Mock modules before importing config command
const mockConfigManagerLoad = jest.fn<() => Promise<any>>();
const mockConfigManagerSave = jest.fn<(config: any) => Promise<void>>();
const mockConfigManagerExists = jest.fn<() => Promise<boolean>>();
const mockConfigManagerGetDefaultConfig = jest.fn<() => any>();
const mockConfigManagerMergeConfig = jest.fn<(config: any, updates: any) => any>();

const mockSpinnerStart = jest.fn<(text?: string) => void>();
const mockSpinnerSucceed = jest.fn<(text?: string) => void>();
const mockSpinnerFail = jest.fn<(text?: string) => void>();
const mockSpinnerStop = jest.fn<() => void>();

jest.unstable_mockModule('chalk', () => ({
  default: {
    bold: jest.fn((text: string) => text),
    green: jest.fn((text: string) => text),
    red: jest.fn((text: string) => text),
    yellow: jest.fn((text: string) => text),
    gray: jest.fn((text: string) => text),
  },
  bold: jest.fn((text: string) => text),
  green: jest.fn((text: string) => text),
  red: jest.fn((text: string) => text),
  yellow: jest.fn((text: string) => text),
  gray: jest.fn((text: string) => text),
}));

// Mock external dependencies
jest.unstable_mockModule('fs', () => ({
  existsSync: jest.fn<(path: string) => boolean>(),
  writeFileSync: jest.fn<(path: string, content: string) => void>(),
  readFileSync: jest.fn<(path: string, encoding?: string) => string>(),
  mkdirSync: jest.fn<(path: string, options?: any) => string | undefined>(),
}));

jest.unstable_mockModule('path', () => ({
  join: jest.fn((...args: string[]) => args.join('/')),
  resolve: jest.fn((path: string) => path),
}));

jest.unstable_mockModule('../../src/services/config/manager.js', () => ({
  default: jest.fn().mockImplementation(() => ({
    load: mockConfigManagerLoad,
    save: mockConfigManagerSave,
    exists: mockConfigManagerExists,
    getDefaultConfig: mockConfigManagerGetDefaultConfig,
    mergeConfig: mockConfigManagerMergeConfig,
  })),
}));

jest.unstable_mockModule('../../src/utils/spinner.js', () => ({
  default: jest.fn().mockImplementation(() => ({
    start: mockSpinnerStart,
    succeed: mockSpinnerSucceed,
    fail: mockSpinnerFail,
    stop: mockSpinnerStop,
  })),
}));

// Mock process.cwd and process.exit
const mockProcessCwd = jest.fn<() => string>();
const mockProcessExit = jest.fn<(code: number) => never>((code: number) => {
  throw new Error(`Process exited with code ${code}`);
});

Object.defineProperty(process, 'exit', {
  value: mockProcessExit,
  writable: true,
});

Object.defineProperty(process, 'cwd', {
  value: mockProcessCwd,
  writable: true,
});

// Import after mocking
const fs = await import('fs');
const path = await import('path');
await import('chalk');
await import('../../src/services/config/manager.js');
await import('../../src/utils/spinner.js');

describe('Config Command', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Mock console methods
    jest.spyOn(global.console, 'log').mockImplementation(() => {});
    jest.spyOn(global.console, 'error').mockImplementation(() => {});

    // Mock process methods
    mockProcessCwd.mockReturnValue('/test/project');

    // Default mock implementations
    mockConfigManagerLoad.mockResolvedValue(null);
    mockConfigManagerSave.mockResolvedValue(undefined);
    mockConfigManagerExists.mockResolvedValue(false);
    mockConfigManagerGetDefaultConfig.mockReturnValue({
      version: '1.0',
      projectName: 'test-project',
      environment: 'test',
      apiKeys: {},
      webhooks: { url: 'https://example.com/webhook', events: ['payment.paid'] },
      dev: { port: 3000, autoRegisterWebhook: true, verifyWebhookSignatures: false },
    });

    // Mock file system
    jest.mocked(fs.existsSync).mockReturnValue(false);
    jest.mocked(fs.writeFileSync).mockImplementation(() => {});
    jest.mocked(fs.readFileSync).mockReturnValue('');
    jest.mocked(fs.mkdirSync).mockImplementation(() => undefined);
    jest.mocked(path.join).mockImplementation((...args) => args.join('/'));
    jest.mocked(path.resolve).mockImplementation((p) => p);
  });

  afterEach(() => {
    // Restore console spies
    jest.restoreAllMocks();
  });

  describe('show subcommand', () => {
    it('should display configuration in pretty format when config exists', async () => {
      const mockConfig = {
        version: '1.0',
        projectName: 'test-project',
        environment: 'test',
        apiKeys: {
          test: { public: 'pk_test_1234567890', secret: 'sk_test_1234567890' },
          live: { public: 'pk_live_1234567890', secret: 'sk_live_1234567890' },
        },
        webhooks: {
          url: 'https://example.com/webhook',
          events: ['payment.paid', 'payment.failed'],
        },
        dev: { port: 3000, autoRegisterWebhook: true, verifyWebhookSignatures: false },
        rateLimiting: {
          enabled: true,
          maxRequests: 100,
          windowMs: 60000,
          environmentMultiplier: 0.5,
          endpoints: { '/payments': { maxRequests: 50, windowMs: 30000 } },
        },
      };

      mockConfigManagerLoad.mockResolvedValue(mockConfig);

      const { showAction } = await import('../../src/commands/config.js');
      await showAction({});

      expect(mockConfigManagerLoad).toHaveBeenCalledTimes(1);
      expect(mockSpinnerStart).toHaveBeenCalledWith('Loading configuration...');
      expect(mockSpinnerSucceed).toHaveBeenCalledWith('Configuration loaded');
      // Check that some configuration display happened
      expect(console.log).toHaveBeenCalled();
    });

    it('should display configuration as JSON when --json flag is used', async () => {
      const mockConfig = {
        version: '1.0',
        projectName: 'test-project',
        environment: 'test',
        apiKeys: { test: { public: 'pk_test_123', secret: 'sk_test_123' } },
        webhooks: { url: 'https://example.com/webhook', events: ['payment.paid'] },
        dev: { port: 3000, autoRegisterWebhook: true, verifyWebhookSignatures: false },
      };

      mockConfigManagerLoad.mockResolvedValue(mockConfig);

      const { showAction } = await import('../../src/commands/config.js');
      await showAction({ json: true });

      expect(mockConfigManagerLoad).toHaveBeenCalledTimes(1);
      expect(console.log).toHaveBeenCalledWith(JSON.stringify(mockConfig, null, 2));
    });

    it('should handle no configuration found', async () => {
      mockConfigManagerLoad.mockResolvedValue(null);

      const { showAction } = await import('../../src/commands/config.js');
      await showAction({});

      expect(mockConfigManagerLoad).toHaveBeenCalledTimes(1);
      expect(mockSpinnerFail).toHaveBeenCalledWith('No configuration found');
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('No PayMongo configuration found')
      );
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining("Run 'paymongo init'"));
    });

    it('should handle configuration load errors', async () => {
      const errorMessage = 'Failed to load configuration';
      mockConfigManagerLoad.mockRejectedValue(new Error(errorMessage));

      const { showAction } = await import('../../src/commands/config.js');

      await expect(showAction({})).rejects.toThrow('Command failed');

      expect(mockSpinnerStart).toHaveBeenCalledWith('Loading configuration...');
      expect(mockSpinnerStop).toHaveBeenCalled();
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('❌ Configuration file corrupted:'),
        errorMessage
      );
    });

    it('should mask API keys in display', async () => {
      const mockConfig = {
        version: '1.0',
        projectName: 'test-project',
        environment: 'live',
        apiKeys: {
          live: { public: 'pk_live_very_long_key_here', secret: 'sk_live_very_long_secret_here' },
        },
        webhooks: { url: 'https://example.com/webhook', events: ['payment.paid'] },
        dev: { port: 3000, autoRegisterWebhook: true, verifyWebhookSignatures: false },
      };

      mockConfigManagerLoad.mockResolvedValue(mockConfig);

      const { showAction } = await import('../../src/commands/config.js');
      await showAction({});

      // Check that API keys are masked in display
      const logCalls = (console.log as jest.MockedFunction<typeof console.log>).mock.calls;
      const publicKeyCall = logCalls.find((call) => call[0]?.includes('Public (live):'));
      const secretKeyCall = logCalls.find((call) => call[0]?.includes('Secret (live):'));

      expect(publicKeyCall).toBeDefined();
      expect(publicKeyCall![1]).toBe('pk_live_ve***');
      expect(secretKeyCall).toBeDefined();
      expect(secretKeyCall![1]).toBe('sk_live_ve***');
    });

    it('should display rate limiting information when enabled', async () => {
      const mockConfig = {
        version: '1.0',
        projectName: 'test-project',
        environment: 'test',
        apiKeys: {},
        webhooks: { url: 'https://example.com/webhook', events: ['payment.paid'] },
        dev: { port: 3000, autoRegisterWebhook: true, verifyWebhookSignatures: false },
        rateLimiting: {
          enabled: true,
          maxRequests: 200,
          windowMs: 120000,
          environmentMultiplier: 0.3,
          endpoints: { '/payments': { maxRequests: 50, windowMs: 30000 } },
        },
      };

      mockConfigManagerLoad.mockResolvedValue(mockConfig);

      const { showAction } = await import('../../src/commands/config.js');
      await showAction({});

      // Check that rate limiting information is displayed
      const logCalls = (console.log as jest.MockedFunction<typeof console.log>).mock.calls;
      expect(logCalls.some((call) => call[0]?.includes('Rate Limiting:'))).toBe(true);
      expect(logCalls.some((call) => call[0]?.includes('Enabled:'))).toBe(true);
      expect(logCalls.some((call) => call.join(' ').includes('200 per 120s'))).toBe(true);
      expect(logCalls.some((call) => call.join(' ').includes('0.3x'))).toBe(true);
      expect(logCalls.some((call) => call.join(' ').includes('1 configured'))).toBe(true);
    });

    it('should not display rate limiting section when disabled', async () => {
      const mockConfig = {
        version: '1.0',
        projectName: 'test-project',
        environment: 'test',
        apiKeys: {},
        webhooks: { url: 'https://example.com/webhook', events: ['payment.paid'] },
        dev: { port: 3000, autoRegisterWebhook: true, verifyWebhookSignatures: false },
        // No rateLimiting property
      };

      mockConfigManagerLoad.mockResolvedValue(mockConfig);

      const { showAction } = await import('../../src/commands/config.js');
      await showAction({});

      expect(console.log).not.toHaveBeenCalledWith(expect.stringContaining('Rate Limiting:'));
    });
  });

  describe('set subcommand', () => {
    it('should update configuration value with string input', async () => {
      const existingConfig = {
        version: '1.0',
        projectName: 'old-name',
        environment: 'test',
        apiKeys: {},
        webhooks: { url: 'https://example.com/webhook', events: ['payment.paid'] },
        dev: { port: 3000, autoRegisterWebhook: true, verifyWebhookSignatures: false },
      };

      mockConfigManagerLoad.mockResolvedValue(existingConfig);

      const { setAction } = await import('../../src/commands/config.js');
      await setAction('projectName', 'new-project-name');

      expect(mockConfigManagerLoad).toHaveBeenCalledTimes(1);
      expect(mockSpinnerStart).toHaveBeenCalledWith('Loading configuration...');
      expect(mockSpinnerSucceed).toHaveBeenCalledWith('Configuration loaded');
      expect(mockSpinnerStart).toHaveBeenCalledWith('Updating configuration...');
      expect(mockSpinnerSucceed).toHaveBeenCalledWith('Configuration updated');
      expect(mockConfigManagerSave).toHaveBeenCalledWith({
        ...existingConfig,
        projectName: 'new-project-name',
      });
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('✓ Set projectName = new-project-name')
      );
    });

    it('should handle key mapping for user-friendly keys', async () => {
      const existingConfig = {
        version: '1.0',
        projectName: 'test',
        environment: 'test',
        apiKeys: {},
        webhooks: { url: 'old-url', events: [] },
        dev: { port: 3000, autoRegisterWebhook: true, verifyWebhookSignatures: false },
      };

      mockConfigManagerLoad.mockResolvedValue(existingConfig);

      const { setAction } = await import('../../src/commands/config.js');
      await setAction('webhook.url', 'https://new-webhook.com');

      expect(mockConfigManagerSave).toHaveBeenCalledWith({
        ...existingConfig,
        webhooks: { ...existingConfig.webhooks, url: 'https://new-webhook.com' },
      });
    });

    it('should coerce boolean values', async () => {
      const existingConfig = {
        version: '1.0',
        projectName: 'test',
        environment: 'test',
        apiKeys: {},
        webhooks: { url: 'https://example.com/webhook', events: ['payment.paid'] },
        dev: { port: 3000, autoRegisterWebhook: true, verifyWebhookSignatures: false },
      };

      mockConfigManagerLoad.mockResolvedValue(existingConfig);

      const { setAction } = await import('../../src/commands/config.js');
      await setAction('dev.verifySignatures', 'true');

      expect(mockConfigManagerSave).toHaveBeenCalledWith({
        ...existingConfig,
        dev: { ...existingConfig.dev, verifyWebhookSignatures: true },
      });
    });

    it('should coerce numeric values', async () => {
      const existingConfig = {
        version: '1.0',
        projectName: 'test',
        environment: 'test',
        apiKeys: {},
        webhooks: { url: 'https://example.com/webhook', events: ['payment.paid'] },
        dev: { port: 3000, autoRegisterWebhook: true, verifyWebhookSignatures: false },
      };

      mockConfigManagerLoad.mockResolvedValue(existingConfig);

      const { setAction } = await import('../../src/commands/config.js');
      await setAction('dev.port', '8080');

      expect(mockConfigManagerSave).toHaveBeenCalledWith({
        ...existingConfig,
        dev: { ...existingConfig.dev, port: 8080 },
      });
    });

    it('should handle nested key paths', async () => {
      const existingConfig = {
        version: '1.0',
        projectName: 'test',
        environment: 'test',
        apiKeys: {},
        webhooks: { url: 'https://example.com/webhook', events: ['payment.paid'] },
        dev: { port: 3000, autoRegisterWebhook: true, verifyWebhookSignatures: false },
      };

      mockConfigManagerLoad.mockResolvedValue(existingConfig);

      const { setAction } = await import('../../src/commands/config.js');
      await setAction('rateLimit.enabled', 'true');

      expect(mockConfigManagerSave).toHaveBeenCalledWith({
        ...existingConfig,
        rateLimiting: { enabled: true },
      });
    });

    it('should handle no configuration found', async () => {
      mockConfigManagerLoad.mockResolvedValue(null);

      const { setAction } = await import('../../src/commands/config.js');
      await setAction('projectName', 'new-name');

      expect(mockConfigManagerLoad).toHaveBeenCalledTimes(1);
      expect(mockSpinnerFail).toHaveBeenCalledWith('No configuration found');
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('No PayMongo configuration found')
      );
      expect(mockConfigManagerSave).not.toHaveBeenCalled();
    });

    it('should handle configuration save errors', async () => {
      const existingConfig = {
        version: '1.0',
        projectName: 'test',
        environment: 'test',
        apiKeys: {},
        webhooks: { url: 'https://example.com/webhook', events: ['payment.paid'] },
        dev: { port: 3000, autoRegisterWebhook: true, verifyWebhookSignatures: false },
      };

      mockConfigManagerLoad.mockResolvedValue(existingConfig);
      mockConfigManagerSave.mockRejectedValue(new Error('Save failed'));

      const { setAction } = await import('../../src/commands/config.js');

      await expect(setAction('projectName', 'new-name')).rejects.toThrow(
        'Command failed'
      );

      expect(mockSpinnerStop).toHaveBeenCalled();
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('❌ Failed to update configuration:'),
        'Save failed'
      );
    });
  });

  describe('backup subcommand', () => {
    it('should create backup with default name and directory', async () => {
      const mockConfig = {
        version: '1.0',
        projectName: 'test-project',
        environment: 'test',
        apiKeys: {},
        webhooks: { url: 'https://example.com/webhook', events: ['payment.paid'] },
        dev: { port: 3000, autoRegisterWebhook: true, verifyWebhookSignatures: false },
      };

      mockConfigManagerLoad.mockResolvedValue(mockConfig);

      const { backupAction } = await import('../../src/commands/config.js');
      await backupAction({});

      expect(mockConfigManagerLoad).toHaveBeenCalledTimes(1);
      expect(mockSpinnerStart).toHaveBeenCalledWith('Loading current configuration...');
      expect(mockSpinnerSucceed).toHaveBeenCalledWith('Configuration loaded');
      expect(mockSpinnerStart).toHaveBeenCalledWith('Creating backup...');
      expect(mockSpinnerSucceed).toHaveBeenCalledWith('Backup created');
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        expect.stringMatching(/.*paymongo-config-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.json/),
        JSON.stringify(mockConfig, null, 2),
        'utf-8'
      );
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('✓ Configuration backup created:')
      );
    });

    it('should create backup with custom directory and name', async () => {
      const mockConfig = {
        version: '1.0',
        projectName: 'test-project',
        environment: 'test',
        apiKeys: {},
        webhooks: { url: 'https://example.com/webhook', events: ['payment.paid'] },
        dev: { port: 3000, autoRegisterWebhook: true, verifyWebhookSignatures: false },
      };

      mockConfigManagerLoad.mockResolvedValue(mockConfig);

      const { backupAction } = await import('../../src/commands/config.js');
      await backupAction({ directory: '/custom/dir', name: 'my-backup' });

      expect(fs.existsSync).toHaveBeenCalledWith('/custom/dir');
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        expect.stringMatching(/.*my-backup-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.json/),
        JSON.stringify(mockConfig, null, 2),
        'utf-8'
      );
    });

    it('should create backup directory if it does not exist', async () => {
      const mockConfig = {
        version: '1.0',
        projectName: 'test-project',
        environment: 'test',
        apiKeys: {},
        webhooks: { url: 'https://example.com/webhook', events: ['payment.paid'] },
        dev: { port: 3000, autoRegisterWebhook: true, verifyWebhookSignatures: false },
      };

      mockConfigManagerLoad.mockResolvedValue(mockConfig);
      jest.mocked(fs.existsSync).mockReturnValue(false);

      const { backupAction } = await import('../../src/commands/config.js');
      await backupAction({ directory: '/new/dir' });

      expect(fs.existsSync).toHaveBeenCalledWith('/new/dir');
      expect(fs.mkdirSync).toHaveBeenCalledWith('/new/dir', { recursive: true });
    });

    it('should handle no configuration found', async () => {
      mockConfigManagerLoad.mockResolvedValue(null);

      const { backupAction } = await import('../../src/commands/config.js');
      await backupAction({});

      expect(mockConfigManagerLoad).toHaveBeenCalledTimes(1);
      expect(mockSpinnerFail).toHaveBeenCalledWith('No configuration found');
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('No PayMongo configuration found')
      );
      expect(fs.writeFileSync).not.toHaveBeenCalled();
    });

    it('should handle configuration load errors', async () => {
      mockConfigManagerLoad.mockRejectedValue(new Error('Load failed'));

      const { backupAction } = await import('../../src/commands/config.js');

      await expect(backupAction({})).rejects.toThrow('Command failed');

      expect(mockSpinnerStop).toHaveBeenCalled();
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('❌ Failed to create backup:'),
        'Load failed'
      );
    });
  });

  describe('reset subcommand', () => {
    it('should reset configuration to defaults', async () => {
      const { resetAction } = await import('../../src/commands/config.js');
      await resetAction();

      expect(mockSpinnerStart).toHaveBeenCalledWith('Resetting configuration...');
      expect(mockSpinnerSucceed).toHaveBeenCalledWith('Configuration reset');
      expect(mockConfigManagerSave).toHaveBeenCalledWith(mockConfigManagerGetDefaultConfig());
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('✓ Configuration reset to defaults')
      );
    });

    it('should handle save errors during reset', async () => {
      mockConfigManagerSave.mockRejectedValue(new Error('Save failed'));

      const { resetAction } = await import('../../src/commands/config.js');

      await expect(resetAction()).rejects.toThrow('Command failed');

      expect(mockSpinnerStop).toHaveBeenCalled();
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('❌ Failed to reset configuration:'),
        'Save failed'
      );
    });
  });

  describe('import subcommand', () => {
    it('should import configuration from valid file', async () => {
      const importedConfig = {
        version: '1.0',
        projectName: 'imported-project',
        environment: 'live',
        apiKeys: { live: { public: 'pk_live_imported', secret: 'sk_live_imported' } },
        webhooks: { url: 'https://imported.com/webhook', events: ['payment.succeeded'] },
        dev: { port: 4000, autoRegisterWebhook: false, verifyWebhookSignatures: true },
      };

      mockConfigManagerLoad.mockResolvedValue(null); // No existing config
      jest.mocked(fs.existsSync).mockReturnValue(true);
      jest.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(importedConfig));

      const { importAction } = await import('../../src/commands/config.js');
      await importAction('config.json', {});

      expect(mockSpinnerStart).toHaveBeenCalledWith('Reading import file...');
      expect(mockSpinnerSucceed).toHaveBeenCalledWith('File read');
      expect(mockSpinnerStart).toHaveBeenCalledWith('Validating configuration...');
      expect(mockSpinnerSucceed).toHaveBeenCalledWith('Configuration validated');
      expect(mockSpinnerStart).toHaveBeenCalledWith('Importing configuration...');
      expect(mockSpinnerSucceed).toHaveBeenCalledWith('Configuration imported');
      expect(mockConfigManagerSave).toHaveBeenCalledWith({
        ...importedConfig,
        webhookSecrets: {},
      });
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('✓ Configuration imported successfully')
      );
    });

    it('should create backup when importing over existing config', async () => {
      const existingConfig = {
        version: '1.0',
        projectName: 'existing',
        environment: 'test',
        apiKeys: {},
        webhooks: { url: 'https://example.com/webhook', events: ['payment.paid'] },
        dev: { port: 3000, autoRegisterWebhook: true, verifyWebhookSignatures: false },
      };
      const importedConfig = {
        version: '1.0',
        projectName: 'existing', // Same as existing
        environment: 'test', // Same as existing
        apiKeys: {},
        webhooks: { url: 'https://example.com/webhook', events: ['payment.paid'] },
        dev: { port: 4000, autoRegisterWebhook: false, verifyWebhookSignatures: true },
      };

      mockConfigManagerLoad.mockResolvedValue(existingConfig);
      jest.mocked(fs.existsSync).mockReturnValue(true);
      jest.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(importedConfig));
      mockConfigManagerMergeConfig.mockReturnValue(existingConfig);

      const { importAction } = await import('../../src/commands/config.js');
      await importAction('config.json', {});

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        expect.stringMatching(/\.paymongo\.backup\.\d+\.json/),
        JSON.stringify(existingConfig, null, 2)
      );
      expect(mockConfigManagerSave).toHaveBeenCalledWith({
        ...importedConfig,
        webhookSecrets: {},
      });
    });

    it('should handle import file not found', async () => {
      jest.mocked(fs.existsSync).mockReturnValue(false);

      const { importAction } = await import('../../src/commands/config.js');

      await expect(importAction('missing.json', {})).rejects.toThrow('Command failed');

      expect(mockSpinnerFail).toHaveBeenCalledWith('File not found');
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('❌ Import file not found:')
      );
    });

    it('should handle invalid JSON in import file', async () => {
      jest.mocked(fs.existsSync).mockReturnValue(true);
      jest.mocked(fs.readFileSync).mockReturnValue('invalid json {');

      const { importAction } = await import('../../src/commands/config.js');

      await expect(importAction('config.json', {})).rejects.toThrow('Command failed');

      expect(mockSpinnerFail).toHaveBeenCalledWith('Invalid JSON');
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('❌ Invalid JSON in import file')
      );
    });

    it('should handle configuration validation errors', async () => {
      const invalidConfig = { invalid: 'config' };

      mockConfigManagerLoad.mockResolvedValue(null);
      jest.mocked(fs.existsSync).mockReturnValue(true);
      jest.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(invalidConfig));

      const { importAction } = await import('../../src/commands/config.js');

      await expect(importAction('config.json', {})).rejects.toThrow('Command failed');

      expect(mockSpinnerStart).toHaveBeenCalledWith('Validating configuration...');
      // Validation fails, so process.exit is called
    });

    it('should skip conflicts check when force flag is used', async () => {
      const existingConfig = {
        version: '1.0',
        projectName: 'existing',
        environment: 'test',
        apiKeys: {},
        webhooks: { url: 'https://example.com/webhook', events: ['payment.paid'] },
        dev: { port: 3000, autoRegisterWebhook: true, verifyWebhookSignatures: false },
      };
      const importedConfig = {
        version: '1.0',
        projectName: 'different',
        environment: 'live',
        apiKeys: {},
        webhooks: { url: 'https://example.com/webhook', events: ['payment.paid'] },
        dev: { port: 4000, autoRegisterWebhook: false, verifyWebhookSignatures: true },
      };

      mockConfigManagerLoad.mockResolvedValue(existingConfig);
      jest.mocked(fs.existsSync).mockReturnValue(true);
      jest.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(importedConfig));

      const { importAction } = await import('../../src/commands/config.js');
      await importAction('config.json', { force: true });

      expect(mockSpinnerStart).not.toHaveBeenCalledWith('Checking for conflicts...');
      expect(mockConfigManagerSave).toHaveBeenCalledWith({
        ...importedConfig,
        webhookSecrets: {},
      });
    });
  });

  describe('rate-limit subcommand', () => {
    describe('enable', () => {
      it('should enable rate limiting when config exists', async () => {
        const existingConfig = {
          version: '1.0',
          projectName: 'test',
          environment: 'test',
          apiKeys: {},
          webhooks: { url: 'https://example.com/webhook', events: ['payment.paid'] },
          dev: { port: 3000, autoRegisterWebhook: true, verifyWebhookSignatures: false },
        };

        mockConfigManagerLoad.mockResolvedValue(existingConfig);

        const { rateLimitEnableAction } = await import('../../src/commands/config.js');
        await rateLimitEnableAction();

        expect(mockConfigManagerLoad).toHaveBeenCalledTimes(1);
        expect(mockSpinnerStart).toHaveBeenCalledWith('Loading configuration...');
        expect(mockSpinnerSucceed).toHaveBeenCalledWith('Configuration loaded');
        expect(mockSpinnerStart).toHaveBeenCalledWith('Enabling rate limiting...');
        expect(mockSpinnerSucceed).toHaveBeenCalledWith('Rate limiting enabled');
        expect(mockConfigManagerSave).toHaveBeenCalledWith({
          ...existingConfig,
          rateLimiting: {
            enabled: true,
            maxRequests: 100,
            windowMs: 60000,
            environmentMultiplier: 0.5,
          },
        });
        expect(console.log).toHaveBeenCalledWith(
          expect.stringContaining('✓ Rate limiting enabled')
        );
      });

      it('should update existing rate limiting settings when enabling', async () => {
        const existingConfig = {
          version: '1.0',
          projectName: 'test',
          environment: 'test',
          apiKeys: {},
          webhooks: { url: 'https://example.com/webhook', events: ['payment.paid'] },
          dev: { port: 3000, autoRegisterWebhook: true, verifyWebhookSignatures: false },
          rateLimiting: {
            enabled: false,
            maxRequests: 50,
            windowMs: 30000,
            environmentMultiplier: 0.8,
          },
        };

        mockConfigManagerLoad.mockResolvedValue(existingConfig);

        const { rateLimitEnableAction } = await import('../../src/commands/config.js');
        await rateLimitEnableAction();

        expect(mockConfigManagerSave).toHaveBeenCalledWith({
          ...existingConfig,
          rateLimiting: {
            enabled: true,
            maxRequests: 50,
            windowMs: 30000,
            environmentMultiplier: 0.8,
          },
        });
      });

      it('should handle no configuration found', async () => {
        mockConfigManagerLoad.mockResolvedValue(null);

        const { rateLimitEnableAction } = await import('../../src/commands/config.js');
        await rateLimitEnableAction();

        expect(mockSpinnerFail).toHaveBeenCalledWith('No configuration found');
        expect(console.log).toHaveBeenCalledWith(
          expect.stringContaining('No PayMongo configuration found')
        );
        expect(mockConfigManagerSave).not.toHaveBeenCalled();
      });
    });

    describe('disable', () => {
      it('should disable rate limiting', async () => {
        const existingConfig = {
          version: '1.0',
          projectName: 'test',
          environment: 'test',
          apiKeys: {},
          webhooks: { url: 'https://example.com/webhook', events: ['payment.paid'] },
          dev: { port: 3000, autoRegisterWebhook: true, verifyWebhookSignatures: false },
          rateLimiting: {
            enabled: true,
            maxRequests: 100,
            windowMs: 60000,
            environmentMultiplier: 0.5,
          },
        };

        mockConfigManagerLoad.mockResolvedValue(existingConfig);

        const { rateLimitDisableAction } = await import('../../src/commands/config.js');
        await rateLimitDisableAction();

        expect(mockConfigManagerSave).toHaveBeenCalledWith({
          ...existingConfig,
          rateLimiting: {
            enabled: false,
            maxRequests: 100,
            windowMs: 60000,
            environmentMultiplier: 0.5,
          },
        });
        expect(console.log).toHaveBeenCalledWith(
          expect.stringContaining('✓ Rate limiting disabled')
        );
      });
    });

    describe('set-max-requests', () => {
      it('should set maximum requests', async () => {
        const existingConfig = {
          version: '1.0',
          projectName: 'test',
          environment: 'test',
          apiKeys: {},
          webhooks: { url: 'https://example.com/webhook', events: ['payment.paid'] },
          dev: { port: 3000, autoRegisterWebhook: true, verifyWebhookSignatures: false },
        };

        mockConfigManagerLoad.mockResolvedValue(existingConfig);

        const { rateLimitSetMaxRequestsAction } = await import('../../src/commands/config.js');
        await rateLimitSetMaxRequestsAction('200');

        expect(mockConfigManagerSave).toHaveBeenCalledWith({
          ...existingConfig,
          rateLimiting: {
            enabled: true,
            maxRequests: 200,
            windowMs: 60000,
            environmentMultiplier: 0.5,
          },
        });
        expect(console.log).toHaveBeenCalledWith(
          expect.stringContaining('✓ Maximum requests set to 200 per minute')
        );
      });

      it('should reject invalid number of requests', async () => {
        const { rateLimitSetMaxRequestsAction } = await import('../../src/commands/config.js');

        await expect(rateLimitSetMaxRequestsAction('0')).rejects.toThrow(
          'Command failed'
        );

        expect(console.error).toHaveBeenCalledWith(
          expect.stringContaining('❌ Invalid number of requests')
        );
      });

      it('should reject non-numeric input', async () => {
        const { rateLimitSetMaxRequestsAction } = await import('../../src/commands/config.js');

        await expect(rateLimitSetMaxRequestsAction('abc')).rejects.toThrow(
          'Command failed'
        );

        expect(console.error).toHaveBeenCalledWith(
          expect.stringContaining('❌ Invalid number of requests')
        );
      });
    });

    describe('set-window', () => {
      it('should set rate limit window', async () => {
        const existingConfig = {
          version: '1.0',
          projectName: 'test',
          environment: 'test',
          apiKeys: {},
          webhooks: { url: 'https://example.com/webhook', events: ['payment.paid'] },
          dev: { port: 3000, autoRegisterWebhook: true, verifyWebhookSignatures: false },
        };

        mockConfigManagerLoad.mockResolvedValue(existingConfig);

        const { rateLimitSetWindowAction } = await import('../../src/commands/config.js');
        await rateLimitSetWindowAction('120');

        expect(mockConfigManagerSave).toHaveBeenCalledWith({
          ...existingConfig,
          rateLimiting: {
            enabled: true,
            maxRequests: 100,
            windowMs: 120000,
            environmentMultiplier: 0.5,
          },
        });
        expect(console.log).toHaveBeenCalledWith(
          expect.stringContaining('✓ Rate limit window set to 120 seconds')
        );
      });

      it('should reject invalid window seconds', async () => {
        const { rateLimitSetWindowAction } = await import('../../src/commands/config.js');

        await expect(rateLimitSetWindowAction('0')).rejects.toThrow('Command failed');

        expect(console.error).toHaveBeenCalledWith(
          expect.stringContaining('❌ Invalid time window')
        );
      });
    });

    describe('status', () => {
      it('should display rate limiting status when enabled', async () => {
        const configWithRateLimiting = {
          version: '1.0',
          projectName: 'test',
          environment: 'test',
          apiKeys: {},
          webhooks: { url: 'https://example.com/webhook', events: ['payment.paid'] },
          dev: { port: 3000, autoRegisterWebhook: true, verifyWebhookSignatures: false },
          rateLimiting: {
            enabled: true,
            maxRequests: 150,
            windowMs: 90000,
            environmentMultiplier: 0.6,
            endpoints: {
              '/payments': { maxRequests: 50, windowMs: 30000 },
              '/webhooks': { maxRequests: 25, windowMs: 60000 },
            },
          },
        };

        mockConfigManagerLoad.mockResolvedValue(configWithRateLimiting);

        const { rateLimitStatusAction } = await import('../../src/commands/config.js');
        await rateLimitStatusAction();

        expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Rate Limiting Status'));
        expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Status: Enabled'));
        expect(console.log).toHaveBeenCalledWith(expect.stringContaining('150 per 90s'));
        expect(console.log).toHaveBeenCalledWith(expect.stringContaining('0.6x'));
        expect(console.log).toHaveBeenCalledWith(expect.stringContaining('/payments: 50 per 30s'));
        expect(console.log).toHaveBeenCalledWith(expect.stringContaining('/webhooks: 25 per 60s'));
      });

      it('should display disabled status when rate limiting is disabled', async () => {
        const configWithoutRateLimiting = {
          version: '1.0',
          projectName: 'test',
          environment: 'test',
          apiKeys: {},
          webhooks: { url: 'https://example.com/webhook', events: ['payment.paid'] },
          dev: { port: 3000, autoRegisterWebhook: true, verifyWebhookSignatures: false },
        };

        mockConfigManagerLoad.mockResolvedValue(configWithoutRateLimiting);

        const { rateLimitStatusAction } = await import('../../src/commands/config.js');
        await rateLimitStatusAction();

        expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Rate Limiting Status'));
        expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Status: Disabled'));
        expect(console.log).toHaveBeenCalledWith(
          expect.stringContaining('Rate limiting is not currently active')
        );
      });
    });
  });
});
