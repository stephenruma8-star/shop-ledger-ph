// Ensures node_modules/better-sqlite3 is built for the CURRENT Node runtime.
// electron-builder rebuilds native deps for Electron during build:win, which breaks
// plain-Node test runs; this reinstalls the Node prebuild when needed.
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

function canLoad() {
  try {
    const Database = createRequire(import.meta.url)('better-sqlite3');
    const db = new Database(':memory:');
    db.exec('select 1');
    db.close();
    return true;
  } catch (e) { return false; }
}

if (canLoad()) {
  console.log('sqlite-node-abi: better-sqlite3 loads under Node (OK)');
} else {
  console.log('sqlite-node-abi: ABI mismatch (rebuilt for Electron) - reinstalling Node prebuild...');
  const bin = resolve('node_modules', '.bin', process.platform === 'win32' ? 'prebuild-install.cmd' : 'prebuild-install');
  try {
    execFileSync(bin, [], { cwd: resolve('node_modules', 'better-sqlite3'), stdio: 'inherit', shell: true });
  } catch (e) {
    console.error('sqlite-node-abi: prebuild-install failed. Run "npm install" or "npm run rebuild:electron" and re-test.');
    process.exit(1);
  }
  if (!canLoad()) {
    console.error('sqlite-node-abi: better-sqlite3 still cannot load under Node after reinstall.');
    process.exit(1);
  }
  console.log('sqlite-node-abi: better-sqlite3 restored for Node (OK)');
}