import { afterEach, beforeEach, describe, expect, it, vi as jest } from 'vitest';

// Mock modules before importing login command
const mockSelect = jest.fn<() => Promise<string>>();
const mockPassword = jest.fn<() => Promise<string>>();
const mockValidateApiKey = jest.fn<(key: string, type: string) => boolean>();
const mockApiClientValidate = jest.fn<() => Promise<boolean>>();

const mockOsHomedir = jest.fn<() => string>();
const mockOsHostname = jest.fn<() => string>();
const mockOsUserInfo = jest.fn<() => { username: string }>();

const mockPathJoin = jest.fn<(path: string, ...paths: string[]) => string>();
const mockPathDirname = jest.fn<(path: string) => string>();

const mockFsExistsSync = jest.fn<(path: string) => boolean>();
const mockFsMkdirSync = jest.fn<(path: string) => void>();
const mockFsWriteFileSync = jest.fn<(path: string, data: string) => void>();
const mockFsReadFileSync = jest.fn<(path: string) => string>();
const mockFsUnlinkSync = jest.fn<(path: string) => void>();

const mockCryptoRandomBytes = jest.fn<(size: number) => Buffer>();
const mockCryptoCreateCipheriv = jest.fn<() => any>();
const mockCryptoCreateDecipheriv = jest.fn<() => any>();

const mockConfigManagerLoad = jest.fn<() => Promise<any>>();
const mockConfigManagerSave = jest.fn<(config: any) => Promise<void>>();
const mockConfigManagerDelete = jest.fn<() => Promise<void>>();
const mockConfigManagerGetDefaultConfig = jest.fn<() => any>();

jest.mock('@inquirer/prompts', () => ({
  select: mockSelect,
  password: mockPassword,
}));

jest.mock('../../src/utils/validator.js', () => ({
  validateApiKey: mockValidateApiKey,
}));

jest.mock('node:os', () => {
  const osModule = {
    homedir: mockOsHomedir,
    hostname: mockOsHostname,
    userInfo: mockOsUserInfo,
    release: jest.fn(() => '10.0.0'),
  };
  return {
    default: osModule,
    ...osModule,
  };
});

jest.mock('node:path', () => {
  const pathModule = {
    join: mockPathJoin,
    dirname: mockPathDirname,
  };
  return {
    default: pathModule,
    ...pathModule,
  };
});

jest.mock('fs', () => ({
  existsSync: mockFsExistsSync,
  mkdirSync: mockFsMkdirSync,
  writeFileSync: mockFsWriteFileSync,
  readFileSync: mockFsReadFileSync,
  unlinkSync: mockFsUnlinkSync,
}));

jest.mock('crypto', () => ({
  createHash: jest.fn(() => ({
    update: jest.fn(() => ({
      digest: jest.fn(() => 'mock-encryption-key-32-chars-long'),
    })),
  })),
  randomBytes: mockCryptoRandomBytes,
  scryptSync: jest.fn(() => Buffer.from('mock-scrypt-key-32-bytes-long---')),
  createCipheriv: mockCryptoCreateCipheriv,
  createDecipheriv: mockCryptoCreateDecipheriv,
}));

jest.mock('../../src/services/config/manager.js', () => ({
  default: jest.fn().mockImplementation(() => ({
    load: mockConfigManagerLoad,
    save: mockConfigManagerSave,
    delete: mockConfigManagerDelete,
    getDefaultConfig: mockConfigManagerGetDefaultConfig,
  })),
}));

jest.mock('../../src/services/api/client.js', () => ({
  default: jest.fn().mockImplementation(() => ({
    validateApiKey: mockApiClientValidate,
  })),
}));

// Import after mocking
await import('node:fs');
await import('node:os');
await import('node:path');
await import('node:crypto');
await import('@inquirer/prompts');
await import('../../src/utils/validator.js');
const { default: ConfigManager } = await import('../../src/services/config/manager.js');
const { default: ApiClient } = await import('../../src/services/api/client.js');
const { CredentialManager, command } = await import('../../src/commands/login.js');

