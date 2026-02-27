import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import type { PayMongoConfig } from '../../src/types/paymongo.js';

// Type for request handler
type RequestHandler = (req: unknown, res: unknown) => void;

// Mock modules before importing dev command
const mockSelect = jest.fn();
const mockPassword = jest.fn();
const mockApiClientValidate = jest.fn<() => Promise<boolean>>();
const mockApiClientCreateWebhook =
  jest.fn<() => Promise<{ id: string; attributes: { secret: string } }>>();
const mockApiClientDeleteWebhook = jest.fn<() => Promise<void>>();

const mockFsExistsSync = jest.fn<() => boolean>();
const mockFsMkdirSync = jest.fn();
const mockFsWriteFileSync = jest.fn();
const mockFsReadFileSync = jest.fn<() => string>();
const mockFsUnlinkSync = jest.fn();
const mockFsOpenSync = jest.fn<() => number>();
const mockFsStatSync = jest.fn<() => { size: number }>();
const mockFsWatchFile = jest.fn();

const mockOsHomedir = jest.fn<() => string>();

const mockCryptoTimingSafeEqual = jest.fn<() => boolean>();

const mockHttpCreateServer = jest.fn<(handler: RequestHandler) => MockServer>();

const mockSpawn = jest.fn();

const mockNgrokForward = jest.fn<() => Promise<{ url: () => string; close: () => void }>>();

const mockConfigManagerLoad = jest.fn<() => Promise<PayMongoConfig | null>>();
const mockConfigManagerSave = jest.fn<() => Promise<void>>();

// Type for mock server
interface MockServer {
  listen: jest.Mock<(port: number, callback?: () => void) => void>;
  on: jest.Mock;
  close: jest.Mock<(callback?: () => void) => void>;
}

const mockDevProcessManagerSaveState = jest.fn();
const mockDevProcessManagerLoadState = jest.fn<() => null | object>();
const mockDevProcessManagerClearState = jest.fn();
const mockDevProcessManagerIsProcessRunning = jest.fn<() => boolean>();
const mockDevProcessManagerKillProcess = jest.fn<() => boolean>();
const mockDevProcessManagerGetLogFile = jest.fn<() => string>();
const mockDevProcessManagerReadLogs = jest.fn<() => string[]>();
const mockDevProcessManagerClearLogs = jest.fn();
const mockDevProcessManagerFormatUptime = jest.fn<() => string>();

const mockSpinnerStart = jest.fn();
const mockSpinnerSucceed = jest.fn();
const mockSpinnerFail = jest.fn();
const mockSpinnerWarn = jest.fn();
const mockSpinnerStop = jest.fn();

// Mock AnalyticsService
const mockAnalyticsRecordEvent = jest.fn();

// Mock modules before importing dev command
jest.unstable_mockModule('../../src/services/analytics/service.js', () => ({
  AnalyticsService: jest.fn().mockImplementation(() => ({
    recordEvent: mockAnalyticsRecordEvent,
  })),
}));

// Mock @inquirer/prompts
jest.unstable_mockModule('@inquirer/prompts', () => ({
  select: mockSelect,
  password: mockPassword,
}));

// Mock fs
jest.unstable_mockModule('fs', () => ({
  existsSync: mockFsExistsSync,
  mkdirSync: mockFsMkdirSync,
  writeFileSync: mockFsWriteFileSync,
  readFileSync: mockFsReadFileSync,
  unlinkSync: mockFsUnlinkSync,
  openSync: mockFsOpenSync,
  statSync: mockFsStatSync,
  watchFile: mockFsWatchFile,
}));

// Mock os
jest.unstable_mockModule('node:os', () => {
  const osModule = {
    homedir: mockOsHomedir,
    hostname: jest.fn(() => 'test-host'),
    userInfo: jest.fn(() => ({ username: 'testuser' })),
    release: jest.fn(() => '10.0.0'),
  };
  return {
    default: osModule,
    ...osModule,
  };
});

// Mock crypto
jest.unstable_mockModule('crypto', () => ({
  createHmac: jest.fn(() => ({
    update: jest.fn(() => ({
      digest: jest.fn(() => 'mock-expected-signature'),
    })),
  })),
  timingSafeEqual: mockCryptoTimingSafeEqual,
}));

// Mock http
jest.unstable_mockModule('http', () => ({
  createServer: mockHttpCreateServer,
}));

// Mock child_process
jest.unstable_mockModule('child_process', () => ({
  spawn: mockSpawn,
  execSync: jest.fn(),
}));

// Mock @ngrok/ngrok
jest.unstable_mockModule('@ngrok/ngrok', () => ({
  default: {
    forward: mockNgrokForward,
  },
}));

