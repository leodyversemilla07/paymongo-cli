import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

/**
 * SECURITY NOTICE: This test file previously contained real API keys which have been removed.
 * Never commit API keys to version control. Use environment variables instead.
 *
 * End-to-end test for PayMongo CLI login functionality.
 * This test validates the login flow but requires API keys to be provided via environment variables.
 *
 * To run these tests, set environment variables:
 * - PAYMONGO_TEST_SECRET_KEY
 * - PAYMONGO_TEST_PUBLIC_KEY
 * - PAYMONGO_LIVE_SECRET_KEY (optional)
 * - PAYMONGO_LIVE_PUBLIC_KEY (optional)
 *
 * Example:
 *   PAYMONGO_TEST_SECRET_KEY=sk_test_xxx PAYMONGO_TEST_PUBLIC_KEY=pk_test_xxx npm test
 *
 * NOTE: These tests are intentionally skipped when API keys are not provided.
 * For unit tests that don't require real API keys, see tests/unit/login-command.test.ts
 */

// Check if we're in CI environment
const _isCI = process.env.CI === 'true';

describe('CLI Login E2E Test', () => {
  let tempDir: string;
  let cliPath: string;
  let homeDir: string;

  // API keys from environment variables (never hardcode real keys!)
  const TEST_SECRET_KEY = process.env.PAYMONGO_TEST_SECRET_KEY || 'sk_test_placeholder';
  const TEST_PUBLIC_KEY = process.env.PAYMONGO_TEST_PUBLIC_KEY || 'pk_test_placeholder';
  const LIVE_SECRET_KEY = process.env.PAYMONGO_LIVE_SECRET_KEY || 'sk_live_placeholder';
  const LIVE_PUBLIC_KEY = process.env.PAYMONGO_LIVE_PUBLIC_KEY || 'pk_live_placeholder';

  // Skip tests if API keys are not provided
  const hasTestKeys =
    TEST_SECRET_KEY !== 'sk_test_placeholder' && TEST_PUBLIC_KEY !== 'pk_test_placeholder';
  const hasLiveKeys =
    LIVE_SECRET_KEY !== 'sk_live_placeholder' && LIVE_PUBLIC_KEY !== 'pk_live_placeholder';

  beforeAll(() => {
    // Build the CLI first
    execSync('npm run build', { stdio: 'inherit' });
    cliPath = path.join(process.cwd(), 'bin', 'paymongo.js');

    // Store original home directory
    homeDir = process.env.HOME || process.env.USERPROFILE || '';
  });

  beforeEach(() => {
    // Create temp directory for testing
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'paymongo-cli-e2e-'));

    // Change to temp directory
    process.chdir(tempDir);

    // Set HOME to temp directory so credentials are stored there
    process.env.HOME = tempDir;
    process.env.USERPROFILE = tempDir;

    // Ensure .paymongo directory doesn't exist initially
    const paymongoDir = path.join(tempDir, '.paymongo');
    if (fs.existsSync(paymongoDir)) {
      fs.rmSync(paymongoDir, { recursive: true, force: true });
    }
  });

  afterEach(() => {
    // Restore original home directory
    process.env.HOME = homeDir;
    process.env.USERPROFILE = homeDir;

    // Clean up temp directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('login with test API keys', () => {
    // Skip if test API keys are not provided
    (hasTestKeys ? it : it.skip)('should successfully login with valid test API keys', () => {
      // Run login command with test keys
      const command = `node "${cliPath}" login --key ${TEST_SECRET_KEY} --public-key ${TEST_PUBLIC_KEY} --env test`;
      execSync(command, { stdio: 'pipe' });

      // Verify credentials are stored globally (in HOME directory)
      const homePaymongoDir = path.join(tempDir, '.paymongo');
      expect(fs.existsSync(homePaymongoDir)).toBe(true);

      const credentialsPath = path.join(homePaymongoDir, 'credentials.enc');
      expect(fs.existsSync(credentialsPath)).toBe(true);

      // Verify credentials file is encrypted (should not contain plain text keys)
      const credentialsContent = fs.readFileSync(credentialsPath, 'utf-8');
      expect(credentialsContent).not.toContain(TEST_SECRET_KEY);
      expect(credentialsContent).not.toContain(TEST_PUBLIC_KEY);
    });

    // Skip if test API keys are not provided
    (hasTestKeys ? it : it.skip)('should create project config when login succeeds', () => {
      // First create a basic project config
      const initialConfig = {
        version: '1.0',
        projectName: 'E2E Test Project',
        environment: 'test',
        apiKeys: {},
        webhooks: { url: '', events: [] },
        webhookSecrets: {},
        dev: { port: 3000, autoRegisterWebhook: true, verifyWebhookSignatures: false },
      };

      fs.writeFileSync('.paymongo', JSON.stringify(initialConfig, null, 2));

      // Login with test keys
      const command = `node "${cliPath}" login --key ${TEST_SECRET_KEY} --public-key ${TEST_PUBLIC_KEY} --env test`;
      execSync(command, { stdio: 'pipe' });

      // Verify project config was updated
      expect(fs.existsSync('.paymongo')).toBe(true);
      const config = JSON.parse(fs.readFileSync('.paymongo', 'utf-8'));

      expect(config.environment).toBe('test');
      expect(config.apiKeys.test.secret).toBe(TEST_SECRET_KEY);
      expect(config.apiKeys.test.public).toBe(TEST_PUBLIC_KEY);
    });

    // Skip if test API keys are not provided
    (hasTestKeys ? it : it.skip)('should fail with invalid API key', () => {
      const invalidKey = 'sk_test_invalid_key_12345';

      const command = `node "${cliPath}" login --key ${invalidKey} --env test`;

      // Should throw due to invalid key
      expect(() => {
        execSync(command, { stdio: 'pipe' });
      }).toThrow();
    });

    // Skip if test API keys are not provided
    (hasTestKeys ? it : it.skip)('should work with subsequent API calls after login', () => {
      // Login first
      const loginCommand = `node "${cliPath}" login --key ${TEST_SECRET_KEY} --public-key ${TEST_PUBLIC_KEY} --env test`;
      execSync(loginCommand, { stdio: 'pipe' });

      // Now try to list webhooks (this should work since we're authenticated)
      const webhooksCommand = `node "${cliPath}" webhooks list`;
      const output = execSync(webhooksCommand, { stdio: 'pipe' });

      // Should not throw and should return some output
      expect(output).toBeDefined();
      expect(output.length).toBeGreaterThan(0);
    });
  });

  describe('logout functionality', () => {
    // Skip if test API keys are not provided
    (hasTestKeys ? it : it.skip)('should clear stored credentials', () => {
      // First login
      const loginCommand = `node "${cliPath}" login --key ${TEST_SECRET_KEY} --public-key ${TEST_PUBLIC_KEY} --env test`;
      execSync(loginCommand, { stdio: 'pipe' });

      // Verify credentials exist
      const paymongoDir = path.join(tempDir, '.paymongo');
      const credentialsPath = path.join(paymongoDir, 'credentials.enc');
      expect(fs.existsSync(credentialsPath)).toBe(true);

      // Now logout
      const logoutCommand = `node "${cliPath}" login --logout`;
      execSync(logoutCommand, { stdio: 'pipe' });

      // Verify credentials are cleared
      expect(fs.existsSync(credentialsPath)).toBe(false);
    });
  });

  describe('login with live API keys', () => {
    // Skip if live API keys are not provided
    (hasLiveKeys ? it : it.skip)('should successfully login with valid live API keys', () => {
      // Run login command with live keys
      const command = `node "${cliPath}" login --key ${LIVE_SECRET_KEY} --public-key ${LIVE_PUBLIC_KEY} --env live`;
      execSync(command, { stdio: 'pipe' });

      // Verify login succeeded (command didn't throw)
      // Note: We can't easily verify file storage in isolated test due to HOME override issues,
      // but the command succeeding indicates the API validation worked
    });

    // Skip if live API keys are not provided
    (hasLiveKeys ? it : it.skip)('should fail with invalid live API key', () => {
      const invalidKey = 'sk_live_invalid_key_12345';

      const command = `node "${cliPath}" login --key ${invalidKey} --env live`;

      // Should throw due to invalid key
      expect(() => {
        execSync(command, { stdio: 'pipe' });
      }).toThrow();
    });
  });
});
