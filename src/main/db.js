// SQLite storage backend (better-sqlite3) for the main process.
// All IndexedDB stores are mirrored as s_<store>(id INTEGER PRIMARY KEY AUTOINCREMENT, value TEXT)
// tables holding JSON records, preserving exact IndexedDB semantics (keyPath 'id', autoIncrement).
// If better-sqlite3 cannot be loaded, init() reports ok:false and the renderer falls back to IndexedDB.
const { app } = require('electron');
const path = require('path');
const fs = require('fs');
const logger = require('./logger.js');

let Database = null;
try { Database = require('better-sqlite3'); } catch (e) { logger.error('better-sqlite3 unavailable: ' + e.message); }

const STORES = ['clients','transactions','payments','inventory','quickItems','settings','auditLogs','users','expenses','suppliers','purchaseOrders','supplierPayments','notifications'];

let db = null;
let dbPath = null;
const stmts = new Map();

// Versioned schema migrations. Baseline (v1) is the current schema; future schema changes
// (new stores, columns, indexes) add higher versions with idempotent steps. Each step runs
// once inside a transaction and is recorded in schema_migrations.
const MIGRATIONS = [
  { version: 1, name: 'baseline', up() {} },
  { version: 2, name: 'add indexes', up() {
    db.exec(`CREATE INDEX IF NOT EXISTS idx_transactions_date ON s_transactions(json_extract(value, '$.date'))`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_transactions_client ON s_transactions(json_extract(value, '$.clientId'))`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_transactions_status ON s_transactions(json_extract(value, '$.status'))`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_transactions_invoice ON s_transactions(json_extract(value, '$.invoiceNo'))`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_payments_date ON s_payments(json_extract(value, '$.date'))`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_payments_client ON s_payments(json_extract(value, '$.clientId'))`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_expenses_date ON s_expenses(json_extract(value, '$.date'))`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_expenses_category ON s_expenses(json_extract(value, '$.category'))`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_inventory_name ON s_inventory(json_extract(value, '$.name'))`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_inventory_sku ON s_inventory(json_extract(value, '$.sku'))`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_inventory_barcode ON s_inventory(json_extract(value, '$.barcode'))`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_inventory_category ON s_inventory(json_extract(value, '$.category'))`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_clients_name ON s_clients(json_extract(value, '$.name'))`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_auditlogs_date ON s_auditLogs(json_extract(value, '$.createdAt'))`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_auditlogs_action ON s_auditLogs(json_extract(value, '$.action'))`);
  }, down() {
    db.exec(`DROP INDEX IF EXISTS idx_transactions_date`);
    db.exec(`DROP INDEX IF EXISTS idx_transactions_client`);
    db.exec(`DROP INDEX IF EXISTS idx_transactions_status`);
    db.exec(`DROP INDEX IF EXISTS idx_transactions_invoice`);
    db.exec(`DROP INDEX IF EXISTS idx_payments_date`);
    db.exec(`DROP INDEX IF EXISTS idx_payments_client`);
    db.exec(`DROP INDEX IF EXISTS idx_expenses_date`);
    db.exec(`DROP INDEX IF EXISTS idx_expenses_category`);
    db.exec(`DROP INDEX IF EXISTS idx_inventory_name`);
    db.exec(`DROP INDEX IF EXISTS idx_inventory_sku`);
    db.exec(`DROP INDEX IF EXISTS idx_inventory_barcode`);
    db.exec(`DROP INDEX IF EXISTS idx_inventory_category`);
    db.exec(`DROP INDEX IF EXISTS idx_clients_name`);
    db.exec(`DROP INDEX IF EXISTS idx_auditlogs_date`);
    db.exec(`DROP INDEX IF EXISTS idx_auditlogs_action`);
  }},
  { version: 3, name: 'relational schema', up() {
    db.exec(`CREATE TABLE IF NOT EXISTS r_clients (
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
    db.exec(`CREATE TABLE IF NOT EXISTS r_transactions (
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
    db.exec(`CREATE TABLE IF NOT EXISTS r_transaction_items (
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
      FOREIGN KEY (transactionId) REFERENCES r_transactions(id) ON DELETE CASCADE,
      FOREIGN KEY (invId) REFERENCES r_inventory(id)
    )`);
    db.exec(`CREATE TABLE IF NOT EXISTS r_payments (
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
    db.exec(`CREATE TABLE IF NOT EXISTS r_inventory (
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
    db.exec(`CREATE TABLE IF NOT EXISTS r_inventory_variants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      inventoryId INTEGER NOT NULL,
      name TEXT DEFAULT '',
      stock INTEGER DEFAULT 0,
      FOREIGN KEY (inventoryId) REFERENCES r_inventory(id) ON DELETE CASCADE
    )`);
    db.exec(`CREATE TABLE IF NOT EXISTS r_quickItems (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT DEFAULT '',
      price REAL DEFAULT 0
    )`);
    db.exec(`CREATE TABLE IF NOT EXISTS r_settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT NOT NULL UNIQUE,
      value TEXT DEFAULT ''
    )`);
    db.exec(`CREATE TABLE IF NOT EXISTS r_auditLogs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      action TEXT DEFAULT '',
      details TEXT DEFAULT '',
      user TEXT DEFAULT '',
      createdAt TEXT DEFAULT '',
      date TEXT DEFAULT ''
    )`);
    db.exec(`CREATE TABLE IF NOT EXISTS r_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL DEFAULT '',
      password TEXT DEFAULT '',
      name TEXT DEFAULT '',
      role TEXT DEFAULT 'staff'
    )`);
    db.exec(`CREATE TABLE IF NOT EXISTS r_expenses (
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
    db.exec(`CREATE TABLE IF NOT EXISTS r_suppliers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT DEFAULT '',
      contact TEXT DEFAULT '',
      email TEXT DEFAULT '',
      category TEXT DEFAULT '',
      address TEXT DEFAULT '',
      createdAt TEXT DEFAULT ''
    )`);
    db.exec(`CREATE TABLE IF NOT EXISTS r_supplierPriceHistory (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      supplierId INTEGER NOT NULL,
      itemName TEXT DEFAULT '',
      price REAL DEFAULT 0,
      qty INTEGER DEFAULT 0,
      date TEXT DEFAULT '',
      poNo TEXT DEFAULT '',
      FOREIGN KEY (supplierId) REFERENCES r_suppliers(id) ON DELETE CASCADE
    )`);
    db.exec(`CREATE TABLE IF NOT EXISTS r_purchaseOrders (
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
    db.exec(`CREATE TABLE IF NOT EXISTS r_purchaseOrder_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      purchaseOrderId INTEGER NOT NULL,
      invId INTEGER,
      name TEXT DEFAULT '',
      price REAL DEFAULT 0,
      qty INTEGER DEFAULT 0,
      variantName TEXT DEFAULT '',
      FOREIGN KEY (purchaseOrderId) REFERENCES r_purchaseOrders(id) ON DELETE CASCADE,
      FOREIGN KEY (invId) REFERENCES r_inventory(id)
    )`);
    db.exec(`CREATE TABLE IF NOT EXISTS r_supplierPayments (
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
    db.exec(`CREATE TABLE IF NOT EXISTS r_notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      message TEXT DEFAULT '',
      type TEXT DEFAULT 'info',
      read INTEGER DEFAULT 0,
      createdAt TEXT DEFAULT '',
      date TEXT DEFAULT ''
    )`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_r_transactions_client ON r_transactions(clientId)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_r_transactions_date ON r_transactions(date)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_r_transactions_status ON r_transactions(status)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_r_transactions_invoice ON r_transactions(invoiceNo)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_r_transaction_items_txn ON r_transaction_items(transactionId)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_r_transaction_items_inv ON r_transaction_items(invId)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_r_payments_client ON r_payments(clientId)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_r_payments_date ON r_payments(date)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_r_inventory_name ON r_inventory(name)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_r_inventory_sku ON r_inventory(sku)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_r_inventory_barcode ON r_inventory(barcode)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_r_inventory_category ON r_inventory(category)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_r_inventory_expiry ON r_inventory(expiryDate)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_r_expenses_date ON r_expenses(date)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_r_expenses_category ON r_expenses(category)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_r_auditlogs_date ON r_auditLogs(createdAt)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_r_auditlogs_action ON r_auditLogs(action)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_r_supplier_payments_supplier ON r_supplierPayments(supplierId)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_r_purchase_orders_supplier ON r_purchaseOrders(supplierId)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_r_purchase_orders_date ON r_purchaseOrders(date)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_r_po_items_po ON r_purchaseOrder_items(purchaseOrderId)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_r_price_history_supplier ON r_supplierPriceHistory(supplierId)`);
  }}
];

function schemaVersion() {
  try {
    const row = stmt('SELECT MAX(version) AS v FROM schema_migrations').get();
    return row ? (row.v || 0) : 0;
  } catch (e) { return 0; }
}

function runMigrations() {
  if (!db) return { ok: false, error: 'SQLite not initialized' };
  try {
    db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, name TEXT, applied_at TEXT)');
    const applied = new Set(stmt('SELECT version FROM schema_migrations').all().map(r => r.version));
    let ran = 0;
    for (const m of MIGRATIONS) {
      if (applied.has(m.version)) continue;
      db.transaction(() => {
        m.up();
        stmt('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)').run(m.version, m.name, new Date().toISOString());
      })();
      ran++;
    }
    return { ok: true, schemaVersion: schemaVersion(), applied: ran };
  } catch (e) { return { ok: false, error: e.message }; }
}

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
    runMigrations();
    scheduleMaintenance();
    return openInfo();
  } catch (e) {
    logger.error('SQLite init failed: ' + e.message);
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

function migrateToRelational() {
  if (!db) return { ok: false, error: 'SQLite not initialized' };
  const row = stmt('SELECT value FROM meta WHERE key = ?').get('relationalMigrated');
  if (row && row.value === 'true') return { migrated: false, reason: 'already migrated' };

  const counts = {};
  const tx = db.transaction(() => {
    // Migrate clients
    const clients = all('clients');
    const insClient = stmt(`INSERT OR IGNORE INTO r_clients (id, name, phone, address, balance, dueDate, createdAt, ledgerYear, isSC, isPWD, loyaltyPoints, totalSpent, redeemedDiscount) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    for (const c of clients) {
      insClient.run(c.id, c.name||'', c.phone||'', c.address||'', c.balance||0, c.dueDate||'', c.createdAt||'', c.ledgerYear||'', c.isSC?1:0, c.isPWD?1:0, c.loyaltyPoints||0, c.totalSpent||0, c.redeemedDiscount||0);
    }
    counts.clients = clients.length;

    // Migrate transactions + items
    const transactions = all('transactions');
    const insTx = stmt(`INSERT OR IGNORE INTO r_transactions (id, invoiceNo, clientId, clientName, date, createdAt, subtotal, totalInterest, discount, scDiscount, grandTotal, commissionRate, commissionAmount, paymentMethod, status, balanceAdded, duplicateCheck, vatExclusive, vatAmount, vatRate, editedAt, returnReason, refundMethod, returnNotes, refId, voidReason, voidNotes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    const insTxItem = stmt(`INSERT INTO r_transaction_items (transactionId, date, description, name, unitCost, intRate, amount, invId, variantName) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    for (const t of transactions) {
      insTx.run(t.id, t.invoiceNo||'', t.clientId||null, t.clientName||'', t.date||'', t.createdAt||'', t.subtotal||0, t.totalInterest||0, t.discount||0, t.scDiscount||0, t.grandTotal||0, t.commissionRate||0, t.commissionAmount||0, t.paymentMethod||'Cash', t.status||'pending', t.balanceAdded?1:0, t.duplicateCheck?1:0, t.vatExclusive||0, t.vatAmount||0, t.vatRate||0.12, t.editedAt||'', t.returnReason||'', t.refundMethod||'', t.returnNotes||'', t.refId||null, t.voidReason||'', t.voidNotes||'');
      if (Array.isArray(t.items)) {
        for (const item of t.items) {
          insTxItem.run(t.id, item.date||'', item.description||'', item.name||'', item.unitCost||0, item.intRate||0, item.amount||0, item.invId||null, item.variantName||'');
        }
      }
    }
    counts.transactions = transactions.length;

    // Migrate payments
    const payments = all('payments');
    const insPay = stmt(`INSERT OR IGNORE INTO r_payments (id, clientId, clientName, amount, date, type, notes, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    for (const p of payments) {
      insPay.run(p.id, p.clientId||0, p.clientName||'', p.amount||0, p.date||'', p.type||'', p.notes||'', p.createdAt||'', p.updatedAt||'');
    }
    counts.payments = payments.length;

    // Migrate inventory + variants
    const inventory = all('inventory');
    const insInv = stmt(`INSERT OR IGNORE INTO r_inventory (id, name, description, sku, barcode, category, sellPrice, costPrice, stock, minStock, lowStock, unit, image, expiryDate, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    const insVariant = stmt(`INSERT INTO r_inventory_variants (inventoryId, name, stock) VALUES (?, ?, ?)`);
    for (const i of inventory) {
      insInv.run(i.id, i.name||'', i.description||'', i.sku||'', i.barcode||'', i.category||'', i.sellPrice||i.price||0, i.costPrice||0, i.stock||0, i.minStock||5, i.lowStock||5, i.unit||'', i.image||'', i.expiryDate||'', i.createdAt||'', i.updatedAt||'');
      if (Array.isArray(i.variants)) {
        for (const v of i.variants) {
          insVariant.run(i.id, v.name||'', v.stock||0);
        }
      }
    }
    counts.inventory = inventory.length;

    // Migrate quickItems
    const qi = all('quickItems');
    const insQi = stmt(`INSERT OR IGNORE INTO r_quickItems (id, name, price) VALUES (?, ?, ?)`);
    for (const q of qi) { insQi.run(q.id, q.name||'', q.price||0); }
    counts.quickItems = qi.length;

    // Migrate settings
    const settings = all('settings');
    const insSetting = stmt(`INSERT OR REPLACE INTO r_settings (id, key, value) VALUES (?, ?, ?)`);
    for (const s of settings) { insSetting.run(s.id, s.key||'', s.value||''); }
    counts.settings = settings.length;

    // Migrate auditLogs
    const logs = all('auditLogs');
    const insLog = stmt(`INSERT OR IGNORE INTO r_auditLogs (id, action, details, user, createdAt, date) VALUES (?, ?, ?, ?, ?, ?)`);
    for (const l of logs) { insLog.run(l.id, l.action||'', l.details||'', l.user||'', l.createdAt||'', l.date||''); }
    counts.auditLogs = logs.length;

    // Migrate users
    const users = all('users');
    const insUser = stmt(`INSERT OR IGNORE INTO r_users (id, username, password, name, role) VALUES (?, ?, ?, ?, ?)`);
    for (const u of users) { insUser.run(u.id, u.username||'', u.password||'', u.name||'', u.role||'staff'); }
    counts.users = users.length;

    // Migrate expenses
    const expenses = all('expenses');
    const insExp = stmt(`INSERT OR IGNORE INTO r_expenses (id, date, category, description, amount, payee, type, refType, refId, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    for (const e of expenses) { insExp.run(e.id, e.date||'', e.category||'', e.description||'', e.amount||0, e.payee||'', e.type||'', e.refType||'', e.refId||null, e.createdAt||''); }
    counts.expenses = expenses.length;

    // Migrate suppliers + price history
    const suppliers = all('suppliers');
    const insSup = stmt(`INSERT OR IGNORE INTO r_suppliers (id, name, contact, email, category, address, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)`);
    const insPH = stmt(`INSERT INTO r_supplierPriceHistory (supplierId, itemName, price, qty, date, poNo) VALUES (?, ?, ?, ?, ?, ?)`);
    for (const s of suppliers) {
      insSup.run(s.id, s.name||'', s.contact||'', s.email||'', s.category||'', s.address||'', s.createdAt||'');
      if (Array.isArray(s.priceHistory)) {
        for (const ph of s.priceHistory) {
          insPH.run(s.id, ph.itemName||'', ph.price||0, ph.qty||0, ph.date||'', ph.poNo||'');
        }
      }
    }
    counts.suppliers = suppliers.length;

    // Migrate purchaseOrders + items
    const pos = all('purchaseOrders');
    const insPO = stmt(`INSERT OR IGNORE INTO r_purchaseOrders (id, poNo, supplierId, supplierName, date, total, status, createdAt, receivedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    const insPOItem = stmt(`INSERT INTO r_purchaseOrder_items (purchaseOrderId, invId, name, price, qty, variantName) VALUES (?, ?, ?, ?, ?, ?)`);
    for (const po of pos) {
      insPO.run(po.id, po.poNo||'', po.supplierId||null, po.supplierName||'', po.date||'', po.total||0, po.status||'Pending', po.createdAt||'', po.receivedAt||'');
      if (Array.isArray(po.items)) {
        for (const item of po.items) {
          insPOItem.run(po.id, item.invId||null, item.name||'', item.price||0, item.qty||0, item.variantName||'');
        }
      }
    }
    counts.purchaseOrders = pos.length;

    // Migrate supplierPayments
    const sp = all('supplierPayments');
    const insSP = stmt(`INSERT OR IGNORE INTO r_supplierPayments (id, supplierId, supplierName, amount, date, notes, paymentMethod, referenceNo, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    for (const p of sp) { insSP.run(p.id, p.supplierId||0, p.supplierName||'', p.amount||0, p.date||'', p.notes||'', p.paymentMethod||'Cash', p.referenceNo||'', p.createdAt||''); }
    counts.supplierPayments = sp.length;

    // Migrate notifications
    const notifs = all('notifications');
    const insNotif = stmt(`INSERT OR IGNORE INTO r_notifications (id, message, type, read, createdAt, date) VALUES (?, ?, ?, ?, ?, ?)`);
    for (const n of notifs) { insNotif.run(n.id, n.message||'', n.type||'info', n.read?1:0, n.createdAt||'', n.date||''); }
    counts.notifications = notifs.length;

    stmt('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run('relationalMigrated', 'true');
  });
  tx();
  return { ok: true, counts };
}

// Online backup (VACUUM-style consistent copy) of the live SQLite file.
function snapshot(destPath) {
  if (!db) return Promise.reject(new Error('SQLite not initialized'));
  return db.backup(destPath).then(() => {
    try { return { ok: true, size: fs.statSync(destPath).size }; }
    catch (e) { throw new Error('Snapshot written but unreadable: ' + e.message); }
  });
}

function integrityCheck() {
  if (!db) return { ok: false, error: 'SQLite not initialized' };
  try {
    const rows = db.pragma('integrity_check', { simple: true });
    const list = Array.isArray(rows) ? rows : [String(rows)];
    const ok = list.length === 1 && list[0] === 'ok';
    return { ok, result: ok ? 'ok' : list.join('; ') };
  } catch (e) { return { ok: false, error: e.message }; }
}

function optimize() {
  if (!db) return { ok: false, error: 'SQLite not initialized' };
  try { db.pragma('optimize'); return { ok: true }; }
  catch (e) { return { ok: false, error: e.message }; }
}

function checkpoint() {
  if (!db) return { ok: false, error: 'SQLite not initialized' };
  try { db.pragma('wal_checkpoint(TRUNCATE)'); return { ok: true }; }
  catch (e) { return { ok: false, error: e.message }; }
}

function vacuum() {
  if (!db) return { ok: false, error: 'SQLite not initialized' };
  try { db.exec('VACUUM'); return { ok: true, size: fileSize() }; }
  catch (e) { return { ok: false, error: e.message }; }
}

function rollbackMigration(targetVersion) {
  if (!db) return { ok: false, error: 'SQLite not initialized' };
  try {
    db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, name TEXT, applied_at TEXT)');
    const applied = stmt('SELECT version FROM schema_migrations ORDER BY version DESC').all();
    const toRollback = applied.filter(r => r.version > targetVersion).sort((a, b) => b.version - a.version);
    const rolledBack = [];
    for (const m of toRollback) {
      const migration = MIGRATIONS.find(x => x.version === m.version);
      if (migration && typeof migration.down === 'function') {
        db.transaction(() => {
          migration.down();
          stmt('DELETE FROM schema_migrations WHERE version = ?').run(m.version);
        })();
        rolledBack.push(m.version);
      }
    }
    return { ok: true, rolledBack };
  } catch (e) { return { ok: false, error: e.message }; }
}

let _maintenanceInterval = null;

function scheduleMaintenance() {
  if (_maintenanceInterval) return;
  _maintenanceInterval = setInterval(() => {
    if (!db) return;
    try { db.pragma('wal_checkpoint(PASSIVE)'); } catch (e) {}
    try {
      const row = stmt('SELECT value FROM meta WHERE key = ?').get('lastVacuum');
      const today = new Date().toISOString().split('T')[0];
      if (!row || row.value !== today) {
        db.exec('VACUUM');
        stmt('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run('lastVacuum', today);
      }
    } catch (e) {}
  }, 5 * 60 * 1000);
}

// Swaps the live database for the given file (a previously made snapshot):
// keeps a .prerestore safety copy of the current DB, drops stale WAL/SHM sidecars,
// reopens, and stamps meta so the renderer never re-migrates over a restored store.
function replaceWith(filePath) {
  if (!db) return { ok: false, error: 'SQLite not initialized' };
  try {
    const head = fs.readFileSync(filePath);
    if (head.slice(0, 16).toString('ascii') !== 'SQLite format 3\u0000') return { ok: false, error: 'Not a valid SQLite file' };
    db.close();
    try { fs.copyFileSync(dbPath, dbPath + '.prerestore'); } catch (e) {}
    fs.copyFileSync(filePath, dbPath);
    for (const suffix of ['-wal', '-shm']) { try { fs.unlinkSync(dbPath + suffix); } catch (e) {} }
    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = NORMAL');
    db.pragma('busy_timeout = 5000');
    stmts.clear();
    db.exec('CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT)');
    for (const s of STORES) db.exec(`CREATE TABLE IF NOT EXISTS s_${s} (id INTEGER PRIMARY KEY AUTOINCREMENT, value TEXT NOT NULL)`);
    runMigrations();
    stmt('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run('sqliteMigrated', 'true');
    const chk = integrityCheck();
    if (!chk.ok) { close(); return { ok: false, error: 'Restored file failed integrity check: ' + (chk.result || chk.error) }; }
    return openInfo();
  } catch (e) {
    try { if (db) db.close(); } catch (e2) {}
    db = null;
    return { ok: false, error: e.message };
  }
}

// Replaces all stores from a { store: [records...] } dump (JSON backup import).
// Keeps a .prerestore safety copy, preserves original ids, stamps sqliteMigrated
// so the renderer never re-migrates over the imported data.
function replaceFromDump(dump) {
  if (!db) return { ok: false, error: 'SQLite not initialized' };
  if (!dump || typeof dump !== 'object' || Array.isArray(dump)) return { ok: false, error: 'Invalid backup dump' };
  try { fs.copyFileSync(dbPath, dbPath + '.prerestore'); } catch (e) {}
  const counts = {};
  const tx = db.transaction(() => {
    for (const s of STORES) {
      const records = Array.isArray(dump[s]) ? dump[s] : [];
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
  const chk = integrityCheck();
  if (!chk.ok) return { ok: false, error: 'Imported data failed integrity check: ' + (chk.result || chk.error) };
  return { ok: true, counts };
}

function stats() {
  if (!db) return { ok: false, error: 'SQLite not initialized' };
  const counts = {};
  for (const s of STORES) counts[s] = stmt(`SELECT COUNT(*) AS n FROM s_${s}`).get().n;
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

function isRelationalReady() {
  try {
    const row = stmt('SELECT value FROM meta WHERE key = ?').get('relationalMigrated');
    return row && row.value === 'true';
  } catch (e) { return false; }
}

function rAll(store) {
  const table = R_TABLES[store];
  if (!table) return [];
  return stmt(`SELECT * FROM ${table} ORDER BY id`).all();
}

function rGet(store, id) {
  const table = R_TABLES[store];
  if (!table) return undefined;
  return stmt(`SELECT * FROM ${table} WHERE id = ?`).get(id);
}

// For stores with nested items, reconstruct the JSON format
function rAllWithItems(store) {
  const rows = rAll(store);
  if (store === 'transactions') {
    return rows.map(r => {
      const items = stmt('SELECT * FROM r_transaction_items WHERE transactionId = ?').all(r.id);
      return { ...r, items, balanceAdded: !!r.balanceAdded, duplicateCheck: !!r.duplicateCheck };
    });
  }
  if (store === 'inventory') {
    return rows.map(r => {
      const variants = stmt('SELECT * FROM r_inventory_variants WHERE inventoryId = ?').all(r.id);
      return { ...r, variants };
    });
  }
  if (store === 'purchaseOrders') {
    return rows.map(r => {
      const items = stmt('SELECT * FROM r_purchaseOrder_items WHERE purchaseOrderId = ?').all(r.id);
      return { ...r, items };
    });
  }
  if (store === 'suppliers') {
    return rows.map(r => {
      const priceHistory = stmt('SELECT * FROM r_supplierPriceHistory WHERE supplierId = ?').all(r.id);
      return { ...r, priceHistory };
    });
  }
  return rows;
}

function close() {
  if (db) {
    try { db.close(); } catch (e) {}
    db = null;
  }
  stmts.clear();
}

function getDbChecksum() {
  if (!dbPath) return null;
  const { createHash } = require('crypto');
  try {
    const data = fs.readFileSync(dbPath);
    return createHash('sha256').update(data).digest('hex');
  } catch (e) { return null; }
}

function encryptDb(password) {
  if (!dbPath) return { ok: false, error: 'Database not initialized' };
  if (!password) return { ok: false, error: 'Password required' };
  try {
    const { encryptData } = require('./crypto.js');
    const data = fs.readFileSync(dbPath);
    const encrypted = encryptData(data, password);
    fs.writeFileSync(dbPath, JSON.stringify(encrypted));
    stmt('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run('_encrypted', 'true');
    return { ok: true, size: fs.statSync(dbPath).size };
  } catch (e) { return { ok: false, error: e.message }; }
}

function decryptDb(password) {
  if (!dbPath) return { ok: false, error: 'Database not initialized' };
  if (!password) return { ok: false, error: 'Password required' };
  try {
    const { decryptData } = require('./crypto.js');
    const raw = fs.readFileSync(dbPath, 'utf8');
    const encrypted = JSON.parse(raw);
    if (!encrypted.salt || !encrypted.iv || !encrypted.data) return { ok: false, error: 'Database is not encrypted' };
    const decrypted = decryptData(encrypted, password);
    fs.writeFileSync(dbPath, decrypted);
    stmt('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run('_encrypted', 'false');
    return { ok: true, size: fs.statSync(dbPath).size };
  } catch (e) { return { ok: false, error: 'Wrong password or corrupted database' }; }
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
  ipcMain.handle('db-encrypt', (e, { password }) => encryptDb(password));
  ipcMain.handle('db-decrypt', (e, { password }) => decryptDb(password));
  ipcMain.handle('db-checksum', () => getDbChecksum());
  ipcMain.handle('db-migrate-relational', () => migrateToRelational());
  ipcMain.handle('db-is-relational', () => isRelationalReady());
}

module.exports = { registerDbIpc, init, migrate, get, add, put, del, all, clear, stats, snapshot, integrityCheck, optimize, checkpoint, vacuum, replaceWith, replaceFromDump, runMigrations, schemaVersion, close, closeDb: close, rollbackMigration, scheduleMaintenance, encryptDb, decryptDb, getDbChecksum, migrateToRelational, isRelationalReady, rAll, rGet, rAllWithItems };
