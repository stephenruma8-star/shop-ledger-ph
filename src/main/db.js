// SQLite storage backend (better-sqlite3) for the main process.
// All IndexedDB stores are mirrored as s_<store>(id INTEGER PRIMARY KEY AUTOINCREMENT, value TEXT)
// tables holding JSON records, preserving exact IndexedDB semantics (keyPath 'id', autoIncrement).
// If better-sqlite3 cannot be loaded, init() reports ok:false and the renderer falls back to IndexedDB.
const { app } = require('electron');
const path = require('path');
const fs = require('fs');

let Database = null;
try { Database = require('better-sqlite3'); } catch (e) { console.error('better-sqlite3 unavailable:', e.message); }

const STORES = ['clients','transactions','payments','inventory','quickItems','settings','auditLogs','users','expenses','suppliers','purchaseOrders','supplierPayments','notifications'];

let db = null;
let dbPath = null;
const stmts = new Map();

function stmt(sql) {
  let s = stmts.get(sql);
  if (!s) { s = db.prepare(sql); stmts.set(sql, s); }
  return s;
}

function checkStore(store) {
  if (!STORES.includes(store)) throw new Error('Unknown store: ' + store);
}

function fileSize() {
  try { return fs.statSync(dbPath).size; } catch (e) { return 0; }
}

function openInfo() {
  if (!db) return { ok: false, error: 'SQLite not initialized' };
  const row = stmt('SELECT value FROM meta WHERE key = ?').get('sqliteMigrated');
  const needMigration = !(row && row.value === 'true');
  return { ok: true, backend: 'sqlite', path: dbPath, size: fileSize(), needMigration, stores: STORES.length };
}

function init(userDataPath) {
  if (!Database) return { ok: false, error: 'better-sqlite3 not available' };
  if (db) return openInfo();
  try {
    dbPath = path.join(userDataPath, 'shop-ledger-ph.sqlite');
    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = NORMAL');
    db.pragma('busy_timeout = 5000');
    db.exec('CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT)');
    for (const s of STORES) db.exec(`CREATE TABLE IF NOT EXISTS s_${s} (id INTEGER PRIMARY KEY AUTOINCREMENT, value TEXT NOT NULL)`);
    return openInfo();
  } catch (e) {
    console.error('SQLite init failed:', e);
    try { if (db) db.close(); } catch (e2) {}
    db = null; dbPath = null;
    return { ok: false, error: e.message };
  }
}

function get(store, id) {
  checkStore(store);
  const row = stmt(`SELECT value FROM s_${store} WHERE id = ?`).get(id);
  return row ? JSON.parse(row.value) : undefined;
}

function all(store) {
  checkStore(store);
  return stmt(`SELECT id, value FROM s_${store} ORDER BY id`).all().map(r => JSON.parse(r.value));
}

function add(store, obj) {
  checkStore(store);
  let id;
  if (obj && typeof obj.id === 'number') {
    id = Number(stmt(`INSERT INTO s_${store} (id, value) VALUES (?, ?)`).run(obj.id, JSON.stringify(obj)).lastInsertRowid);
  } else {
    const info = stmt(`INSERT INTO s_${store} (value) VALUES (?)`).run(JSON.stringify(obj));
    id = Number(info.lastInsertRowid);
    // Mirror IndexedDB keyPath behavior: the generated key is injected into the stored record
    stmt(`UPDATE s_${store} SET value = ? WHERE id = ?`).run(JSON.stringify({ ...obj, id }), id);
  }
  return id;
}

function put(store, obj) {
  checkStore(store);
  if (!obj || typeof obj.id !== 'number') throw new Error('put requires a record with a numeric id');
  stmt(`INSERT INTO s_${store} (id, value) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET value = excluded.value`).run(obj.id, JSON.stringify(obj));
  return obj.id;
}

function del(store, id) {
  checkStore(store);
  stmt(`DELETE FROM s_${store} WHERE id = ?`).run(id);
}

function clear(store) {
  checkStore(store);
  db.exec(`DELETE FROM s_${store}`);
}

// One-time migration from the renderer's IndexedDB dump: { storeName: [records...] }.
// Replaces each store in a single transaction preserving original ids; idempotent.
function migrate(dump) {
  if (!db) throw new Error('SQLite not initialized');
  const row = stmt('SELECT value FROM meta WHERE key = ?').get('sqliteMigrated');
  if (row && row.value === 'true') return { migrated: false, counts: {} };
  const counts = {};
  const tx = db.transaction(() => {
    for (const s of STORES) {
      const records = (dump && Array.isArray(dump[s])) ? dump[s] : [];
      db.exec(`DELETE FROM s_${s}`);
      const ins = stmt(`INSERT OR IGNORE INTO s_${s} (id, value) VALUES (?, ?)`);
      let n = 0;
      for (const rec of records) {
        if (rec && typeof rec.id === 'number') { ins.run(rec.id, JSON.stringify(rec)); n++; }
      }
      counts[s] = n;
    }
    stmt('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run('sqliteMigrated', 'true');
  });
  tx();
  return { migrated: true, counts };
}

// Online backup (VACUUM-style consistent copy) of the live SQLite file.
function snapshot(destPath) {
  if (!db) return Promise.reject(new Error('SQLite not initialized'));
  return db.backup(destPath).then(() => {
    try { return { ok: true, size: fs.statSync(destPath).size }; }
    catch (e) { throw new Error('Snapshot written but unreadable: ' + e.message); }
  });
}

function stats() {
  if (!db) return { ok: false, error: 'SQLite not initialized' };
  const counts = {};
  for (const s of STORES) counts[s] = stmt(`SELECT COUNT(*) AS n FROM s_${s}`).get().n;
  return { ok: true, backend: 'sqlite', path: dbPath, size: fileSize(), counts };
}

function close() {
  if (db) {
    try { db.close(); } catch (e) {}
    db = null;
  }
  stmts.clear();
}

function registerDbIpc(ipcMain, userDataPath) {
  ipcMain.handle('db-open', () => init(userDataPath || app.getPath('userData')));
  ipcMain.handle('db-migrate', (e, { dump }) => migrate(dump));
  ipcMain.handle('db-get', (e, { store, id }) => get(store, id));
  ipcMain.handle('db-add', (e, { store, obj }) => add(store, obj));
  ipcMain.handle('db-put', (e, { store, obj }) => put(store, obj));
  ipcMain.handle('db-del', (e, { store, id }) => del(store, id));
  ipcMain.handle('db-all', (e, { store }) => all(store));
  ipcMain.handle('db-clear', (e, { store }) => clear(store));
  ipcMain.handle('db-stats', () => stats());
}

module.exports = { registerDbIpc, init, migrate, get, add, put, del, all, clear, stats, snapshot, close, closeDb: close };
