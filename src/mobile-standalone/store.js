// ---------- STANDALONE STORE ----------
// On-device SQLite data layer for the fully independent phone app.
// Driver-injected: setStoreDriver({ exec, run, get, all }) — promises in,
// rows out. Tested in Node (node:sqlite), shipped on Capacitor
// (@capacitor-community/sqlite). Response shapes mirror lanApi.js exactly
// so the shared views work unchanged. No imports/exports: concatenated.
let _storeDriver = null;
let _dataVersion = 1;
let _printerFn = null;
function setStoreDriver(d) { _storeDriver = d; }
function setPrinterFn(fn) { _printerFn = fn || null; }
function _db() { if (!_storeDriver) throw _apiErr(503, 'Database not ready'); return _storeDriver; }
function _apiErr(status, message, extra) {
  const e = new Error(message);
  e.status = status; e.json = Object.assign({ success: false, error: message }, extra || {});
  return e;
}
const _EXPENSE_CATS = ['Purchases', 'Utilities', 'Rent', 'Supplies', 'Transportation', 'Salaries', 'Marketing', 'Maintenance', 'Food', 'Other'];
function _todayStr() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function _r2(n) { return Math.round((parseFloat(n) || 0) * 100) / 100; }
function _validateAmount(v) {
  const n = parseFloat(v);
  return !isNaN(n) && isFinite(n) && n >= 0 && n <= 999999999;
}
function _sanitize(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/[<>"'&]/g, c => ({ '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '&': '&amp;' }[c])).trim().slice(0, 500);
}
function _active(t) { return t.status !== 'voided' && t.status !== 'interest'; }
function _dayTotal(arr, f) { return arr.filter(f).reduce((s, x) => s + (x.amount || x.grandTotal || 0), 0); }
function _csvCell(v) {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
function _parseJson(s, fb) { try { const v = JSON.parse(s); return v === undefined ? fb : v; } catch (e) { return fb; } }
function _bump() { _dataVersion++; }
// Simple promise-chain mutex for invoice/PO numbering (async drivers race).
let _numMutex = Promise.resolve();
function _withNumbering(fn) {
  const p = _numMutex.then(fn, fn);
  _numMutex = p.catch(() => {});
  return p;
}

const STORE_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS clients (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, phone TEXT, address TEXT, balance REAL DEFAULT 0, dueDate TEXT, createdAt TEXT, ledgerYear TEXT, isSC INTEGER DEFAULT 0, isPWD INTEGER DEFAULT 0, loyaltyPoints INTEGER DEFAULT 0, totalSpent REAL DEFAULT 0, redeemedDiscount REAL DEFAULT 0)`,
  `CREATE TABLE IF NOT EXISTS inventory (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, description TEXT, sku TEXT, barcode TEXT, category TEXT, sellPrice REAL DEFAULT 0, costPrice REAL DEFAULT 0, stock INTEGER DEFAULT 0, minStock INTEGER DEFAULT 5, lowStock INTEGER DEFAULT 5, unit TEXT DEFAULT 'pcs', image TEXT, expiryDate TEXT, variants TEXT DEFAULT '[]', createdAt TEXT, updatedAt TEXT)`,
  `CREATE TABLE IF NOT EXISTS transactions (id INTEGER PRIMARY KEY AUTOINCREMENT, invoiceNo TEXT, clientId INTEGER, clientName TEXT, date TEXT, createdAt TEXT, items TEXT DEFAULT '[]', subtotal REAL DEFAULT 0, totalInterest REAL DEFAULT 0, discount REAL DEFAULT 0, scDiscount REAL DEFAULT 0, grandTotal REAL DEFAULT 0, commissionRate REAL DEFAULT 0, commissionAmount REAL DEFAULT 0, paymentMethod TEXT DEFAULT 'Cash', status TEXT DEFAULT 'pending', balanceAdded INTEGER DEFAULT 0, vatExclusive REAL DEFAULT 0, vatAmount REAL DEFAULT 0, vatRate REAL DEFAULT 0.12, editedAt TEXT, returnReason TEXT, refundMethod TEXT, returnNotes TEXT, refId INTEGER, refInvoiceNo TEXT, partial INTEGER DEFAULT 0, voidReason TEXT, voidNotes TEXT, voidedAt TEXT)`,
  `CREATE TABLE IF NOT EXISTS payments (id INTEGER PRIMARY KEY AUTOINCREMENT, clientId INTEGER, clientName TEXT, amount REAL DEFAULT 0, date TEXT, type TEXT, notes TEXT, createdAt TEXT, updatedAt TEXT)`,
  `CREATE TABLE IF NOT EXISTS expenses (id INTEGER PRIMARY KEY AUTOINCREMENT, date TEXT, category TEXT, description TEXT, amount REAL DEFAULT 0, payee TEXT, type TEXT, refType TEXT, refId INTEGER, createdAt TEXT)`,
  `CREATE TABLE IF NOT EXISTS suppliers (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, contact TEXT, email TEXT, category TEXT, address TEXT, createdAt TEXT)`,
  `CREATE TABLE IF NOT EXISTS purchase_orders (id INTEGER PRIMARY KEY AUTOINCREMENT, poNo TEXT, supplierId INTEGER, supplierName TEXT, date TEXT, items TEXT DEFAULT '[]', total REAL DEFAULT 0, status TEXT DEFAULT 'Pending', createdAt TEXT, receivedAt TEXT)`,
  `CREATE TABLE IF NOT EXISTS supplier_payments (id INTEGER PRIMARY KEY AUTOINCREMENT, supplierId INTEGER, supplierName TEXT, amount REAL DEFAULT 0, date TEXT, notes TEXT, paymentMethod TEXT DEFAULT 'Cash', referenceNo TEXT, createdAt TEXT)`,
  `CREATE TABLE IF NOT EXISTS quick_items (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, price REAL DEFAULT 0, invId INTEGER)`,
  `CREATE TABLE IF NOT EXISTS settings (id INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT UNIQUE NOT NULL, value TEXT)`,
  `CREATE TABLE IF NOT EXISTS audit_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, action TEXT, details TEXT, user TEXT, createdAt TEXT, date TEXT)`
];
const STORE_SEED_SETTINGS = [
  ['shopName', 'My Sari-Sari Store'], ['shopContact', ''], ['shopAddress', ''],
  ['currency', '₱'], ['receiptFooter', 'Thank you for your patronage!'], ['receiptHeaderText', ''],
  ['pettyCashBalance', '0'], ['vatRate', '0'], ['pointsPerPeso', '1'],
  ['thermalHost', ''], ['thermalPort', '9100'], ['currentCashier', '']
];
async function initStore(driver) {
  setStoreDriver(driver);
  const db = _db();
  for (const sql of STORE_SCHEMA) await db.exec(sql);
  for (const [k, v] of STORE_SEED_SETTINGS) {
    const row = await db.get('SELECT id FROM settings WHERE key = ?', [k]);
    if (!row) await db.run('INSERT INTO settings (key, value) VALUES (?, ?)', [k, v]);
  }
  return true;
}
async function _settingsMap() {
  const rows = await _db().all('SELECT key, value FROM settings', []);
  const s = {};
  rows.forEach(x => { s[x.key] = x.value; });
  return s;
}
async function _audit(action, details) {
  try {
    await _db().run(
      'INSERT INTO audit_logs (action, details, user, createdAt, date) VALUES (?, ?, ?, ?, ?)',
      [String(action || ''), String(details || ''), 'phone', new Date().toISOString(), _todayStr()]
    );
  } catch (e) {}
}
function _rowClient(r) {
  return {
    id: r.id, name: r.name, phone: r.phone || '', address: r.address || '',
    balance: r.balance || 0, dueDate: r.dueDate || '', createdAt: r.createdAt,
    isSC: !!r.isSC, isPWD: !!r.isPWD,
    loyaltyPoints: r.loyaltyPoints || 0, totalSpent: r.totalSpent || 0,
    redeemedDiscount: r.redeemedDiscount || 0
  };
}
function _rowTxn(t) {
  t.items = _parseJson(t.items, []);
  t.balanceAdded = !!t.balanceAdded; t.partial = !!t.partial;
  return t;
}

// ---------- clients ----------
async function _apiClients(method, parts, body) {
  const db = _db();
  if (method === 'GET' && parts.length === 0) {
    const rows = await db.all('SELECT * FROM clients ORDER BY name', []);
    return rows.map(_rowClient);
  }
  if (method === 'POST' && parts.length === 0) {
    const b = body || {};
    const name = String(b.name || '').trim();
    if (!name) throw _apiErr(400, 'Client name required');
    if (name.length > 80) throw _apiErr(400, 'Name too long (max 80)');
    const r = await db.run(
      'INSERT INTO clients (name, phone, address, balance, dueDate, isSC, isPWD, createdAt) VALUES (?, ?, ?, 0, ?, ?, ?, ?)',
      [name, String(b.phone || '').trim().slice(0, 20), String(b.address || '').trim().slice(0, 200),
       String(b.dueDate || '').slice(0, 10), b.isSC ? 1 : 0, b.isPWD ? 1 : 0, new Date().toISOString()]
    );
    await _audit('client-add', 'Added client ' + name + ' (phone)');
    _bump();
    return { success: true, id: r.lastID };
  }
  if (parts.length === 2 && parts[1] === 'history' && method === 'GET') {
    const c = await db.get('SELECT * FROM clients WHERE id = ?', [parts[0]]);
    if (!c) throw _apiErr(404, 'Client not found');
    const txns = await db.all('SELECT * FROM transactions WHERE clientId = ? ORDER BY date DESC, createdAt DESC LIMIT 100', [c.id]);
    const pays = await db.all('SELECT * FROM payments WHERE clientId = ? ORDER BY date DESC, createdAt DESC LIMIT 100', [c.id]);
    const byDate = (a, b) => String(b.date || b.createdAt || '').localeCompare(String(a.date || a.createdAt || ''));
    return {
      client: { id: c.id, name: c.name, phone: c.phone, address: c.address, balance: c.balance || 0, loyaltyPoints: c.loyaltyPoints || 0, isSC: !!c.isSC, isPWD: !!c.isPWD },
      sales: txns.sort(byDate).slice(0, 100).map(t => ({ id: t.id, invoiceNo: t.invoiceNo, date: t.date, grandTotal: t.grandTotal, paymentMethod: t.paymentMethod, status: t.status })),
      payments: pays.sort(byDate).slice(0, 100).map(p => ({ id: p.id, date: p.date, amount: p.amount, type: p.type }))
    };
  }
  if (parts.length === 2 && parts[1] === 'redeem' && method === 'POST') {
    const c = await db.get('SELECT * FROM clients WHERE id = ?', [parts[0]]);
    if (!c) throw _apiErr(404, 'Client not found');
    const pts = c.loyaltyPoints || 0;
    if (pts < 100) throw _apiErr(400, 'Need at least 100 points to redeem', { success: false });
    const discountAmount = Math.floor(pts / 100), pointsToRedeem = discountAmount * 100;
    await db.run('UPDATE clients SET loyaltyPoints = ?, redeemedDiscount = ? WHERE id = ?',
      [pts - pointsToRedeem, (c.redeemedDiscount || 0) + discountAmount, c.id]);
    await _audit('loyalty-redeem', 'redeemed ' + pointsToRedeem + ' points (phone)');
    _bump();
    return { success: true, points: pointsToRedeem, discount: discountAmount, remaining: pts - pointsToRedeem };
  }
  if (parts.length === 1 && method === 'DELETE') {
    const c = await db.get('SELECT * FROM clients WHERE id = ?', [parts[0]]);
    if (!c) throw _apiErr(404, 'Client not found');
    if ((c.balance || 0) !== 0) throw _apiErr(400, 'Cannot delete: client still has a balance of ₱' + (Number(c.balance) || 0).toFixed(2));
    const txns = await db.all('SELECT id FROM transactions WHERE clientId = ? LIMIT 1', [c.id]);
    if (txns.length) throw _apiErr(400, 'Cannot delete: client has recorded sales');
    const pays = await db.all('SELECT id FROM payments WHERE clientId = ? LIMIT 1', [c.id]);
    if (pays.length) throw _apiErr(400, 'Cannot delete: client has recorded payments');
    await db.run('DELETE FROM clients WHERE id = ?', [c.id]);
    await _audit('client-delete', 'Deleted client ' + (c.name || '') + ' (phone)');
    _bump();
    return { success: true };
  }
  if (parts.length === 1 && method === 'PUT') {    const b = body || {};
    const name = String(b.name || '').trim();
    if (!name) throw _apiErr(400, 'Client name required');
    if (name.length > 80) throw _apiErr(400, 'Name too long (max 80)');
    const c = await db.get('SELECT * FROM clients WHERE id = ?', [parts[0]]);
    if (!c) throw _apiErr(404, 'Client not found');
    await db.run('UPDATE clients SET name = ?, phone = ?, address = ?, dueDate = ?, isSC = ?, isPWD = ? WHERE id = ?',
      [name, String(b.phone || '').trim().slice(0, 20), String(b.address || '').trim().slice(0, 200),
       String(b.dueDate || '').slice(0, 10), b.isSC ? 1 : 0, b.isPWD ? 1 : 0, c.id]);
    await _audit('client-edit', 'Updated client ' + name + ' (phone)');
    _bump();
    return { success: true };
  }
  throw _apiErr(404, 'Not found');
}

// ---------- inventory ----------
function _cleanInvInput(b) {
  b = b || {};
  const variants = Array.isArray(b.variants)
    ? b.variants.filter(v => v && String(v.name || '').trim()).slice(0, 20)
      .map(v => ({ name: String(v.name).trim().slice(0, 40), stock: Math.max(0, parseInt(v.stock) || 0) }))
    : [];
  const stock = variants.length
    ? variants.reduce((s, v) => s + v.stock, 0)
    : Math.max(0, parseInt(b.stock) || 0);
  return {
    name: String(b.name || '').trim(),
    sku: String(b.sku || '').trim().slice(0, 40),
    barcode: String(b.barcode || '').trim().slice(0, 40),
    category: String(b.category || '').trim().slice(0, 40),
    sellPrice: Math.max(0, parseFloat(b.sellPrice ?? b.price) || 0),
    costPrice: Math.max(0, parseFloat(b.costPrice) || 0),
    stock,
    minStock: Math.max(0, parseInt(b.minStock ?? b.lowStock) || 5),
    lowStock: Math.max(0, parseInt(b.lowStock ?? b.minStock) || 5),
    unit: String(b.unit || 'pcs').trim().slice(0, 12) || 'pcs',
    variants,
    expiryDate: String(b.expiryDate || '').slice(0, 10)
  };
}
function _mapInv(i) {
  return {
    id: i.id, name: i.name, price: parseFloat(i.sellPrice || 0) || 0,
    stock: i.stock || 0, lowStock: i.lowStock ?? i.minStock ?? 5,
    hasImage: !!i.image, sku: i.sku || '', barcode: i.barcode || '',
    variants: _parseJson(i.variants, []), createdAt: i.createdAt
  };
}
async function _apiInventory(method, parts, body, query) {
  const db = _db();
  if (method === 'GET' && parts.length === 0) {
    // NOTE: image blobs stay out of the list query — photos ride the
    // on-demand /images endpoint so every refresh doesn't haul megabytes.
    const rows = await db.all('SELECT id, name, sku, barcode, category, sellPrice, costPrice, stock, minStock, lowStock, unit, expiryDate, variants, createdAt, updatedAt FROM inventory', []);
    return rows.map(_mapInv).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }
  if (method === 'GET' && parts.length === 1 && parts[0] === 'valuation') {
    const rows = await db.all('SELECT stock, costPrice, sellPrice FROM inventory', []);
    let cost = 0, retail = 0, units = 0;
    for (const i of rows) {
      const st = i.stock || 0;
      units += st;
      cost += st * (parseFloat(i.costPrice) || 0);
      retail += st * (parseFloat(i.sellPrice) || 0);
    }
    return { items: rows.length, units, costValue: Math.round(cost * 100) / 100, retailValue: Math.round(retail * 100) / 100 };
  }
  if (method === 'GET' && parts.length === 1 && parts[0] === 'images') {
    const ids = String(query.ids || '').split(',').map(s => s.trim()).filter(Boolean).slice(0, 200);
    if (!ids.length) return {};
    const out = {};
    for (const id of ids) {
      const r = await db.get('SELECT image FROM inventory WHERE id = ?', [id]);
      out[id] = (r && r.image) || null;
    }
    return out;
  }
  if (method === 'POST' && parts.length === 0) {
    const rec = _cleanInvInput(body);
    if (!rec.name) throw _apiErr(400, 'Item name required');
    if (rec.name.length > 80) throw _apiErr(400, 'Name too long (max 80)');
    const all = await db.all('SELECT id, name, sku, barcode FROM inventory', []);
    const dup = all.find(i => String(i.name || '').trim().toLowerCase() === rec.name.toLowerCase())
      || (rec.sku && all.find(i => i.sku && String(i.sku).toLowerCase() === rec.sku.toLowerCase()))
      || (rec.barcode && all.find(i => i.barcode && i.barcode === rec.barcode));
    if (dup) throw _apiErr(400, 'Duplicate item, SKU or barcode');
    const r = await db.run(
      'INSERT INTO inventory (name, description, sku, barcode, category, sellPrice, costPrice, stock, minStock, lowStock, unit, expiryDate, variants, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [rec.name, '', rec.sku, rec.barcode, rec.category, rec.sellPrice, rec.costPrice, rec.stock, rec.minStock, rec.lowStock, rec.unit, rec.expiryDate, JSON.stringify(rec.variants), new Date().toISOString()]
    );
    await _audit('inventory', 'New item: ' + rec.name + ' (phone)');
    _bump();
    return { success: true, id: r.lastID };
  }
  if (method === 'PUT' && parts.length === 1) {
    const rec = _cleanInvInput(body);
    if (!rec.name) throw _apiErr(400, 'Item name required');
    if (rec.name.length > 80) throw _apiErr(400, 'Name too long (max 80)');
    const self = await db.get('SELECT * FROM inventory WHERE id = ?', [parts[0]]);
    if (!self) throw _apiErr(404, 'Item not found');
    const all = await db.all('SELECT id, name, sku, barcode FROM inventory', []);
    const dup = all.find(i => String(i.id) !== String(self.id) && (
      String(i.name || '').trim().toLowerCase() === rec.name.toLowerCase()
      || (rec.sku && i.sku && String(i.sku).toLowerCase() === rec.sku.toLowerCase())
      || (rec.barcode && i.barcode && i.barcode === rec.barcode)));
    if (dup) throw _apiErr(400, 'Duplicate item, SKU or barcode');
    const before = self.stock || 0;
    await db.run(
      'UPDATE inventory SET name=?, sku=?, barcode=?, category=?, sellPrice=?, costPrice=?, stock=?, minStock=?, lowStock=?, unit=?, expiryDate=?, variants=? WHERE id=?',
      [rec.name, rec.sku, rec.barcode, rec.category, rec.sellPrice, rec.costPrice, rec.stock, rec.minStock, rec.lowStock, rec.unit, rec.expiryDate, JSON.stringify(rec.variants), self.id]
    );
    if (before !== rec.stock) await _audit('inventory', (self.name || '') + ': stock ' + before + ' → ' + rec.stock + ' (adj: ' + (rec.stock - before) + ') (phone)');
    _bump();
    return { success: true };
  }
  if (method === 'DELETE' && parts.length === 1) {
    const it = await db.get('SELECT * FROM inventory WHERE id = ?', [parts[0]]);
    if (!it) throw _apiErr(404, 'Item not found');
    // Safety: history keeps the name, so an item named in any sale line stays.
    const txns = await db.all('SELECT items FROM transactions', []);
    const nm = String(it.name || '').trim().toLowerCase();
    const used = txns.some(t => _parseJson(t.items, []).some(li =>
      (li.invId !== undefined && li.invId !== null && li.invId !== '' && String(li.invId) === String(it.id)) ||
      (nm && String(li.description || li.name || '').trim().toLowerCase() === nm)));
    if (used) throw _apiErr(400, 'Cannot delete: this item appears in recorded sales');
    await db.run('DELETE FROM inventory WHERE id = ?', [it.id]);
    await db.run('DELETE FROM quick_items WHERE invId = ?', [it.id]);
    await _audit('inventory', 'Deleted item: ' + (it.name || '') + ' (stock was ' + (it.stock || 0) + ') (phone)');
    _bump();
    return { success: true };
  }
  if (method === 'POST' && parts.length === 1 && parts[0] === 'adjust') {
    const qty = parseInt(body && body.stock, 10);
    const id = body && body.id;
    if (id === undefined || id === null || id === '' || isNaN(qty) || qty < 0 || qty > 999999) {
      throw _apiErr(400, 'Valid id and stock (0-999999) required');
    }
    const it = await db.get('SELECT * FROM inventory WHERE id = ?', [id]);
    if (!it) throw _apiErr(404, 'Item not found');
    const before = it.stock || 0;
    await db.run('UPDATE inventory SET stock = ? WHERE id = ?', [qty, it.id]);
    await _audit('stocktake', it.name + ': stock ' + before + ' → ' + qty + ' (phone)');
    _bump();
    return { success: true, name: it.name, before, stock: qty };
  }
  if (method === 'POST' && parts.length === 2 && parts[1] === 'photo') {    const img = body && body.image;
    if (typeof img !== 'string' || !img.startsWith('data:image/') || img.length > 700000) {
      throw _apiErr(400, 'Photo must be an image data URL under ~700KB');
    }
    const it = await db.get('SELECT * FROM inventory WHERE id = ?', [parts[0]]);
    if (!it) throw _apiErr(404, 'Item not found');
    await db.run('UPDATE inventory SET image = ?, updatedAt = ? WHERE id = ?', [img, new Date().toISOString(), it.id]);
    await _audit('inventory', 'Photo updated: ' + (it.name || '') + ' (phone)');
    _bump();
    return { success: true };
  }
  throw _apiErr(404, 'Not found');
}

// ---------- quick sale presets ----------
async function _apiQuick(method, parts, body) {
  const db = _db();
  if (method === 'GET' && parts.length === 0) {
    const rows = await db.all('SELECT * FROM quick_items ORDER BY id', []);
    return rows.map(q => ({ id: q.id, name: q.name, price: q.price, invId: q.invId || null }));
  }
  if (method === 'POST' && parts.length === 0) {
    const b = body || {};
    const name = String(b.name || '').trim().slice(0, 80);
    const price = Math.max(0, parseFloat(b.price) || 0);
    if (!name) throw _apiErr(400, 'Preset name required');
    const r = await db.run('INSERT INTO quick_items (name, price, invId) VALUES (?, ?, ?)',
      [name, price, b.invId || null]);
    await _audit('quick-items', 'New preset: ' + name + ' (phone)');
    _bump();
    return { success: true, id: r.lastID };
  }
  if (method === 'DELETE' && parts.length === 1) {
    const q = await db.get('SELECT * FROM quick_items WHERE id = ?', [parts[0]]);
    if (!q) throw _apiErr(404, 'Preset not found');
    await db.run('DELETE FROM quick_items WHERE id = ?', [q.id]);
    await _audit('quick-items', 'Deleted preset: ' + (q.name || '') + ' (phone)');
    _bump();
    return { success: true };
  }
  throw _apiErr(404, 'Not found');
}

// ---------- sales ----------
const PAY_METHODS = ['Cash', 'GCash', 'Maya', 'Bank Transfer'];
async function _nextInvoiceNo(db) {
  const rows = await db.all("SELECT invoiceNo FROM transactions WHERE invoiceNo LIKE 'INV-%'", []);
  let mx = 0;
  for (const r of rows) {
    const n = parseInt(String(r.invoiceNo || '').replace('INV-', '')) || 0;
    if (n > mx) mx = n;
  }
  return 'INV-' + String(mx + 1).padStart(5, '0');
}
async function _applySale(body) {
  const db = _db();
  const { clientId, items, paymentMethod, discount } = body || {};
  if (!items || !Array.isArray(items) || items.length === 0) throw _apiErr(400, 'At least one item required');
  if (items.length > 100) throw _apiErr(400, 'Too many items (max 100)');
  for (const item of items) {
    if (!item.description || typeof item.description !== 'string') throw _apiErr(400, 'Each item must have a description');
    if (!_validateAmount(item.unitCost)) throw _apiErr(400, 'Invalid item price');
    if (item.qty && (isNaN(parseInt(item.qty)) || parseInt(item.qty) < 1)) throw _apiErr(400, 'Invalid item quantity');
  }
  if (discount && !_validateAmount(discount)) throw _apiErr(400, 'Invalid discount');
  if (paymentMethod && !PAY_METHODS.includes(paymentMethod)) throw _apiErr(400, 'Invalid payment method');
  return _withNumbering(async () => {
    const invoiceNo = await _nextInvoiceNo(db);
    const subtotal = items.reduce((s, i) => s + (((i.qty || 1) * (i.unitCost || 0))), 0);
    const totalInterest = items.reduce((s, i) => s + (((i.qty || 1) * (i.unitCost || 0)) * ((i.intRate || 0) / 100)), 0);
    const d = parseFloat(discount) || 0;
    const grandTotal = Math.max(0, subtotal + totalInterest - d);
    let clientName = 'Walk-in';
    if (clientId) {
      const cd = await db.get('SELECT * FROM clients WHERE id = ?', [clientId]);
      if (cd) clientName = cd.name;
    }
    const payMethod = paymentMethod || 'Cash';
    const storedItems = items.map(i => Object.assign({}, i, {
      amount: ((i.qty || 1) * (i.unitCost || 0)) + ((i.qty || 1) * (i.unitCost || 0)) * ((i.intRate || 0) / 100)
    }));
    const now = new Date().toISOString();
    await db.run(
      'INSERT INTO transactions (invoiceNo, clientId, clientName, date, createdAt, items, subtotal, totalInterest, discount, scDiscount, grandTotal, paymentMethod, status, balanceAdded) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)',
      [invoiceNo, clientId || null, clientName, _todayStr(), now, JSON.stringify(storedItems), subtotal, totalInterest, d, grandTotal, payMethod, grandTotal <= 0 ? 'paid' : 'pending', (clientId && payMethod !== 'Cash') ? 1 : 0]
    );
    await _audit('sale', 'Mobile sale ' + invoiceNo + ' - ₱' + grandTotal.toFixed(2) + ' (phone)');
    for (const item of storedItems) {
      let invId = item.invId;
      if (!invId && item.description) {
        const desc = String(item.description).trim();
        const qty = Math.max(1, parseInt(item.qty) || 1);
        const unitCost = item.unitCost || 0;
        if (desc) {
          const all = await db.all('SELECT id, name FROM inventory', []);
          const f = all.find(i => String(i.name || '').trim().toLowerCase() === desc.toLowerCase());
          if (f) invId = f.id;
          else {
            const r = await db.run(
              'INSERT INTO inventory (name, description, sku, category, stock, minStock, lowStock, costPrice, sellPrice, createdAt) VALUES (?, ?, ?, ?, ?, 5, 5, 0, ?, ?)',
              [desc, '', '', '', qty, unitCost, now]
            );
            invId = r.lastID;
            await _audit('inventory', 'Auto-created from sale: ' + desc + ' (phone)');
          }
        }
      }
      if (invId) {
        const inv = await db.get('SELECT * FROM inventory WHERE id = ?', [invId]);
        if (inv) {
          const q = parseInt(item.qty) || 1;
          let variants = _parseJson(inv.variants, []);
          if (item.variantName && Array.isArray(variants)) {
            variants = variants.map(v => v.name === item.variantName
              ? Object.assign({}, v, { stock: (v.stock || 0) - q }) : v);
          }
          await db.run('UPDATE inventory SET stock = ?, variants = ? WHERE id = ?',
            [(inv.stock || 0) - q, JSON.stringify(variants), inv.id]);
        }
      }
    }
    if (clientId) {
      const c = await db.get('SELECT * FROM clients WHERE id = ?', [clientId]);
      if (c && payMethod !== 'Cash') {
        await db.run('UPDATE clients SET balance = ? WHERE id = ?', [(c.balance || 0) + grandTotal, c.id]);
      }
      if (c) {
        const s = await _settingsMap();
        const ppp = parseFloat(s.pointsPerPeso) || 1;
        const earned = Math.floor((Number(grandTotal) || 0) * ppp);
        if (earned > 0) {
          await db.run('UPDATE clients SET loyaltyPoints = ?, totalSpent = ? WHERE id = ?',
            [(c.loyaltyPoints || 0) + earned, (c.totalSpent || 0) + grandTotal, c.id]);
        }
      }
    }
    _bump();
    return { success: true, invoiceNo };
  });
}
function _mapTxnList(t) {
  const items = _parseJson(t.items, []);
  return {
    id: t.id, invoiceNo: t.invoiceNo, clientName: t.clientName, paymentMethod: t.paymentMethod,
    date: t.date, createdAt: t.createdAt, grandTotal: t.grandTotal, subtotal: t.subtotal,
    totalInterest: t.totalInterest, discount: t.discount, scDiscount: t.scDiscount,
    status: t.status, items: items.length
  };
}
async function _apiSales(method, parts, body, query) {
  const db = _db();
  if (method === 'POST' && parts.length === 0) return _applySale(body || {});
  if (method === 'GET' && parts.length === 0) {
    const limit = Math.min(parseInt(query.limit) || 200, 500);
    // SQL-level cap: years of sales must never all land in memory at once.
    const rows = await db.all('SELECT * FROM transactions ORDER BY date DESC, createdAt DESC LIMIT ?', [limit]);
    return rows.map(_mapTxnList);
  }
  if (method === 'GET' && parts.length === 1) {
    const rows = await db.all('SELECT * FROM transactions WHERE invoiceNo = ? OR id = ?', [String(parts[0]), String(parts[0])]);
    const t = rows.find(x => String(x.id) === String(parts[0]) || x.invoiceNo === String(parts[0]));
    if (!t) throw _apiErr(404, 'Transaction not found');
    const full = _rowTxn(Object.assign({}, t));
    return {
      id: full.id, invoiceNo: full.invoiceNo, clientId: full.clientId || null, clientName: full.clientName,
      paymentMethod: full.paymentMethod, date: full.date, createdAt: full.createdAt,
      grandTotal: full.grandTotal, subtotal: full.subtotal, totalInterest: full.totalInterest,
      discount: full.discount, scDiscount: full.scDiscount, status: full.status, items: full.items
    };
  }
  throw _apiErr(404, 'Not found');
}
async function _apiVoid(body) {
  const db = _db();
  const ref = body && (body.invoiceNo ?? body.id);
  if (ref === undefined || ref === null || String(ref).trim() === '') throw _apiErr(400, 'invoiceNo required');
  const rows = await db.all('SELECT * FROM transactions WHERE invoiceNo = ? OR id = ?', [String(ref), String(ref)]);
  const t = rows.find(x => x.invoiceNo === String(ref) || String(x.id) === String(ref));
  if (!t || t.status === 'voided') throw _apiErr(404, 'Sale not found or already voided');
  const items = _parseJson(t.items, []);
  for (const it of items) {
    if (it.invId) {
      const inv = await db.get('SELECT * FROM inventory WHERE id = ?', [it.invId]);
      if (inv) await db.run('UPDATE inventory SET stock = ? WHERE id = ?', [(inv.stock || 0) + (parseInt(it.qty) || 1), inv.id]);
    }
  }
  if (t.balanceAdded && t.clientId) {
    const c = await db.get('SELECT * FROM clients WHERE id = ?', [t.clientId]);
    if (c) await db.run('UPDATE clients SET balance = ? WHERE id = ?', [Math.max(0, (c.balance || 0) - (t.grandTotal || 0)), c.id]);
  }
  await db.run('UPDATE transactions SET status = ?, voidedAt = ? WHERE id = ?', ['voided', new Date().toISOString(), t.id]);
  await _audit('sale-void', 'Mobile void ' + String(ref) + ' (phone)');
  _bump();
  return { success: true };
}
async function _apiReturns(body) {
  const db = _db();
  const ref = body && (body.invoiceNo ?? body.id);
  if (ref === undefined || ref === null || String(ref).trim() === '') throw _apiErr(400, 'invoiceNo required');
  const wantItems = body && body.items;
  if (wantItems !== undefined) {
    if (!Array.isArray(wantItems) || !wantItems.length || wantItems.length > 100) {
      throw _apiErr(400, 'items must be a non-empty list (max 100)');
    }
    for (const li of wantItems) {
      const q = parseInt(li && li.qty, 10);
      if (!li || (!li.invId && !li.description) || isNaN(q) || q < 1) {
        throw _apiErr(400, 'each line needs an item and qty ≥ 1');
      }
    }
  }
  const found = await db.all('SELECT * FROM transactions WHERE invoiceNo = ? OR id = ?', [String(ref), String(ref)]);
  const orig = found.find(t => t.invoiceNo === String(ref) || String(t.id) === String(ref)) || null;
  if (!orig) throw _apiErr(404, 'Original sale not found');
  const origItems = _parseJson(orig.items, []);
  if (!origItems.length) throw _apiErr(400, 'Original sale has no item lines');
  const priorAll = await db.all('SELECT * FROM transactions WHERE status = ?', ['return']);
  const prior = priorAll.filter(t => (orig.id !== null && t.refId === orig.id || t.refInvoiceNo === (orig.invoiceNo || '')));
  const keyOf = (i) => (i.invId !== undefined && i.invId !== null && i.invId !== '' ? 'id:' + i.invId : 'nm:' + String(i.description || i.name || '').trim().toLowerCase());
  const remaining = {};
  for (const i of origItems) {
    const k = keyOf(i);
    remaining[k] = remaining[k] || { item: i, left: 0 };
    remaining[k].left += parseInt(i.qty) || 1;
  }
  for (const r of prior) {
    for (const i of _parseJson(r.items, [])) {
      const k = keyOf(i);
      if (remaining[k]) remaining[k].left -= Math.abs(parseInt(i.qty) || 0);
    }
  }
  let requested = [];
  // NOTE: unit cost is resolved from the ORIGINAL line (amount ÷ original
  // qty) BEFORE overwriting qty — using the requested qty here would
  // inflate partial refunds on multi-unit lines.
  const unitFromOrig = (line) => {
    const q0 = parseInt(line.qty) || 1;
    const a = parseFloat(line.amount);
    if (a) return a / q0;
    return parseFloat(line.unitCost || line.price) || 0;
  };
  if (wantItems && wantItems.length) {
    for (const li of wantItems) {
      const probe = { invId: li.invId ?? null, description: li.description || '', name: li.description || '' };
      const k = keyOf(probe);
      const slot = remaining[k];
      const q = parseInt(li.qty, 10);
      if (!slot || slot.left < q) throw _apiErr(400, 'Cannot return that much: ' + (probe.description || ('#' + probe.invId)));
      slot.left -= q;
      requested.push(Object.assign({}, slot.item, { qty: q, _u: unitFromOrig(slot.item) }));
    }
  } else {
    for (const k of Object.keys(remaining)) {
      if (remaining[k].left > 0) requested.push(Object.assign({}, remaining[k].item, { qty: remaining[k].left, _u: unitFromOrig(remaining[k].item) }));
    }
    if (!requested.length) throw _apiErr(400, 'That sale was already fully returned');
  }
  return _withNumbering(async () => {
    const invoiceNo = await _nextInvoiceNo(db);
    const unitOf = (line) => (typeof line._u === 'number') ? line._u : unitFromOrig(line);
    const origSub = origItems.reduce((s, i) => s + ((parseInt(i.qty) || 1) * unitOf(i)), 0);
    let retSub = 0;
    const items = requested.map(r => {
      const unit = unitOf(r);
      const amt = (parseInt(r.qty) || 1) * unit;
      retSub += amt;
      const clean = Object.assign({}, r);
      delete clean._u;
      return Object.assign(clean, { qty: -(parseInt(r.qty) || 1), amount: -amt });
    });
    const discShare = origSub > 0 ? (parseFloat(orig.discount) || 0) * (retSub / origSub) : 0;
    const grandTotal = -(Math.max(0, retSub - discShare));
    const absTotal = Math.abs(grandTotal);
    const partial = requested.length !== origItems.length || origItems.some(i => {
      const k = keyOf(i);
      return (remaining[k] ? remaining[k].left : 0) > 0;
    });
    const now = new Date().toISOString();
    await db.run(
      'INSERT INTO transactions (invoiceNo, clientId, clientName, date, createdAt, items, subtotal, totalInterest, discount, scDiscount, grandTotal, paymentMethod, status, refId, refInvoiceNo, partial) VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, 0, ?, ?, ?, ?, ?, ?)',
      [invoiceNo, orig.clientId || null, orig.clientName || 'Walk-in', _todayStr(), now, JSON.stringify(items), -retSub, grandTotal, orig.paymentMethod || 'Cash', 'return', orig.id || null, orig.invoiceNo || null, partial ? 1 : 0]
    );
    for (const item of items) {
      if (item.invId) {
        const inv = await db.get('SELECT * FROM inventory WHERE id = ?', [item.invId]);
        if (inv) await db.run('UPDATE inventory SET stock = ? WHERE id = ?', [(inv.stock || 0) + Math.abs(parseInt(item.qty) || 1), inv.id]);
      }
    }
    if (orig.clientId && (orig.paymentMethod || 'Cash') !== 'Cash') {
      const c = await db.get('SELECT * FROM clients WHERE id = ?', [orig.clientId]);
      if (c) await db.run('UPDATE clients SET balance = ? WHERE id = ?', [Math.max(0, (c.balance || 0) - absTotal), c.id]);
    }
    await _audit('return', 'Mobile return ' + (orig.invoiceNo || '') + ' → ' + invoiceNo + ' - ₱' + absTotal.toFixed(2) + (partial ? ' (partial)' : '') + ' (phone)');
    _bump();
    return { success: true, invoiceNo };
  });
}

// ---------- payments ----------
async function _apiPayments(method, parts, body) {
  const db = _db();
  if (method === 'POST' && parts.length === 0) {
    const { clientId, amount, type, date } = body || {};
    if (!_validateAmount(amount)) throw _apiErr(400, 'Valid amount required');
    if (clientId && typeof clientId !== 'number' && typeof clientId !== 'string') throw _apiErr(400, 'Invalid client ID');
    const amtNum = _r2(amount);
    if (amtNum <= 0) throw _apiErr(400, 'Amount must be greater than 0');
    const safeDate = _sanitize(date) || new Date().toISOString().split('T')[0];
    const c = clientId ? await db.get('SELECT * FROM clients WHERE id = ?', [clientId]) : null;
    const balBefore = c ? (c.balance || 0) : 0;
    const pt = (type === 'Full' || type === 'Partial') ? type : (amtNum >= balBefore ? 'Full' : 'Partial');
    await db.run('INSERT INTO payments (clientId, amount, type, date, notes, createdAt) VALUES (?, ?, ?, ?, ?, ?)',
      [clientId || null, amtNum, pt, safeDate, '', new Date().toISOString()]);
    if (c) await db.run('UPDATE clients SET balance = ? WHERE id = ?', [Math.max(0, balBefore - amtNum), c.id]);
    await _audit('payment', 'Mobile payment ' + (c ? c.name : 'client') + ' - ₱' + amtNum.toFixed(2) + ' (phone)');
    _bump();
    return { success: true };
  }
  if (method === 'PUT' && parts.length === 1) {
    const amt = parseFloat(body && body.amount);
    if (!_validateAmount(amt) || amt <= 0) throw _apiErr(400, 'Valid amount required');
    const p = await db.get('SELECT * FROM payments WHERE id = ?', [parts[0]]);
    if (!p) throw _apiErr(404, 'Payment not found');
    const amtNum = _r2(amt);
    const diff = amtNum - (p.amount || 0);
    await db.run('UPDATE payments SET amount = ? WHERE id = ?', [amtNum, p.id]);
    if (p.clientId) {
      const c = await db.get('SELECT * FROM clients WHERE id = ?', [p.clientId]);
      if (c) await db.run('UPDATE clients SET balance = ? WHERE id = ?', [Math.max(0, (c.balance || 0) - diff), c.id]);
    }
    await _audit('payment', 'Mobile payment edit (phone)');
    _bump();
    return { success: true };
  }
  if (method === 'DELETE' && parts.length === 1) {
    const p = await db.get('SELECT * FROM payments WHERE id = ?', [parts[0]]);
    if (!p) throw _apiErr(404, 'Payment not found');
    await db.run('DELETE FROM payments WHERE id = ?', [p.id]);
    if (p.clientId) {
      const c = await db.get('SELECT * FROM clients WHERE id = ?', [p.clientId]);
      if (c) await db.run('UPDATE clients SET balance = ? WHERE id = ?', [(c.balance || 0) + (p.amount || 0), c.id]);
    }
    await _audit('payment', 'Mobile payment delete (phone)');
    _bump();
    return { success: true };
  }
  throw _apiErr(404, 'Not found');
}

// ---------- expenses + petty cash ----------
async function _apiExpenses(method, parts, body) {
  const db = _db();
  if (method === 'GET' && parts.length === 0) {
    const rows = await db.all('SELECT * FROM expenses ORDER BY date DESC, createdAt DESC LIMIT 500', []);
    return rows
      .map(e => ({ id: e.id, date: e.date, category: e.category, description: e.description, amount: e.amount, payee: e.payee, createdAt: e.createdAt }));
  }
  if (method === 'POST' && parts.length === 0) {
    const { description, amount, category, date, payee } = body || {};
    if (!_validateAmount(amount)) throw _apiErr(400, 'Valid amount required (0-999999999)');
    const amountNum = _r2(amount);
    if (amountNum <= 0) throw _apiErr(400, 'Amount must be greater than 0');
    const cat = _EXPENSE_CATS.includes(category) ? category : 'Other';
    await db.run('INSERT INTO expenses (date, category, description, amount, payee, createdAt) VALUES (?, ?, ?, ?, ?, ?)',
      [_sanitize(date) || _todayStr(), cat, _sanitize(description), amountNum, _sanitize(payee), new Date().toISOString()]);
    await _audit('expense-add', cat + ': ₱' + amountNum.toFixed(2) + ' - ' + _sanitize(description) + ' (phone)');
    _bump();
    return { success: true };
  }
  if (method === 'PUT' && parts.length === 1) {
    const b = body || {};
    const amountNum = _r2(b.amount);
    if (!_validateAmount(amountNum) || amountNum <= 0) throw _apiErr(400, 'Valid amount required');
    const e = await db.get('SELECT * FROM expenses WHERE id = ?', [parts[0]]);
    if (!e) throw _apiErr(404, 'Expense not found');
    await db.run('UPDATE expenses SET description = ?, amount = ?, category = ?, date = ?, payee = ? WHERE id = ?',
      [_sanitize(b.description), amountNum, _EXPENSE_CATS.includes(b.category) ? b.category : 'Other', _sanitize(b.date) || _todayStr(), _sanitize(b.payee), e.id]);
    await _audit('expense-edit', 'Mobile expense edit (phone)');
    _bump();
    return { success: true };
  }
  if (method === 'DELETE' && parts.length === 1) {
    const e = await db.get('SELECT * FROM expenses WHERE id = ?', [parts[0]]);
    if (!e) throw _apiErr(404, 'Expense not found');
    await db.run('DELETE FROM expenses WHERE id = ?', [e.id]);
    await _audit('expense-delete', 'Mobile expense delete (phone)');
    _bump();
    return { success: true };
  }
  throw _apiErr(404, 'Not found');
}
async function _apiPetty(method, body) {
  const db = _db();
  if (method === 'GET') {
    const s = await _settingsMap();
    const rows = await db.all("SELECT * FROM expenses WHERE type = 'petty-cash'", []);
    const log = rows
      .sort((a, b) => String(b.date || b.createdAt || '').localeCompare(String(a.date || a.createdAt || '')))
      .slice(0, 50)
      .map(e => ({ id: e.id, date: e.date, description: e.description, amount: e.amount, createdAt: e.createdAt }));
    return { balance: parseFloat(s.pettyCashBalance) || 0, log };
  }
  const amt = _r2(body && body.amount);
  const dir = body && body.dir === 'withdraw' ? -1 : 1;
  if (!_validateAmount(amt) || amt <= 0) throw _apiErr(400, 'Valid amount required');
  const s = await _settingsMap();
  const bal = parseFloat(s.pettyCashBalance) || 0;
  const next = bal + (dir * amt);
  if (next < 0) { const e = _apiErr(400, 'Insufficient petty cash'); e.json = { success: false, error: 'Insufficient petty cash' }; throw e; }
  const row = await db.get('SELECT * FROM settings WHERE key = ?', ['pettyCashBalance']);
  if (row) await db.run('UPDATE settings SET value = ? WHERE id = ?', [String(next), row.id]);
  else await db.run('INSERT INTO settings (key, value) VALUES (?, ?)', ['pettyCashBalance', String(next)]);
  await db.run("INSERT INTO expenses (date, category, description, amount, type, createdAt) VALUES (?, 'Other', ?, ?, 'petty-cash', ?)",
    [_todayStr(), dir > 0 ? 'Petty cash top-up' : 'Petty cash withdrawal', amt, new Date().toISOString()]);
  await _audit('petty-cash', 'Mobile petty cash ' + (dir > 0 ? 'top-up' : 'withdrawal') + ' (phone)');
  _bump();
  return { success: true, balance: next };
}

// ---------- suppliers + purchase orders ----------
async function _apiSuppliers(method, parts, body) {
  const db = _db();
  if (method === 'GET' && parts.length === 0) {
    const sups = await db.all('SELECT * FROM suppliers', []);
    const pays = await db.all('SELECT supplierId, amount FROM supplier_payments', []);
    const pos = await db.all('SELECT supplierId, total FROM purchase_orders', []);
    const paid = {}, purchased = {};
    pays.forEach(p => { paid[p.supplierId] = (paid[p.supplierId] || 0) + (p.amount || 0); });
    pos.forEach(po => { purchased[po.supplierId] = (purchased[po.supplierId] || 0) + (po.total || 0); });
    return sups.map(s => ({
      id: s.id, name: s.name, contact: s.contact, email: s.email, category: s.category, address: s.address,
      purchased: purchased[s.id] || 0, paid: paid[s.id] || 0, owed: Math.max(0, (purchased[s.id] || 0) - (paid[s.id] || 0))
    })).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }
  if (method === 'POST' && parts.length === 0) {
    const b = body || {};
    const name = String(b.name || '').trim();
    if (!name) throw _apiErr(400, 'Supplier name required');
    if (name.length > 80) throw _apiErr(400, 'Name too long (max 80)');
    const r = await db.run('INSERT INTO suppliers (name, contact, email, category, address, createdAt) VALUES (?, ?, ?, ?, ?, ?)',
      [name, String(b.contact || '').trim().slice(0, 40), String(b.email || '').trim().slice(0, 80), String(b.category || '').trim().slice(0, 40), String(b.address || '').trim().slice(0, 200), new Date().toISOString()]);
    await _audit('supplier', 'New supplier: ' + name + ' (phone)');
    _bump();
    return { success: true, id: r.lastID };
  }
  if (method === 'GET' && parts.length === 2 && parts[1] === 'payments') {
    const s = await db.get('SELECT * FROM suppliers WHERE id = ?', [parts[0]]);
    if (!s) throw _apiErr(404, 'Supplier not found');
    const pays = await db.all('SELECT * FROM supplier_payments WHERE supplierId = ?', [s.id]);
    const byDate = (a, b) => String(b.date || b.createdAt || '').localeCompare(String(a.date || a.createdAt || ''));
    const pos = await db.all('SELECT * FROM purchase_orders WHERE supplierId = ?', [s.id]);
    const purchased = pos.filter(p => p.status === 'Received').reduce((sum, p) => sum + (p.total || 0), 0);
    const paid = pays.reduce((sum, p) => sum + (p.amount || 0), 0);
    return {
      supplier: { id: s.id, name: s.name }, purchased, paid, owed: Math.max(0, purchased - paid),
      payments: pays.sort(byDate).slice(0, 50).map(p => ({ id: p.id, date: p.date, amount: p.amount, paymentMethod: p.paymentMethod, notes: p.notes }))
    };
  }
  throw _apiErr(404, 'Not found');
}
async function _apiSupplierPayments(body) {
  const db = _db();
  const { supplierId, amount, paymentMethod, notes } = body || {};
  if (!_validateAmount(amount)) throw _apiErr(400, 'Valid amount required');
  const amtNum = _r2(amount);
  if (amtNum <= 0) throw _apiErr(400, 'Amount must be greater than 0');
  const s = await db.get('SELECT * FROM suppliers WHERE id = ?', [supplierId]);
  if (!s) throw _apiErr(404, 'Supplier not found');
  const pm = ['Cash', 'GCash', 'Maya', 'Bank Transfer'].includes(paymentMethod) ? paymentMethod : 'Cash';
  await db.run('INSERT INTO supplier_payments (supplierId, supplierName, amount, date, notes, paymentMethod, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [s.id, s.name || '', amtNum, _todayStr(), _sanitize(notes), pm, new Date().toISOString()]);
  await _audit('supplier-payment', 'Paid ' + (s.name || '') + ' - ₱' + amtNum.toFixed(2) + ' (phone)');
  _bump();
  return { success: true };
}
async function _apiPOs(method, parts, body) {
  const db = _db();
  if (method === 'GET' && parts.length === 0) {
    const rows = await db.all('SELECT * FROM purchase_orders', []);
    return rows
      .sort((a, b) => String(b.date || b.createdAt || '').localeCompare(String(a.date || a.createdAt || '')))
      .map(po => ({ id: po.id, poNo: po.poNo, supplierId: po.supplierId, supplierName: po.supplierName, date: po.date, items: _parseJson(po.items, []), total: po.total, status: po.status, createdAt: po.createdAt }));
  }
  if (method === 'POST' && parts.length === 0) {
    const { supplierId, items, date } = body || {};
    if (!items || !items.length) throw _apiErr(400, 'No items');
    const s = supplierId ? await db.get('SELECT * FROM suppliers WHERE id = ?', [supplierId]) : null;
    const supplierName = s ? s.name : 'Unknown';
    const pos = await db.all("SELECT poNo FROM purchase_orders WHERE poNo LIKE 'PO-%'", []);
    let mx = 0;
    for (const p of pos) { const n = parseInt(String(p.poNo || '').replace('PO-', '')) || 0; if (n > mx) mx = n; }
    const poNo = 'PO-' + String(mx + 1).padStart(5, '0');
    const total = items.reduce((sum, i) => sum + ((parseFloat(i.price) || 0) * (parseInt(i.qty) || 1)), 0);
    const cleanItems = items.map(i => ({ invId: i.invId || null, name: String(i.name || 'Item'), price: parseFloat(i.price) || 0, qty: parseInt(i.qty) || 1, variantName: i.variantName || null }));
    await db.run('INSERT INTO purchase_orders (poNo, supplierId, supplierName, date, items, total, status, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [poNo, supplierId || null, supplierName, date || _todayStr(), JSON.stringify(cleanItems), total, 'Pending', new Date().toISOString()]);
    await _audit('po', 'PO ' + poNo + ' created from ' + supplierName + ' (phone)');
    _bump();
    return { success: true, poNo };
  }
  if (method === 'DELETE' && parts.length === 1) {
    const po = await db.get('SELECT * FROM purchase_orders WHERE id = ?', [parts[0]]);
    if (!po) throw _apiErr(404, 'Purchase order not found');
    // Received POs already added stock and booked a purchase expense — they
    // stay as permanent history. Cancel pending ones freely.
    if (po.status === 'Received') throw _apiErr(400, 'Cannot delete a received order (it is purchase history)');
    await db.run('DELETE FROM purchase_orders WHERE id = ?', [po.id]);
    await _audit('po', 'Cancelled PO ' + (po.poNo || '') + ' (phone)');
    _bump();
    return { success: true };
  }
  if (method === 'POST' && parts.length === 2 && parts[1] === 'receive') {    const po = await db.get('SELECT * FROM purchase_orders WHERE id = ?', [parts[0]]);
    if (!po) { const e = _apiErr(404, 'Purchase order not found'); e.json = { success: false, error: 'Purchase order not found' }; throw e; }
    if (po.status === 'Received') { const e = _apiErr(400, 'Already received'); e.json = { success: false, error: 'Already received' }; throw e; }
    await db.run('UPDATE purchase_orders SET status = ?, receivedAt = ? WHERE id = ?', ['Received', new Date().toISOString(), po.id]);
    for (const it of _parseJson(po.items, [])) {
      if (it.invId) {
        const inv = await db.get('SELECT * FROM inventory WHERE id = ?', [it.invId]);
        if (inv) await db.run('UPDATE inventory SET stock = ? WHERE id = ?', [(inv.stock || 0) + (parseInt(it.qty) || 1), inv.id]);
      }
    }
    await db.run('INSERT INTO expenses (date, category, description, amount, payee, createdAt) VALUES (?, ?, ?, ?, ?, ?)',
      [po.date || _todayStr(), 'Purchases', 'PO ' + (po.poNo || '') + ' received', po.total || 0, po.supplierName || '', new Date().toISOString()]);
    await _audit('po', 'Mobile PO received ' + (po.poNo || '') + ' (phone)');
    _bump();
    return { success: true, poNo: po.poNo };
  }
  throw _apiErr(404, 'Not found');
}

// ---------- reports / stats / settings / audit ----------
async function _apiStats() {
  const db = _db();
  // Slim columns: aggregates never need the items blobs.
  const txns = await db.all('SELECT id, invoiceNo, clientId, clientName, date, createdAt, grandTotal, paymentMethod, status FROM transactions', []);
  const exps = await db.all('SELECT * FROM expenses', []);
  const pays = await db.all('SELECT * FROM payments', []);
  const clients = await db.all('SELECT id, balance FROM clients', []);
  const inv = await db.all('SELECT stock, lowStock, minStock FROM inventory', []);
  const tStr = _todayStr();
  const todayTx = txns.filter(t => t.date === tStr && _active(t));
  const refundAbs = (t) => Math.abs(t.grandTotal || 0);
  return {
    clients: clients.length, inventory: inv.length,
    totalUtang: clients.reduce((s, c) => s + (c.balance || 0), 0),
    lowStockCount: inv.filter(i => (i.stock || 0) <= (i.lowStock ?? i.minStock ?? 5)).length,
    todaySales: todayTx.reduce((s, t) => s + (t.grandTotal || 0), 0),
    todayExpenses: _dayTotal(exps, e => e.date === tStr),
    todayCollected: _dayTotal(pays, p => p.date === tStr),
    todayProfit: todayTx.reduce((s, t) => s + (t.grandTotal || 0), 0) - _dayTotal(exps, e => e.date === tStr),
    todayRefunds: txns.filter(t => t.date === tStr && t.status === 'return').reduce((s, t) => s + refundAbs(t), 0),
    monthRefunds: txns.filter(t => (t.date || '').startsWith(tStr.slice(0, 7)) && t.status === 'return').reduce((s, t) => s + refundAbs(t), 0),
    monthSales: txns.filter(t => (t.date || '').startsWith(tStr.slice(0, 7)) && _active(t)).reduce((s, t) => s + (t.grandTotal || 0), 0),
    monthCollected: _dayTotal(pays, p => (p.date || '').startsWith(tStr.slice(0, 7))),
    monthExpenses: _dayTotal(exps, e => (e.date || '').startsWith(tStr.slice(0, 7))),
    monthProfit: txns.filter(t => (t.date || '').startsWith(tStr.slice(0, 7)) && _active(t)).reduce((s, t) => s + (t.grandTotal || 0), 0) - _dayTotal(exps, e => (e.date || '').startsWith(tStr.slice(0, 7))),
    recent: txns.filter(_active)
      .sort((a, b) => String(b.date || b.createdAt || '').localeCompare(String(a.date || a.createdAt || '')))
      .slice(0, 5)
      .map(t => ({ invoiceNo: t.invoiceNo, clientName: t.clientName, grandTotal: t.grandTotal, date: t.date }))
  };
}
async function _apiReports(query) {
  const db = _db();
  const txns = await db.all('SELECT * FROM transactions', []);
  const exps = await db.all('SELECT * FROM expenses', []);
  const pays = await db.all('SELECT * FROM payments', []);
  const tStr = _todayStr();
  const mStr = /^\d{4}-\d{2}$/.test(query.month || '') ? query.month : tStr.slice(0, 7);
  const refundAbs = (t) => Math.abs(t.grandTotal || 0);
  const topItems = {};
  txns.filter(_active).forEach(t => {
    _parseJson(t.items, []).forEach(it => {
      const nm = it.description || it.name || 'Item';
      const q = parseInt(it.qty) || 1;
      const amt = (it.amount || (q * (it.unitCost || 0))) || 0;
      if (!topItems[nm]) topItems[nm] = { name: nm, qty: 0, amount: 0 };
      topItems[nm].qty += q; topItems[nm].amount += amt;
    });
  });
  const week = [];
  for (let i = 6; i >= 0; i--) {
    const dt = new Date(Date.now() - i * 86400000);
    const d = dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0') + '-' + String(dt.getDate()).padStart(2, '0');
    week.push({
      date: d,
      sales: txns.filter(t => _active(t) && t.date === d).reduce((s, t) => s + (t.grandTotal || 0), 0),
      expenses: _dayTotal(exps, e => e.date === d),
      refunds: txns.filter(t => t.status === 'return' && t.date === d).reduce((s, t) => s + refundAbs(t), 0)
    });
  }
  return {
    monthStr: mStr,
    today: {
      sales: txns.filter(t => _active(t) && t.date === tStr).reduce((s, t) => s + (t.grandTotal || 0), 0),
      expenses: _dayTotal(exps, e => e.date === tStr),
      collected: _dayTotal(pays, p => p.date === tStr),
      profit: txns.filter(t => _active(t) && t.date === tStr).reduce((s, t) => s + (t.grandTotal || 0), 0) - _dayTotal(exps, e => e.date === tStr),
      refunds: txns.filter(t => t.status === 'return' && t.date === tStr).reduce((s, t) => s + refundAbs(t), 0)
    },
    month: {
      sales: txns.filter(t => _active(t) && (t.date || '').startsWith(mStr)).reduce((s, t) => s + (t.grandTotal || 0), 0),
      expenses: _dayTotal(exps, e => (e.date || '').startsWith(mStr)),
      collected: _dayTotal(pays, p => (p.date || '').startsWith(mStr)),
      profit: txns.filter(t => _active(t) && (t.date || '').startsWith(mStr)).reduce((s, t) => s + (t.grandTotal || 0), 0) - _dayTotal(exps, e => (e.date || '').startsWith(mStr)),
      refunds: txns.filter(t => t.status === 'return' && (t.date || '').startsWith(mStr)).reduce((s, t) => s + refundAbs(t), 0)
    },
    topItems: Object.values(topItems).sort((a, b) => b.amount - a.amount).slice(0, 5),
    week
  };
}
async function _apiCsv(query) {
  const db = _db();
  const tStr = _todayStr();
  const m = /^\d{4}-\d{2}$/.test(query.month || '') ? query.month : tStr.slice(0, 7);
  const txns = await db.all('SELECT * FROM transactions', []);
  const exps = await db.all('SELECT * FROM expenses', []);
  const L = [];
  L.push(['Date', 'Invoice', 'Client', 'Item', 'Qty', 'Price', 'Amount', 'Payment', 'Status'].map(_csvCell).join(','));
  txns.filter(t => _active(t) && (t.date || '').startsWith(m))
    .sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')))
    .forEach(t => {
      const items = _parseJson(t.items, []);
      (items.length ? items : [{}]).forEach(it => {
        const q = parseFloat(it.qty) || 1;
        const p = it.unitCost || it.price || 0;
        L.push([t.date || '', t.invoiceNo || '', t.clientName || '', it.description || it.name || '', q, p, (it.amount ?? (q * p)), t.paymentMethod || '', t.status || ''].map(_csvCell).join(','));
      });
    });
  L.push('');
  L.push(['EXPENSES', '', '', '', '', '', '', '', ''].map(_csvCell).join(','));
  L.push(['Date', 'Category', 'Description', 'Amount', 'Payee', '', '', '', ''].map(_csvCell).join(','));
  exps.filter(e => (e.date || '').startsWith(m))
    .sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')))
    .forEach(e => {
      L.push([e.date || '', e.category || '', e.description || '', e.amount || 0, e.payee || '', '', '', '', ''].map(_csvCell).join(','));
    });
  return { success: true, csv: '﻿' + L.join('\n') };
}
const EDITABLE_SETTINGS = ['shopName', 'shopAddress', 'shopContact', 'receiptFooter', 'receiptHeaderText', 'thermalHost', 'thermalPort'];
async function _apiSettings(method, body) {
  const db = _db();
  if (method === 'GET') {
    const s = await _settingsMap();
    return {
      shopName: s.shopName || 'My Sari-Sari Store', shopContact: s.shopContact || '', shopAddress: s.shopAddress || '',
      currency: s.currency || '₱', receiptFooter: s.receiptFooter || '',
      pettyCashBalance: parseFloat(s.pettyCashBalance) || 0, vatRate: parseFloat(s.vatRate) || 0
    };
  }
  const b = body || {};
  const key = String(b.key || '');
  if (!EDITABLE_SETTINGS.includes(key)) throw _apiErr(400, 'That setting cannot be edited from a phone');
  const value = String(b.value ?? '').slice(0, 500);
  const row = await db.get('SELECT * FROM settings WHERE key = ?', [key]);
  if (row) await db.run('UPDATE settings SET value = ? WHERE id = ?', [value, row.id]);
  else await db.run('INSERT INTO settings (key, value) VALUES (?, ?)', [key, value]);
  await _audit('settings', 'Updated ' + key + ' (phone)');
  _bump();
  return { success: true };
}
async function _apiAudit(query) {
  const limit = Math.min(parseInt(query.limit) || 100, 200);
  const rows = await _db().all('SELECT * FROM audit_logs ORDER BY createdAt DESC LIMIT ?', [limit]);
  return rows
    .map(l => ({ id: l.id, action: l.action || '', details: l.details || '', user: l.user || '', createdAt: l.createdAt || '' }));
}
async function _apiPrint(body) {
  const b = body || {};
  const id = b.transactionId ?? b.id;
  if (id === undefined || id === null || id === '') {
    const e = _apiErr(400, 'transactionId required'); e.json = { success: false, error: 'transactionId required' }; throw e;
  }
  const db = _db();
  const rows = await db.all('SELECT * FROM transactions WHERE invoiceNo = ? OR id = ?', [String(id), String(id)]);
  const t = rows.find(x => String(x.id) === String(id) || x.invoiceNo === String(id));
  if (!t) { const e = _apiErr(404, 'Transaction not found'); e.json = { success: false, error: 'Transaction not found' }; throw e; }
  const s = await _settingsMap();
  const peso = (n) => '₱' + (Number(n) || 0).toFixed(2);
  const lines = [];
  lines.push({ t: 'center', bold: true, size: 'double', text: s.shopName || 'Shop Ledger PH' });
  if (s.shopAddress) lines.push({ t: 'center', text: s.shopAddress });
  if (s.shopContact) lines.push({ t: 'center', text: 'Contact: ' + s.shopContact });
  lines.push({ t: 'divider' });
  lines.push({ t: 'center', bold: true, text: 'OFFICIAL RECEIPT' });
  lines.push({ text: 'Invoice: ' + (t.invoiceNo || 'N/A') });
  lines.push({ text: 'Date: ' + (t.createdAt || t.date || '') });
  if (t.clientName && t.clientName !== 'Walk-in') lines.push({ text: 'Client: ' + t.clientName });
  lines.push({ t: 'divider' });
  _parseJson(t.items, []).forEach(item => {
    const qt = parseFloat(item.qty) || 1;
    const sub = qt * (item.unitCost || item.price || 0);
    lines.push({ text: (item.description || item.name || 'Item') });
    lines.push({ text: '  ' + qt + ' x ' + peso(item.unitCost || item.price) + '      ' + peso(sub) });
  });
  lines.push({ t: 'divider' });
  lines.push({ text: 'Subtotal:             ' + peso(t.subtotal) });
  if (t.totalInterest > 0) lines.push({ text: 'Interest:             ' + peso(t.totalInterest) });
  if (t.discount > 0) lines.push({ text: 'Discount:             -' + peso(t.discount) });
  lines.push({ bold: true, text: 'TOTAL:                ' + peso(t.grandTotal) });
  lines.push({ t: 'divider' });
  lines.push({ text: 'Payment: ' + (t.paymentMethod || 'Cash') });
  lines.push({ t: 'spacer' });
  lines.push({ t: 'center', text: s.receiptFooter || 'Thank you for your patronage!' });
  lines.push({ t: 'spacer' });
  if (typeof _printerFn !== 'function') {
    const e = _apiErr(502, 'Printer not configured on this phone'); e.json = { success: false, error: 'Printer not configured on this phone' }; throw e;
  }
  const r = await _printerFn(lines, s.thermalHost || '', s.thermalPort || '9100');
  if (!r || !r.success) { const e = _apiErr(502, (r && r.error) || 'Print failed'); e.json = { success: false, error: (r && r.error) || 'Print failed' }; throw e; }
  await _audit('print', 'Mobile reprint ' + (t.invoiceNo || '') + ' (phone)');
  return { success: true };
}
async function _apiSms() {
  const clients = await _db().all('SELECT * FROM clients', []);
  const today = _todayStr();
  const debtors = clients
    .filter(c => (c.balance || 0) > 0)
    .sort((a, b) => (b.balance || 0) - (a.balance || 0));
  const texts = debtors
    .filter(c => c.phone)
    .map(c => ({
      name: c.name || '', phone: c.phone || '',
      text: 'Hi ' + (c.name || '') + ', friendly reminder from ' + 'your sari-sari store' + ': your balance is ₱' + (Number(c.balance) || 0).toFixed(2) + (c.dueDate ? ' (due ' + c.dueDate + ')' : '') + '. Thank you!'
    }));
  void today;
  await _audit('sms', 'Reminder list built for ' + debtors.length + ' debtors (phone)');
  return { success: true, sent: 0, failed: 0, total: debtors.length, texts };
}

// ---------- backup export / import ----------
const BACKUP_TABLES = ['clients', 'inventory', 'transactions', 'payments', 'expenses', 'suppliers', 'purchase_orders', 'supplier_payments', 'quick_items', 'settings', 'audit_logs'];
async function _apiBackupExport() {
  const db = _db();
  const tables = {};
  for (const t of BACKUP_TABLES) tables[t] = await db.all('SELECT * FROM ' + t, []);
  return { success: true, backup: { app: 'shop-ledger-standalone', version: 1, exportedAt: new Date().toISOString(), tables } };
}
async function _apiBackupImport(body) {
  const db = _db();
  const b = (body && body.backup) || body || {};
  if (!b || b.app !== 'shop-ledger-standalone' || typeof b.tables !== 'object' || !b.tables) {
    throw _apiErr(400, 'Not a Shop Ledger phone backup');
  }
  // Validate everything BEFORE wiping: every known table must be an array
  // of plain row objects when present.
  const incoming = {};
  for (const t of BACKUP_TABLES) {
    const rows = b.tables[t];
    if (rows === undefined) { incoming[t] = null; continue; }
    if (!Array.isArray(rows)) throw _apiErr(400, 'Backup is corrupted (table ' + t + ')');
    for (const r of rows) {
      if (!r || typeof r !== 'object' || Array.isArray(r)) throw _apiErr(400, 'Backup is corrupted (table ' + t + ')');
    }
    incoming[t] = rows;
  }
  const colsOf = (rows) => {
    const cols = [];
    for (const r of rows) for (const k of Object.keys(r)) if (!cols.includes(k)) cols.push(k);
    return cols.filter(c => /^[A-Za-z_][A-Za-z0-9_]*$/.test(c));
  };
  await db.exec('BEGIN');
  try {
    for (const t of BACKUP_TABLES) {
      if (incoming[t] === null) continue;
      await db.exec('DELETE FROM ' + t);
      const cols = colsOf(incoming[t]);
      if (!cols.length) continue;
      const ph = cols.map(() => '?').join(',');
      for (const r of incoming[t]) {
        await db.run('INSERT INTO ' + t + ' (' + cols.join(',') + ') VALUES (' + ph + ')',
          cols.map(c => (r[c] === undefined ? null : (typeof r[c] === 'object' && r[c] !== null ? JSON.stringify(r[c]) : r[c]))));
      }
    }
    await db.exec('COMMIT');
  } catch (e) {
    try { await db.exec('ROLLBACK'); } catch (_) {}
    throw _apiErr(400, 'Restore failed, nothing was changed: ' + (e && e.message));
  }
  // Re-seed any settings the backup predates, then log the restore.
  await initStore(_db());
  await _audit('backup-restore', 'Phone ledger restored from backup (' + (b.exportedAt || 'unknown date') + ') (phone)');
  _bump();
  const counts = {};
  for (const t of BACKUP_TABLES) counts[t] = (incoming[t] || []).length;
  return { success: true, counts };
}
async function localApi(method, rawPath, body) {
  const m = String(method || 'GET').toUpperCase();
  const qi = String(rawPath || '').indexOf('?');
  const path = qi >= 0 ? rawPath.slice(0, qi) : rawPath;
  const query = {};
  if (qi >= 0) {
    rawPath.slice(qi + 1).split('&').forEach(kv => {
      const eq = kv.indexOf('=');
      if (eq < 0) query[decodeURIComponent(kv)] = '';
      else query[decodeURIComponent(kv.slice(0, eq))] = decodeURIComponent(kv.slice(eq + 1));
    });
  }
  const parts = String(path || '').replace(/^\/api\//, '').split('/').filter(Boolean);
  const head = parts[0] || '';
  if (head === 'version' && m === 'GET') return { v: _dataVersion };
  if (head === 'clients') return _apiClients(m, parts.slice(1), body);
  if (head === 'inventory') return _apiInventory(m, parts.slice(1), body, query);
  if (head === 'quick-items') return _apiQuick(m, parts.slice(1), body);
  if (head === 'sales') return _apiSales(m, parts.slice(1), body, query);
  if (head === 'transactions') return _apiSales(m, parts.slice(1), body, query);
  if (head === 'void' && m === 'POST') return _apiVoid(body);
  if (head === 'returns' && m === 'POST') return _apiReturns(body);
  if (head === 'payments') return _apiPayments(m, parts.slice(1), body);
  if (head === 'print-thermal' && m === 'POST') return _apiPrint(body);
  if (head === 'expenses') return _apiExpenses(m, parts.slice(1), body);
  if (head === 'petty-cash') return _apiPetty(m, body);
  if (head === 'suppliers') return _apiSuppliers(m, parts.slice(1), body);
  if (head === 'supplier-payments' && m === 'POST') return _apiSupplierPayments(body);
  if (head === 'purchase-orders') return _apiPOs(m, parts.slice(1), body);
  if (head === 'stats' && m === 'GET') return _apiStats();
  if (head === 'reports' && m === 'GET' && parts[1] === 'export.csv') return _apiCsv(query);
  if (head === 'reports' && m === 'GET') return _apiReports(query);
  if (head === 'settings') return _apiSettings(m, body);
  if (head === 'audit' && m === 'GET') return _apiAudit(query);
  if (head === 'sms-reminders' && m === 'POST') return _apiSms();
  if (head === 'backup' && parts[1] === 'export' && m === 'GET') return _apiBackupExport();
  if (head === 'backup' && parts[1] === 'import' && m === 'POST') return _apiBackupImport(body);
  if (head === 'alerts' && m === 'GET') {
    const rows = await _db().all('SELECT id, name, stock, lowStock, minStock, sellPrice FROM inventory', []);
    const items = rows.map(i => ({
      id: i.id, name: i.name, stock: i.stock || 0,
      lowStock: i.lowStock ?? i.minStock ?? 5,
      price: parseFloat(i.sellPrice || 0) || 0
    }));
    const out = items.filter(i => i.stock <= 0).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    const low = items.filter(i => i.stock > 0 && i.stock <= i.lowStock).sort((a, b) => a.stock - b.stock).slice(0, 100);
    return { out, low, outCount: out.length, lowCount: low.length };
  }
  if (head === 'mobile-diag') return m === 'GET' ? [] : { success: true, stored: 0 };
  throw _apiErr(404, 'Not found');
}
