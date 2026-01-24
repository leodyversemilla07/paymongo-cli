import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execSync } from 'child_process';

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
  static saveState(state: DevProcessState): void {
    if (!fs.existsSync(STATE_DIR)) {
      fs.mkdirSync(STATE_DIR, { recursive: true });
    }
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  }

  /**
   * Load the saved dev server state
   */
  static loadState(): DevProcessState | null {
    try {
      if (!fs.existsSync(STATE_FILE)) {
        return null;
      }
      const content = fs.readFileSync(STATE_FILE, 'utf-8');
      return JSON.parse(content) as DevProcessState;
    } catch {
      return null;
    }
  }

  /**
   * Clear the saved state
   */
  static clearState(): void {
    try {
      if (fs.existsSync(STATE_FILE)) {
        fs.unlinkSync(STATE_FILE);
      }
    } catch {
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
  static getLogFile(): string {
    if (!fs.existsSync(STATE_DIR)) {
      fs.mkdirSync(STATE_DIR, { recursive: true });
    }
    return LOG_FILE;
  }

  /**
   * Read recent logs
   */
  static readLogs(lines: number = 50): string[] {
    try {
      if (!fs.existsSync(LOG_FILE)) {
        return [];
      }
      const content = fs.readFileSync(LOG_FILE, 'utf-8');
      const allLines = content.split('\n').filter(line => line.trim());
      return allLines.slice(-lines);
    } catch {
      return [];
    }
  }

  /**
   * Clear log file
   */
  static clearLogs(): void {
    try {
      if (fs.existsSync(LOG_FILE)) {
        fs.writeFileSync(LOG_FILE, '');
      }
    } catch {
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
