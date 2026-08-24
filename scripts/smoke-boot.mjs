// Boot smoke: launches the REAL Electron binary against the built app (out/main)
// and asserts the main process stays alive long enough to come up cleanly.
// Validates the better-sqlite3 Electron-ABI build, preload, window creation and
// startup path under actual Electron, not just the node-renderer harnesses.
// Usage: node scripts/smoke-boot.mjs   (run `npm run build` + `npm run rebuild:electron` first)
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { resolve, join } from 'node:path';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';

const require = createRequire(import.meta.url);
const electronExe = require('electron'); // resolves to the electron binary path
const root = resolve(import.meta.dirname ?? process.cwd(), '..');
const userData = mkdtempSync(join(tmpdir(), 'slp-boot-'));

console.log('Boot smoke: electron=' + electronExe + ' cwd=' + root);

const child = spawn(electronExe, ['.', '--no-sandbox', '--disable-gpu', '--user-data-dir=' + userData], {
  cwd: root,
  env: { ...process.env, ELECTRON_DISABLE_SECURITY_WARNINGS: 'true' },
});

let stderr = '';
let out = '';
child.stderr.on('data', (d) => { stderr += d.toString(); });
child.stdout.on('data', (d) => { out += d.toString(); });

const HEALTHY_SECONDS = 12;
const verdict = await new Promise((resolveVerdict) => {
  const timer = setTimeout(() => resolveVerdict('alive'), HEALTHY_SECONDS * 1000);
  child.on('exit', (code, signal) => {
    clearTimeout(timer);
    resolveVerdict('exited:' + code + ':' + (signal || ''));
  });
});

if (verdict === 'alive') {
  console.log('PASS - app stayed alive for ' + HEALTHY_SECONDS + 's (main process boot OK)');
  child.kill();
  await new Promise((r) => setTimeout(r, 500));
  process.exit(0);
} else {
  console.error('FAIL - app exited early (' + verdict + ')');
  console.error('--- stderr (last 2000 chars) ---');
  console.error(stderr.slice(-2000));
  console.error('--- stdout (last 2000 chars) ---');
  console.error(out.slice(-2000));
  process.exit(1);
}