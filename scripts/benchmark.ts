#!/usr/bin/env node

/**
 * Performance Benchmark Script for PayMongo CLI
 * Tests the effectiveness of lazy loading and caching optimizations
 */

import { execSync } from 'node:child_process';

const CLI_PATH = 'node dist/index.js';

interface BenchmarkResult {
  command: string;
  real: number;
  user: number;
  sys: number;
}

function parseTimeOutput(output: string): { real: number; user: number; sys: number } {
  const lines = output.trim().split('\n');
  let real = 0,
    user = 0,
    sys = 0;

  for (const line of lines) {
    if (line.startsWith('real')) {
      const match = line.match(/real\s+(\d+)m([\d.]+)s/);
      if (match?.[1] && match[2]) {
        real = parseInt(match[1], 10) * 60 + parseFloat(match[2]);
      }
    } else if (line.startsWith('user')) {
      const match = line.match(/user\s+(\d+)m([\d.]+)s/);
      if (match?.[1] && match[2]) {
        user = parseInt(match[1], 10) * 60 + parseFloat(match[2]);
      }
    } else if (line.startsWith('sys')) {
      const match = line.match(/sys\s+(\d+)m([\d.]+)s/);
      if (match?.[1] && match[2]) {
        sys = parseInt(match[1], 10) * 60 + parseFloat(match[2]);
      }
    }
  }

  return { real, user, sys };
}

function runBenchmark(command: string, description: string): BenchmarkResult {
  console.log(`Running: ${description}`);

  try {
    const fullCommand = `time ${CLI_PATH} ${command}`;

    // Run command and capture timing
    execSync(fullCommand, {
      encoding: 'utf-8',
      stdio: 'pipe',
    });

    // Extract timing from combined output
    const timingOutput = execSync(`${fullCommand} 2>&1 | grep -E "(real|user|sys)"`, {
      encoding: 'utf-8',
    });

    const times = parseTimeOutput(timingOutput);

    return {
      command,
      ...times,
    };
  } catch (error) {
    console.log(`Failed to run ${command}:`, error);
    return { command, real: 0, user: 0, sys: 0 };
  }
}

function main() {
  console.log('🚀 PayMongo CLI Performance Benchmark\n');
  console.log('Testing lazy loading and caching optimizations...\n');

  const benchmarks = [
    { cmd: '--version', desc: 'Version command (minimal load)' },
    { cmd: '--help', desc: 'Help command (loads all command metadata)' },
    { cmd: 'config --help', desc: 'Config command help (lazy loads config command)' },
    { cmd: 'webhooks --help', desc: 'Webhooks command help (lazy loads webhooks command)' },
    { cmd: 'dev --help', desc: 'Dev command help (lazy loads dev command with ngrok)' },
  ];

  const results: BenchmarkResult[] = [];

  for (const benchmark of benchmarks) {
    const result = runBenchmark(benchmark.cmd, benchmark.desc);
    results.push(result);
    console.log(
      `  ⏱️  ${result.real.toFixed(3)}s real, ${result.user.toFixed(3)}s user, ${result.sys.toFixed(3)}s sys\n`
    );
  }

  // Summary
  console.log('📊 Performance Summary:');
  console.log('======================');

  const avgStartup = results.reduce((sum, r) => sum + r.real, 0) / results.length;
  console.log(`Average startup time: ${avgStartup.toFixed(3)}s`);

  const fastest = results.reduce((min, r) => (r.real < min.real ? r : min));
  const slowest = results.reduce((max, r) => (r.real > max.real ? r : max));

  console.log(`Fastest command: ${fastest.command} (${fastest.real.toFixed(3)}s)`);
  console.log(`Slowest command: ${slowest.command} (${slowest.real.toFixed(3)}s)`);

  console.log('\n✅ Benchmark completed!');
  console.log('\n💡 Key optimizations implemented:');
  console.log('  • Lazy command loading - Commands load only when used');
  console.log('  • Lazy dependency loading - Heavy deps (ngrok, inquirer) load on demand');
  console.log('  • API response caching - Reduces redundant API calls');
  console.log('  • Configuration caching - Avoids repeated file reads');
  console.log('  • Incremental TypeScript compilation - Faster rebuilds');
}

if (require.main === module) {
  main();
}
