// SQLite storage backend for the main process, on SQLCipher 4 (@journeyapps/sqlcipher).
// All IndexedDB stores are mirrored as s_<store>(id INTEGER PRIMARY KEY AUTOINCREMENT, value TEXT)
// tables holding JSON records, preserving exact IndexedDB semantics (keyPath 'id', autoIncrement).
// If the binding cannot be loaded, init() reports ok:false and the renderer falls back to IndexedDB.
//
// Concurrency model: node-sqlite3 is async, so every exported operation runs through a
// single promise-chain mutex (queued()). That preserves the exact ordering semantics the
// old synchronous backend had. Internal helpers (*Raw) must only be called from code that
// already holds the queue — never wrap a queued function inside another queued one.
//
// Encryption model (page-level, SQLCipher): the live file is ALWAYS ciphertext once a key
// is set. PRAGMA key unlocks, PRAGMA rekey enables/changes. There is never a plaintext
// window on disk — even a crash leaves the vault locked. No passwords are retained in
// memory after use, and no temp-file plaintext copies are ever written.
const { app } = require('electron');
const path = require('path');
const fs = require('fs');
const logger = require('./logger.js');

let sqlite3 = null;
try { sqlite3 = require('@journeyapps/sqlcipher'); } catch (e) { logger.error('sqlcipher unavailable: ' + e.message); }

const STORES = ['clients','transactions','payments','inventory','quickItems','settings','auditLogs','users','expenses','suppliers','purchaseOrders','supplierPayments','notifications','balanceSnapshots'];

