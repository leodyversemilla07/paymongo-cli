import { afterEach, beforeEach, describe, expect, it, vi as jest } from 'vitest';
import type { PayMongoConfig } from '../../src/types/paymongo.js';

// Mock modules before importing init command
const mockConfigManagerExists = jest.fn<() => Promise<boolean>>();
const mockConfigManagerSave = jest.fn<(config: PayMongoConfig) => Promise<void>>();
const mockApiClientValidateApiKey = jest.fn<() => Promise<boolean>>();
const mockSpinnerStart = jest.fn<(text?: string) => void>();
const mockSpinnerSucceed = jest.fn<(text?: string) => void>();
const mockSpinnerFail = jest.fn<(text?: string) => void>();
const mockSpinnerStop = jest.fn<() => void>();

// Mock external dependencies
jest.mock('fs', () => ({
  existsSync: jest.fn<(path: string) => boolean>(),
  writeFileSync: jest.fn<(path: string, content: string) => void>(),
  readFileSync: jest.fn<(path: string, encoding?: string) => string>(),
  mkdirSync: jest.fn(),
}));

jest.mock('path', () => ({
  join: jest.fn((...args: string[]) => args.join('/')),
  basename: jest.fn((path: string) => path.split('/').pop() || ''),
}));

jest.mock('../../src/services/config/manager.js', () => ({
  default: jest.fn().mockImplementation(() => ({
    exists: mockConfigManagerExists,
    save: mockConfigManagerSave,
  })),
}));

jest.mock('../../src/services/api/client.js', () => ({
  default: jest.fn().mockImplementation(() => ({
    validateApiKey: mockApiClientValidateApiKey,
  })),
}));

jest.mock('../../src/utils/spinner.js', () => ({
  default: jest.fn().mockImplementation(() => ({
    start: mockSpinnerStart,
    succeed: mockSpinnerSucceed,
    fail: mockSpinnerFail,
    stop: mockSpinnerStop,
  })),
}));

const mockValidateApiKey = jest.fn<(key: string, type: 'public' | 'secret') => boolean>();

jest.mock('../../src/utils/validator.js', () => ({
  validateApiKey: mockValidateApiKey,
}));

jest.mock('@inquirer/prompts', () => ({
  confirm: jest.fn<(options: any) => Promise<boolean>>(),
  input: jest.fn<(options: any) => Promise<string>>(),
  select: jest.fn<(options: any) => Promise<string>>(),
  password: jest.fn<(options: any) => Promise<string>>(),
  checkbox: jest.fn<(options: any) => Promise<string[]>>(),
  number: jest.fn<(options: any) => Promise<number>>(),
}));

// Mock process.cwd and process.exit
const mockProcessCwd = jest.fn<() => string>();
const mockProcessExit = jest.fn<(code: number) => never>();

Object.defineProperty(process, 'cwd', {
  value: mockProcessCwd,
  writable: true,
});

Object.defineProperty(process, 'exit', {
  value: mockProcessExit,
  writable: true,
});

// Import after mocking
const { initAction } = await import('../../src/commands/init.js');
const fs = await import('node:fs');
await import('node:path');
await import('../../src/utils/validator.js');
const prompts = await import('@inquirer/prompts');

