import { execFileSync } from 'node:child_process';
import { rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
// Incremental compilation alone leaves removed/renamed modules in published tarballs.
await rm(new URL('dist/', root), { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
execFileSync(process.execPath, [fileURLToPath(new URL('node_modules/typescript/bin/tsc', root))], {
  cwd: fileURLToPath(root),
  stdio: 'inherit',
});
