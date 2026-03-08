import ConfigManager from '../../src/services/config/manager.js';
import { PayMongoConfig } from '../../src/types/paymongo.js';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { validateConfig } from '../../src/types/schemas.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('ConfigManager', () => {
  const testDir = path.join(__dirname, '..', 'temp');
  const configPath = path.join(testDir, '.paymongo');
  let configManager: ConfigManager;
  let originalCwd: string;

  beforeEach(() => {
    // Store original working directory
    originalCwd = process.cwd();

    // Create temp directory
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }

    // Clean up any existing config
    if (fs.existsSync(configPath)) {
      fs.unlinkSync(configPath);
    }

    // Change to test directory
    process.chdir(testDir);
    configManager = new ConfigManager();
  });

  afterEach(() => {
    // Change back to original directory first
    if (originalCwd && originalCwd !== process.cwd()) {
      process.chdir(originalCwd);
    }

    // Clean up with retry mechanism for Windows file locking
    const cleanup = () => {
      try {
        if (fs.existsSync(configPath)) {
          fs.unlinkSync(configPath);
        }
        if (fs.existsSync(testDir)) {
          fs.rmSync(testDir, { recursive: true, force: true });
        }
        return true;
      } catch (_error) {
        // Retry after a short delay for Windows file locking
        return false;
      }
    };

    // Retry cleanup up to 5 times with increasing delays
    let attempts = 0;
    const maxAttempts = 5;
    while (attempts < maxAttempts) {
      if (cleanup()) {
        break;
      }
      attempts++;
      // Wait longer between attempts
      const delay = Math.min(100 * Math.pow(2, attempts), 1000);
      if (attempts < maxAttempts) {
        // Use synchronous delay for test cleanup
        const start = Date.now();
        while (Date.now() - start < delay) {
          // Busy wait - acceptable for test cleanup
        }
      }
    }
  });

  describe('save and load', () => {
    it('should save and load config correctly', async () => {
      const testConfig: PayMongoConfig = {
        version: '1.0',
        projectName: 'Test Project',
        environment: 'test',
        apiKeys: {
          test: {
            public: 'pk_test_123',
            secret: 'sk_test_123',
          },
        },
        webhooks: {
          url: 'http://localhost:3000/webhook',
          events: ['payment.paid'],
        },
        webhookSecrets: {},
        dev: {
          port: 3000,
          autoRegisterWebhook: true,
          verifyWebhookSignatures: false,
        },
      };

      // Save config
      await configManager.save(testConfig);

      // Load config
      const loadedConfig = await configManager.load();

      expect(loadedConfig).toEqual(testConfig);
    });

    it('should return null when no config exists', async () => {
      const config = await configManager.load();
      expect(config).toBeNull();
    });

    it('should handle invalid JSON gracefully', async () => {
      // Write invalid JSON
      fs.writeFileSync(configPath, '{ invalid json }');

      // Should handle error gracefully
      await expect(configManager.load()).rejects.toThrow();
    });

    it('should accept rate limiting config through schema validation', () => {
      const config: PayMongoConfig = {
        version: '1.0',
        projectName: 'Rate Limited Project',
        environment: 'test',
        apiKeys: {},
        webhooks: {
          url: 'http://localhost:3000/webhook',
          events: ['payment.paid'],
        },
        webhookSecrets: {},
        dev: {
          port: 3000,
          autoRegisterWebhook: true,
          verifyWebhookSignatures: false,
        },
        rateLimiting: {
          enabled: true,
          maxRequests: 100,
          windowMs: 60000,
          environmentMultiplier: 0.5,
          endpoints: {
            '/webhooks': {
              maxRequests: 20,
              windowMs: 60000,
            },
          },
        },
      };

      const result = validateConfig(config);

      expect(result.success).toBe(true);
      expect(result.data?.rateLimiting?.endpoints?.['/webhooks']?.maxRequests).toBe(20);
    });
  });

  describe('exists', () => {
    it('should return false when config does not exist', async () => {
      expect(await configManager.exists()).toBe(false);
    });

    it('should return true when config exists', async () => {
      const testConfig: PayMongoConfig = {
        version: '1.0',
        projectName: 'Test Project',
        environment: 'test',
        apiKeys: {
          test: {
            public: 'pk_test_123',
            secret: 'sk_test_123',
          },
        },
        webhooks: {
          url: 'http://localhost:3000/webhook',
          events: ['payment.paid'],
        },
        webhookSecrets: {},
        dev: {
          port: 3000,
          autoRegisterWebhook: true,
          verifyWebhookSignatures: false,
        },
      };

      await configManager.save(testConfig);
      expect(await configManager.exists()).toBe(true);
    });
  });
});
