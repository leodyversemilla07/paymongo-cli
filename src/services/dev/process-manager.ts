import { execSync } from 'node:child_process';
import fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

export interface DevProcessState {
  pid: number;
  port: number;
  tunnelUrl: string;
  webhookId: string | undefined;
  webhookUrl: string;
  localUrl: string;
  events: string[];
  startedAt: number;
  projectName: string;
}

const STATE_DIR = path.join(os.homedir(), '.paymongo-cli');
const STATE_FILE = path.join(STATE_DIR, 'dev-server.json');
const LOG_FILE = path.join(STATE_DIR, 'dev-server.log');

export class DevProcessManager {
  /**
   * Save the current dev server state
   */
  static async saveState(state: DevProcessState): Promise<void> {
    await fs.mkdir(STATE_DIR, { recursive: true });
    await fs.writeFile(STATE_FILE, JSON.stringify(state, null, 2));
  }

  /**
   * Load the saved dev server state
   */
  static async loadState(): Promise<DevProcessState | null> {
    try {
      const content = await fs.readFile(STATE_FILE, 'utf-8');
      return JSON.parse(content) as DevProcessState;
    } catch (error: unknown) {
      if (
        error instanceof Error &&
        'code' in error &&
        (error as NodeJS.ErrnoException).code === 'ENOENT'
      ) {
        return null;
      }
      return null;
    }
  }

  /**
   * Clear the saved state
   */
  static async clearState(): Promise<void> {
    try {
      await fs.unlink(STATE_FILE);
    } catch (error: unknown) {
      if (
        error instanceof Error &&
        'code' in error &&
        (error as NodeJS.ErrnoException).code === 'ENOENT'
      ) {
        return;
      }
      // Ignore errors
    }
  }

  /**
   * Check if a process with the given PID is running
   */
  static isProcessRunning(pid: number): boolean {
    try {
      // Sending signal 0 doesn't kill the process, just checks if it exists
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Kill a process by PID
   */
  static killProcess(pid: number): boolean {
    try {
      // On Windows, use taskkill for more reliable termination
      if (process.platform === 'win32') {
        execSync(`taskkill /pid ${pid} /f /t`, { stdio: 'ignore' });
      } else {
        process.kill(pid, 'SIGTERM');
      }
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get the log file path
   */
  static async getLogFile(): Promise<string> {
    await fs.mkdir(STATE_DIR, { recursive: true });
    return LOG_FILE;
  }

  /**
   * Read recent logs
   */
  static async readLogs(lines: number = 50): Promise<string[]> {
    try {
      const content = await fs.readFile(LOG_FILE, 'utf-8');
      const allLines = content.split('\n').filter((line) => line.trim());
      return allLines.slice(-lines);
    } catch (error: unknown) {
      if (
        error instanceof Error &&
        'code' in error &&
        (error as NodeJS.ErrnoException).code === 'ENOENT'
      ) {
        return [];
      }
      return [];
    }
  }

  /**
   * Clear log file
   */
  static async clearLogs(): Promise<void> {
    try {
      await fs.writeFile(LOG_FILE, '');
    } catch (error: unknown) {
      if (
        error instanceof Error &&
        'code' in error &&
        (error as NodeJS.ErrnoException).code === 'ENOENT'
      ) {
        return;
      }
      // Ignore errors
    }
  }

  /**
   * Get formatted uptime string
   */
  static formatUptime(startedAt: number): string {
    const seconds = Math.floor((Date.now() - startedAt) / 1000);

    if (seconds < 60) {
      return `${seconds}s`;
    } else if (seconds < 3600) {
      const mins = Math.floor(seconds / 60);
      const secs = seconds % 60;
      return `${mins}m ${secs}s`;
    } else {
      const hours = Math.floor(seconds / 3600);
      const mins = Math.floor((seconds % 3600) / 60);
      return `${hours}h ${mins}m`;
    }
  }
}
