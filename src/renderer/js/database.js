export const DB_NAME = 'ShopLedgerPH';
export const DB_VERSION = 4;
export const SCHEMA_VERSION = 1;
export let db = null;
export let sqlite = null;

const STORES = ['clients','transactions','payments','inventory','quickItems','settings','auditLogs','users','expenses','suppliers','purchaseOrders','supplierPayments','notifications'];

const MIGRATIONS = [
  { version: 1, name: 'initial schema', up: async (dbApi) => { /* tables created on init */ } },
];

export async function runMigrations(dbApi) {
  let current = 0;
  try {
    const rows = await dbApi.all('settings');
    const s = rows.find(r => r.key === 'schemaVersion');
    current = s ? parseInt(s.value) || 0 : 0;
  } catch (e) { /* first run */ }
  for (const m of MIGRATIONS) {
    if (m.version > current) {
      console.log(`Migration ${m.version}: ${m.name}`);
      await m.up(dbApi);
      try {
        const rows = await dbApi.all('settings');
        const existing = rows.find(r => r.key === 'schemaVersion');
        if (existing) { existing.value = String(m.version); await dbApi.put('settings', existing); }
        else await dbApi.add('settings', { key: 'schemaVersion', value: String(m.version) });
      } catch (e) { console.error('Failed to save schema version:', e); }
    }
  }
}

// Dump every IndexedDB store (used only for the one-time SQLite migration).
function dumpAllStoresIDB() {
  return new Promise((resolve, reject) => {
    let req;
    try { req = indexedDB.open(DB_NAME, DB_VERSION); } catch (e) { reject(e); return; }
    req.onupgradeneeded = (e) => {
      const d = e.target.result;
      STORES.forEach(s => { if (!d.objectStoreNames.contains(s)) d.createObjectStore(s, { keyPath: 'id', autoIncrement: true }); });
    };
    req.onsuccess = (e) => {
      const d = e.target.result;
      const out = {};
      try {
        const tx = d.transaction(STORES, 'readonly');
        const pending = STORES.map(s => new Promise((res, rej) => {
          const r = tx.objectStore(s).getAll();
          r.onsuccess = () => { out[s] = r.result; res(); };
          r.onerror = () => rej(r.error);
        }));
        tx.oncomplete = () => { d.close(); Promise.all(pending).then(() => resolve(out), reject); };
        tx.onerror = () => reject(tx.error);
      } catch (err) { reject(err); }
    };
    req.onerror = () => reject(req.error);
  });
}

// Legacy IndexedDB path. Kept synchronous at call time (indexedDB.open fires on
// the current tick) so boot-upgrade ordering stays identical to the pre-SQLite code.
function legacyOpenIDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const d = e.target.result;
      STORES.forEach(s => { if (!d.objectStoreNames.contains(s)) d.createObjectStore(s, { keyPath: 'id', autoIncrement: true }); });

    };
    req.onsuccess = (e) => { db = e.target.result; resolve(db); };
    req.onerror = () => reject(req.error);
  });
}

export async function openDB() {
  if (!window.electronAPI || !window.electronAPI.db) return legacyOpenIDB();
  try {
    const res = await window.electronAPI.db.open();
    if (!res || !res.ok) return legacyOpenIDB();
    if (res.needMigration) {
      const dump = await dumpAllStoresIDB();
      await window.electronAPI.db.migrate(dump);
    }
    sqlite = window.electronAPI.db;
    await runMigrations(sqlite);
    return sqlite;
  } catch (e) {
    console.error('SQLite backend unavailable, using IndexedDB:', e);
    return legacyOpenIDB();
  }
}

export function dbOp(store, mode, fn) {
  return new Promise((resolve, reject) => {
    if (!db) { reject(new Error('Database not opened')); return; }
    try {
      const tx = db.transaction(store, mode);
      const os = tx.objectStore(store);
      const result = fn(os);
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error);
    } catch (e) { reject(e); }
  });
}

export function dbAll(store) {
  if (sqlite) return sqlite.all(store);
  return new Promise((resolve, reject) => {
    dbOp(store, 'readonly', os => {
      const req = os.getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  });
}

export function dbGet(store, id) {
  if (sqlite) return sqlite.get(store, id);
  return new Promise((resolve, reject) => {
    dbOp(store, 'readonly', os => {
      const req = os.get(id);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  });
}

export function dbPut(store, obj) {
  if (sqlite) return sqlite.put(store, obj);
  return new Promise((resolve, reject) => {
    dbOp(store, 'readwrite', os => {
      const req = os.put(obj);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  });
}

export function dbAdd(store, obj) {
  if (sqlite) return sqlite.add(store, obj);
  return new Promise((resolve, reject) => {
    dbOp(store, 'readwrite', os => {
      const req = os.add(obj);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  });
}

export function dbDel(store, id) {
  if (sqlite) return sqlite.del(store, id);
  return new Promise((resolve, reject) => {
    dbOp(store, 'readwrite', os => {
      const req = os.delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  });
}

export function dbClear(store) {
  if (sqlite) return sqlite.clear(store);
  return new Promise((resolve, reject) => {
    dbOp(store, 'readwrite', os => {
      const req = os.clear();
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  });
}


// expose top-level bindings as globals (inline onclick handlers and legacy code paths rely on them)
Object.defineProperties(window, {
  DB_NAME: { get: () => DB_NAME, configurable: true },
  DB_VERSION: { get: () => DB_VERSION, configurable: true },
  db: { get: () => db, set: (v) => { db = v; }, configurable: true },
  sqlite: { get: () => sqlite, configurable: true },
  openDB: { get: () => openDB, configurable: true },
  dbOp: { get: () => dbOp, configurable: true },
  dbAll: { get: () => dbAll, configurable: true },
  dbGet: { get: () => dbGet, configurable: true },
  dbPut: { get: () => dbPut, configurable: true },
  dbAdd: { get: () => dbAdd, configurable: true },
  dbDel: { get: () => dbDel, configurable: true },
  dbClear: { get: () => dbClear, configurable: true }
});
