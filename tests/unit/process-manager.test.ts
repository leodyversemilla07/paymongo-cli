import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const mockFs = {
  mkdir: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  writeFile: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  readFile: jest.fn<() => Promise<string>>(),
  unlink: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
};

jest.unstable_mockModule('fs/promises', () => ({
  default: mockFs,
}));

// Mock child_process for killProcess tests
const mockExecSync = jest.fn();
jest.unstable_mockModule('child_process', () => ({
  execSync: mockExecSync,
}));

const { DevProcessManager } = await import('../../src/services/dev/process-manager.js');
import type { DevProcessState } from '../../src/services/dev/process-manager.js';

const sampleState: DevProcessState = {
  pid: 12345,
  port: 3000,
  tunnelUrl: 'https://abc123.ngrok.io',
  webhookId: 'wh_123',
  webhookUrl: 'https://abc123.ngrok.io/webhook',
  localUrl: 'http://localhost:3000',
  events: ['payment.paid', 'payment.failed'],
  startedAt: Date.now() - 60000,
  projectName: 'test-project',
};

describe('DevProcessManager', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('saveState', () => {
    it('should create state directory and write state file', async () => {
      await DevProcessManager.saveState(sampleState);

      expect(mockFs.mkdir).toHaveBeenCalledWith(
        expect.stringContaining('.paymongo-cli'),
        { recursive: true },
      );
      expect(mockFs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('dev-server.json'),
        JSON.stringify(sampleState, null, 2),
      );
    });
  });

  describe('loadState', () => {
    it('should return parsed state when file exists', async () => {
      mockFs.readFile.mockResolvedValue(JSON.stringify(sampleState));

      const result = await DevProcessManager.loadState();

      expect(result).toEqual(sampleState);
      expect(mockFs.readFile).toHaveBeenCalledWith(
        expect.stringContaining('dev-server.json'),
        'utf-8',
      );
    });

    it('should return null when file does not exist', async () => {
      const enoent = new Error('ENOENT') as NodeJS.ErrnoException;
      enoent.code = 'ENOENT';
      mockFs.readFile.mockRejectedValue(enoent);

      const result = await DevProcessManager.loadState();

      expect(result).toBeNull();
    });

    it('should return null on other read errors', async () => {
      mockFs.readFile.mockRejectedValue(new Error('permission denied'));

      const result = await DevProcessManager.loadState();

      expect(result).toBeNull();
    });
  });

  describe('clearState', () => {
    it('should call unlink on state file', async () => {
      mockFs.unlink.mockResolvedValue(undefined);

      await DevProcessManager.clearState();

      expect(mockFs.unlink).toHaveBeenCalledWith(
        expect.stringContaining('dev-server.json'),
      );
    });

    it('should not throw when file does not exist', async () => {
      const enoent = new Error('ENOENT') as NodeJS.ErrnoException;
      enoent.code = 'ENOENT';
      mockFs.unlink.mockRejectedValue(enoent);

      await expect(DevProcessManager.clearState()).resolves.toBeUndefined();
    });
  });

  describe('isProcessRunning', () => {
    it('should return true for the current process PID', () => {
      const result = DevProcessManager.isProcessRunning(process.pid);

      expect(result).toBe(true);
    });

    it('should return false for a non-existent PID', () => {
      const result = DevProcessManager.isProcessRunning(999999999);

      expect(result).toBe(false);
    });
  });

  describe('killProcess', () => {
    it('should call execSync with taskkill on win32', () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'win32' });

      DevProcessManager.killProcess(12345);

      expect(mockExecSync).toHaveBeenCalledWith(
        'taskkill /pid 12345 /f /t',
        { stdio: 'ignore' },
      );

      Object.defineProperty(process, 'platform', { value: originalPlatform });
    });

    it('should return false when kill fails', () => {
      mockExecSync.mockImplementation(() => {
        throw new Error('process not found');
      });

      const result = DevProcessManager.killProcess(999999999);

      expect(result).toBe(false);
    });
  });

  describe('getLogFile', () => {
    it('should ensure directory exists and return log file path', async () => {
      const logFile = await DevProcessManager.getLogFile();

      expect(mockFs.mkdir).toHaveBeenCalledWith(
        expect.stringContaining('.paymongo-cli'),
        { recursive: true },
      );
      expect(logFile).toContain('dev-server.log');
    });
  });

  describe('readLogs', () => {
    it('should return last N lines from log file', async () => {
      const logContent = Array.from({ length: 100 }, (_, i) => `line ${i + 1}`).join('\n');
      mockFs.readFile.mockResolvedValue(logContent);

      const result = await DevProcessManager.readLogs(5);

      expect(result).toHaveLength(5);
      expect(result[0]).toBe('line 96');
      expect(result[4]).toBe('line 100');
    });

    it('should default to 50 lines', async () => {
      const logContent = Array.from({ length: 100 }, (_, i) => `line ${i + 1}`).join('\n');
      mockFs.readFile.mockResolvedValue(logContent);

      const result = await DevProcessManager.readLogs();

      expect(result).toHaveLength(50);
      expect(result[0]).toBe('line 51');
    });

    it('should return empty array when log file does not exist', async () => {
      const enoent = new Error('ENOENT') as NodeJS.ErrnoException;
      enoent.code = 'ENOENT';
      mockFs.readFile.mockRejectedValue(enoent);

      const result = await DevProcessManager.readLogs();

      expect(result).toEqual([]);
    });

    it('should filter out blank lines', async () => {
      mockFs.readFile.mockResolvedValue('line1\n\n  \nline2\n');

      const result = await DevProcessManager.readLogs();

      expect(result).toEqual(['line1', 'line2']);
    });
  });

  describe('clearLogs', () => {
    it('should write empty string to log file', async () => {
      await DevProcessManager.clearLogs();

      expect(mockFs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('dev-server.log'),
        '',
      );
    });
  });

  describe('formatUptime', () => {
    it('should format seconds correctly', () => {
      const startedAt = Date.now() - 30 * 1000;

      const result = DevProcessManager.formatUptime(startedAt);

      expect(result).toBe('30s');
    });

    it('should format minutes and seconds correctly', () => {
      const startedAt = Date.now() - (5 * 60 + 15) * 1000;

      const result = DevProcessManager.formatUptime(startedAt);

      expect(result).toBe('5m 15s');
    });

    it('should format hours and minutes correctly', () => {
      const startedAt = Date.now() - (2 * 3600 + 30 * 60) * 1000;

      const result = DevProcessManager.formatUptime(startedAt);

      expect(result).toBe('2h 30m');
    });

    it('should return 0s for just-started process', () => {
      const startedAt = Date.now();

      const result = DevProcessManager.formatUptime(startedAt);

      expect(result).toBe('0s');
    });

    it('should handle exactly 60 seconds as 1m 0s', () => {
      const startedAt = Date.now() - 60 * 1000;

      const result = DevProcessManager.formatUptime(startedAt);

      expect(result).toBe('1m 0s');
    });

    it('should handle exactly 1 hour as 1h 0m', () => {
      const startedAt = Date.now() - 3600 * 1000;

      const result = DevProcessManager.formatUptime(startedAt);

      expect(result).toBe('1h 0m');
    });
  });
});
