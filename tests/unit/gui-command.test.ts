import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import type { PayMongoConfig } from '../../src/types/paymongo.js';

// Mock modules before importing
const mockConfigManagerLoad = jest.fn<() => Promise<PayMongoConfig | null>>();
const mockApiClientConstructor = jest.fn();
const mockAnalyticsServiceConstructor = jest.fn();
const mockWebServerStart = jest.fn<() => Promise<void>>();
const mockWebServerStop = jest.fn<() => Promise<void>>();
const mockWebServerConstructor = jest.fn().mockImplementation(() => ({
  start: mockWebServerStart,
  stop: mockWebServerStop,
}));
const mockSpinnerStart = jest.fn<(text?: string) => void>();
const mockSpinnerSucceed = jest.fn<(text?: string) => void>();
const mockSpinnerFail = jest.fn<(text?: string) => void>();
const mockSpinnerStop = jest.fn<() => void>();

jest.unstable_mockModule('../../src/services/config/manager.js', () => ({
  ConfigManager: jest.fn().mockImplementation(() => ({
    load: mockConfigManagerLoad,
  })),
}));

jest.unstable_mockModule('../../src/services/api/client.js', () => ({
  ApiClient: mockApiClientConstructor,
}));

jest.unstable_mockModule('../../src/services/analytics/service.js', () => ({
  AnalyticsService: mockAnalyticsServiceConstructor,
}));

jest.unstable_mockModule('../../src/services/web/server.js', () => ({
  WebServer: mockWebServerConstructor,
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
const { default: guiCommand } = await import('../../src/commands/gui.js');

describe('GUI Command', () => {
  const originalConsoleLog = console.log;
  const originalConsoleError = console.error;
  const originalProcessExit = process.exit;
  const originalProcessOn = process.on;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock console methods
    console.log = jest.fn();
    console.error = jest.fn();
    process.exit = jest.fn() as unknown as typeof process.exit;
    process.on = jest.fn().mockReturnValue(process) as unknown as typeof process.on;

    // Default mock implementations
    mockConfigManagerLoad.mockResolvedValue(null);
    mockWebServerStart.mockResolvedValue(undefined);
    mockWebServerStop.mockResolvedValue(undefined);
  });

  afterEach(() => {
    console.log = originalConsoleLog;
    console.error = originalConsoleError;
    process.exit = originalProcessExit;
    process.on = originalProcessOn;
  });

  describe('command structure', () => {
    it('should have the correct name', () => {
      expect(guiCommand.name()).toBe('gui');
    });

    it('should have the correct description', () => {
      expect(guiCommand.description()).toBe('Start the PayMongo GUI dashboard');
    });

    it('should have port option', () => {
      const portOption = guiCommand.options.find((opt) => opt.short === '-p');
      expect(portOption).toBeDefined();
      expect(portOption?.long).toBe('--port');
    });

    it('should have host option', () => {
      const hostOption = guiCommand.options.find((opt) => opt.short === '-h');
      expect(hostOption).toBeDefined();
      expect(hostOption?.long).toBe('--host');
    });
  });

  describe('gui action', () => {
    it('should start GUI dashboard successfully with default options', async () => {
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

      await guiCommand.parseAsync(['node', 'test']);

      expect(mockConfigManagerLoad).toHaveBeenCalled();
      expect(mockWebServerConstructor).toHaveBeenCalledWith(
        expect.objectContaining({
          port: 8080,
          host: 'localhost',
        })
      );
      expect(mockWebServerStart).toHaveBeenCalled();
      expect(mockSpinnerSucceed).toHaveBeenCalledWith('GUI dashboard started');
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('PayMongo GUI Dashboard is running')
      );
    });

    it('should start GUI dashboard with custom port and host', async () => {
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

      await guiCommand.parseAsync(['node', 'test', '--port', '9000', '--host', '0.0.0.0']);

      expect(mockWebServerConstructor).toHaveBeenCalledWith(
        expect.objectContaining({
          port: 9000,
          host: '0.0.0.0',
        })
      );
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('http://0.0.0.0:9000')
      );
    });

    it('should handle no configuration found', async () => {
      mockConfigManagerLoad.mockResolvedValue(null);

      await guiCommand.parseAsync(['node', 'test']);

      expect(mockSpinnerFail).toHaveBeenCalledWith('No configuration found');
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('No PayMongo configuration found')
      );
      expect(mockWebServerStart).not.toHaveBeenCalled();
    });

    it('should handle server startup errors', async () => {
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
      mockWebServerStart.mockRejectedValue(new Error('Port already in use'));

      await guiCommand.parseAsync(['node', 'test']);

      expect(mockSpinnerStop).toHaveBeenCalled();
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to start GUI dashboard'),
        'Port already in use'
      );
      expect(process.exit).toHaveBeenCalledWith(1);
    });

    it('should register SIGINT handler for graceful shutdown', async () => {
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

      await guiCommand.parseAsync(['node', 'test']);

      expect(process.on).toHaveBeenCalledWith('SIGINT', expect.any(Function));
    });

    it('should register SIGTERM handler for graceful shutdown', async () => {
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

      await guiCommand.parseAsync(['node', 'test']);

      expect(process.on).toHaveBeenCalledWith('SIGTERM', expect.any(Function));
    });

    it('should stop server on SIGINT', async () => {
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

      await guiCommand.parseAsync(['node', 'test']);

      // Find the SIGINT handler
      const sigintCall = (process.on as jest.Mock).mock.calls.find(
        (call) => call[0] === 'SIGINT'
      ) as [string, () => Promise<void>] | undefined;
      expect(sigintCall).toBeDefined();

      // Call the handler
      if (sigintCall) {
        await sigintCall[1]();
      }

      expect(mockWebServerStop).toHaveBeenCalled();
      expect(process.exit).toHaveBeenCalledWith(0);
    });
  });
});
