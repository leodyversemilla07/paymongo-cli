import { beforeEach, describe, expect, it, vi as jest } from 'vitest';

// Define mock ora instance interface
interface MockOraInstance {
  text: string;
  start: jest.Mock<() => MockOraInstance>;
  stop: jest.Mock<() => MockOraInstance>;
  succeed: jest.Mock<() => MockOraInstance>;
  fail: jest.Mock<() => MockOraInstance>;
  warn: jest.Mock<() => MockOraInstance>;
  info: jest.Mock<() => MockOraInstance>;
}

// Create mock ora instance
const mockOraInstance: MockOraInstance = {
  text: 'Loading...',
  start: jest.fn<() => MockOraInstance>(),
  stop: jest.fn<() => MockOraInstance>(),
  succeed: jest.fn<() => MockOraInstance>(),
  fail: jest.fn<() => MockOraInstance>(),
  warn: jest.fn<() => MockOraInstance>(),
  info: jest.fn<() => MockOraInstance>(),
};

// Setup return values after object is created
mockOraInstance.start.mockReturnValue(mockOraInstance);
mockOraInstance.stop.mockReturnValue(mockOraInstance);
mockOraInstance.succeed.mockReturnValue(mockOraInstance);
mockOraInstance.fail.mockReturnValue(mockOraInstance);
mockOraInstance.warn.mockReturnValue(mockOraInstance);
mockOraInstance.info.mockReturnValue(mockOraInstance);

// Mock ora module
const mockOra = jest.fn(() => mockOraInstance);
jest.mock('ora', () => ({
  default: mockOra,
}));

// Import after mocking
const { default: Spinner } = await import('../../src/utils/spinner.js');

describe('Spinner', () => {
  let spinner: InstanceType<typeof Spinner>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockOraInstance.text = 'Loading...';
    spinner = new Spinner();
  });

  describe('constructor', () => {
    it('should create spinner with default options', () => {
      new Spinner();
      expect(mockOra).toHaveBeenCalledWith({
        text: 'Loading...',
        color: 'cyan',
        spinner: 'dots',
      });
    });

    it('should create spinner with custom text', () => {
      new Spinner({ text: 'Custom loading...' });
      expect(mockOra).toHaveBeenCalledWith(
        expect.objectContaining({
          text: 'Custom loading...',
        })
      );
    });

    it('should create spinner with custom color', () => {
      new Spinner({ color: 'green' });
      expect(mockOra).toHaveBeenCalledWith(
        expect.objectContaining({
          color: 'green',
        })
      );
    });
  });

  describe('start', () => {
    it('should start the spinner', () => {
      spinner.start();
      expect(mockOraInstance.start).toHaveBeenCalled();
    });

    it('should update text when starting', () => {
      spinner.start('Starting process...');
      expect(mockOraInstance.text).toBe('Starting process...');
      expect(mockOraInstance.start).toHaveBeenCalled();
    });
  });

  describe('stop', () => {
    it('should stop the spinner', () => {
      spinner.stop();
      expect(mockOraInstance.stop).toHaveBeenCalled();
    });
  });

  describe('succeed', () => {
    it('should show success state', () => {
      spinner.succeed();
      expect(mockOraInstance.succeed).toHaveBeenCalled();
    });

    it('should update text when succeeding', () => {
      spinner.succeed('Operation completed!');
      expect(mockOraInstance.text).toBe('Operation completed!');
      expect(mockOraInstance.succeed).toHaveBeenCalled();
    });
  });

  describe('fail', () => {
    it('should show failure state', () => {
      spinner.fail();
      expect(mockOraInstance.fail).toHaveBeenCalled();
    });

    it('should update text when failing', () => {
      spinner.fail('Operation failed!');
      expect(mockOraInstance.text).toBe('Operation failed!');
      expect(mockOraInstance.fail).toHaveBeenCalled();
    });
  });

  describe('warn', () => {
    it('should show warning state', () => {
      spinner.warn();
      expect(mockOraInstance.warn).toHaveBeenCalled();
    });

    it('should update text when warning', () => {
      spinner.warn('Warning message');
      expect(mockOraInstance.text).toBe('Warning message');
      expect(mockOraInstance.warn).toHaveBeenCalled();
    });
  });

  describe('info', () => {
    it('should show info state', () => {
      spinner.info();
      expect(mockOraInstance.info).toHaveBeenCalled();
    });

    it('should update text when showing info', () => {
      spinner.info('Information message');
      expect(mockOraInstance.text).toBe('Information message');
      expect(mockOraInstance.info).toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('should update spinner text', () => {
      spinner.update('Updated text');
      expect(mockOraInstance.text).toBe('Updated text');
    });
  });
});