describe('Init Command', () => {
  const originalConsoleLog = console.log;
  const originalConsoleError = console.error;
  const originalProcessCwd = process.cwd;
  const originalProcessExit = process.exit;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock console methods
    console.log = jest.fn();
    console.error = jest.fn();

    // Mock process methods
    mockProcessCwd.mockReturnValue('/test/project');
    process.cwd = mockProcessCwd;
    process.exit = mockProcessExit;

    // Default mock implementations
    mockConfigManagerExists.mockResolvedValue(false);
    mockConfigManagerSave.mockResolvedValue(undefined);
    mockApiClientValidateApiKey.mockResolvedValue(true);
    mockValidateApiKey.mockReturnValue(true);

    // Mock file system
    (fs.existsSync as jest.MockedFunction<typeof fs.existsSync>).mockReturnValue(false);
    (fs.writeFileSync as jest.MockedFunction<typeof fs.writeFileSync>).mockImplementation(() => {});
    (fs.readFileSync as jest.MockedFunction<typeof fs.readFileSync>).mockReturnValue('');

    // Path is already mocked via jest.mock
  });

  afterEach(() => {
    console.log = originalConsoleLog;
    console.error = originalConsoleError;
    process.cwd = originalProcessCwd;
    process.exit = originalProcessExit;
  });

  describe('non-interactive mode', () => {
    it('should initialize with provided options', async () => {
      // Mock successful initialization
      mockConfigManagerExists.mockResolvedValue(false);
      mockApiClientValidateApiKey.mockResolvedValue(true);

      const options = {
        nonInteractive: true,
        name: 'test-project',
        key: 'sk_test_123',
        env: 'test' as const,
        port: '3000',
        events: 'payment.paid,payment.failed',
      };

      await initAction(options);

      expect(mockSpinnerSucceed).toHaveBeenCalledTimes(3);
      expect(mockSpinnerSucceed).toHaveBeenNthCalledWith(1, 'API keys validated');
      expect(mockSpinnerSucceed).toHaveBeenNthCalledWith(2, 'Configuration saved');
      expect(mockSpinnerSucceed).toHaveBeenNthCalledWith(3, '.env file created');
      expect(mockProcessExit).not.toHaveBeenCalled();
    });

    it('should use default project name when not provided', async () => {
      mockProcessCwd.mockReturnValue('/test/my-project');

      await initAction({
        nonInteractive: true,
        key: 'sk_test_123',
        env: 'test' as const,
        port: '3000',
        events: 'payment.paid,payment.failed',
      });

      expect(mockConfigManagerSave).toHaveBeenCalledWith(
        expect.objectContaining({
          projectName: 'my-project',
        })
      );
    });

    it('should exit with error when API key validation fails', async () => {
      mockApiClientValidateApiKey.mockRejectedValue(new Error('Invalid API key'));

      await expect(
        initAction({
          nonInteractive: true,
          key: 'sk_test_123',
          env: 'test' as const,
          port: '3000',
          events: 'payment.paid,payment.failed',
        })
      ).rejects.toThrow('Command failed');

      expect(mockSpinnerFail).toHaveBeenCalledWith('API key validation failed');
    });

    it('should exit with error when API key validation fails', async () => {
      mockApiClientValidateApiKey.mockRejectedValue(new Error('Invalid API key'));

      await expect(
        initAction({
          nonInteractive: true,
          key: 'sk_test_123',
          env: 'test' as const,
          port: '3000',
          events: 'payment.paid,payment.failed',
        })
      ).rejects.toThrow('Command failed');

      expect(mockSpinnerFail).toHaveBeenCalledWith('API key validation failed');
    });

    it('should handle file system errors during .env creation', async () => {
      (fs.writeFileSync as jest.MockedFunction<typeof fs.writeFileSync>).mockImplementation(() => {
        throw new Error('Permission denied');
      });

      await expect(
        initAction({
          nonInteractive: true,
          key: 'sk_test_123',
          env: 'test',
          port: '3000',
          events: 'payment.paid,payment.failed',
        })
      ).rejects.toThrow('Command failed');

      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('File system error'),
        expect.any(String)
      );
    });
  });

  describe('interactive mode', () => {
    beforeEach(() => {
      // Mock interactive prompts
      (prompts.confirm as jest.MockedFunction<any>).mockResolvedValue(true);
      (prompts.input as jest.MockedFunction<any>).mockResolvedValue('test-project');
      (prompts.select as jest.MockedFunction<any>).mockResolvedValue('test');
      (prompts.password as jest.MockedFunction<any>)
        .mockResolvedValueOnce('sk_test_123') // secret key
        .mockResolvedValueOnce('pk_test_456'); // public key
      (prompts.checkbox as jest.MockedFunction<any>).mockResolvedValue(['payment.paid']);
      (prompts.number as jest.MockedFunction<any>).mockResolvedValue(3000);
    });

    it('should prompt for configuration in interactive mode', async () => {
      await initAction({
        nonInteractive: false,
        env: 'test',
        port: '3000',
        events: 'payment.paid,payment.failed',
      });

      expect(prompts.input).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Project name:',
        })
      );
      expect(prompts.select).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Environment:',
        })
      );
      expect(prompts.password).toHaveBeenCalledTimes(2); // secret and public key
      expect(prompts.checkbox).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Webhook events to listen for:',
        })
      );
      expect(prompts.number).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Development server port:',
        })
      );
    });

    it('should cancel initialization when user declines overwrite', async () => {
      mockConfigManagerExists.mockResolvedValue(true);
      (prompts.confirm as jest.MockedFunction<typeof prompts.confirm>).mockResolvedValue(false);

      await initAction({
        nonInteractive: false,
        env: 'test',
        port: '3000',
        events: 'payment.paid,payment.failed',
      });

      expect(mockConfigManagerSave).not.toHaveBeenCalled();
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Initialization cancelled'));
    });
  });

  describe('configuration file handling', () => {
    it('should create .env file with API keys', async () => {
      await initAction({
        nonInteractive: true,
        name: 'test-project',
        key: 'sk_test_123',
        publicKey: 'pk_test_456',
        env: 'test',
        port: '3000',
        events: 'payment.paid,payment.failed',
      });

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        '/test/project/.env',
        expect.stringContaining('PAYMONGO_SECRET_KEY=sk_test_123')
      );
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        '/test/project/.env',
        expect.stringContaining('PAYMONGO_PUBLIC_KEY=pk_test_456')
      );
    });

    it('should update .gitignore when it exists', async () => {
      (fs.existsSync as jest.MockedFunction<typeof fs.existsSync>).mockReturnValue(true);
      (fs.readFileSync as jest.MockedFunction<typeof fs.readFileSync>).mockReturnValue(
        'node_modules\n'
      );

      await initAction({
        nonInteractive: true,
        key: 'sk_test_123',
        env: 'test',
        port: '3000',
        events: 'payment.paid,payment.failed',
      });

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        '/test/project/.gitignore',
        'node_modules\n\n# PayMongo\n.env\n.paymongo\n'
      );
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('Added .env and .paymongo to .gitignore')
      );
    });

    it('should not update .gitignore if entries already exist', async () => {
      (fs.existsSync as jest.MockedFunction<typeof fs.existsSync>).mockReturnValue(true);
      (fs.readFileSync as jest.MockedFunction<typeof fs.readFileSync>).mockReturnValue(
        'node_modules\n.env\n.paymongo\n'
      );

      await initAction({
        nonInteractive: true,
        key: 'sk_test_123',
        env: 'test',
        port: '3000',
        events: 'payment.paid,payment.failed',
      });

      expect(fs.writeFileSync).not.toHaveBeenCalledWith(
        '/test/project/.gitignore',
        expect.anything()
      );
    });
  });

  describe('error handling', () => {
    it('should provide actionable error messages for API key issues', async () => {
      const { ApiKeyError } = await import('../../src/utils/errors.js');
      const error = new ApiKeyError('Invalid API key', 'secret');
      mockApiClientValidateApiKey.mockRejectedValue(error);

      await expect(
        initAction({
          nonInteractive: true,
          key: 'sk_test_123',
          env: 'test',
          port: '3000',
          events: 'payment.paid,payment.failed',
        })
      ).rejects.toThrow('Command failed');

      expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Invalid API keys'));
    });

    it('should handle network errors with specific guidance', async () => {
      const { NetworkError } = await import('../../src/utils/errors.js');
      const error = new NetworkError('Network connection failed');
      mockApiClientValidateApiKey.mockRejectedValue(error);

      await expect(
        initAction({
          nonInteractive: true,
          key: 'sk_test_123',
          env: 'test',
          port: '3000',
          events: 'payment.paid,payment.failed',
        })
      ).rejects.toThrow('Command failed');

      expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Network error'));
    });

    it('should handle file system permission errors', async () => {
      mockConfigManagerSave.mockRejectedValue(new Error('Permission denied'));

      await expect(
        initAction({
          nonInteractive: true,
          key: 'sk_test_123',
          env: 'test',
          port: '3000',
          events: 'payment.paid,payment.failed',
        })
      ).rejects.toThrow('Command failed');

      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('File system error'),
        expect.any(String)
      );
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('Make sure you have write permissions')
      );
    });
  });
});
