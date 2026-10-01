import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const npmCli = process.env.npm_execpath;
assert.ok(npmCli, 'Run this check with npm run test:package');
const temporary = await mkdtemp(join(tmpdir(), 'paymongo-package-'));

function runNode(args, cwd) {
  const env = { ...process.env, NO_COLOR: '1' };
  // npm 12 exports this lifecycle setting, but rejects it on child project installs.
  for (const key of Object.keys(env)) {
    if (key.toLowerCase() === 'npm_config_allow_scripts') delete env[key];
  }
  return execFileSync(process.execPath, args, {
    cwd,
    encoding: 'utf8',
    timeout: 180000,
    stdio: ['ignore', 'pipe', 'pipe'],
    env,
  }).trim();
}
function runNpm(args, cwd) {
  return runNode([npmCli, ...args], cwd);
}
try {
  const result = JSON.parse(
    runNpm(['pack', '--json', '--ignore-scripts', '--pack-destination', temporary], root)
  );
  // npm 10/11 return an array; npm 12 returns an object keyed by package name.
  const packed = (Array.isArray(result) ? result : Object.values(result)).find(
    (entry) => entry.name === manifest.name
  );
  assert.ok(packed, 'npm pack did not return the expected package');
  assert.equal(packed.version, manifest.version);
  const files = new Set(packed.files.map((entry) => entry.path));
  for (const path of [
    'bin/paymongo.js',
    'dist/index.js',
    'dist/commands/checkout/index.js',
    'dist/commands/payment-methods/index.js',
    'dist/services/dev/forwarder.js',
    'dist/utils/webhook-verifier.js',
    'README.md',
    'LICENSE',
    'CHANGELOG.md',
    'USER_GUIDE.md',
    'API_REFERENCE.md',
    'INSTALLATION.md',
    'PAYMONGO_API_ALIGNMENT.md',
    'RELEASE.md',
  ])
    assert.ok(files.has(path), `Missing packaged file: ${path}`);
  for (const path of files) {
    assert.ok(
      path === 'package.json' || manifest.files.includes(path) || /^dist\/.*\.js$/.test(path),
      `Unexpected packaged file: ${path}`
    );
    assert.ok(
      !path.split('/').some((part) => part.startsWith('.env') || part.startsWith('.paymongo')),
      'Sensitive configuration must not be packaged'
    );
  }

  const installation = join(temporary, 'installation');
  await mkdir(installation);
  await writeFile(
    join(installation, 'package.json'),
    JSON.stringify({ name: 'paymongo-package-smoke', private: true, type: 'module' })
  );
  const tarball = join(temporary, basename(packed.filename));
  runNpm(
    [
      'install',
      '--engine-strict',
      '--ignore-scripts',
      '--no-audit',
      '--no-fund',
      '--package-lock=false',
      tarball,
    ],
    installation
  );
  const packageRoot = join(installation, 'node_modules', manifest.name);
  const cli = join(packageRoot, 'bin', 'paymongo.js');
  assert.equal(runNode([cli, '--version'], installation), manifest.version);
  assert.equal(
    runNpm(['exec', '--offline', '--', 'paymongo', '--version'], installation),
    manifest.version
  );
  for (const args of [
    ['--help'],
    ['init', '--help'],
    ['login', '--help'],
    ['dev', '--help'],
    ['config', '--help'],
    ['webhooks', '--help'],
    ['payments', '--help'],
    ['intents', '--help'],
    ['intents', 'attach', '--help'],
    ['intents', 'capture', '--help'],
    ['payment-methods', 'create', '--help'],
    ['checkout', 'create', '--help'],
    ['checkout', 'expire', '--help'],
    ['generate', '--help'],
    ['doctor', '--help'],
  ])
    assert.match(runNode([cli, ...args], installation), /Usage: paymongo/);

  // A real write failure must reach the installed CLI's nonzero exit boundary.
  // This generator needs no configuration, credentials, or network operations.
  assert.throws(
    () =>
      runNode(
        [
          cli,
          'generate',
          'payment-intent',
          '--output',
          join(installation, 'missing-directory', 'intent.js'),
        ],
        installation
      ),
    (error) =>
      error instanceof Error &&
      'status' in error &&
      error.status === 1 &&
      'stderr' in error &&
      String(error.stderr).includes('ENOENT')
  );

  const verifier = pathToFileURL(join(packageRoot, 'dist', 'utils', 'webhook-verifier.js')).href;
  assert.equal(
    runNode(
      [
        '--input-type=module',
        '-e',
        `const mod = await import(${JSON.stringify(verifier)}); console.log(typeof mod.verifyWebhookSignature);`,
      ],
      installation
    ),
    'function'
  );
  console.log(
    `Packed CLI ${manifest.version}: file allowlist, isolated install, bin shim, help, failure exit, and verifier checks passed.`
  );
} finally {
  await rm(temporary, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
