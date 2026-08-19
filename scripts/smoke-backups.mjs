// Smoke test for backup + database maintenance features:
//   - db.snapshot() online backup of the live SQLite file
//   - binary-safe encrypted snapshots (src/main/crypto.js)
//   - db maintenance primitives (integrity / optimize / checkpoint / vacuum)
//   - backupService (auto snapshots, pruning, restore via replaceWith, dbHealth)
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

// 7 db maintenance primitives
const { integrityCheck, optimize, checkpoint, vacuum } = require('../src/main/db.js');
ok(integrityCheck().ok === true, 'integrityCheck passes on live DB');
ok(optimize().ok === true, 'optimize (PRAGMA optimize) runs');
ok(checkpoint().ok === true, 'wal_checkpoint(TRUNCATE) runs');
const vac = vacuum();
ok(vac.ok === true && vac.size > 0, 'VACUUM runs and reports size');

// 8 backupService wiring (pure Node with injected cfg)
const svcDir = mkdtempSync(join(tmpdir(), 'slp-svc-'));
const svc = require('../src/main/backupService.js');
const fakeSettings = {};
svc.configure({
  userDataPath: userData,
  backupsDir: join(svcDir, 'backups'),
  getSettings: async () => fakeSettings,
  setSetting: async (k, v) => { fakeSettings[k] = v; },
  getRendererDump: async () => ({ clients: [] }),
  notify: () => {}
});
const eAuto = await svc.createBackup('', true);
ok(eAuto.status === 'ok' && eAuto.auto === true && eAuto.encrypted === false, 'createBackup auto entry ok');
ok(existsSync(join(svcDir, 'backups', eAuto.name)), 'auto snapshot file exists');
ok(readFileSync(join(svcDir, 'backups', eAuto.name)).slice(0, 16).toString('ascii') === 'SQLite format 3\u0000', 'auto snapshot is a real SQLite file');
const list = await svc.listBackups();
ok(list.success === true && list.backups[0].name === eAuto.name, 'listBackups returns newest first');

const planDisabled = await svc.planLocalSnapshot();
ok(planDisabled.planned === false && planDisabled.reason === 'disabled', 'planLocalSnapshot disabled when autoSnapshotEnabled off');
fakeSettings.autoSnapshotEnabled = 'true';
fakeSettings.snapshotKeepCount = '1';
const plan1 = await svc.planLocalSnapshot();
ok(plan1.planned === true && plan1.entry.status === 'ok' && plan1.entry.auto === true, 'planLocalSnapshot creates auto snapshot');
ok(fakeSettings.lastAutoSnapshot === new Date().toISOString().split('T')[0], 'lastAutoSnapshot recorded for today');
const plan2 = await svc.planLocalSnapshot();
ok(plan2.planned === false && plan2.reason === 'already-today', 'planLocalSnapshot skips second run same day');
const manual = await svc.createBackup('', false);
ok(manual.auto === false, 'manual backup flagged auto=false');
await svc.createBackup('', true);
await svc.createBackup('', true);
const pruned = svc.pruneAutoSnapshots(2);
ok(pruned === 1, 'pruneAutoSnapshots removes oldest excess auto snapshot (keep 2)');
const afterPrune = await svc.listBackups();
ok(afterPrune.backups.filter(b => b.auto).length === 2, 'two auto snapshots kept after prune');
ok(afterPrune.backups.some(b => b.name === manual.name), 'manual backup never pruned');
ok(!afterPrune.backups.some(b => b.name === plan1.entry.name), 'oldest auto snapshot removed from index');
ok(!existsSync(join(svcDir, 'backups', plan1.entry.name)), 'pruned snapshot file deleted');

const health = svc.dbHealth('status');
ok(health.success === true && health.backend === 'sqlite', 'dbHealth status reports sqlite backend');
ok(health.details && health.details.integrityOk === true, 'dbHealth status runs integrity check');
ok(health.details.tableCount > 0 && health.details.dbSizeBytes > 0, 'dbHealth status reports table count and size');
ok(health.details.snapshotCount >= 2, 'dbHealth status reports snapshot count');
const compact = svc.dbHealth('compact');
ok(compact.success === true && compact.details.compacted === true, 'dbHealth compact runs VACUUM');

// 9 restore flow (encrypted round trip through replaceWith)
const preRestore = join(svcDir, 'pre-restore.bak');
await snapshot(preRestore);
await invoke(h, 'db-add', { store: 'clients', obj: { id: 99, name: 'Temp Client' } });
const crafted = join(svcDir, 'backups', 'restore-ok.bak');
writeFileSync(crafted, JSON.stringify(encryptData(readFileSync(preRestore), 'pw123')));
writeFileSync(join(svcDir, 'backups', 'backups.json'), JSON.stringify([
  { name: 'restore-ok.bak', date: new Date().toISOString(), size: 0, status: 'ok', type: 'snapshot', encrypted: true, auto: false }
], null, 2));
let rr = await svc.restoreBackup('restore-ok.bak', '');
ok(rr.success === false && /password/i.test(rr.error), 'encrypted restore without password rejected');
rr = await svc.restoreBackup('restore-ok.bak', 'bad');
ok(rr.success === false && /wrong password|corrupted/i.test(rr.error), 'restore with wrong password rejected');
rr = await svc.restoreBackup('restore-ok.bak', 'pw123');
ok(rr.success === true, 'restore with correct password succeeds');
const gone = await invoke(h, 'db-get', { store: 'clients', id: 99 });
ok(!gone, 'restored database no longer contains the temp client');
ok(existsSync(join(userData, 'shop-ledger-ph.sqlite.prerestore')), '.prerestore safety copy kept');
const restoredDb = new Database(join(userData, 'shop-ledger-ph.sqlite'));
const metaVal = restoredDb.prepare('SELECT value FROM meta WHERE key = ?').get('sqliteMigrated');
restoredDb.close();
ok(metaVal && metaVal.value === 'true', 'sqliteMigrated stamped so renderer never re-migrates');

// 10 non-SQLite (json-type) backup cannot be restored as a database
writeFileSync(join(svcDir, 'backups', 'json-only.bak'), '{"clients":[]}');
writeFileSync(join(svcDir, 'backups', 'backups.json'), JSON.stringify([
  { name: 'json-only.bak', date: new Date().toISOString(), size: 12, status: 'ok', type: 'json', encrypted: false, auto: false }
], null, 2));
const jr = await svc.restoreBackup('json-only.bak', '');
ok(jr.success === false && /not a valid database snapshot/i.test(jr.error), 'json backup rejected for DB restore');

rmSync(dir, { recursive: true, force: true });
rmSync(svcDir, { recursive: true, force: true });
closeDb();
rmSync(userData, { recursive: true, force: true });

console.log(`\nBackup smoke: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