// Mock ConfigManager
jest.unstable_mockModule('../../src/services/config/manager.js', () => ({
  default: jest.fn().mockImplementation(() => ({
    load: mockConfigManagerLoad,
    save: mockConfigManagerSave,
  })),
}));

// Mock ApiClient
jest.unstable_mockModule('../../src/services/api/client.js', () => ({
  default: jest.fn().mockImplementation(() => ({
    validateApiKey: mockApiClientValidate,
    createWebhook: mockApiClientCreateWebhook,
    deleteWebhook: mockApiClientDeleteWebhook,
  })),
}));

// Mock DevProcessManager
jest.unstable_mockModule('../../src/services/dev/process-manager.js', () => ({
  DevProcessManager: {
    saveState: mockDevProcessManagerSaveState,
    loadState: mockDevProcessManagerLoadState,
    clearState: mockDevProcessManagerClearState,
    isProcessRunning: mockDevProcessManagerIsProcessRunning,
    killProcess: mockDevProcessManagerKillProcess,
    getLogFile: mockDevProcessManagerGetLogFile,
    readLogs: mockDevProcessManagerReadLogs,
    clearLogs: mockDevProcessManagerClearLogs,
    formatUptime: mockDevProcessManagerFormatUptime,
  },
}));

// Mock Spinner
jest.unstable_mockModule('../../src/utils/spinner.js', () => ({
  default: jest.fn().mockImplementation(() => ({
    start: mockSpinnerStart,
    succeed: mockSpinnerSucceed,
    fail: mockSpinnerFail,
    warn: mockSpinnerWarn,
    stop: mockSpinnerStop,
  })),
}));

// Import after mocking
const { DevServer } = await import('../../src/commands/dev.js');

