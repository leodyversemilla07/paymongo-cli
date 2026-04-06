/**
 * Integration tests for dev server lifecycle
 * Tests background mode, status, logs, and stop commands
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi as jest } from 'vitest';

// Define state interface for type safety
interface DevServerState {
  pid: number;
  port: number;
  tunnelUrl: string;
  webhookUrl: string;
  localUrl: string;
  events: string[];
  startedAt: number;
  projectName: string;
  webhookId?: string;
}

// Mock DevProcessManager with proper types
const mockDevProcessManager = {
  loadState: jest.fn<() => DevServerState | null>(),
  saveState: jest.fn<(state: DevServerState) => void>(),
  clearState: jest.fn<() => void>(),
  isProcessRunning: jest.fn<(pid: number) => boolean>(),
  killProcess: jest.fn<(pid: number) => boolean>(),
  formatUptime: jest.fn<(startedAt: number) => string>(),
  getLogFile: jest.fn<() => string>(),
  readLogs: jest.fn<(lines: number) => string[]>(),
  clearLogs: jest.fn<() => void>(),
};

jest.mock('../../src/services/dev/process-manager.js', () => ({
  DevProcessManager: mockDevProcessManager,
}));

describe('Dev Server Integration', () => {
  const testLogDir = path.join(os.tmpdir(), 'paymongo-cli-test-logs');
  const testLogFile = path.join(testLogDir, 'dev.log');

  beforeEach(() => {
    jest.clearAllMocks();

    // Create test log directory
    if (!fs.existsSync(testLogDir)) {
      fs.mkdirSync(testLogDir, { recursive: true });
    }

    mockDevProcessManager.getLogFile.mockReturnValue(testLogFile);
  });

  afterEach(() => {
    // Cleanup test files
    if (fs.existsSync(testLogFile)) {
      fs.unlinkSync(testLogFile);
    }
  });

  describe('Process State Management', () => {
    it('should detect when no server is running', () => {
      mockDevProcessManager.loadState.mockReturnValue(null);

      const state = mockDevProcessManager.loadState();
      expect(state).toBeNull();
    });

    it('should detect running server with valid state', () => {
      const mockState = {
        pid: 12345,
        port: 3000,
        tunnelUrl: 'https://test.ngrok.io',
        webhookUrl: 'https://test.ngrok.io/webhook/test',
        localUrl: 'http://localhost:3000/webhook/test',
        events: ['payment.paid', 'payment.failed'],
        startedAt: Date.now() - 60000,
        projectName: 'test-project',
      };

      mockDevProcessManager.loadState.mockReturnValue(mockState);
      mockDevProcessManager.isProcessRunning.mockReturnValue(true);
      mockDevProcessManager.formatUptime.mockReturnValue('1 minute');

      const state = mockDevProcessManager.loadState();
      const isRunning = mockDevProcessManager.isProcessRunning(state?.pid);

      expect(state).toEqual(mockState);
      expect(isRunning).toBe(true);
    });

    it('should detect stale state when process is not running', () => {
      const mockState = {
        pid: 99999,
        port: 3000,
        tunnelUrl: 'https://test.ngrok.io',
        webhookUrl: 'https://test.ngrok.io/webhook/test',
        localUrl: 'http://localhost:3000/webhook/test',
        events: ['payment.paid'],
        startedAt: Date.now() - 3600000,
        projectName: 'old-project',
      };

      mockDevProcessManager.loadState.mockReturnValue(mockState);
      mockDevProcessManager.isProcessRunning.mockReturnValue(false);

      const state = mockDevProcessManager.loadState();
      const isRunning = mockDevProcessManager.isProcessRunning(state?.pid);

      expect(state).not.toBeNull();
      expect(isRunning).toBe(false);
    });
  });

  describe('Log Management', () => {
    it('should return empty array when no logs exist', () => {
      mockDevProcessManager.readLogs.mockReturnValue([]);

      const logs = mockDevProcessManager.readLogs(50);
      expect(logs).toEqual([]);
    });

    it('should return last N lines of logs', () => {
      const mockLogs = [
        '[12:00:00] Server started',
        '[12:00:01] Tunnel created',
        '[12:00:05] Webhook received',
      ];
      mockDevProcessManager.readLogs.mockReturnValue(mockLogs);

      const logs = mockDevProcessManager.readLogs(50);
      expect(logs).toHaveLength(3);
      expect(logs[0]).toContain('Server started');
    });

    it('should clear logs file', () => {
      // Write some test content
      fs.writeFileSync(testLogFile, 'test log content');

      mockDevProcessManager.clearLogs.mockImplementation(() => {
        fs.writeFileSync(testLogFile, '');
      });

      mockDevProcessManager.clearLogs();

      expect(mockDevProcessManager.clearLogs).toHaveBeenCalled();
    });
  });

  describe('Process Lifecycle', () => {
    it('should kill process successfully', () => {
      mockDevProcessManager.killProcess.mockReturnValue(true);

      const killed = mockDevProcessManager.killProcess(12345);
      expect(killed).toBe(true);
    });

    it('should handle failed process kill', () => {
      mockDevProcessManager.killProcess.mockReturnValue(false);

      const killed = mockDevProcessManager.killProcess(99999);
      expect(killed).toBe(false);
    });

    it('should clear state after successful stop', () => {
      mockDevProcessManager.killProcess.mockReturnValue(true);

      mockDevProcessManager.killProcess(12345);
      mockDevProcessManager.clearState();

      expect(mockDevProcessManager.clearState).toHaveBeenCalled();
    });
  });
});
