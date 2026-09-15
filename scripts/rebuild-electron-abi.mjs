// No-op by design: @journeyapps/sqlcipher is an N-API prebuild that loads under any
// Node/Electron version, so there is nothing to rebuild for the Electron ABI.
// Kept (and kept as `npm run rebuild:electron`) so existing docs/workflows keep
// working. Verifies the binding file is present; run `npm install` to restore it.
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const bindingDir = resolve('node_modules', '@journeyapps', 'sqlcipher', 'lib', 'binding');
if (!existsSync(bindingDir)) {
  console.error('rebuild-electron-abi: sqlcipher binding missing - run "npm install" first.');
  process.exit(1);
}
console.log('rebuild-electron-abi: N-API binding present, no rebuild needed (OK)');
