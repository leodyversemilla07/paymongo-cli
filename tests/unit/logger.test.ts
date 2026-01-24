import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

// Create mock winston logger
const mockWinstonLogger = {
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
};

// Create mock winston module
const mockWinston = {
  createLogger: jest.fn(() => mockWinstonLogger),
  format: {
    combine: jest.fn(),
    colorize: jest.fn(),
    simple: jest.fn(),
    timestamp: jest.fn(),
    json: jest.fn(),
  },
  transports: {
    Console: jest.fn(),
    File: jest.fn(),
  },
};

// Create mock chalk module
const mockChalk = {
  green: jest.fn((text: string) => `green:${text}`),
  red: jest.fn((text: string) => `red:${text}`),
  yellow: jest.fn((text: string) => `yellow:${text}`),
};

// Mock modules before importing Logger
jest.unstable_mockModule('winston', () => ({
  default: mockWinston,
}));
jest.unstable_mockModule('chalk', () => ({
  default: mockChalk,
}));

// Import Logger after mocking
const { default: Logger } = await import('../../src/utils/logger.js');

describe('Logger', () => {
  let logger: InstanceType<typeof Logger>;
  let consoleSpy: ReturnType<typeof jest.spyOn>;

  beforeEach(() => {
    jest.clearAllMocks();
    consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    logger = new Logger();
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  describe('constructor', () => {
    it('should create logger with default options', () => {
      new Logger();
      expect(mockWinston.createLogger).toHaveBeenCalledWith(
        expect.objectContaining({
          level: 'info',
        })
      );
    });

    it('should create logger with custom level', () => {
      new Logger({ level: 'debug' });
      expect(mockWinston.createLogger).toHaveBeenCalledWith(
        expect.objectContaining({
          level: 'debug',
        })
      );
    });

    it('should add file transport when file option provided', () => {
      new Logger({ file: '/var/log/app.log' });
      expect(mockWinston.transports.File).toHaveBeenCalledWith(
        expect.objectContaining({
          filename: '/var/log/app.log',
        })
      );
    });

    it('should not add file transport by default', () => {
      jest.clearAllMocks();
      new Logger();
      expect(mockWinston.transports.File).not.toHaveBeenCalled();
    });
  });

  describe('error', () => {
    it('should log error messages', () => {
      logger.error('Error message');
      expect(mockWinstonLogger.error).toHaveBeenCalledWith('Error message');
    });

    it('should log error with metadata', () => {
      logger.error('Error message', { code: 'ERR001' });
      expect(mockWinstonLogger.error).toHaveBeenCalledWith('Error message', { code: 'ERR001' });
    });
  });

  describe('warn', () => {
    it('should log warning messages', () => {
      logger.warn('Warning message');
      expect(mockWinstonLogger.warn).toHaveBeenCalledWith('Warning message');
    });

    it('should log warning with metadata', () => {
      logger.warn('Warning message', { reason: 'deprecated' });
      expect(mockWinstonLogger.warn).toHaveBeenCalledWith('Warning message', { reason: 'deprecated' });
    });
  });

  describe('info', () => {
    it('should log info messages', () => {
      logger.info('Info message');
      expect(mockWinstonLogger.info).toHaveBeenCalledWith('Info message');
    });

    it('should log info with metadata', () => {
      logger.info('Info message', { userId: 123 });
      expect(mockWinstonLogger.info).toHaveBeenCalledWith('Info message', { userId: 123 });
    });
  });

  describe('debug', () => {
    it('should log debug messages', () => {
      logger.debug('Debug message');
      expect(mockWinstonLogger.debug).toHaveBeenCalledWith('Debug message');
    });

    it('should log debug with metadata', () => {
      logger.debug('Debug message', { stack: 'trace' });
      expect(mockWinstonLogger.debug).toHaveBeenCalledWith('Debug message', { stack: 'trace' });
    });
  });

  describe('success', () => {
    it('should print success message with green checkmark', () => {
      logger.success('Operation successful');
      expect(consoleSpy).toHaveBeenCalledWith('green:✓', 'Operation successful');
    });
  });

  describe('failure', () => {
    it('should print failure message with red X', () => {
      logger.failure('Operation failed');
      expect(consoleSpy).toHaveBeenCalledWith('red:✗', 'Operation failed');
    });
  });

  describe('warning', () => {
    it('should print warning message with yellow warning symbol', () => {
      logger.warning('Warning occurred');
      expect(consoleSpy).toHaveBeenCalledWith('yellow:⚠', 'Warning occurred');
    });
  });
});
