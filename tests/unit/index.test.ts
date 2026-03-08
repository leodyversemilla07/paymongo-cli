import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';

class ExitError extends Error {
  code: number | undefined;

  constructor(code: number | undefined) {
    super(`Process exited with code ${code}`);
    this.code = code;
  }
}

describe('CLI Entry Point (index.ts)', () => {
  const originalArgv = process.argv;
  const originalExit = process.exit;
  const originalStdoutWrite = process.stdout.write.bind(process.stdout);
  const originalStderrWrite = process.stderr.write.bind(process.stderr);

  let stdout = '';
  let stderr = '';

  beforeEach(() => {
    stdout = '';
    stderr = '';

    process.exit = ((code?: number) => {
      throw new ExitError(code);
    }) as typeof process.exit;

    process.stdout.write = ((chunk: string | Uint8Array) => {
      stdout += chunk.toString();
      return true;
    }) as typeof process.stdout.write;

    process.stderr.write = ((chunk: string | Uint8Array) => {
      stderr += chunk.toString();
      return true;
    }) as typeof process.stderr.write;
  });

  afterEach(() => {
    process.argv = originalArgv;
    process.exit = originalExit;
    process.stdout.write = originalStdoutWrite;
    process.stderr.write = originalStderrWrite;
  });

  async function runCli(args: string[]): Promise<{ stdout: string; stderr: string; exitCode?: number }> {
    process.argv = ['node', 'src/index.ts', ...args];

    try {
      await import(`../../src/index.js?test=${Date.now()}-${Math.random()}`);
      return { stdout, stderr };
    } catch (error) {
      if (error instanceof ExitError) {
        return { stdout, stderr, exitCode: error.code };
      }

      throw error;
    }
  }

  it('should display help information when --help is passed', async () => {
    const result = await runCli(['--help']);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('paymongo');
    expect(result.stdout).toContain('CLI tool for PayMongo integration development');
    expect(result.stdout).toContain('EXAMPLES');
    expect(result.stdout).toContain('$ paymongo init');
    expect(result.stdout).toContain('$ paymongo dev');
    expect(result.stderr).toBe('');
  });

  it('should display version information when --version is passed', async () => {
    const result = await runCli(['--version']);

    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toMatch(/\d+\.\d+\.\d+/);
    expect(result.stderr).toBe('');
  });

  it('should handle invalid commands gracefully', async () => {
    const result = await runCli(['invalid-command']);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('error');
    expect(result.stderr).toContain('invalid-command');
  });
});