// Versioned schema migrations. Baseline (v1) is the current schema; future schema changes
// (new stores, columns, indexes) add higher versions with idempotent steps. Each step runs
// once inside a transaction and is recorded in schema_migrations.
const MIGRATIONS = [
  { version: 1, name: 'baseline', up: async () => {}, down: async () => {} },
  { version: 2, name: 'add indexes', up: async () => {
    await execAsync(`CREATE INDEX IF NOT EXISTS idx_transactions_date ON s_transactions(json_extract(value, '$.date'))`);
    await execAsync(`CREATE INDEX IF NOT EXISTS idx_transactions_client ON s_transactions(json_extract(value, '$.clientId'))`);
    await execAsync(`CREATE INDEX IF NOT EXISTS idx_transactions_status ON s_transactions(json_extract(value, '$.status'))`);
    await execAsync(`CREATE INDEX IF NOT EXISTS idx_transactions_invoice ON s_transactions(json_extract(value, '$.invoiceNo'))`);
    await execAsync(`CREATE INDEX IF NOT EXISTS idx_payments_date ON s_payments(json_extract(value, '$.date'))`);
    await execAsync(`CREATE INDEX IF NOT EXISTS idx_payments_client ON s_payments(json_extract(value, '$.clientId'))`);
    await execAsync(`CREATE INDEX IF NOT EXISTS idx_expenses_date ON s_expenses(json_extract(value, '$.date'))`);
    await execAsync(`CREATE INDEX IF NOT EXISTS idx_expenses_category ON s_expenses(json_extract(value, '$.category'))`);
    await execAsync(`CREATE INDEX IF NOT EXISTS idx_inventory_name ON s_inventory(json_extract(value, '$.name'))`);
    await execAsync(`CREATE INDEX IF NOT EXISTS idx_inventory_sku ON s_inventory(json_extract(value, '$.sku'))`);
    await execAsync(`CREATE INDEX IF NOT EXISTS idx_inventory_barcode ON s_inventory(json_extract(value, '$.barcode'))`);
    await execAsync(`CREATE INDEX IF NOT EXISTS idx_inventory_category ON s_inventory(json_extract(value, '$.category'))`);
    await execAsync(`CREATE INDEX IF NOT EXISTS idx_clients_name ON s_clients(json_extract(value, '$.name'))`);
    await execAsync(`CREATE INDEX IF NOT EXISTS idx_auditlogs_date ON s_auditLogs(json_extract(value, '$.createdAt'))`);
    await execAsync(`CREATE INDEX IF NOT EXISTS idx_auditlogs_action ON s_auditLogs(json_extract(value, '$.action'))`);
  }, down: async () => {
    await execAsync(`DROP INDEX IF EXISTS idx_transactions_date`);
    await execAsync(`DROP INDEX IF EXISTS idx_transactions_client`);
    await execAsync(`DROP INDEX IF EXISTS idx_transactions_status`);
    await execAsync(`DROP INDEX IF EXISTS idx_transactions_invoice`);
    await execAsync(`DROP INDEX IF EXISTS idx_payments_date`);
    await execAsync(`DROP INDEX IF EXISTS idx_payments_client`);
    await execAsync(`DROP INDEX IF EXISTS idx_expenses_date`);
    await execAsync(`DROP INDEX IF EXISTS idx_expenses_category`);
    await execAsync(`DROP INDEX IF EXISTS idx_inventory_name`);
    await execAsync(`DROP INDEX IF EXISTS idx_inventory_sku`);
    await execAsync(`DROP INDEX IF EXISTS idx_inventory_barcode`);
    await execAsync(`DROP INDEX IF EXISTS idx_inventory_category`);
    await execAsync(`DROP INDEX IF EXISTS idx_clients_name`);
    await execAsync(`DROP INDEX IF EXISTS idx_auditlogs_date`);
    await execAsync(`DROP INDEX IF EXISTS idx_auditlogs_action`);
  }},
  { version: 3, name: 'relational schema', up: async () => {
    await execAsync(`CREATE TABLE IF NOT EXISTS r_clients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL DEFAULT '',
      phone TEXT DEFAULT '',
      address TEXT DEFAULT '',
      balance REAL DEFAULT 0,
      dueDate TEXT DEFAULT '',
      createdAt TEXT DEFAULT '',
      ledgerYear TEXT DEFAULT '',
      isSC INTEGER DEFAULT 0,
      isPWD INTEGER DEFAULT 0,
      loyaltyPoints INTEGER DEFAULT 0,
      totalSpent REAL DEFAULT 0,
      redeemedDiscount REAL DEFAULT 0
    )`);
    await execAsync(`CREATE TABLE IF NOT EXISTS r_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoiceNo TEXT DEFAULT '',
      clientId INTEGER,
      clientName TEXT DEFAULT '',
      date TEXT DEFAULT '',
      createdAt TEXT DEFAULT '',
      subtotal REAL DEFAULT 0,
      totalInterest REAL DEFAULT 0,
      discount REAL DEFAULT 0,
      scDiscount REAL DEFAULT 0,
      grandTotal REAL DEFAULT 0,
      commissionRate REAL DEFAULT 0,
      commissionAmount REAL DEFAULT 0,
      paymentMethod TEXT DEFAULT 'Cash',
      status TEXT DEFAULT 'pending',
      balanceAdded INTEGER DEFAULT 0,
      duplicateCheck INTEGER DEFAULT 0,
      vatExclusive REAL DEFAULT 0,
      vatAmount REAL DEFAULT 0,
      vatRate REAL DEFAULT 0.12,
      editedAt TEXT DEFAULT '',
      returnReason TEXT DEFAULT '',
      refundMethod TEXT DEFAULT '',
      returnNotes TEXT DEFAULT '',
      refId INTEGER,
      voidReason TEXT DEFAULT '',
      voidNotes TEXT DEFAULT '',
      FOREIGN KEY (clientId) REFERENCES r_clients(id)
    )`);
    await execAsync(`CREATE TABLE IF NOT EXISTS r_transaction_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      transactionId INTEGER NOT NULL,
      date TEXT DEFAULT '',
      description TEXT DEFAULT '',
      name TEXT DEFAULT '',
      unitCost REAL DEFAULT 0,
      intRate REAL DEFAULT 0,
      amount REAL DEFAULT 0,
      invId INTEGER,
      variantName TEXT DEFAULT '',
      FOREIGN KEY (transactionId) REFERENCES r_transactions(id) ON DELETE CASCADE
    )`);
    await execAsync(`CREATE TABLE IF NOT EXISTS r_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      clientId INTEGER NOT NULL,
      clientName TEXT DEFAULT '',
      amount REAL DEFAULT 0,
      date TEXT DEFAULT '',
      type TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      createdAt TEXT DEFAULT '',
      updatedAt TEXT DEFAULT '',
      FOREIGN KEY (clientId) REFERENCES r_clients(id)
    )`);
    await execAsync(`CREATE TABLE IF NOT EXISTS r_inventory (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL DEFAULT '',
      description TEXT DEFAULT '',
      sku TEXT DEFAULT '',
      barcode TEXT DEFAULT '',
      category TEXT DEFAULT '',
      sellPrice REAL DEFAULT 0,
      costPrice REAL DEFAULT 0,
      stock INTEGER DEFAULT 0,
      minStock INTEGER DEFAULT 5,
      lowStock INTEGER DEFAULT 5,
      unit TEXT DEFAULT '',
      image TEXT DEFAULT '',
      expiryDate TEXT DEFAULT '',
      createdAt TEXT DEFAULT '',
      updatedAt TEXT DEFAULT ''
    )`);
    await execAsync(`CREATE TABLE IF NOT EXISTS r_inventory_variants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      inventoryId INTEGER NOT NULL,
      name TEXT DEFAULT '',
      stock INTEGER DEFAULT 0,
      FOREIGN KEY (inventoryId) REFERENCES r_inventory(id) ON DELETE CASCADE
    )`);
    await execAsync(`CREATE TABLE IF NOT EXISTS r_quickItems (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT DEFAULT '',
      price REAL DEFAULT 0
    )`);
    await execAsync(`CREATE TABLE IF NOT EXISTS r_settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT NOT NULL UNIQUE,
      value TEXT DEFAULT ''
    )`);
    await execAsync(`CREATE TABLE IF NOT EXISTS r_auditLogs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      action TEXT DEFAULT '',
      details TEXT DEFAULT '',
      user TEXT DEFAULT '',
      createdAt TEXT DEFAULT '',
      date TEXT DEFAULT ''
    )`);
    await execAsync(`CREATE TABLE IF NOT EXISTS r_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL DEFAULT '',
      password TEXT DEFAULT '',
      name TEXT DEFAULT '',
      role TEXT DEFAULT 'staff'
    )`);
    await execAsync(`CREATE TABLE IF NOT EXISTS r_expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT DEFAULT '',
      category TEXT DEFAULT '',
      description TEXT DEFAULT '',
      amount REAL DEFAULT 0,
      payee TEXT DEFAULT '',
      type TEXT DEFAULT '',
      refType TEXT DEFAULT '',
      refId INTEGER,
      createdAt TEXT DEFAULT ''
    )`);
    await execAsync(`CREATE TABLE IF NOT EXISTS r_suppliers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT DEFAULT '',
      contact TEXT DEFAULT '',
      email TEXT DEFAULT '',
      category TEXT DEFAULT '',
      address TEXT DEFAULT '',
      createdAt TEXT DEFAULT ''
    )`);
    await execAsync(`CREATE TABLE IF NOT EXISTS r_supplierPriceHistory (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      supplierId INTEGER NOT NULL,
      itemName TEXT DEFAULT '',
      price REAL DEFAULT 0,
      qty INTEGER DEFAULT 0,
      date TEXT DEFAULT '',
      poNo TEXT DEFAULT '',
      FOREIGN KEY (supplierId) REFERENCES r_suppliers(id) ON DELETE CASCADE
    )`);
    await execAsync(`CREATE TABLE IF NOT EXISTS r_purchaseOrders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      poNo TEXT DEFAULT '',
      supplierId INTEGER,
      supplierName TEXT DEFAULT '',
      date TEXT DEFAULT '',
      total REAL DEFAULT 0,
      status TEXT DEFAULT 'Pending',
      createdAt TEXT DEFAULT '',
      receivedAt TEXT DEFAULT '',
      FOREIGN KEY (supplierId) REFERENCES r_suppliers(id)
    )`);
    await execAsync(`CREATE TABLE IF NOT EXISTS r_purchaseOrder_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      purchaseOrderId INTEGER NOT NULL,
      invId INTEGER,
      name TEXT DEFAULT '',
      price REAL DEFAULT 0,
      qty INTEGER DEFAULT 0,
      variantName TEXT DEFAULT '',
      FOREIGN KEY (purchaseOrderId) REFERENCES r_purchaseOrders(id) ON DELETE CASCADE
    )`);
    await execAsync(`CREATE TABLE IF NOT EXISTS r_supplierPayments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      supplierId INTEGER NOT NULL,
      supplierName TEXT DEFAULT '',
      amount REAL DEFAULT 0,
      date TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      paymentMethod TEXT DEFAULT 'Cash',
      referenceNo TEXT DEFAULT '',
      createdAt TEXT DEFAULT '',
      FOREIGN KEY (supplierId) REFERENCES r_suppliers(id)
    )`);
    await execAsync(`CREATE TABLE IF NOT EXISTS r_notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      message TEXT DEFAULT '',
      type TEXT DEFAULT 'info',
      read INTEGER DEFAULT 0,
      createdAt TEXT DEFAULT '',
      date TEXT DEFAULT ''
    )`);
    await execAsync(`CREATE INDEX IF NOT EXISTS idx_r_transactions_client ON r_transactions(clientId)`);
    await execAsync(`CREATE INDEX IF NOT EXISTS idx_r_transactions_date ON r_transactions(date)`);
    await execAsync(`CREATE INDEX IF NOT EXISTS idx_r_transactions_status ON r_transactions(status)`);
    await execAsync(`CREATE INDEX IF NOT EXISTS idx_r_transactions_invoice ON r_transactions(invoiceNo)`);
    await execAsync(`CREATE INDEX IF NOT EXISTS idx_r_transaction_items_txn ON r_transaction_items(transactionId)`);
    await execAsync(`CREATE INDEX IF NOT EXISTS idx_r_transaction_items_inv ON r_transaction_items(invId)`);
    await execAsync(`CREATE INDEX IF NOT EXISTS idx_r_payments_client ON r_payments(clientId)`);
    await execAsync(`CREATE INDEX IF NOT EXISTS idx_r_payments_date ON r_payments(date)`);
    await execAsync(`CREATE INDEX IF NOT EXISTS idx_r_inventory_name ON r_inventory(name)`);
    await execAsync(`CREATE INDEX IF NOT EXISTS idx_r_inventory_sku ON r_inventory(sku)`);
    await execAsync(`CREATE INDEX IF NOT EXISTS idx_r_inventory_barcode ON r_inventory(barcode)`);
    await execAsync(`CREATE INDEX IF NOT EXISTS idx_r_inventory_category ON r_inventory(category)`);
    await execAsync(`CREATE INDEX IF NOT EXISTS idx_r_inventory_expiry ON r_inventory(expiryDate)`);
    await execAsync(`CREATE INDEX IF NOT EXISTS idx_r_expenses_date ON r_expenses(date)`);
    await execAsync(`CREATE INDEX IF NOT EXISTS idx_r_expenses_category ON r_expenses(category)`);
    await execAsync(`CREATE INDEX IF NOT EXISTS idx_r_auditlogs_date ON r_auditLogs(createdAt)`);
    await execAsync(`CREATE INDEX IF NOT EXISTS idx_r_auditlogs_action ON r_auditLogs(action)`);
    await execAsync(`CREATE INDEX IF NOT EXISTS idx_r_supplier_payments_supplier ON r_supplierPayments(supplierId)`);
    await execAsync(`CREATE INDEX IF NOT EXISTS idx_r_purchase_orders_supplier ON r_purchaseOrders(supplierId)`);
    await execAsync(`CREATE INDEX IF NOT EXISTS idx_r_purchase_orders_date ON r_purchaseOrders(date)`);
    await execAsync(`CREATE INDEX IF NOT EXISTS idx_r_po_items_po ON r_purchaseOrder_items(purchaseOrderId)`);
    await execAsync(`CREATE INDEX IF NOT EXISTS idx_r_price_history_supplier ON r_supplierPriceHistory(supplierId)`);
  }, down: async () => {
    // v3 created only additive tables/indexes; rolling back drops them.
    const tables = ['r_priceHistory', 'r_notifications', 'r_supplierPayments', 'r_purchaseOrder_items', 'r_purchaseOrders', 'r_supplierPriceHistory', 'r_suppliers', 'r_expenses', 'r_users', 'r_auditLogs', 'r_settings', 'r_quickItems', 'r_inventory_variants', 'r_inventory', 'r_payments', 'r_transaction_items', 'r_transactions', 'r_clients'];
    for (const t of tables) { try { await execAsync(`DROP TABLE IF EXISTS ${t}`); } catch (e) {} }
  }}
];