describe('Dev Command', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Default mocks
    mockOsHomedir.mockReturnValue('/home/user');
    mockFsExistsSync.mockReturnValue(false);
    mockFsMkdirSync.mockImplementation(() => {});
    mockFsWriteFileSync.mockImplementation(() => {});
    mockFsReadFileSync.mockReturnValue('{}');
    mockFsUnlinkSync.mockImplementation(() => {});
    mockFsOpenSync.mockReturnValue(1);
    mockFsStatSync.mockReturnValue({ size: 0 });
    mockFsWatchFile.mockImplementation(() => {});

    mockCryptoTimingSafeEqual.mockReturnValue(true);

    mockConfigManagerLoad.mockResolvedValue(null);
    mockConfigManagerSave.mockResolvedValue(undefined);

    mockApiClientValidate.mockResolvedValue(true);
    mockApiClientCreateWebhook.mockResolvedValue({
      id: 'webhook-123',
      attributes: { secret: 'webhook-secret' },
    });
    mockApiClientDeleteWebhook.mockResolvedValue(undefined);

    mockDevProcessManagerLoadState.mockReturnValue(null);
    mockDevProcessManagerIsProcessRunning.mockReturnValue(false);
    mockDevProcessManagerKillProcess.mockReturnValue(true);
    mockDevProcessManagerGetLogFile.mockReturnValue('/tmp/dev-server.log');
    mockDevProcessManagerReadLogs.mockReturnValue(['log line 1', 'log line 2']);
    mockDevProcessManagerFormatUptime.mockReturnValue('5m 30s');

    mockSpinnerStart.mockImplementation(() => {});
    mockSpinnerSucceed.mockImplementation(() => {});
    mockSpinnerFail.mockImplementation(() => {});
    mockSpinnerWarn.mockImplementation(() => {});
    mockSpinnerStop.mockImplementation(() => {});

    mockAnalyticsRecordEvent.mockImplementation(() => {});

    // Mock ngrok
    mockNgrokForward.mockResolvedValue({
      url: () => 'https://test-tunnel.ngrok.io',
      close: () => {},
    });

    // Mock HTTP server
    const mockServer: MockServer = {
      listen: jest.fn((port: number, callback?: () => void) => callback && callback()),
      on: jest.fn(),
      close: jest.fn((callback?: () => void) => callback && callback()),
    };
    mockHttpCreateServer.mockReturnValue(mockServer);

    // Mock spawn
    mockSpawn.mockReturnValue({
      pid: 12345,
      unref: jest.fn(),
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('DevServer', () => {
    it('should start and stop the HTTP server', async () => {
      const config = {
        version: '1.0',
        projectName: 'test-project',
        environment: 'test' as const,
        apiKeys: { test: { secret: 'sk_test_key', public: 'pk_test_key' } },
        webhooks: { url: '', events: [] },
        webhookSecrets: {},
        dev: { port: 3000, autoRegisterWebhook: true, verifyWebhookSignatures: false },
      };

      const devServer = new DevServer(3000, config);
      await devServer.start();
      await devServer.stop();

      expect(mockHttpCreateServer).toHaveBeenCalled();
      // Check that server.listen was called with port 3000
      const mockServer = mockHttpCreateServer.mock.results[0].value as MockServer;
      expect(mockServer.listen).toHaveBeenCalledWith(3000, expect.any(Function));
      expect(mockServer.close).toHaveBeenCalled();
    });

    it('should handle webhook requests correctly', async () => {
      const config = {
        version: '1.0',
        projectName: 'test-project',
        environment: 'test' as const,
        apiKeys: { test: { secret: 'sk_test_key', public: 'pk_test_key' } },
        webhooks: { url: '', events: [] },
        webhookSecrets: {},
        dev: { port: 3000, autoRegisterWebhook: true, verifyWebhookSignatures: false },
      };

      const devServer = new DevServer(3000, config);

      // Mock request and response
      const mockReq = {
        method: 'POST',
        url: '/webhook/test-project',
        headers: {} as Record<string, string>,
        on: jest.fn<(event: string, callback: (data?: string) => void) => void>(),
      };
      const mockRes = {
        writeHead: jest.fn(),
        end: jest.fn(),
      };

      // Mock the data event to provide proper webhook payload
      mockReq.on.mockImplementation((event: string, callback: (data?: string) => void) => {
        if (event === 'data') {
          callback(
            JSON.stringify({
              data: {
                type: 'payment',
                id: 'pay_123',
                attributes: {
                  amount: 10000,
                  status: 'paid',
                },
              },
            })
          );
        } else if (event === 'end') {
          callback();
        }
      });

      const mockServer: MockServer = {
        listen: jest.fn((port: number, callback?: () => void) => {
          if (callback) callback();
        }),
        on: jest.fn(),
        close: jest.fn(),
      };
      mockHttpCreateServer.mockReturnValue(mockServer);

      await devServer.start();

      // Get the request handler from the createServer call
      const requestHandler = mockHttpCreateServer.mock.calls[0]?.[0] as unknown as RequestHandler;
      requestHandler(mockReq, mockRes);

      // Wait for async processWebhookBody to complete
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(mockRes.writeHead).toHaveBeenCalledWith(200, { 'Content-Type': 'application/json' });
      expect(mockRes.end).toHaveBeenCalledWith(JSON.stringify({ success: true }));
    });

    it('should reject non-webhook paths', async () => {
      const config = {
        version: '1.0',
        projectName: 'test-project',
        environment: 'test' as const,
        apiKeys: { test: { secret: 'sk_test_key', public: 'pk_test_key' } },
        webhooks: { url: '', events: [] },
        webhookSecrets: {},
        dev: { port: 3000, autoRegisterWebhook: true, verifyWebhookSignatures: false },
      };

      const devServer = new DevServer(3000, config);

      const mockReq = {
        method: 'GET',
        url: '/',
        headers: {} as Record<string, string>,
      };
      const mockRes = {
        writeHead: jest.fn(),
        end: jest.fn(),
      };

      const mockServer: MockServer = { listen: jest.fn(), on: jest.fn(), close: jest.fn() };
      mockHttpCreateServer.mockReturnValue(mockServer);

      await devServer.start();

      const requestHandler = mockHttpCreateServer.mock.calls[0]?.[0] as unknown as RequestHandler;
      requestHandler(mockReq, mockRes);

      expect(mockRes.writeHead).toHaveBeenCalledWith(404);
      expect(mockRes.end).toHaveBeenCalledWith('Not Found');
    });

    it('should verify webhook signatures when enabled', async () => {
      // Mock crypto for signature verification
      mockCryptoTimingSafeEqual.mockReturnValue(true);

      const config = {
        version: '1.0',
        projectName: 'test-project',
        environment: 'test' as const,
        apiKeys: { test: { secret: 'sk_test_key', public: 'pk_test_key' } },
        webhooks: { url: '', events: [] },
        webhookSecrets: { 'webhook-123': 'test-secret' },
        dev: { port: 3000, autoRegisterWebhook: true, verifyWebhookSignatures: true },
      };

      const devServer = new DevServer(3000, config);

      const mockReq = {
        method: 'POST',
        url: '/webhook/test-project',
        headers: {
          'paymongo-signature': 't=1234567890,te=mock-expected-signature,li=',
        } as Record<string, string>,
        on: jest.fn<(event: string, callback: (data?: string) => void) => void>(),
      };
      const mockRes = {
        writeHead: jest.fn(),
        end: jest.fn(),
      };

      mockReq.on.mockImplementation((event: string, callback: (data?: string) => void) => {
        if (event === 'data') {
          callback(
            JSON.stringify({
              data: {
                type: 'payment',
                id: 'pay_123',
                attributes: {
                  amount: 10000,
                  status: 'paid',
                },
              },
            })
          );
        } else if (event === 'end') {
          callback();
        }
      });

      const mockServer: MockServer = {
        listen: jest.fn((port: number, callback?: () => void) => {
          if (callback) callback();
        }),
        on: jest.fn(),
        close: jest.fn(),
      };
      mockHttpCreateServer.mockReturnValue(mockServer);

      await devServer.start();

      const requestHandler = mockHttpCreateServer.mock.calls[0]?.[0] as unknown as RequestHandler;
      requestHandler(mockReq, mockRes);

      // Wait for async processWebhookBody to complete
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(mockRes.writeHead).toHaveBeenCalledWith(200, { 'Content-Type': 'application/json' });
      expect(mockRes.end).toHaveBeenCalledWith(JSON.stringify({ success: true }));
    });

    it('should reject invalid webhook signatures', async () => {
      // Mock crypto to return false for signature verification
      mockCryptoTimingSafeEqual.mockReturnValue(false);

      const config = {
        version: '1.0',
        projectName: 'test-project',
        environment: 'test' as const,
        apiKeys: { test: { secret: 'sk_test_key', public: 'pk_test_key' } },
        webhooks: { url: '', events: [] },
        webhookSecrets: { 'webhook-123': 'test-secret' },
        dev: { port: 3000, autoRegisterWebhook: true, verifyWebhookSignatures: true },
      };

      const devServer = new DevServer(3000, config);

      const mockReq = {
        method: 'POST',
        url: '/webhook/test-project',
        headers: {
          'paymongo-signature': 't=1234567890,te=invalid-signature,li=',
        } as Record<string, string>,
        on: jest.fn<(event: string, callback: (data?: string) => void) => void>(),
      };
      const mockRes = {
        writeHead: jest.fn(),
        end: jest.fn(),
      };

      mockReq.on.mockImplementation((event: string, callback: (data?: string) => void) => {
        if (event === 'data') {
          callback(
            JSON.stringify({
              data: {
                type: 'payment',
                id: 'pay_123',
                attributes: {
                  amount: 10000,
                  status: 'paid',
                },
              },
            })
          );
        } else if (event === 'end') {
          callback();
        }
      });

      const mockServer: MockServer = {
        listen: jest.fn((port: number, callback?: () => void) => {
          if (callback) callback();
        }),
        on: jest.fn(),
        close: jest.fn(),
      };
      mockHttpCreateServer.mockReturnValue(mockServer);

      await devServer.start();

      const requestHandler = mockHttpCreateServer.mock.calls[0]?.[0] as unknown as RequestHandler;
      requestHandler(mockReq, mockRes);

      // Wait for async processWebhookBody to complete
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(mockRes.writeHead).toHaveBeenCalledWith(401, { 'Content-Type': 'application/json' });
      expect(mockRes.end).toHaveBeenCalledWith(JSON.stringify({ error: 'Invalid signature' }));
    });

    it('should record analytics events for successful webhooks', async () => {
      const config = {
        version: '1.0',
        projectName: 'test-project',
        environment: 'test' as const,
        apiKeys: { test: { secret: 'sk_test_key', public: 'pk_test_key' } },
        webhooks: { url: '', events: [] },
        webhookSecrets: {},
        dev: { port: 3000, autoRegisterWebhook: true, verifyWebhookSignatures: false },
        analytics: { enabled: true },
      };

      const devServer = new DevServer(3000, config);

      const mockReq = {
        method: 'POST',
        url: '/webhook/test-project',
        headers: {} as Record<string, string>,
        on: jest.fn<(event: string, callback: (data?: string) => void) => void>(),
      };
      const mockRes = {
        writeHead: jest.fn(),
        end: jest.fn(),
      };

      mockReq.on.mockImplementation((event: string, callback: (data?: string) => void) => {
        if (event === 'data') {
          callback(
            JSON.stringify({
              data: {
                type: 'payment',
                id: 'pay_123',
                attributes: {
                  amount: 10000,
                  status: 'paid',
                },
              },
            })
          );
        } else if (event === 'end') {
          callback();
        }
      });

      const mockServer: MockServer = {
        listen: jest.fn((port: number, callback?: () => void) => {
          if (callback) callback();
        }),
        on: jest.fn(),
        close: jest.fn(),
      };
      mockHttpCreateServer.mockReturnValue(mockServer);

      await devServer.start();

      const requestHandler = mockHttpCreateServer.mock.calls[0]?.[0] as unknown as RequestHandler;
      requestHandler(mockReq, mockRes);

      expect(mockAnalyticsRecordEvent).toHaveBeenCalledWith({
        type: 'payment',
        success: true,
        data: {
          amount: 10000,
          status: 'paid',
        },
      });
    });
  });
});
