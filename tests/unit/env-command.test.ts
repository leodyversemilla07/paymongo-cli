import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import type { PayMongoConfig } from '../../src/types/paymongo.js';

// Mock modules before importing
const mockConfigManagerLoad = jest.fn<() => Promise<PayMongoConfig | null>>();
const mockConfigManagerSave = jest.fn<(config: PayMongoConfig) => Promise<void>>();
const mockApiClientValidateApiKey = jest.fn<() => Promise<boolean>>();
const mockSpinnerStart = jest.fn<(text?: string) => void>();
const mockSpinnerSucceed = jest.fn<(text?: string) => void>();
const mockSpinnerFail = jest.fn<(text?: string) => void>();
const mockSpinnerStop = jest.fn<() => void>();

jest.unstable_mockModule('../../src/services/config/manager.js', () => ({
  default: jest.fn().mockImplementation(() => ({
    load: mockConfigManagerLoad,
    save: mockConfigManagerSave,
  })),
}));

jest.unstable_mockModule('../../src/services/api/client.js', () => ({
  default: jest.fn().mockImplementation(() => ({
    validateApiKey: mockApiClientValidateApiKey,
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

// Import after mocking
const { default: envCommand } = await import('../../src/commands/env.js');

describe('Env Command', () => {
  const originalConsoleLog = console.log;
  const originalConsoleError = console.error;
  const originalProcessExit = process.exit;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock console methods
    console.log = jest.fn();
    console.error = jest.fn();
    process.exit = jest.fn() as unknown as typeof process.exit;

    // Default mock implementations
    mockConfigManagerLoad.mockResolvedValue(null);
    mockConfigManagerSave.mockResolvedValue(undefined);
    mockApiClientValidateApiKey.mockResolvedValue(true);
  });

  afterEach(() => {
    console.log = originalConsoleLog;
    console.error = originalConsoleError;
    process.exit = originalProcessExit;
  });

  describe('command structure', () => {
    it('should have the correct name', () => {
      expect(envCommand.name()).toBe('env');
    });

    it('should have switch subcommand', () => {
      const switchCmd = envCommand.commands.find((cmd) => cmd.name() === 'switch');
      expect(switchCmd).toBeDefined();
      expect(switchCmd?.description()).toBe('Switch between test and live environments');
    });

    it('should have current subcommand', () => {
      const currentCmd = envCommand.commands.find((cmd) => cmd.name() === 'current');
      expect(currentCmd).toBeDefined();
      expect(currentCmd?.description()).toBe('Show current environment');
    });
  });

  describe('switch subcommand', () => {
    it('should switch environment successfully', async () => {
      const mockConfig: PayMongoConfig = {
        version: '1.0',
        projectName: 'test-project',
        environment: 'test',
        apiKeys: {
          test: { secret: 'sk_test_123456789012', public: 'pk_test_123456789012' },
          live: { secret: 'sk_live_123456789012', public: 'pk_live_123456789012' },
        },
        webhooks: { url: '', events: [] },
        webhookSecrets: {},
        dev: { port: 3000, autoRegisterWebhook: true, verifyWebhookSignatures: false },
      };

      mockConfigManagerLoad.mockResolvedValue(mockConfig);
      mockConfigManagerSave.mockResolvedValue(undefined);
      mockApiClientValidateApiKey.mockResolvedValue(true);

      // Parse and execute the command
      await envCommand.parseAsync(['node', 'test', 'switch', 'live']);

      expect(mockConfigManagerLoad).toHaveBeenCalled();
      expect(mockConfigManagerSave).toHaveBeenCalledWith(
        expect.objectContaining({
          environment: 'live',
        })
      );
      expect(mockSpinnerSucceed).toHaveBeenCalledWith('Switched to live environment');
    });

    it('should reject invalid environment', async () => {
      const mockConfig: PayMongoConfig = {
        version: '1.0',
        projectName: 'test-project',
        environment: 'test',
        apiKeys: {
          test: { secret: 'sk_test_123456789012', public: 'pk_test_123456789012' },
        },
        webhooks: { url: '', events: [] },
        webhookSecrets: {},
        dev: { port: 3000, autoRegisterWebhook: true, verifyWebhookSignatures: false },
      };

      mockConfigManagerLoad.mockResolvedValue(mockConfig);

      await expect(envCommand.parseAsync(['node', 'test', 'switch', 'invalid'])).rejects.toThrow('Command failed');

      expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Invalid environment'));
    });

    it('should handle missing API keys for target environment', async () => {
      const mockConfig: PayMongoConfig = {
        version: '1.0',
        projectName: 'test-project',
        environment: 'test',
        apiKeys: {
          test: { secret: 'sk_test_123456789012', public: 'pk_test_123456789012' },
        },
        webhooks: { url: '', events: [] },
        webhookSecrets: {},
        dev: { port: 3000, autoRegisterWebhook: true, verifyWebhookSignatures: false },
      };

      mockConfigManagerLoad.mockResolvedValue(mockConfig);

      await expect(envCommand.parseAsync(['node', 'test', 'switch', 'live'])).rejects.toThrow('Command failed');

      expect(mockSpinnerFail).toHaveBeenCalledWith('Missing API keys for live environment');
    });

    it('should handle no configuration found', async () => {
      mockConfigManagerLoad.mockResolvedValue(null);

      await envCommand.parseAsync(['node', 'test', 'switch', 'live']);

      expect(mockSpinnerFail).toHaveBeenCalledWith('No configuration found');
    });

    it('should skip validation with --force flag', async () => {
      const mockConfig: PayMongoConfig = {
        version: '1.0',
        projectName: 'test-project',
        environment: 'test',
        apiKeys: {
          test: { secret: 'sk_test_123456789012', public: 'pk_test_123456789012' },
          live: { secret: 'sk_live_123456789012', public: 'pk_live_123456789012' },
        },
        webhooks: { url: '', events: [] },
        webhookSecrets: {},
        dev: { port: 3000, autoRegisterWebhook: true, verifyWebhookSignatures: false },
      };

      mockConfigManagerLoad.mockResolvedValue(mockConfig);
      mockConfigManagerSave.mockResolvedValue(undefined);

      await envCommand.parseAsync(['node', 'test', 'switch', 'live', '--force']);

      // When --force is used, validateApiKey should not be called
      expect(mockApiClientValidateApiKey).not.toHaveBeenCalled();
      expect(mockConfigManagerSave).toHaveBeenCalled();
    });

    it('should fail when API key validation fails', async () => {
      const mockConfig: PayMongoConfig = {
        version: '1.0',
        projectName: 'test-project',
        environment: 'test',
        apiKeys: {
          test: { secret: 'sk_test_123456789012', public: 'pk_test_123456789012' },
          live: { secret: 'sk_live_123456789012', public: 'pk_live_123456789012' },
        },
        webhooks: { url: '', events: [] },
        webhookSecrets: {},
        dev: { port: 3000, autoRegisterWebhook: true, verifyWebhookSignatures: false },
      };

      mockConfigManagerLoad.mockResolvedValue(mockConfig);
      mockApiClientValidateApiKey.mockRejectedValue(new Error('API key validation failed'));

      await expect(envCommand.parseAsync(['node', 'test', 'switch', 'live'])).rejects.toThrow('Command failed');

      expect(mockSpinnerFail).toHaveBeenCalledWith('API key validation failed');
    });
  });

  describe('current subcommand', () => {
    it('should show current environment configuration', async () => {
      const mockConfig: PayMongoConfig = {
        version: '1.0',
        projectName: 'test-project',
        environment: 'test',
        apiKeys: {
          test: { secret: 'sk_test_123456789012', public: 'pk_test_123456789012' },
        },
        webhooks: { url: '', events: [] },
        webhookSecrets: {},
        dev: { port: 3000, autoRegisterWebhook: true, verifyWebhookSignatures: false },
      };

      mockConfigManagerLoad.mockResolvedValue(mockConfig);

      await envCommand.parseAsync(['node', 'test', 'current']);

      expect(mockConfigManagerLoad).toHaveBeenCalled();
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Current Environment:'));
    });

    it('should handle no configuration found', async () => {
      mockConfigManagerLoad.mockResolvedValue(null);

      await envCommand.parseAsync(['node', 'test', 'current']);

      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('No PayMongo configuration found')
      );
    });

    it('should show warning for live environment', async () => {
      const mockConfig: PayMongoConfig = {
        version: '1.0',
        projectName: 'test-project',
        environment: 'live',
        apiKeys: {
          live: { secret: 'sk_live_123456789012', public: 'pk_live_123456789012' },
        },
        webhooks: { url: '', events: [] },
        webhookSecrets: {},
        dev: { port: 3000, autoRegisterWebhook: true, verifyWebhookSignatures: false },
      };

      mockConfigManagerLoad.mockResolvedValue(mockConfig);

      await envCommand.parseAsync(['node', 'test', 'current']);

      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('You are using LIVE environment')
      );
    });
  });
});