let db = null;
let dbPath = null;
let sessionKey = null; // DB password while unlocked (memory only, never logged/persisted)
let tail = Promise.resolve();
function queued(fn) { const run = tail.then(fn, fn); tail = run.catch(() => {}); return run; }

const q = (s) => "'" + String(s).replace(/'/g, "''") + "'";

// --- Promise adapters (raw: caller must hold the queue) ----------------------
function hRun(handle, sql, params) {
  return new Promise((resolve, reject) => {
    handle.run(sql, params || [], function (err) {
      err ? reject(err) : resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}
function hGet(handle, sql, params) {
  return new Promise((resolve, reject) => {
    handle.get(sql, params || [], (err, row) => err ? reject(err) : resolve(row));
  });
}
function hAll(handle, sql, params) {
  return new Promise((resolve, reject) => {
    handle.all(sql, params || [], (err, rows) => err ? reject(err) : resolve(rows || []));
  });
}
function hExec(handle, sql) {
  return new Promise((resolve, reject) => {
    handle.exec(sql, (err) => err ? reject(err) : resolve());
  });
}
function runAsync(sql, params) { return hRun(db, sql, params); }
function getAsync(sql, params) { return hGet(db, sql, params); }
function allAsync(sql, params) { return hAll(db, sql, params); }
function execAsync(sql) { return hExec(db, sql); }
async function withTx(fn) {
  await execAsync('BEGIN IMMEDIATE');
  try { const r = await fn(); await execAsync('COMMIT'); return r; }
  catch (e) { try { await execAsync('ROLLBACK'); } catch (e2) {} throw e; }
}

function checkStore(store) {
  if (!STORES.includes(store)) throw new Error('Unknown store: ' + store);
}

function fileSize(p) {
  try { return fs.statSync(p || dbPath).size; } catch (e) { return 0; }
}

function fileHead(p) {
  try {
    const fd = fs.openSync(p, 'r');
    const b = Buffer.alloc(16);
    fs.readSync(fd, b, 0, 16, 0);
    fs.closeSync(fd);
    return b.toString('utf8');
  } catch (e) { return ''; }
}

const SQLITE_MAGIC = 'SQLite format 3\0';

function isLegacyBlob(p) {
  try {
    const raw = fs.readFileSync(p, 'utf8');
    if (!raw.startsWith('{')) return false;
    const o = JSON.parse(raw);
    return !!(o && o.salt && o.iv && o.data);
  } catch (e) { return false; }
}

function isWrongPassword(e) {
  return /not a database|notadb|wrong|incorrect|bad decrypt|error:1C|error:060|error:061/i.test(String((e && e.message) || e));
}

function dropSidecars() {
  if (!dbPath) return;
  for (const ext of ['-wal', '-shm', '-journal']) { try { fs.unlinkSync(dbPath + ext); } catch (e) {} }
}

// --- Connection management ---------------------------------------------------
function openHandleAt(p) {
  return new Promise((resolve, reject) => {
    const handle = new sqlite3.Database(p, sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, (err) => {
      if (err) return reject(err);
      try {
        handle.configure('busyTimeout', 5000);
        handle.serialize();
      } catch (e) { /* best effort on old API surface */ }
      resolve(handle);
    });
  });
}

function openHandle() {
  return openHandleAt(dbPath);
}

function closeHandle(handle) {
  return new Promise((resolve) => {
    if (!handle) return resolve();
    try { handle.close(() => resolve()); } catch (e) { resolve(); }
  });
}

function close() {
  const handle = db;
  db = null;
  sessionKey = null;
  if (handle) { try { handle.close(() => {}); } catch (e) {} }
}

// Awaitable close for shutdown paths and tests (Windows holds file locks until the
// handle actually closes, so rmSync-style cleanup must wait for this).
function closeDb() {
  const handle = db;
  db = null;
  sessionKey = null;
  if (!handle) return Promise.resolve();
  return new Promise((resolve) => {
    try { handle.close(() => resolve()); } catch (e) { resolve(); }
  });
}

async function applyKey(handle, key) {
  await hRun(handle, `PRAGMA key = ${q(key)}`);
  await hRun(handle, 'PRAGMA cipher_compatibility = 4');
}

async function probeHandle(handle) {
  await hGet(handle, 'SELECT count(*) AS c FROM sqlite_master');
}

async function schemaEnsure() {
  await execAsync('CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT)');
  for (const s of STORES) await execAsync(`CREATE TABLE IF NOT EXISTS s_${s} (id INTEGER PRIMARY KEY AUTOINCREMENT, value TEXT NOT NULL)`);
}

async function openDbInternal(userDataPath, key) {
  const closing = db;
  db = null;
  if (closing) { try { await closeHandle(closing); } catch (e) {} }
  dbPath = path.join(userDataPath, 'shop-ledger-ph.sqlite');
  const handle = await openHandle();
  if (key) await applyKey(handle, key);
  try {
    await probeHandle(handle);
  } catch (e) {
    await closeHandle(handle);
    throw e;
  }
  db = handle;
  await execAsync('PRAGMA journal_mode = WAL');
  await execAsync('PRAGMA synchronous = NORMAL');
  await schemaEnsure();
  await runMigrationsRaw();
  scheduleMaintenance();
  sessionKey = key ? String(key) : null;
  return openInfoRaw();
}

async function openInfoRaw() {
  if (!db) return { ok: false, error: 'SQLite not initialized' };
  const row = await getAsync('SELECT value FROM meta WHERE key = ?', ['sqliteMigrated']);
  const needMigration = !(row && row.value === 'true');
  return { ok: true, backend: 'sqlite', path: dbPath, size: fileSize(), needMigration, stores: STORES.length };
}

// --- Raw CRUD (queue already held) -------------------------------------------
async function getRaw(store, id) {
  checkStore(store);
  const row = await getAsync(`SELECT value FROM s_${store} WHERE id = ?`, [id]);
  return row ? JSON.parse(row.value) : undefined;
}

async function allRaw(store) {
  checkStore(store);
  return (await allAsync(`SELECT id, value FROM s_${store} ORDER BY id`)).map(r => JSON.parse(r.value));
}

async function addRaw(store, obj) {
  checkStore(store);
  let id;
  if (obj && typeof obj.id === 'number') {
    id = Number((await runAsync(`INSERT INTO s_${store} (id, value) VALUES (?, ?)`, [obj.id, JSON.stringify(obj)])).lastID);
  } else {
    const info = await runAsync(`INSERT INTO s_${store} (value) VALUES (?)`, [JSON.stringify(obj)]);
    id = Number(info.lastID);
    // Mirror IndexedDB keyPath behavior: the generated key is injected into the stored record
    await runAsync(`UPDATE s_${store} SET value = ? WHERE id = ?`, [JSON.stringify({ ...obj, id }), id]);
  }
  return id;
}

async function putRaw(store, obj) {
  checkStore(store);
  if (!obj || typeof obj.id !== 'number') throw new Error('put requires a record with a numeric id');
  await runAsync(`INSERT INTO s_${store} (id, value) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET value = excluded.value`, [obj.id, JSON.stringify(obj)]);
  return obj.id;
}

async function delRaw(store, id) {
  checkStore(store);
  await runAsync(`DELETE FROM s_${store} WHERE id = ?`, [id]);
}

async function clearRaw(store) {
  checkStore(store);
  await execAsync(`DELETE FROM s_${store}`);
}

function get(store, id) { return queued(() => getRaw(store, id)); }
function all(store) { return queued(() => allRaw(store)); }
function add(store, obj) { return queued(() => addRaw(store, obj)); }
function put(store, obj) { return queued(() => putRaw(store, obj)); }
function del(store, id) { return queued(() => delRaw(store, id)); }
function clear(store) { return queued(() => clearRaw(store)); }

async function schemaVersionRaw() {
  try {
    const row = await getAsync('SELECT MAX(version) AS v FROM schema_migrations');
    return row ? (row.v || 0) : 0;
  } catch (e) { return 0; }
}

async function runMigrationsRaw() {
  if (!db) return { ok: false, error: 'SQLite not initialized' };
  await execAsync('CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, name TEXT, applied_at TEXT)');
  const applied = new Set((await allAsync('SELECT version FROM schema_migrations')).map(r => r.version));
  let ran = 0;
  for (const m of MIGRATIONS) {
    if (applied.has(m.version)) continue;
    await withTx(async () => {
      await m.up();
      await runAsync('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)', [m.version, m.name, new Date().toISOString()]);
    });
    ran++;
  }
  return { ok: true, schemaVersion: await schemaVersionRaw(), applied: ran };
}

// One-time migration from the renderer's IndexedDB dump: { storeName: [records...] }.
// Replaces each store in a single transaction preserving original ids; idempotent.
async function migrate(dump) {
  if (!db) throw new Error('SQLite not initialized');
  const row = await getAsync('SELECT value FROM meta WHERE key = ?', ['sqliteMigrated']);
  if (row && row.value === 'true') return { migrated: false, counts: {} };
  const counts = {};
  await withTx(async () => {
    for (const s of STORES) {
      const records = (dump && Array.isArray(dump[s])) ? dump[s] : [];
      await execAsync(`DELETE FROM s_${s}`);
      let n = 0;
      for (const rec of records) {
        if (rec && typeof rec.id === 'number') { await runAsync(`INSERT OR IGNORE INTO s_${s} (id, value) VALUES (?, ?)`, [rec.id, JSON.stringify(rec)]); n++; }
      }
      counts[s] = n;
    }
    await runAsync('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', ['sqliteMigrated', 'true']);
  });
  return { migrated: true, counts };
}

async function migrateToRelational() {
  if (!db) return { ok: false, error: 'SQLite not initialized' };
  const row = await getAsync('SELECT value FROM meta WHERE key = ?', ['relationalMigrated']);
  if (row && row.value === 'true') return { migrated: false, reason: 'already migrated' };

  const counts = {};
  await withTx(async () => {
    // Migrate clients
    const clients = await allRaw('clients');
    for (const c of clients) {
      await runAsync(`INSERT OR IGNORE INTO r_clients (id, name, phone, address, balance, dueDate, createdAt, ledgerYear, isSC, isPWD, loyaltyPoints, totalSpent, redeemedDiscount) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [c.id, c.name||'', c.phone||'', c.address||'', c.balance||0, c.dueDate||'', c.createdAt||'', c.ledgerYear||'', c.isSC?1:0, c.isPWD?1:0, c.loyaltyPoints||0, c.totalSpent||0, c.redeemedDiscount||0]);
    }
    counts.clients = clients.length;

    // Migrate transactions + items
    const transactions = await allRaw('transactions');
    for (const t of transactions) {
      await runAsync(`INSERT OR IGNORE INTO r_transactions (id, invoiceNo, clientId, clientName, date, createdAt, subtotal, totalInterest, discount, scDiscount, grandTotal, commissionRate, commissionAmount, paymentMethod, status, balanceAdded, duplicateCheck, vatExclusive, vatAmount, vatRate, editedAt, returnReason, refundMethod, returnNotes, refId, voidReason, voidNotes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [t.id, t.invoiceNo||'', t.clientId||null, t.clientName||'', t.date||'', t.createdAt||'', t.subtotal||0, t.totalInterest||0, t.discount||0, t.scDiscount||0, t.grandTotal||0, t.commissionRate||0, t.commissionAmount||0, t.paymentMethod||'Cash', t.status||'pending', t.balanceAdded?1:0, t.duplicateCheck?1:0, t.vatExclusive||0, t.vatAmount||0, t.vatRate||0.12, t.editedAt||'', t.returnReason||'', t.refundMethod||'', t.returnNotes||'', t.refId||null, t.voidReason||'', t.voidNotes||'']);
      if (Array.isArray(t.items)) {
        for (const item of t.items) {
          await runAsync(`INSERT INTO r_transaction_items (transactionId, date, description, name, unitCost, intRate, amount, invId, variantName) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [t.id, item.date||'', item.description||'', item.name||'', item.unitCost||0, item.intRate||0, item.amount||0, item.invId||null, item.variantName||'']);
        }
      }
    }
    counts.transactions = transactions.length;

    // Migrate payments
    const payments = await allRaw('payments');
    for (const p of payments) {
      await runAsync(`INSERT OR IGNORE INTO r_payments (id, clientId, clientName, amount, date, type, notes, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [p.id, p.clientId||0, p.clientName||'', p.amount||0, p.date||'', p.type||'', p.notes||'', p.createdAt||'', p.updatedAt||'']);
    }
    counts.payments = payments.length;

    // Migrate inventory + variants
    const inventory = await allRaw('inventory');
    for (const i of inventory) {
      await runAsync(`INSERT OR IGNORE INTO r_inventory (id, name, description, sku, barcode, category, sellPrice, costPrice, stock, minStock, lowStock, unit, image, expiryDate, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [i.id, i.name||'', i.description||'', i.sku||'', i.barcode||'', i.category||'', i.sellPrice||i.price||0, i.costPrice||0, i.stock||0, i.minStock||5, i.lowStock||5, i.unit||'', i.image||'', i.expiryDate||'', i.createdAt||'', i.updatedAt||'']);
      if (Array.isArray(i.variants)) {
        for (const v of i.variants) {
          await runAsync(`INSERT INTO r_inventory_variants (inventoryId, name, stock) VALUES (?, ?, ?)`, [i.id, v.name||'', v.stock||0]);
        }
      }
    }
    counts.inventory = inventory.length;

    // Migrate quickItems
    const qi = await allRaw('quickItems');
    for (const x of qi) { await runAsync(`INSERT OR IGNORE INTO r_quickItems (id, name, price) VALUES (?, ?, ?)`, [x.id, x.name||'', x.price||0]); }
    counts.quickItems = qi.length;

    // Migrate settings
    const settings = await allRaw('settings');
    for (const s of settings) { await runAsync(`INSERT OR REPLACE INTO r_settings (id, key, value) VALUES (?, ?, ?)`, [s.id, s.key||'', s.value||'']); }
    counts.settings = settings.length;

    // Migrate auditLogs
    const logs = await allRaw('auditLogs');
    for (const l of logs) { await runAsync(`INSERT OR IGNORE INTO r_auditLogs (id, action, details, user, createdAt, date) VALUES (?, ?, ?, ?, ?, ?)`, [l.id, l.action||'', l.details||'', l.user||'', l.createdAt||'', l.date||'']); }
    counts.auditLogs = logs.length;

    // Migrate users
    const users = await allRaw('users');
    for (const u of users) { await runAsync(`INSERT OR IGNORE INTO r_users (id, username, password, name, role) VALUES (?, ?, ?, ?, ?)`, [u.id, u.username||'', u.password||'', u.name||'', u.role||'staff']); }
    counts.users = users.length;

    // Migrate expenses
    const expenses = await allRaw('expenses');
    for (const e of expenses) { await runAsync(`INSERT OR IGNORE INTO r_expenses (id, date, category, description, amount, payee, type, refType, refId, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [e.id, e.date||'', e.category||'', e.description||'', e.amount||0, e.payee||'', e.type||'', e.refType||'', e.refId||null, e.createdAt||'']); }
    counts.expenses = expenses.length;

    // Migrate suppliers + price history
    const suppliers = await allRaw('suppliers');
    for (const s of suppliers) {
      await runAsync(`INSERT OR IGNORE INTO r_suppliers (id, name, contact, email, category, address, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)`, [s.id, s.name||'', s.contact||'', s.email||'', s.category||'', s.address||'', s.createdAt||'']);
      if (Array.isArray(s.priceHistory)) {
        for (const ph of s.priceHistory) {
          await runAsync(`INSERT INTO r_supplierPriceHistory (supplierId, itemName, price, qty, date, poNo) VALUES (?, ?, ?, ?, ?, ?)`, [s.id, ph.itemName||'', ph.price||0, ph.qty||0, ph.date||'', ph.poNo||'']);
        }
      }
    }
    counts.suppliers = suppliers.length;

    // Migrate purchaseOrders + items
    const pos = await allRaw('purchaseOrders');
    for (const po of pos) {
      await runAsync(`INSERT OR IGNORE INTO r_purchaseOrders (id, poNo, supplierId, supplierName, date, total, status, createdAt, receivedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [po.id, po.poNo||'', po.supplierId||null, po.supplierName||'', po.date||'', po.total||0, po.status||'Pending', po.createdAt||'', po.receivedAt||'']);
      if (Array.isArray(po.items)) {
        for (const item of po.items) {
          await runAsync(`INSERT INTO r_purchaseOrder_items (purchaseOrderId, invId, name, price, qty, variantName) VALUES (?, ?, ?, ?, ?, ?)`, [po.id, item.invId||null, item.name||'', item.price||0, item.qty||0, item.variantName||'']);
        }
      }
    }
    counts.purchaseOrders = pos.length;

    // Migrate supplierPayments
    const sp = await allRaw('supplierPayments');
    for (const p of sp) { await runAsync(`INSERT OR IGNORE INTO r_supplierPayments (id, supplierId, supplierName, amount, date, notes, paymentMethod, referenceNo, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [p.id, p.supplierId||0, p.supplierName||'', p.amount||0, p.date||'', p.notes||'', p.paymentMethod||'Cash', p.referenceNo||'', p.createdAt||'']); }
    counts.supplierPayments = sp.length;

    // Migrate notifications
    const notifs = await allRaw('notifications');
    for (const n of notifs) { await runAsync(`INSERT OR IGNORE INTO r_notifications (id, message, type, read, createdAt, date) VALUES (?, ?, ?, ?, ?, ?)`, [n.id, n.message||'', n.type||'info', n.read?1:0, n.createdAt||'', n.date||'']); }
    counts.notifications = notifs.length;

    await runAsync('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', ['relationalMigrated', 'true']);
  });
  return { ok: true, counts };
}

// Consistent plaintext snapshot of the live DB (sqlcipher_export decrypts into
// the target when the live DB is keyed, plain-copies otherwise). Snapshots stay
// plaintext SQLite by design: restore, checksums and cloud sync all expect it.
async function snapshot(destPath) {
  if (!db) throw new Error('SQLite not initialized');
  try { fs.unlinkSync(destPath); } catch (e) {}
  await execAsync(`ATTACH DATABASE ${q(destPath)} AS snap_export KEY ''`);
  try {
    await execAsync(`SELECT sqlcipher_export('snap_export')`);
  } finally {
    try { await execAsync('DETACH DATABASE snap_export'); } catch (e) {}
  }
  return { ok: true, size: fs.statSync(destPath).size };
}

async function integrityCheckRaw() {
  if (!db) return { ok: false, error: 'SQLite not initialized' };
  try {
    const rows = await allAsync('PRAGMA integrity_check');
    const vals = rows.map(r => Object.values(r)[0]);
    const ok = vals.length === 1 && vals[0] === 'ok';
    return { ok, result: ok ? 'ok' : vals.join('; ') };
  } catch (e) { return { ok: false, error: e.message }; }
}

async function optimizeRaw() {
  if (!db) return { ok: false, error: 'SQLite not initialized' };
  try { await execAsync('PRAGMA optimize'); return { ok: true }; }
  catch (e) { return { ok: false, error: e.message }; }
}

async function checkpointRaw() {
  if (!db) return { ok: false, error: 'SQLite not initialized' };
  try { await execAsync('PRAGMA wal_checkpoint(TRUNCATE)'); return { ok: true }; }
  catch (e) { return { ok: false, error: e.message }; }
}

async function vacuumRaw() {
  if (!db) return { ok: false, error: 'SQLite not initialized' };
  try { await execAsync('VACUUM'); return { ok: true, size: fileSize() }; }
  catch (e) { return { ok: false, error: e.message }; }
}

async function rollbackMigration(targetVersion) {
  if (!db) return { ok: false, error: 'SQLite not initialized' };
  try {
    await execAsync('CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, name TEXT, applied_at TEXT)');
    const applied = await allAsync('SELECT version FROM schema_migrations ORDER BY version DESC');
    const toRollback = applied.filter(r => r.version > targetVersion).sort((a, b) => b.version - a.version);
    const rolledBack = [];
    for (const m of toRollback) {
      const migration = MIGRATIONS.find(x => x.version === m.version);
      if (migration && typeof migration.down === 'function') {
        await withTx(async () => {
          await migration.down();
          await runAsync('DELETE FROM schema_migrations WHERE version = ?', [m.version]);
        });
        rolledBack.push(m.version);
      }
    }
    return { ok: true, rolledBack };
  } catch (e) { return { ok: false, error: e.message }; }
}

let _maintenanceInterval = null;

function scheduleMaintenance() {
  if (_maintenanceInterval) return;
  // unref'd: maintenance must never keep the process (or a test harness) alive.
  _maintenanceInterval = setInterval(() => {
    if (!db) return;
    queued(() => execAsync('PRAGMA wal_checkpoint(PASSIVE)')).catch(() => {});
  }, 5 * 60 * 1000);
  if (_maintenanceInterval.unref) _maintenanceInterval.unref();
  const daily = setInterval(() => {
    if (!db) return;
    queued(() => execAsync('VACUUM')).catch(() => {});
  }, 86400000);
  if (daily.unref) daily.unref();
}

// Swaps the live database for the given file (a previously made snapshot):
// keeps a .prerestore safety copy of the current DB, drops stale WAL/SHM sidecars,
// reopens (re-applying the session key so an encrypted session stays encrypted),
// and stamps meta so the renderer never re-migrates over a restored store.
async function replaceWith(filePath) {
  if (!db) return { ok: false, error: 'SQLite not initialized' };
  try {
    const head = fs.readFileSync(filePath);
    if (head.slice(0, 16).toString('ascii') !== 'SQLite format 3\u0000') return { ok: false, error: 'Not a valid SQLite file' };
    await execAsync('PRAGMA wal_checkpoint(TRUNCATE)');
    close();
    const keepKey = sessionKey;
    try { fs.copyFileSync(dbPath, dbPath + '.prerestore'); } catch (e) {}
    fs.copyFileSync(filePath, dbPath);
    dropSidecars();
    await openDbInternal(path.dirname(dbPath), null);
    if (keepKey) await ensureEncryptedLive(keepKey);
    await runAsync('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', ['sqliteMigrated', 'true']);
    const chk = await integrityCheckRaw();
    if (!chk.ok) { close(); return { ok: false, error: 'Restored file failed integrity check: ' + (chk.result || chk.error) }; }
    return openInfoRaw();
  } catch (e) {
    close();
    return { ok: false, error: e.message };
  }
}

// Replaces all stores from a { store: [records...] } dump (JSON backup import).
// Keeps a .prerestore safety copy, preserves original ids, stamps sqliteMigrated
// so the renderer never re-migrates over the imported data.
async function replaceFromDump(dump) {
  if (!db) return { ok: false, error: 'SQLite not initialized' };
  if (!dump || typeof dump !== 'object' || Array.isArray(dump)) return { ok: false, error: 'Invalid backup dump' };
  try { fs.copyFileSync(dbPath, dbPath + '.prerestore'); } catch (e) {}
  const counts = {};
  await withTx(async () => {
    for (const s of STORES) {
      const records = Array.isArray(dump[s]) ? dump[s] : [];
      await execAsync(`DELETE FROM s_${s}`);
      let n = 0;
      for (const rec of records) {
        if (rec && typeof rec.id === 'number') { await runAsync(`INSERT OR IGNORE INTO s_${s} (id, value) VALUES (?, ?)`, [rec.id, JSON.stringify(rec)]); n++; }
      }
      counts[s] = n;
    }
    await runAsync('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', ['sqliteMigrated', 'true']);
  });
  const chk = await integrityCheckRaw();
  if (!chk.ok) return { ok: false, error: 'Imported data failed integrity check: ' + (chk.result || chk.error) };
  return { ok: true, counts };
}

async function statsRaw() {
  if (!db) return { ok: false, error: 'SQLite not initialized' };
  const counts = {};
  for (const s of STORES) {
    const row = await getAsync(`SELECT COUNT(*) AS n FROM s_${s}`);
    counts[s] = row ? row.n : 0;
  }
  return { ok: true, backend: 'sqlite', path: dbPath, size: fileSize(), counts };
}

// Relational table names for each store
const R_TABLES = {
  clients: 'r_clients', transactions: 'r_transactions', payments: 'r_payments',
  inventory: 'r_inventory', quickItems: 'r_quickItems', settings: 'r_settings',
  auditLogs: 'r_auditLogs', users: 'r_users', expenses: 'r_expenses',
  suppliers: 'r_suppliers', purchaseOrders: 'r_purchaseOrders',
  supplierPayments: 'r_supplierPayments', notifications: 'r_notifications'
};

async function isRelationalReadyRaw() {
  try {
    const row = await getAsync('SELECT value FROM meta WHERE key = ?', ['relationalMigrated']);
    return !!(row && row.value === 'true');
  } catch (e) { return false; }
}

async function rAllRaw(store) {
  const table = R_TABLES[store];
  if (!table) return [];
  try {
    return await allAsync(`SELECT * FROM ${table} ORDER BY id`);
  } catch (e) { return []; }
}

async function rGetRaw(store, id) {
  const table = R_TABLES[store];
  if (!table) return undefined;
  return getAsync(`SELECT * FROM ${table} WHERE id = ?`, [id]);
}

// For stores with nested items, reconstruct the JSON format
async function rAllWithItemsRaw(store) {
  const rows = await rAllRaw(store);
  if (store === 'transactions') {
    for (const r of rows) {
      r.items = await allAsync('SELECT * FROM r_transaction_items WHERE transactionId = ?', [r.id]);
      r.balanceAdded = !!r.balanceAdded;
      r.duplicateCheck = !!r.duplicateCheck;
    }
    return rows;
  }
  if (store === 'inventory') {
    for (const r of rows) {
      r.variants = await allAsync('SELECT * FROM r_inventory_variants WHERE inventoryId = ?', [r.id]);
    }
    return rows;
  }
  if (store === 'purchaseOrders') {
    for (const r of rows) {
      r.items = await allAsync('SELECT * FROM r_purchaseOrder_items WHERE purchaseOrderId = ?', [r.id]);
    }
    return rows;
  }
  if (store === 'suppliers') {
    for (const r of rows) {
      r.priceHistory = await allAsync('SELECT * FROM r_supplierPriceHistory WHERE supplierId = ?', [r.id]);
    }
    return rows;
  }
  return rows;
}

function getDbChecksum() {
  if (!dbPath) return null;
  const { createHash } = require('crypto');
  try {
    const data = fs.readFileSync(dbPath);
    return createHash('sha256').update(data).digest('hex');
  } catch (e) { return null; }
}

function isDbEncrypted() {
  try {
    if (!dbPath || !fs.existsSync(dbPath)) return { encrypted: false };
    if (fileHead(dbPath).startsWith(SQLITE_MAGIC)) return { encrypted: false };
    return { encrypted: true }; // SQLCipher vault or legacy v3.17.3 blob vault
  } catch (e) { return { encrypted: false }; }
}

// --- Key management (page-level encryption, no plaintext windows) -------------
// Unlock: accepts the password for either a SQLCipher vault or a legacy v3.17.3
// file-blob vault (auto-migrated to SQLCipher on first unlock).
async function unlockDb(password) {
  if (!dbPath) return { ok: false, error: 'Database not initialized' };
  if (!password) return { ok: false, error: 'Password required' };
  if (!fs.existsSync(dbPath)) return { ok: false, error: 'Database file not found' };
  const pw = String(password);
  try {
    if (isLegacyBlob(dbPath)) {
      const { decryptData } = require('./crypto.js');
      let plain;
      try { plain = decryptData(JSON.parse(fs.readFileSync(dbPath, 'utf8')), pw); }
      catch (e) { return { ok: false, error: 'Wrong password' }; }
      if (!plain.toString('utf8', 0, 16).startsWith(SQLITE_MAGIC)) return { ok: false, error: 'Wrong password or corrupted vault' };
      try { fs.copyFileSync(dbPath, dbPath + '.legacy-vault.bak'); } catch (e) {}
      fs.writeFileSync(dbPath, plain);
      dropSidecars();
    }
    const closing = db;
    db = null;
    if (closing) { try { await closeHandle(closing); } catch (e) {} }
    const handle = await openHandle();
    let plain = false;
    try { await probeHandle(handle); plain = true; } catch (e) { /* keyed vault */ }
    if (!plain) {
      await applyKey(handle, pw);
      try {
        await probeHandle(handle);
      } catch (e) {
        await closeHandle(handle);
        return { ok: false, error: 'Wrong password' };
      }
      db = handle;
      await execAsync('PRAGMA journal_mode = WAL');
      await execAsync('PRAGMA synchronous = NORMAL');
      await schemaEnsure();
      await runMigrationsRaw();
      scheduleMaintenance();
      sessionKey = pw;
      try { fs.unlinkSync(dbPath + '.legacy-vault.bak'); } catch (e) {}
      return openInfoRaw();
    }
    // Fresh or legacy-decrypted plaintext: open normally, then lock it.
    await closeHandle(handle);
    await openDbInternal(path.dirname(dbPath), null);
    try {
      await ensureEncryptedLive(pw);
    } catch (e) {
      return { ok: false, error: isWrongPassword(e) ? 'Wrong password' : e.message };
    }
    try { fs.unlinkSync(dbPath + '.legacy-vault.bak'); } catch (e) {}
    return openInfoRaw();
  } catch (e) {
    close();
    return { ok: false, error: isWrongPassword(e) ? 'Wrong password' : e.message };
  }
}

// Encrypts the live database with pw. Vault → vault is an instant rekey; plaintext →
// vault goes through an export + verified swap (rekey is a silent no-op on keyless
// connections in this SQLCipher build, so it can never be used for the first lock).
// Either way the live file is never overwritten before the encrypted copy has been
// proven openable with the new password.
async function ensureEncryptedLive(pw) {
  if (isDbEncrypted().encrypted) {
    await execAsync(`PRAGMA rekey = ${q(pw)}`);
    const chk = await integrityCheckRaw();
    if (!chk.ok) throw new Error('Post-encryption integrity check failed: ' + (chk.result || chk.error));
    sessionKey = pw;
    return { ok: true, size: fileSize() };
  }
  const keepKey = sessionKey;
  const tmpPath = dbPath + '.encrypt.tmp';
  let swapped = false;
  try { fs.unlinkSync(tmpPath); } catch (e) {}
  try {
    await execAsync(`ATTACH DATABASE ${q(tmpPath)} AS enc_vault KEY ${q(pw)}`);
    try {
      await execAsync(`SELECT sqlcipher_export('enc_vault')`);
    } finally {
      try { await execAsync('DETACH DATABASE enc_vault'); } catch (e) {}
    }
    // Prove the copy opens with the new password before touching the live file.
    const side = await openHandleAt(tmpPath);
    try {
      await applyKey(side, pw);
      await probeHandle(side);
    } catch (e) {
      await closeHandle(side);
      throw new Error('Encrypted copy failed verification: ' + e.message);
    }
    await closeHandle(side);
    await execAsync('PRAGMA wal_checkpoint(TRUNCATE)');
    close();
    try { fs.copyFileSync(dbPath, dbPath + '.pre-encrypt.bak'); } catch (e) {}
    fs.renameSync(tmpPath, dbPath);
    swapped = true;
    dropSidecars();
    await openDbInternal(path.dirname(dbPath), pw);
    try { fs.unlinkSync(dbPath + '.pre-encrypt.bak'); } catch (e) {}
    try { fs.unlinkSync(tmpPath); } catch (e) {}
    return { ok: true, size: fileSize() };
  } catch (e) {
    try { fs.unlinkSync(tmpPath); } catch (e2) {}
    try { if (!db) await openDbInternal(path.dirname(dbPath), swapped ? pw : keepKey); } catch (e2) {}
    throw e;
  }
}

// Enable (or re-set) encryption on the live database.
async function encryptDb(password) {
  if (!dbPath) return { ok: false, error: 'Database not initialized' };
  if (!password || String(password).length < 8) return { ok: false, error: 'Password must be at least 8 characters' };
  if (!db) return { ok: false, error: 'Database not open' };
  try {
    return await ensureEncryptedLive(String(password));
  } catch (e) {
    logger.error('encryptDb failed: ' + e.message);
    return { ok: false, error: e.message };
  }
}

// Disable encryption. The password is proven on a side connection first so a wrong
// guess never touches the live file; the live copy is then exported to plaintext
// and swapped in with a .pre-decrypt.bak safety copy.
async function decryptDb(password) {
  if (!dbPath) return { ok: false, error: 'Database not initialized' };
  if (!password) return { ok: false, error: 'Password required' };
  if (!isDbEncrypted().encrypted) {
    if (!db) await openDbInternal(path.dirname(dbPath), null);
    return { ok: true, size: fileSize(), alreadyPlain: true };
  }
  if (!db) return { ok: false, error: 'Database not open' };
  const pw = String(password);
  const keepKey = sessionKey;
  const side = await openHandle();
  try {
    await applyKey(side, pw);
    await probeHandle(side);
  } catch (e) {
    await closeHandle(side);
    return { ok: false, error: 'Wrong password or corrupted vault' };
  }
  await closeHandle(side);
  const tmpPath = dbPath + '.decrypt.tmp';
  try { fs.unlinkSync(tmpPath); } catch (e) {}
  try {
    await execAsync(`ATTACH DATABASE ${q(tmpPath)} AS plaintext KEY ''`);
    try {
      await execAsync(`SELECT sqlcipher_export('plaintext')`);
    } finally {
      try { await execAsync('DETACH DATABASE plaintext'); } catch (e) {}
    }
    await execAsync('PRAGMA wal_checkpoint(TRUNCATE)');
    close();
    try { fs.copyFileSync(dbPath, dbPath + '.pre-decrypt.bak'); } catch (e) {}
    fs.renameSync(tmpPath, dbPath);
    dropSidecars();
    await openDbInternal(path.dirname(dbPath), null);
    try { fs.unlinkSync(dbPath + '.pre-decrypt.bak'); } catch (e) {}
    try { fs.unlinkSync(tmpPath); } catch (e) {}
    return { ok: true, size: fileSize() };
  } catch (e) {
    try { fs.unlinkSync(tmpPath); } catch (e2) {}
    try { if (!db) await openDbInternal(path.dirname(dbPath), keepKey); } catch (e2) {}
    return { ok: false, error: e.message };
  }
}

// Change the vault password. Old password is proven on a side connection, then the
// live database is rekeyed in place — instant, no file copies, no restart needed.
async function changeDbPassword(oldPw, newPw) {
  if (!dbPath) return { ok: false, error: 'Database not initialized' };
  if (!newPw || String(newPw).length < 8) return { ok: false, error: 'New password must be at least 8 characters' };
  if (!db) return { ok: false, error: 'Database not open' };
  if (!isDbEncrypted().encrypted) return { ok: false, error: 'Database is not encrypted — use Enable instead' };
  const side = await openHandle();
  try {
    await applyKey(side, String(oldPw || ''));
    await probeHandle(side);
  } catch (e) {
    await closeHandle(side);
    return { ok: false, error: 'Current password is incorrect or vault is corrupted' };
  }
  await closeHandle(side);
  try {
    await execAsync(`PRAGMA rekey = ${q(String(newPw))}`);
    const chk = await integrityCheckRaw();
    if (!chk.ok) throw new Error('Post-change integrity check failed: ' + (chk.result || chk.error));
    sessionKey = String(newPw);
    return { ok: true, size: fileSize() };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// --- Queued public API ---------------------------------------------------------
function init(userDataPath) { return queued(() => initRaw(userDataPath)); }
async function initRaw(userDataPath) {
  if (!sqlite3) return { ok: false, error: 'sqlcipher binding not available' };
  if (db) return openInfoRaw();
  try {
    const probe = path.join(userDataPath, 'shop-ledger-ph.sqlite');
    let needKey = false;
    try {
      const st = fs.statSync(probe);
      needKey = st.size > 0 && !fileHead(probe).startsWith(SQLITE_MAGIC);
    } catch (e) { needKey = false; }
    if (needKey) {
      dbPath = probe;
      return { ok: false, needPassword: true };
    }
    return await openDbInternal(userDataPath, null);
  } catch (e) {
    logger.error('SQLite init failed: ' + e.message);
    close();
    try {
      if (dbPath && fs.existsSync(dbPath) && !fileHead(dbPath).startsWith(SQLITE_MAGIC)) {
        return { ok: false, needPassword: true };
      }
    } catch (e2) {}
    dbPath = null;
    return { ok: false, error: e.message };
  }
}

function registerDbIpc(ipcMain, userDataPath) {
  ipcMain.handle('db-open', () => init(userDataPath || app.getPath('userData')));
  ipcMain.handle('db-migrate', (e, { dump }) => migrateQueued(dump));
  ipcMain.handle('db-get', (e, { store, id }) => get(store, id));
  ipcMain.handle('db-add', (e, { store, obj }) => add(store, obj));
  ipcMain.handle('db-put', (e, { store, obj }) => put(store, obj));
  ipcMain.handle('db-del', (e, { store, id }) => del(store, id));
  ipcMain.handle('db-all', (e, { store }) => all(store));
  ipcMain.handle('db-clear', (e, { store }) => clear(store));
  ipcMain.handle('db-stats', () => statsQueued());
  ipcMain.handle('db-encrypt', (e, { password }) => encryptQueued(password));
  ipcMain.handle('db-decrypt', (e, { password }) => decryptQueued(password));
  ipcMain.handle('db-checksum', () => getDbChecksum());
  ipcMain.handle('db-unlock', (e, { password }) => unlockQueued(password));
  ipcMain.handle('db-encryption-status', () => ({ success: true, ...isDbEncrypted() }));
  ipcMain.handle('db-change-password', (e, { oldPassword, newPassword }) => changeQueued(oldPassword, newPassword));
  ipcMain.handle('db-migrate-relational', () => migrateRelationalQueued());
  ipcMain.handle('db-is-relational', () => isRelationalQueued());
}

function migrateQueued(dump) { return queued(() => migrate(dump)); }
function statsQueued() { return queued(() => statsRaw()); }
function encryptQueued(password) { return queued(() => encryptDb(password)); }
function decryptQueued(password) { return queued(() => decryptDb(password)); }
function unlockQueued(password) { return queued(() => unlockDb(password)); }
function changeQueued(oldPw, newPw) { return queued(() => changeDbPassword(oldPw, newPw)); }
function migrateRelationalQueued() { return queued(() => migrateToRelational()); }
function isRelationalQueued() { return queued(() => isRelationalReadyRaw()); }
function schemaVersionQueued() { return queued(() => schemaVersionRaw()); }
function runMigrationsQueued() { return queued(() => runMigrationsRaw()); }
function snapshotQueued(destPath) { return queued(() => snapshot(destPath)); }
function replaceWithQueued(filePath) { return queued(() => replaceWith(filePath)); }
function replaceFromDumpQueued(dump) { return queued(() => replaceFromDump(dump)); }
function integrityQueued() { return queued(() => integrityCheckRaw()); }
function optimizeQueued() { return queued(() => optimizeRaw()); }
function checkpointQueued() { return queued(() => checkpointRaw()); }
function vacuumQueued() { return queued(() => vacuumRaw()); }
function rollbackQueued(targetVersion) { return queued(() => rollbackMigration(targetVersion)); }
function rAllQueued(store) { return queued(() => rAllRaw(store)); }
function rGetQueued(store, id) { return queued(() => rGetRaw(store, id)); }
function rAllWithItemsQueued(store) { return queued(() => rAllWithItemsRaw(store)); }

module.exports = { registerDbIpc, init, migrate: migrateQueued, get, add, put, del, all, clear, stats: statsQueued, snapshot: snapshotQueued, integrityCheck: integrityQueued, optimize: optimizeQueued, checkpoint: checkpointQueued, vacuum: vacuumQueued, replaceWith: replaceWithQueued, replaceFromDump: replaceFromDumpQueued, runMigrations: runMigrationsQueued, schemaVersion: schemaVersionQueued, close, closeDb, rollbackMigration: rollbackQueued, scheduleMaintenance, encryptDb: encryptQueued, decryptDb: decryptQueued, getDbChecksum, unlockDb: unlockQueued, isDbEncrypted, changeDbPassword: changeQueued, migrateToRelational: migrateRelationalQueued, isRelationalReady: isRelationalQueued, rAll: rAllQueued, rGet: rGetQueued, rAllWithItems: rAllWithItemsQueued };
