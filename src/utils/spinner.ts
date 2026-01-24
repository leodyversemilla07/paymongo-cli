import ora, { Ora } from 'ora';

export interface SpinnerOptions {
  text?: string;
  color?: 'black' | 'red' | 'green' | 'yellow' | 'blue' | 'magenta' | 'cyan' | 'white' | 'gray';
}

class Spinner {
  private spinner: Ora;

  constructor(options: SpinnerOptions = {}) {
    const { text = 'Loading...', color = 'cyan' } = options;
    this.spinner = ora({
      text,
      color,
      spinner: 'dots',
    });
  }

  start(text?: string): void {
    if (text) {
      this.spinner.text = text;
    }
    this.spinner.start();
  }

  stop(): void {
    this.spinner.stop();
  }

  succeed(text?: string): void {
    if (text) {
      this.spinner.text = text;
    }
    this.spinner.succeed();
  }

  fail(text?: string): void {
    if (text) {
      this.spinner.text = text;
    }
    this.spinner.fail();
  }

  warn(text?: string): void {
    if (text) {
      this.spinner.text = text;
    }
    this.spinner.warn();
  }

  info(text?: string): void {
    if (text) {
      this.spinner.text = text;
    }
    this.spinner.info();
  }

  update(text: string): void {
    this.spinner.text = text;
  }
}

export default Spinner;