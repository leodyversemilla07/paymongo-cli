import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import ConfigManager from '../../src/services/config/manager';

describe('ConfigManager', () => {
  let tempDir: string;
  let configManager: ConfigManager;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'paymongo-test-'));
    configManager = new ConfigManager({ configPath: path.join(tempDir, '.paymongo') });
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('save and load', () => {
    it('should save and load configuration correctly', async () => {
      const config = {
        version: '1.0',
        projectName: 'Test Project',
        environment: 'test' as const,
        apiKeys: {
          test: {
            public: 'pk_test_123',
            secret: 'sk_test_456',
          },
        },
        webhooks: {
          url: 'https://example.com/webhook',
          events: ['payment.paid'],
        },
        webhookSecrets: {},
        dev: {
          port: 3000,
          autoRegisterWebhook: true,
          verifyWebhookSignatures: false,
        },
      };

      await configManager.save(config);
      const loadedConfig = await configManager.load();

      expect(loadedConfig).toEqual(config);
    });

    it('should return null when config file does not exist', async () => {
      const loadedConfig = await configManager.load();
      expect(loadedConfig).toBeNull();
    });
  });

  describe('exists', () => {
    it('should return false when config file does not exist', async () => {
      const exists = await configManager.exists();
      expect(exists).toBe(false);
    });

    it('should return true when config file exists', async () => {
      const config = configManager.getDefaultConfig();
      await configManager.save(config);

      const exists = await configManager.exists();
      expect(exists).toBe(true);
    });
  });

  describe('delete', () => {
    it('should delete existing config file', async () => {
      const config = configManager.getDefaultConfig();
      await configManager.save(config);

      expect(await configManager.exists()).toBe(true);

      await configManager.delete();

      expect(await configManager.exists()).toBe(false);
    });

    it('should not throw error when deleting non-existent config file', async () => {
      expect(await configManager.exists()).toBe(false);

      await expect(configManager.delete()).resolves.not.toThrow();
    });
  });

  describe('getDefaultConfig', () => {
    it('should return a valid default configuration', () => {
      const defaultConfig = configManager.getDefaultConfig();

      expect(defaultConfig.version).toBe('1.0');
      expect(defaultConfig.environment).toBe('test');
      expect(defaultConfig.dev.port).toBe(3000);
      expect(defaultConfig.dev.autoRegisterWebhook).toBe(true);
      expect(defaultConfig.dev.verifyWebhookSignatures).toBe(false);
      expect(defaultConfig.webhooks.events).toEqual(['payment.paid', 'payment.failed']);
    });
  });

  describe('mergeConfig', () => {
    it('should merge configurations correctly', () => {
      const base = configManager.getDefaultConfig();
      const updates = {
        projectName: 'Updated Project',
        dev: {
          port: 4000,
          autoRegisterWebhook: false,
          verifyWebhookSignatures: true,
        },
      };

      const merged = configManager.mergeConfig(base, updates);

      expect(merged.projectName).toBe('Updated Project');
      expect(merged.dev.port).toBe(4000);
      expect(merged.dev.autoRegisterWebhook).toBe(false);
      expect(merged.webhooks.events).toEqual(['payment.paid', 'payment.failed']); // unchanged
    });
  });
});
