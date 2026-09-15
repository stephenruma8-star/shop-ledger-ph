// SQLCipher ships as an N-API prebuild: one binary loads under both plain Node and
// Electron, so no ABI swapping is ever needed. This script just verifies it loads
// (replaces the old better-sqlite3 prebuild-install dance).
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

try {
  const sqlite3 = require('@journeyapps/sqlcipher');
  const db = await new Promise((resolve, reject) => {
    const d = new sqlite3.Database(':memory:', (e) => (e ? reject(e) : resolve(d)));
  });
  await new Promise((resolve, reject) => db.exec('select 1', (e) => (e ? reject(e) : resolve())));
  db.close(() => {});
  console.log('sqlite-node-abi: @journeyapps/sqlcipher loads under Node (OK)');
} catch (e) {
  console.error('sqlite-node-abi: sqlcipher failed to load: ' + (e && e.message));
  process.exit(1);
}
