const DB_NAME = 'ShopLedgerPH';
const DB_VERSION = 3;
let db = null;

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const d = e.target.result;
      const stores = ['clients','transactions','payments','inventory','quickItems','settings','auditLogs','users','expenses','suppliers','purchaseOrders','loyaltyPoints','notifications'];
      stores.forEach(s => { if (!d.objectStoreNames.contains(s)) d.createObjectStore(s, { keyPath: 'id', autoIncrement: true }); });
      if (!d.objectStoreNames.contains('clients')) d.createObjectStore('clients', { keyPath: 'id', autoIncrement: true });
    };
    req.onsuccess = (e) => { db = e.target.result; resolve(db); };
    req.onerror = () => reject(req.error);
  });
}

function dbOp(store, mode, fn) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const os = tx.objectStore(store);
    const result = fn(os);
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
  });
}

function dbAll(store) {
  return new Promise((resolve, reject) => {
    dbOp(store, 'readonly', os => {
      const req = os.getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  });
}

function dbGet(store, id) {
  return new Promise((resolve, reject) => {
    dbOp(store, 'readonly', os => {
      const req = os.get(id);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  });
}

function dbPut(store, obj) {
  return new Promise((resolve, reject) => {
    dbOp(store, 'readwrite', os => {
      const req = os.put(obj);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  });
}

function dbAdd(store, obj) {
  return new Promise((resolve, reject) => {
    dbOp(store, 'readwrite', os => {
      const req = os.add(obj);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  });
}

function dbDel(store, id) {
  return new Promise((resolve, reject) => {
    dbOp(store, 'readwrite', os => {
      const req = os.delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  });
}

function dbClear(store) {
  return new Promise((resolve, reject) => {
    dbOp(store, 'readwrite', os => {
      const req = os.clear();
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  });
}