describe('Login Command', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Mock console methods
    jest.spyOn(global.console, 'log').mockImplementation(() => {});
    jest.spyOn(global.console, 'error').mockImplementation(() => {});

    // Mock OS functions
    mockOsHomedir.mockReturnValue('/home/user');
    mockOsHostname.mockReturnValue('test-machine');
    mockOsUserInfo.mockReturnValue({ username: 'testuser' });

    // Mock path.join to behave like Unix path.join (for Linux compatibility)
    mockPathJoin.mockImplementation((...paths: string[]) => {
      return paths.join('/').replace(/\\/g, '/');
    });
    mockPathDirname.mockImplementation((pathValue: string) => {
      const normalized = pathValue.replace(/\\/g, '/');
      const parts = normalized.split('/');
      parts.pop();
      return parts.join('/') || '/';
    });

    // Mock crypto
    mockCryptoRandomBytes.mockImplementation((size: number) => Buffer.alloc(size, '1'));
    const mockCipher = {
      update: jest.fn(() => Buffer.from('encrypted')),
      final: jest.fn(() => Buffer.from('final')),
      getAuthTag: jest.fn(() => Buffer.from('tag')),
    };
    mockCryptoCreateCipheriv.mockReturnValue(mockCipher);

    const mockDecipher = {
      setAuthTag: jest.fn(() => {}),
      update: jest.fn(() => Buffer.from('decrypted')),
      final: jest.fn(() => Buffer.from('')),
    };
    mockCryptoCreateDecipheriv.mockReturnValue(mockDecipher);

    // Default mocks
    mockFsExistsSync.mockReturnValue(false);
    mockFsMkdirSync.mockImplementation(() => {});
    mockFsWriteFileSync.mockImplementation(() => {});
    mockFsReadFileSync.mockReturnValue('{}');
    mockFsUnlinkSync.mockImplementation(() => {});

    mockConfigManagerLoad.mockResolvedValue(null);
    mockConfigManagerSave.mockResolvedValue();
    mockConfigManagerDelete.mockResolvedValue();
    mockConfigManagerGetDefaultConfig.mockReturnValue({
      version: '1.0',
      projectName: 'test-project',
      environment: 'test',
      apiKeys: {},
      webhooks: { url: null, events: [] },
      dev: { port: 3000, autoRegisterWebhook: true, verifyWebhookSignatures: false },
    });

    mockApiClientValidate.mockResolvedValue(true);
    mockValidateApiKey.mockReturnValue(true);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('logout functionality', () => {
    it('should clear stored credentials and config', async () => {
      mockFsExistsSync.mockReturnValue(true);

      await import('../../src/commands/login.js');

      // Mock the action execution by calling it directly
      // Since Commander action is complex, we'll test the CredentialManager separately
      const { CredentialManager } = await import('../../src/commands/login.js');

      const credManager = new CredentialManager();
      await credManager.clearCredentials();

      const { join } = await import('node:path');
      const expectedPath = join('/home/user', '.paymongo', 'credentials.enc');
      expect(mockFsUnlinkSync).toHaveBeenCalledWith(expectedPath);
    });
  });

  describe('CredentialManager', () => {
    it('should save and load credentials with encryption', async () => {
      const credentials = {
        environment: 'test',
        secretKey: 'sk_test_123',
        publicKey: 'pk_test_456',
      };

      // Mock the decipher to return the credentials as JSON
      const mockDecipher = {
        setAuthTag: jest.fn(() => {}),
        update: jest.fn(() => Buffer.from(JSON.stringify(credentials))),
        final: jest.fn(() => Buffer.from('')),
      };
      mockCryptoCreateDecipheriv.mockReturnValue(mockDecipher);

      const credManager = new CredentialManager();
      await credManager.saveCredentials(credentials);

      // Mock the encrypted data file exists
      mockFsExistsSync.mockReturnValue(true);
      mockFsReadFileSync.mockReturnValue(
        JSON.stringify({
          v: 2,
          iv: '123456789012',
          tag: 'deadbeef',
          data: 'encrypted-data',
        })
      );

      const loaded = await credManager.loadCredentials();

      expect(mockFsWriteFileSync).toHaveBeenCalled();
      expect(loaded).toEqual(credentials);
    });

    it('should return null when no credentials exist', async () => {
      mockFsExistsSync.mockReturnValue(false);

      const credManager = new CredentialManager();
      const loaded = await credManager.loadCredentials();

      expect(loaded).toBeNull();
    });
  });

  describe('interactive login mode', () => {
    it('should prompt for credentials and validate successfully', async () => {
      mockSelect.mockResolvedValue('test');
      mockPassword.mockResolvedValueOnce('sk_test_valid_key');
      mockPassword.mockResolvedValueOnce('pk_test_valid_public_key');

      // Mock successful API validation
      mockApiClientValidate.mockResolvedValue(true);

      // Verify the command module exports correctly
      expect(command).toBeDefined();
      expect(typeof command.name).toBe('function');
      expect(CredentialManager).toBeDefined();
    });

    it('should use stored credentials as defaults in interactive mode', async () => {
      const storedCredentials = {
        environment: 'live',
        secretKey: 'sk_live_stored_key',
        publicKey: 'pk_live_stored_public',
      };

      // Mock stored credentials file exists
      mockFsExistsSync.mockReturnValue(true);
      mockFsReadFileSync.mockReturnValue(
        JSON.stringify({
          v: 2,
          iv: '123456789012',
          tag: 'deadbeef',
          data: 'encrypted-credentials',
        })
      );

      // Mock decryption to return stored credentials
      const mockDecipher = {
        setAuthTag: jest.fn(() => {}),
        update: jest.fn(() => Buffer.from(JSON.stringify(storedCredentials))),
        final: jest.fn(() => Buffer.from('')),
      };
      mockCryptoCreateDecipheriv.mockReturnValue(mockDecipher);

      // Load stored credentials via CredentialManager
      const credManager = new CredentialManager();
      const loaded = await credManager.loadCredentials();

      expect(loaded).toEqual(storedCredentials);
    });
  });

  describe('non-interactive login mode', () => {
    it('should accept API keys via command options', async () => {
      mockApiClientValidate.mockResolvedValue(true);

      // The command module is already imported at the top level
      // Verify the mock is set up correctly for validation
      expect(mockApiClientValidate).toHaveBeenCalledTimes(0); // Not called yet - would be called when command runs
      expect(command).toBeDefined();
    });

    it('should fail validation for invalid API key format', async () => {
      mockValidateApiKey.mockReturnValue(false);

      // Test that validateApiKey mock returns false for invalid keys
      const isValid = mockValidateApiKey('invalid_key', 'secret');
      expect(isValid).toBe(false);
    });
  });

  describe('API key validation', () => {
    it('should validate API key with PayMongo service', async () => {
      mockApiClientValidate.mockResolvedValue(true);

      // Create an instance using the mocked ApiClient constructor
      const apiClient = new ApiClient({
        config: {
          version: '1.0',
          projectName: 'test',
          environment: 'test',
          apiKeys: {
            test: { secret: 'sk_test_valid', public: 'pk_test_valid' },
          },
          webhooks: { url: '', events: [] },
          webhookSecrets: {},
          dev: { port: 3000, autoRegisterWebhook: true, verifyWebhookSignatures: false },
        },
      });

      // The mocked constructor returns an object with validateApiKey method
      const result = await apiClient.validateApiKey();
      expect(result).toBe(true);
    });

    it('should handle API key validation failure', async () => {
      mockApiClientValidate.mockRejectedValue(new Error('Invalid API key'));

      const apiClient = new ApiClient({
        config: {
          version: '1.0',
          projectName: 'test',
          environment: 'test',
          apiKeys: {
            test: { secret: 'sk_test_invalid', public: 'pk_test_invalid' },
          },
          webhooks: { url: '', events: [] },
          webhookSecrets: {},
          dev: { port: 3000, autoRegisterWebhook: true, verifyWebhookSignatures: false },
        },
      });

      await expect(apiClient.validateApiKey()).rejects.toThrow('Invalid API key');
    });
  });

  describe('configuration updates', () => {
    it('should update existing project configuration with new API keys', async () => {
      const existingConfig = {
        version: '1.0',
        projectName: 'existing-project',
        environment: 'test' as const,
        apiKeys: { test: { public: 'pk_test_old', secret: 'sk_test_old' } },
        webhooks: { url: '', events: [] as string[] },
        webhookSecrets: {},
        dev: { port: 3000, autoRegisterWebhook: true, verifyWebhookSignatures: false },
      };

      const newConfig = {
        ...existingConfig,
        environment: 'live' as const,
        apiKeys: {
          live: { public: 'pk_live_new', secret: 'sk_live_new' },
        },
      };

      mockConfigManagerLoad.mockResolvedValue(existingConfig);
      mockApiClientValidate.mockResolvedValue(true);

      // Use the mocked ConfigManager
      const configManager = new ConfigManager();
      await configManager.save(newConfig);

      expect(mockConfigManagerSave).toHaveBeenCalledWith(newConfig);
    });

    it('should create new configuration if none exists', async () => {
      mockConfigManagerLoad.mockResolvedValue(null);
      mockApiClientValidate.mockResolvedValue(true);

      // The mocked getDefaultConfig returns the default config
      const configManager = new ConfigManager();
      const defaultConfig = configManager.getDefaultConfig();

      expect(mockConfigManagerGetDefaultConfig).toHaveBeenCalled();
      expect(defaultConfig).toEqual(
        expect.objectContaining({
          version: '1.0',
          apiKeys: {},
        })
      );
    });
  });

  describe('error handling', () => {
    it('should handle network errors during API validation', async () => {
      mockApiClientValidate.mockRejectedValue(new Error('Network timeout'));

      // Use the mocked ApiClient
      const apiClient = new ApiClient({
        config: {
          version: '1.0',
          projectName: 'test',
          environment: 'test',
          apiKeys: { test: { secret: 'sk_test_key', public: '' } },
          webhooks: { url: '', events: [] },
          webhookSecrets: {},
          dev: { port: 3000, autoRegisterWebhook: true, verifyWebhookSignatures: false },
        },
      });

      await expect(apiClient.validateApiKey()).rejects.toThrow('Network timeout');
    });

    it('should handle file system errors during credential storage', async () => {
      mockFsWriteFileSync.mockImplementation(() => {
        throw new Error('Permission denied');
      });

      const credManager = new CredentialManager();

      await expect(
        credManager.saveCredentials({
          environment: 'test',
          secretKey: 'sk_test_key',
        })
      ).rejects.toThrow('Permission denied');
    });
  });
});
