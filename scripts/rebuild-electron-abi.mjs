// Installs better-sqlite3's published prebuilt binary for the Electron ABI (no compiler
// toolchain required). Run after `npm install` or an Electron upgrade, and before packaging.
// Restore the Node-ABI build afterwards with scripts/sqlite-node-abi.mjs for plain-Node tests.
// Verification of the Electron ABI happens automatically in scripts/smoke-boot.mjs.
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';

const electronVersion = JSON.parse(readFileSync(resolve('node_modules', 'electron', 'package.json'), 'utf8')).version;
const bin = resolve('node_modules', '.bin', process.platform === 'win32' ? 'prebuild-install.cmd' : 'prebuild-install');

console.log('rebuild-electron-abi: installing better-sqlite3 prebuild for electron ' + electronVersion + ' ...');
execFileSync(bin, ['--runtime=electron', '--target=' + electronVersion, '--arch=x64'], {
  cwd: resolve('node_modules', 'better-sqlite3'), stdio: 'inherit', shell: true
});
console.log('rebuild-electron-abi: ok - better-sqlite3 now targets electron ' + electronVersion);