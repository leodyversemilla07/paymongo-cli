import chalk from 'chalk';

export interface LoggerOptions {
  level?: 'error' | 'warn' | 'info' | 'debug';
  file?: string;
}

// Type for logger meta data - allows Error, objects, or primitives
type LogMeta = Error | Record<string, unknown> | string | number | boolean | undefined;

class Logger {
  private level: 'error' | 'warn' | 'info' | 'debug' = 'info';

  constructor(options: LoggerOptions = {}) {
    this.level = options.level ?? 'info';
  }

  private shouldLog(requestedLevel: 'error' | 'warn' | 'info' | 'debug'): boolean {
    const levels = { error: 0, warn: 1, info: 2, debug: 3 };
    return levels[requestedLevel] <= levels[this.level];
  }

  private formatMessage(message: string, meta?: LogMeta[]): string {
    let output = message;

    if (meta && meta.length > 0) {
      meta.forEach((item) => {
        if (item instanceof Error) {
          output += ` ${item.message}`;
        } else if (typeof item === 'object') {
          output += ` ${JSON.stringify(item)}`;
        } else if (item !== undefined) {
          output += ` ${String(item)}`;
        }
      });
    }

    return output;
  }

  error(message: string, ...meta: LogMeta[]): void {
    if (this.shouldLog('error')) {
      const formatted = this.formatMessage(message, meta);
      console.error(chalk.red('ERROR:'), formatted);
    }
  }

  warn(message: string, ...meta: LogMeta[]): void {
    if (this.shouldLog('warn')) {
      const formatted = this.formatMessage(message, meta);
      console.warn(chalk.yellow('WARN:'), formatted);
    }
  }

  info(message: string, ...meta: LogMeta[]): void {
    if (this.shouldLog('info')) {
      const formatted = this.formatMessage(message, meta);
      console.info(chalk.blue('INFO:'), formatted);
    }
  }

  debug(message: string, ...meta: LogMeta[]): void {
    if (this.shouldLog('debug')) {
      const formatted = this.formatMessage(message, meta);
      console.debug(chalk.gray('DEBUG:'), formatted);
    }
  }

  // Convenience methods with chalk colors
  success(message: string): void {
    console.log(chalk.green('✓'), message);
  }

  failure(message: string): void {
    console.log(chalk.red('✗'), message);
  }

  warning(message: string): void {
    console.log(chalk.yellow('⚠'), message);
  }
}

export default Logger;
