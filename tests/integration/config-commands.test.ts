import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { backupAction, importAction } from '../../src/commands/config.js';

describe('CLI Config Commands Integration', () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'paymongo-cli-test-'));
    process.chdir(tempDir);
  });

  afterEach(() => {
    if (originalCwd && originalCwd !== process.cwd()) {
      process.chdir(originalCwd);
    }

    const cleanup = () => {
      try {
        if (fs.existsSync(tempDir)) {
          fs.rmSync(tempDir, { recursive: true, force: true });
        }
        return true;
      } catch {
        return false;
      }
    };

    let attempts = 0;
    const maxAttempts = 5;
    while (attempts < maxAttempts) {
      if (cleanup()) {
        break;
      }

      attempts++;
      const delay = Math.min(100 * Math.pow(2, attempts), 1000);
      if (attempts < maxAttempts) {
        const start = Date.now();
        while (Date.now() - start < delay) {
          // busy wait for Windows file locking
        }
      }
    }
  });

  describe('config import', () => {
    it('should import a valid configuration file', async () => {
      const importConfig = {
        version: '1.0',
        projectName: 'Imported Project',
        environment: 'test',
        apiKeys: {
          test: {
            public: 'pk_test_import',
            secret: 'sk_test_import',
          },
        },
        webhooks: {
          url: 'https://import.example.com/webhook',
          events: ['payment.paid'],
        },
        webhookSecrets: {},
        dev: {
          port: 4000,
          autoRegisterWebhook: false,
          verifyWebhookSignatures: true,
        },
      };

      const importFile = path.join(tempDir, 'import-config.json');
      fs.writeFileSync(importFile, JSON.stringify(importConfig, null, 2));

      await importAction(importFile, { force: true });

      expect(fs.existsSync('.paymongo')).toBe(true);
      const importedContent = JSON.parse(fs.readFileSync('.paymongo', 'utf-8'));
      expect(importedContent.projectName).toBe('Imported Project');
      expect(importedContent.dev.port).toBe(4000);
    });

    it('should fail with invalid JSON', async () => {
      const invalidFile = path.join(tempDir, 'invalid.json');
      fs.writeFileSync(invalidFile, '{ invalid json }');

      await expect(importAction(invalidFile, {})).rejects.toThrow();
    });

    it('should fail with missing required fields', async () => {
      const invalidConfig = {
        version: '1.0',
      };

      const invalidFile = path.join(tempDir, 'invalid-config.json');
      fs.writeFileSync(invalidFile, JSON.stringify(invalidConfig));

      await expect(importAction(invalidFile, {})).rejects.toThrow();
    });
  });

  describe('config backup', () => {
    it('should create a timestamped backup file', async () => {
      const config = {
        version: '1.0',
        projectName: 'Backup Test Project',
        environment: 'test',
        apiKeys: {
          test: {
            public: 'pk_test_backup',
            secret: 'sk_test_backup',
          },
        },
        webhooks: {
          url: 'https://backup.example.com/webhook',
          events: ['payment.paid'],
        },
        webhookSecrets: {},
        dev: {
          port: 3000,
          autoRegisterWebhook: true,
          verifyWebhookSignatures: false,
        },
      };

      fs.writeFileSync('.paymongo', JSON.stringify(config, null, 2));

      await backupAction({});

      const files = fs.readdirSync(tempDir);
      const backupFiles = files.filter(
        (file) => file.startsWith('paymongo-config-') && file.endsWith('.json')
      );

      expect(backupFiles.length).toBe(1);
      const backupFile = backupFiles[0];
      expect(backupFile).toMatch(/paymongo-config-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.json/);

      const backupContent = JSON.parse(fs.readFileSync(backupFile, 'utf-8'));
      expect(backupContent.projectName).toBe('Backup Test Project');
    });

    it('should create backup with custom name', async () => {
      const config = {
        version: '1.0',
        projectName: 'Custom Backup Test',
        environment: 'test',
        apiKeys: { test: { public: 'pk_test', secret: 'sk_test' } },
        webhooks: { url: 'https://example.com', events: ['payment.paid'] },
        webhookSecrets: {},
        dev: { port: 3000, autoRegisterWebhook: true, verifyWebhookSignatures: false },
      };

      fs.writeFileSync('.paymongo', JSON.stringify(config, null, 2));

      await backupAction({ name: 'my-custom-backup' });

      const files = fs.readdirSync(tempDir);
      const backupFiles = files.filter(
        (file) => file.startsWith('my-custom-backup-') && file.endsWith('.json')
      );

      expect(backupFiles.length).toBe(1);
      expect(backupFiles[0]).toMatch(/my-custom-backup-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.json/);
    });
  });
});
