import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('CLI Config Commands Integration', () => {
  let tempDir: string;
  let cliPath: string;
  let originalCwd: string;

  beforeAll(() => {
    // Build the CLI first
    execSync('npm run build', { stdio: 'inherit' });
    cliPath = path.join(process.cwd(), 'bin', 'paymongo.js');
  });

  beforeEach(() => {
    // Store original working directory
    originalCwd = process.cwd();

    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'paymongo-cli-test-'));
    process.chdir(tempDir);
  });

  afterEach(() => {
    // Change back to original directory first
    if (originalCwd && originalCwd !== process.cwd()) {
      process.chdir(originalCwd);
    }

    // Clean up with retry mechanism for Windows file locking
    const cleanup = () => {
      try {
        if (fs.existsSync(tempDir)) {
          fs.rmSync(tempDir, { recursive: true, force: true });
        }
        return true;
      } catch (error) {
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

  describe('config import', () => {
    it('should import a valid configuration file', () => {
      // Create a sample config file to import
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

      // Run the import command
      execSync(`node "${cliPath}" config import "${importFile}" --force`, { stdio: 'pipe' });

      // Verify the config was imported
      expect(fs.existsSync('.paymongo')).toBe(true);
      const importedContent = JSON.parse(fs.readFileSync('.paymongo', 'utf-8'));
      expect(importedContent.projectName).toBe('Imported Project');
      expect(importedContent.dev.port).toBe(4000);
    });

    it('should fail with invalid JSON', () => {
      const invalidFile = path.join(tempDir, 'invalid.json');
      fs.writeFileSync(invalidFile, '{ invalid json }');

      expect(() => {
        execSync(`node "${cliPath}" config import "${invalidFile}"`, { stdio: 'pipe' });
      }).toThrow();
    });

    it('should fail with missing required fields', () => {
      const invalidConfig = {
        version: '1.0',
        // Missing required fields
      };

      const invalidFile = path.join(tempDir, 'invalid-config.json');
      fs.writeFileSync(invalidFile, JSON.stringify(invalidConfig));

      expect(() => {
        execSync(`node "${cliPath}" config import "${invalidFile}"`, { stdio: 'pipe' });
      }).toThrow();
    });
  });

  describe('config backup', () => {
    it('should create a timestamped backup file', () => {
      // First create a config to backup
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

      // Run the backup command
      execSync(`node "${cliPath}" config backup`, { stdio: 'pipe' });

      // Find the backup file (should match pattern paymongo-config-*.json)
      const files = fs.readdirSync(tempDir);
      const backupFiles = files.filter(
        (f) => f.startsWith('paymongo-config-') && f.endsWith('.json')
      );

      expect(backupFiles.length).toBe(1);
      const backupFile = backupFiles[0];
      expect(backupFile).toMatch(/paymongo-config-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.json/);

      // Verify backup content
      const backupContent = JSON.parse(fs.readFileSync(backupFile, 'utf-8'));
      expect(backupContent.projectName).toBe('Backup Test Project');
    });

    it('should create backup with custom name', () => {
      // Create a config first
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

      // Run backup with custom name
      execSync(`node "${cliPath}" config backup --name my-custom-backup`, { stdio: 'pipe' });

      // Find the backup file
      const files = fs.readdirSync(tempDir);
      const backupFiles = files.filter(
        (f) => f.startsWith('my-custom-backup-') && f.endsWith('.json')
      );

      expect(backupFiles.length).toBe(1);
      expect(backupFiles[0]).toMatch(/my-custom-backup-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.json/);
    });
  });
});
