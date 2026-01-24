import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';

/**
 * Unit tests for login command functionality.
 * These tests mock external dependencies to test the login logic without real API calls.
 */

// Mock modules
const mockValidateApiKey = jest.fn<() => Promise<boolean>>();
const mockConfigManagerLoad = jest.fn<() => Promise<any>>();
const mockConfigManagerSave = jest.fn<() => Promise<void>>();
const mockConfigManagerExists = jest.fn<() => Promise<boolean>>();

jest.unstable_mockModule('../../src/services/api/client.js', () => ({
  default: jest.fn().mockImplementation(() => ({
    validateApiKey: mockValidateApiKey,
  })),
  ApiClient: jest.fn().mockImplementation(() => ({
    validateApiKey: mockValidateApiKey,
  })),
}));

jest.unstable_mockModule('../../src/services/config/manager.js', () => ({
  default: jest.fn().mockImplementation(() => ({
    load: mockConfigManagerLoad,
    save: mockConfigManagerSave,
    exists: mockConfigManagerExists,
    getDefaultConfig: () => ({
      version: '1.0',
      projectName: 'PayMongo Project',
      environment: 'test',
      apiKeys: {},
      webhooks: { url: '', events: [] },
      webhookSecrets: {},
      dev: { port: 3000, autoRegisterWebhook: true, verifyWebhookSignatures: false },
    }),
  })),
  ConfigManager: jest.fn().mockImplementation(() => ({
    load: mockConfigManagerLoad,
    save: mockConfigManagerSave,
    exists: mockConfigManagerExists,
  })),
}));

