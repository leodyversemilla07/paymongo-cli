import winston from 'winston';
import chalk from 'chalk';

export interface LoggerOptions {
  level?: 'error' | 'warn' | 'info' | 'debug';
  file?: string;
}

class Logger {
  private logger: winston.Logger;

  constructor(options: LoggerOptions = {}) {
    const { level = 'info', file } = options;

    const transports: winston.transport[] = [
      new winston.transports.Console({
        level,
        format: winston.format.combine(
          winston.format.colorize(),
          winston.format.simple()
        ),
      }),
    ];

    if (file) {
      transports.push(
        new winston.transports.File({
          filename: file,
          level,
          format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.json()
          ),
        })
      );
    }

    this.logger = winston.createLogger({
      level,
      transports,
    });
  }

  error(message: string, ...meta: any[]): void {
    this.logger.error(message, ...meta);
  }

  warn(message: string, ...meta: any[]): void {
    this.logger.warn(message, ...meta);
  }

  info(message: string, ...meta: any[]): void {
    this.logger.info(message, ...meta);
  }

  debug(message: string, ...meta: any[]): void {
    this.logger.debug(message, ...meta);
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