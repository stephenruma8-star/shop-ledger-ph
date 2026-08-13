export const DB_NAME = 'ShopLedgerPH';
export const DB_VERSION = 4;
export let db = null;

export function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const d = e.target.result;
      const stores = ['clients','transactions','payments','inventory','quickItems','settings','auditLogs','users','expenses','suppliers','purchaseOrders','supplierPayments','notifications'];
      stores.forEach(s => { if (!d.objectStoreNames.contains(s)) d.createObjectStore(s, { keyPath: 'id', autoIncrement: true }); });

    };
    req.onsuccess = (e) => { db = e.target.result; resolve(db); };
    req.onerror = () => reject(req.error);
  });
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
  return new Promise((resolve, reject) => {
    dbOp(store, 'readonly', os => {
      const req = os.getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  });
}

export function dbGet(store, id) {
  return new Promise((resolve, reject) => {
    dbOp(store, 'readonly', os => {
      const req = os.get(id);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  });
}

export function dbPut(store, obj) {
  return new Promise((resolve, reject) => {
    dbOp(store, 'readwrite', os => {
      const req = os.put(obj);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  });
}

export function dbAdd(store, obj) {
  return new Promise((resolve, reject) => {
    dbOp(store, 'readwrite', os => {
      const req = os.add(obj);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  });
}

export function dbDel(store, id) {
  return new Promise((resolve, reject) => {
    dbOp(store, 'readwrite', os => {
      const req = os.delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  });
}

export function dbClear(store) {
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
  openDB: { get: () => openDB, configurable: true },
  dbOp: { get: () => dbOp, configurable: true },
  dbAll: { get: () => dbAll, configurable: true },
  dbGet: { get: () => dbGet, configurable: true },
  dbPut: { get: () => dbPut, configurable: true },
  dbAdd: { get: () => dbAdd, configurable: true },
  dbDel: { get: () => dbDel, configurable: true },
  dbClear: { get: () => dbClear, configurable: true }
});