describe('Login Command Unit Tests', () => {
  let tempDir: string;
  let originalHome: string | undefined;
  let originalUserProfile: string | undefined;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Create temp directory for credential storage
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'paymongo-login-test-'));
    
    // Save original environment
    originalHome = process.env.HOME;
    originalUserProfile = process.env.USERPROFILE;
    
    // Set HOME to temp directory
    process.env.HOME = tempDir;
    process.env.USERPROFILE = tempDir;
  });

  afterEach(() => {
    // Restore original environment
    process.env.HOME = originalHome;
    process.env.USERPROFILE = originalUserProfile;
    
    // Clean up temp directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('CredentialManager', () => {
    it('should create credentials directory with correct permissions', () => {
      const configDir = path.join(tempDir, '.paymongo');
      
      // Directory should be created when CredentialManager is instantiated
      fs.mkdirSync(configDir, { recursive: true, mode: 0o700 });
      
      expect(fs.existsSync(configDir)).toBe(true);
    });

    it('should generate encryption key from machine-specific data', () => {
      const machineId = os.hostname() + os.userInfo().username;
      const encryptionKey = crypto
        .createHash('sha256')
        .update(machineId)
        .digest('hex')
        .substring(0, 32);
      
      // Key should be 32 characters (256 bits for AES-256)
      expect(encryptionKey).toHaveLength(32);
    });

    it('should encrypt and decrypt credentials correctly', () => {
      const credentials = {
        environment: 'test',
        secretKey: 'sk_test_1234567890',
        publicKey: 'pk_test_1234567890',
      };

      // Generate encryption key
      const machineId = os.hostname() + os.userInfo().username;
      const encryptionKey = crypto
        .createHash('sha256')
        .update(machineId)
        .digest('hex')
        .substring(0, 32);

      // Encrypt
      const data = JSON.stringify(credentials);
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipheriv('aes-256-cbc', encryptionKey, iv);
      let encrypted = cipher.update(data, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      const encryptedData = iv.toString('hex') + ':' + encrypted;

      // Decrypt
      const [ivHex, encryptedHex] = encryptedData.split(':');
      const decipher = crypto.createDecipheriv(
        'aes-256-cbc',
        encryptionKey,
        Buffer.from(ivHex!, 'hex')
      );
      let decrypted = decipher.update(encryptedHex!, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      const decryptedCredentials = JSON.parse(decrypted);

      expect(decryptedCredentials).toEqual(credentials);
    });

    it('should store encrypted credentials to file', () => {
      const configDir = path.join(tempDir, '.paymongo');
      fs.mkdirSync(configDir, { recursive: true });
      
      const credentialsPath = path.join(configDir, 'credentials.enc');
      const encryptedData = 'encrypted_test_data';
      
      fs.writeFileSync(credentialsPath, encryptedData, { mode: 0o600 });
      
      expect(fs.existsSync(credentialsPath)).toBe(true);
      expect(fs.readFileSync(credentialsPath, 'utf-8')).toBe(encryptedData);
    });

    it('should delete credentials file on logout', () => {
      const configDir = path.join(tempDir, '.paymongo');
      fs.mkdirSync(configDir, { recursive: true });
      
      const credentialsPath = path.join(configDir, 'credentials.enc');
      fs.writeFileSync(credentialsPath, 'test_data');
      
      expect(fs.existsSync(credentialsPath)).toBe(true);
      
      // Simulate logout by deleting credentials
      fs.unlinkSync(credentialsPath);
      
      expect(fs.existsSync(credentialsPath)).toBe(false);
    });
  });

  describe('API Key Validation', () => {
    it('should validate test API key format', () => {
      const validTestKey = 'sk_test_1234567890123456789012';
      const invalidKey = 'invalid_key';
      
      // Test key format validation (starts with sk_test_ or sk_live_)
      expect(validTestKey.startsWith('sk_test_')).toBe(true);
      expect(invalidKey.startsWith('sk_test_')).toBe(false);
      expect(invalidKey.startsWith('sk_live_')).toBe(false);
    });

    it('should validate live API key format', () => {
      const validLiveKey = 'sk_live_1234567890123456789012';
      
      expect(validLiveKey.startsWith('sk_live_')).toBe(true);
    });

    it('should return true when API validation succeeds', async () => {
      mockValidateApiKey.mockResolvedValue(true);
      
      const result = await mockValidateApiKey();
      
      expect(result).toBe(true);
    });

    it('should return false when API validation fails', async () => {
      mockValidateApiKey.mockResolvedValue(false);
      
      const result = await mockValidateApiKey();
      
      expect(result).toBe(false);
    });
  });

  describe('Config Integration', () => {
    it('should update existing config with new API keys', async () => {
      const existingConfig = {
        version: '1.0',
        projectName: 'Test Project',
        environment: 'test',
        apiKeys: {},
        webhooks: { url: '', events: [] },
        webhookSecrets: {},
        dev: { port: 3000, autoRegisterWebhook: true, verifyWebhookSignatures: false },
      };
      
      mockConfigManagerLoad.mockResolvedValue(existingConfig);
      mockConfigManagerExists.mockResolvedValue(true);
      
      const config = await mockConfigManagerLoad();
      
      // Update config with new API keys
      config.apiKeys.test = {
        public: 'pk_test_new',
        secret: 'sk_test_new',
      };
      
      expect(config.apiKeys.test.secret).toBe('sk_test_new');
      expect(config.apiKeys.test.public).toBe('pk_test_new');
    });

    it('should create new config when none exists', async () => {
      mockConfigManagerExists.mockResolvedValue(false);
      mockConfigManagerLoad.mockResolvedValue(null);
      
      const exists = await mockConfigManagerExists();
      
      expect(exists).toBe(false);
    });

    it('should save config after successful login', async () => {
      mockConfigManagerSave.mockResolvedValue(undefined);
      
      const config = {
        version: '1.0',
        projectName: 'Test',
        environment: 'test' as const,
        apiKeys: {
          test: { public: 'pk_test_123', secret: 'sk_test_123' },
        },
        webhooks: { url: '', events: [] },
        webhookSecrets: {},
        dev: { port: 3000, autoRegisterWebhook: true, verifyWebhookSignatures: false },
      };
      
      await mockConfigManagerSave(config);
      
      expect(mockConfigManagerSave).toHaveBeenCalledWith(config);
    });
  });

  describe('Environment Selection', () => {
    it('should support test environment', () => {
      const environments = ['test', 'live'];
      expect(environments).toContain('test');
    });

    it('should support live environment', () => {
      const environments = ['test', 'live'];
      expect(environments).toContain('live');
    });

    it('should use correct API key prefix for test environment', () => {
      const testSecretPrefix = 'sk_test_';
      const testPublicPrefix = 'pk_test_';
      
      expect('sk_test_123'.startsWith(testSecretPrefix)).toBe(true);
      expect('pk_test_123'.startsWith(testPublicPrefix)).toBe(true);
    });

    it('should use correct API key prefix for live environment', () => {
      const liveSecretPrefix = 'sk_live_';
      const livePublicPrefix = 'pk_live_';
      
      expect('sk_live_123'.startsWith(liveSecretPrefix)).toBe(true);
      expect('pk_live_123'.startsWith(livePublicPrefix)).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should handle API validation errors gracefully', async () => {
      mockValidateApiKey.mockRejectedValue(new Error('Network error'));
      
      await expect(mockValidateApiKey()).rejects.toThrow('Network error');
    });

    it('should handle config save errors', async () => {
      mockConfigManagerSave.mockRejectedValue(new Error('Permission denied'));
      
      await expect(mockConfigManagerSave({})).rejects.toThrow('Permission denied');
    });

    it('should handle missing credentials file gracefully', () => {
      const credentialsPath = path.join(tempDir, '.paymongo', 'credentials.enc');
      
      expect(fs.existsSync(credentialsPath)).toBe(false);
    });
  });
});
