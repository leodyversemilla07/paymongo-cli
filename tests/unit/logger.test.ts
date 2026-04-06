import { afterEach, beforeEach, describe, expect, it, vi as jest } from 'vitest';

// Import Logger after mocking
const { default: Logger } = await import('../../src/utils/logger.js');

describe('Logger', () => {
  let logger: InstanceType<typeof Logger>;
  let consoleErrorSpy: ReturnType<typeof jest.spyOn>;
  let consoleWarnSpy: ReturnType<typeof jest.spyOn>;
  let consoleInfoSpy: ReturnType<typeof jest.spyOn>;
  let consoleDebugSpy: ReturnType<typeof jest.spyOn>;
  let consoleLogSpy: ReturnType<typeof jest.spyOn>;

  beforeEach(() => {
    jest.clearAllMocks();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    consoleInfoSpy = jest.spyOn(console, 'info').mockImplementation(() => {});
    consoleDebugSpy = jest.spyOn(console, 'debug').mockImplementation(() => {});
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    logger = new Logger();
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    consoleInfoSpy.mockRestore();
    consoleDebugSpy.mockRestore();
    consoleLogSpy.mockRestore();
  });

  describe('constructor', () => {
    it('should create logger with default level', () => {
      const logger = new Logger();
      expect(logger).toBeInstanceOf(Logger);
    });

    it('should create logger with custom level', () => {
      const logger = new Logger({ level: 'debug' });
      expect(logger).toBeInstanceOf(Logger);
    });
  });

  describe('error', () => {
    it('should log error messages with ERROR prefix', () => {
      logger.error('Error message');
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('ERROR:'),
        'Error message'
      );
    });

    it('should log error with metadata', () => {
      logger.error('Error message', { code: 'ERR001' });
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('ERROR:'),
        'Error message {"code":"ERR001"}'
      );
    });

    it('should log error with Error object', () => {
      const error = new Error('Test error');
      logger.error('Error message', error);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('ERROR:'),
        'Error message Test error'
      );
    });
  });

  describe('warn', () => {
    it('should log warning messages with WARN prefix', () => {
      logger.warn('Warning message');
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('WARN:'),
        'Warning message'
      );
    });

    it('should log warning with metadata', () => {
      logger.warn('Warning message', { reason: 'deprecated' });
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('WARN:'),
        'Warning message {"reason":"deprecated"}'
      );
    });
  });

  describe('info', () => {
    it('should log info messages with INFO prefix', () => {
      logger.info('Info message');
      expect(consoleInfoSpy).toHaveBeenCalledWith(expect.stringContaining('INFO:'), 'Info message');
    });

    it('should log info with metadata', () => {
      logger.info('Info message', { userId: 123 });
      expect(consoleInfoSpy).toHaveBeenCalledWith(
        expect.stringContaining('INFO:'),
        'Info message {"userId":123}'
      );
    });
  });

  describe('debug', () => {
    it('should not log debug messages at default info level', () => {
      logger.debug('Debug message');
      expect(consoleDebugSpy).not.toHaveBeenCalled();
    });

    it('should not log debug with metadata at default info level', () => {
      logger.debug('Debug message', { stack: 'trace' });
      expect(consoleDebugSpy).not.toHaveBeenCalled();
    });
  });

  describe('success', () => {
    it('should print success message with checkmark', () => {
      logger.success('Operation successful');
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('✓'),
        'Operation successful'
      );
    });
  });

  describe('failure', () => {
    it('should print failure message with X', () => {
      logger.failure('Operation failed');
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('✗'), 'Operation failed');
    });
  });

  describe('warning', () => {
    it('should print warning message with warning symbol', () => {
      logger.warning('Warning occurred');
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('⚠'), 'Warning occurred');
    });
  });

  describe('log levels', () => {
    it('should respect log level filtering', () => {
      const errorLogger = new Logger({ level: 'error' });
      errorLogger.debug('Debug message');
      errorLogger.info('Info message');
      errorLogger.warn('Warn message');
      errorLogger.error('Error message');

      expect(consoleDebugSpy).not.toHaveBeenCalled();
      expect(consoleInfoSpy).not.toHaveBeenCalled();
      expect(consoleWarnSpy).not.toHaveBeenCalled();
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('ERROR:'),
        'Error message'
      );
    });

    it('should log all levels when debug level set', () => {
      const debugLogger = new Logger({ level: 'debug' });
      debugLogger.debug('Debug message');
      debugLogger.info('Info message');
      debugLogger.warn('Warn message');
      debugLogger.error('Error message');

      expect(consoleDebugSpy).toHaveBeenCalledWith(
        expect.stringContaining('DEBUG:'),
        'Debug message'
      );
      expect(consoleInfoSpy).toHaveBeenCalledWith(expect.stringContaining('INFO:'), 'Info message');
      expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('WARN:'), 'Warn message');
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('ERROR:'),
        'Error message'
      );
    });
  });
});
