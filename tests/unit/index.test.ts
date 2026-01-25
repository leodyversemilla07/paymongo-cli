import { describe, it, expect } from '@jest/globals';
import { spawn } from 'child_process';

describe('CLI Entry Point (index.ts)', () => {
  it('should display help information when --help is passed', (done) => {
    const cliProcess = spawn('node', ['dist/index.js', '--help'], {
      stdio: 'pipe',
      cwd: process.cwd(),
    });

    let stdout = '';
    let stderr = '';

    cliProcess.stdout?.on('data', (data) => {
      stdout += data.toString();
    });

    cliProcess.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    cliProcess.on('close', (code) => {
      expect(code).toBe(0);
      expect(stdout).toContain('paymongo');
      expect(stdout).toContain('CLI tool for PayMongo integration development');
      expect(stdout).toContain('EXAMPLES');
      expect(stdout).toContain('$ paymongo init');
      expect(stdout).toContain('$ paymongo dev');
      expect(stderr).toBe('');
      done();
    });

    cliProcess.on('error', (error) => {
      done(error);
    });
  });

  it('should display version information when --version is passed', (done) => {
    const cliProcess = spawn('node', ['dist/index.js', '--version'], {
      stdio: 'pipe',
      cwd: process.cwd(),
    });

    let stdout = '';
    let stderr = '';

    cliProcess.stdout?.on('data', (data) => {
      stdout += data.toString();
    });

    cliProcess.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    cliProcess.on('close', (code) => {
      expect(code).toBe(0);
      expect(stdout.trim()).toMatch(/\d+\.\d+\.\d+/); // Version pattern
      expect(stderr).toBe('');
      done();
    });

    cliProcess.on('error', (error) => {
      done(error);
    });
  });

  it('should handle invalid commands gracefully', (done) => {
    const cliProcess = spawn('node', ['dist/index.js', 'invalid-command'], {
      stdio: 'pipe',
      cwd: process.cwd(),
    });

    let stderr = '';

    cliProcess.stdout?.on('data', () => {
      // stdout not needed for this test
    });

    cliProcess.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    cliProcess.on('close', (code) => {
      expect(code).toBe(1); // Should exit with error code
      expect(stderr).toContain('error');
      expect(stderr).toContain('invalid-command');
      done();
    });

    cliProcess.on('error', (error) => {
      done(error);
    });
  });
});
