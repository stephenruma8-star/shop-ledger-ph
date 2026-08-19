// Smoke test for the v3.6.0 backup features:
//   - db.snapshot() online backup of the live SQLite file
//   - binary-safe encrypted snapshots (src/main/crypto.js)
// Runs in plain Node with a fake ipcMain and a temp user-data dir.
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const { registerDbIpc, closeDb, snapshot } = require('../src/main/db.js');
const { encryptData, decryptData } = require('../src/main/crypto.js');

let passed = 0, failed = 0;
const ok = (cond, name) => { if (cond) { passed++; console.log('  ok ' + name); } else { failed++; console.error('  FAIL ' + name); } };

const userData = mkdtempSync(join(tmpdir(), 'slp-backups-smoke-'));
const dir = mkdtempSync(join(tmpdir(), 'slp-backups-files-'));
const invoke = (handlers, name, arg) => handlers.get(name)({}, arg);
const register = () => {
  const handlers = new Map();
  registerDbIpc({ handle: (name, fn) => handlers.set(name, fn) }, userData);
  return handlers;
};

const h = register();
await invoke(h, 'db-open');
await invoke(h, 'db-migrate', { dump: { clients: [{ id: 1, name: 'Aling Nena', balance: 125.5 }, { id: 2, name: 'Mang Jose', balance: 10 }], settings: [{ id: 1, key: 'shopName', value: 'Nena Store' }] } });

// 1 snapshot of the live DB
const snapPath = join(dir, 'snapshot.bak');
const snap = await snapshot(snapPath);
ok(snap && snap.ok === true, 'db.snapshot returns ok');
ok(existsSync(snapPath), 'snapshot file created');
const raw = readFileSync(snapPath);
ok(raw.slice(0, 16).toString('ascii') === 'SQLite format 3\u0000', 'snapshot is a real SQLite file (magic header)');
ok(raw.length > 0, 'snapshot is non-empty (' + raw.length + ' bytes)');
ok(snap.size === raw.length, 'snapshot reports matching size');

// 2 snapshot contents match the live DB
const Database = require('better-sqlite3');
const backupDb = new Database(snapPath);
const row = backupDb.prepare('SELECT value FROM s_clients WHERE id = ?').get(1);
ok(row && JSON.parse(row.value).name === 'Aling Nena', 'snapshot contains live data');
backupDb.close();

// 3 utf8 string round trip (legacy JSON backup path)
const encStr = encryptData(JSON.stringify({ clients: [{ id: 1, name: 'Nena' }] }), 'pw123');
ok(typeof encStr.data === 'string' && encStr.salt && encStr.iv, 'encryptData returns salt/iv/data hex');
const decStr = decryptData(encStr, 'pw123');
ok(JSON.parse(decStr.toString('utf8')).clients[0].name === 'Nena', 'utf8 string round trip via toString');

// 4 binary round trip (SQLite snapshot bytes)
const encBin = encryptData(raw, 'pw123');
const decBin = decryptData(encBin, 'pw123');
ok(Buffer.isBuffer(decBin), 'decryptData returns a Buffer');
ok(decBin.length === raw.length && decBin.equals(raw), 'binary round trip is byte-identical');
const encObj = JSON.parse(JSON.stringify(encBin));
ok(decryptData(encObj, 'pw123').equals(raw), 'encrypted payload survives JSON serialization');

// 5 wrong password fails
let wrongPass = false;
try { decryptData(encBin, 'nope'); } catch (e) { wrongPass = true; }
ok(wrongPass, 'wrong password rejects');

// 6 encrypted snapshot file flow (what create-local-backup does)
const encFile = join(dir, 'backup-encrypted.bak');
const { writeFileSync } = require('node:fs');
writeFileSync(encFile, JSON.stringify(encryptData(raw, 'pw123')));
const restored = decryptData(JSON.parse(readFileSync(encFile, 'utf8')), 'pw123');
ok(restored.equals(raw), 'encrypted snapshot file decrypts back to identical bytes');

rmSync(dir, { recursive: true, force: true });
closeDb();
rmSync(userData, { recursive: true, force: true });

console.log(`\nBackup smoke: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
