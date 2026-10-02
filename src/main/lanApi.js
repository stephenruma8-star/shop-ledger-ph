// LAN / mobile HTTP API as an express Router, backed directly by SQLite (db.js).
// Read endpoints load store rows from the database without touching the renderer, so the
// server keeps working with the window closed. The renderer dump is only a fallback when
// the native module is unavailable, and write endpoints still delegate business logic
// (invoice numbering, audit logs, stock) to the renderer via rendererExec.
const express = require('express');
const fs = require('fs');
const path = require('path');

const EXPENSE_CATS = ['Purchases','Utilities','Rent','Supplies','Transportation','Salaries','Marketing','Maintenance','Food','Other'];

const _offlineQueue = [];
function getOfflineQueue() { return _offlineQueue.slice(); }
function clearOfflineQueue() { _offlineQueue.length = 0; return { ok: true }; }

let _invoiceMutex = Promise.resolve();

const _ipWhitelist = new Set();
const _ipBlacklist = new Set();

function getAccessControl() {
  return {
    whitelist: [..._ipWhitelist],
    blacklist: [..._ipBlacklist]
  };
}

function addToWhitelist(ip) {
  _ipWhitelist.add(ip);
  _ipBlacklist.delete(ip);
  return { success: true };
}

function removeFromWhitelist(ip) {
  _ipWhitelist.delete(ip);
  return { success: true };
}

function addToBlacklist(ip) {
  _ipBlacklist.add(ip);
  _ipWhitelist.delete(ip);
  return { success: true };
}

function removeFromBlacklist(ip) {
  _ipBlacklist.delete(ip);
  return { success: true };
}

const _rateBuckets = new Map();
function rateLimit(maxPerMin = 60) {
  return (req, res, next) => {
    const key = req.ip + req.path;
    const now = Date.now();
    const bucket = _rateBuckets.get(key);
    if (!bucket || now - bucket.start > 60000) {
      _rateBuckets.set(key, { start: now, count: 1 });
      return next();
    }
    bucket.count++;
    if (bucket.count > maxPerMin) {
      return res.status(429).json({ error: 'Too many requests. Please try again later.' });
    }
    next();
  };
}

function sanitize(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/[<>"'&]/g, c => ({ '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '&': '&amp;' }[c])).trim().slice(0, 500);
}

function validateAmount(v) {
  const n = parseFloat(v);
  return !isNaN(n) && isFinite(n) && n >= 0 && n <= 999999999;
}

function createLanApiRouter(deps) {
  const router = express.Router();

  // Monotonic dataset revision: bumped on every mutation below. Phones poll
  // /api/version first and skip the heavy endpoints when nothing changed.
  let _dataVersion = 0;
  function bump(info) {
    _dataVersion++;
    try { deps.notify(info); } catch (e) {}
  }
  
  router.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      const duration = Date.now() - start;
      const level = res.statusCode >= 400 ? 'warn' : 'info';
      const msg = `${req.method} ${req.path} ${res.statusCode} ${duration}ms`;
      if (deps.logger) deps.logger[level](msg);
    });
    next();
  });
  
  router.use(rateLimit(deps.maxRatePerMin || 120));

  // Audit suffix naming the phone that performed a mobile write (" [Ana]").
  // Device names are sanitized at issue time; re-sanitized here for the
  // rendererExec JS-string contexts below.
  function devTag(req) {
    try {
      const n = req && req.device && req.device.name;
      if (!n) return '';
      return ' [' + String(n).replace(/['"`\\\n\r]/g, '').slice(0, 24) + ']';
    } catch (e) { return ''; }
  }

  // Device pairing: exchanges a short-lived 6-digit code (shown on the desktop)
  // for a per-device token. Intentionally unauthenticated; guarded by a tight per-IP
  // rate limit plus code expiry and a 5-guess burn on the main-process side.
  router.post('/api/pair', rateLimit(10), (req, res) => {
    try {
      if (typeof deps.redeemPairCode !== 'function') {
        return res.status(503).json({ success: false, error: 'Pairing not available' });
      }
      const r = deps.redeemPairCode(req.body && req.body.code, req.body && req.body.name);
      if (!r || !r.ok) return res.status(401).json({ success: false, error: (r && r.error) || 'Invalid or expired code' });
      if (typeof deps.onDevicesChanged === 'function') { try { deps.onDevicesChanged(); } catch (e) {} }
      res.json({ success: true, token: r.token, deviceId: r.deviceId || null, name: r.name || null, role: r.role || 'cashier', wsPort: r.wsPort || deps.wsPort || 3458 });
    } catch (err) { res.status(400).json({ success: false, error: 'Bad request' }); }
  });

  // QR-claim pairing: single-use claim from the desktop QR, same device-token result.
  router.post('/api/claim', rateLimit(10), (req, res) => {
    try {
      if (typeof deps.redeemClaim !== 'function') {
        return res.status(503).json({ success: false, error: 'Pairing not available' });
      }
      const r = deps.redeemClaim(req.body && req.body.claim, req.body && req.body.name);
      if (!r || !r.ok) return res.status(401).json({ success: false, error: (r && r.error) || 'Invalid or expired QR code' });
      if (typeof deps.onDevicesChanged === 'function') { try { deps.onDevicesChanged(); } catch (e) {} }
      res.json({ success: true, token: r.token, deviceId: r.deviceId || null, name: r.name || null, role: r.role || 'cashier', wsPort: r.wsPort || deps.wsPort || 3458 });
    } catch (err) { res.status(400).json({ success: false, error: 'Bad request' }); }
  });

  // LAN update distribution: serves this PC's staged update artifacts to peers.
  // Public release bytes (identical to GitHub) — intentionally outside auth.
  router.get('/update-dist/:file', (req, res) => {
    try {
      if (typeof deps.getUpdateDistFile !== 'function') return res.status(503).end();
      const fp = deps.getUpdateDistFile(req.params.file);
      if (!fp) return res.status(404).end();
      res.sendFile(fp, { dotfiles: 'deny' });
    } catch (e) { res.status(404).end(); }
  });

  router.use((req, res, next) => {
    if (req.path === '/api/health') return next();

    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : req.query.token;

    // House token or a per-device phone token (verifyToken dep preferred,
    // plain lanToken compare as fallback for older harnesses).
    let authed = false;
    try {
      if (typeof deps.verifyToken === 'function') {
        const v = deps.verifyToken(token);
        authed = !!(v && v.ok);
        if (authed && v.device) req.device = v.device;
      } else {
        authed = !!token && token === deps.lanToken;
      }
    } catch (e) { authed = false; }
    if (!authed) {
      return res.status(401).json({ error: 'Unauthorized', code: 'UNAUTHORIZED' });
    }
    next();
  });
  
  // Role gate: cashier phones are limited to counter work (sales, payments,
  // catalog reads, printing). Everything sensitive is owner-only. The house
  // token and legacy sessions without device identity count as owner.
  const CASHIER_BLOCKED = [/^\/api\/stats/, /^\/api\/expenses/, /^\/api\/reports/, /^\/api\/settings\//, /^\/api\/sqlite\/enable/, /^\/api\/access-control/, /^\/api\/backups/, /^\/api\/audit/, /^\/api\/returns/, /^\/api\/inventory\/valuation/, /^\/api\/suppliers/, /^\/api\/purchase-orders/];
  router.use((req, res, next) => {
    try {
      const role = (req.device && req.device.role) || 'owner';
      if (role !== 'cashier') return next();
      if (req.method === 'POST' && (
        req.path === '/api/purchase-orders' ||
        req.path === '/api/supplier-payments' ||
        (req.path.startsWith('/api/inventory/') && req.path.endsWith('/photo'))
      )) {
        return res.status(403).json({ error: 'Forbidden', code: 'FORBIDDEN' });
      }
      // Diagnostics reads stay owner-only; every paired phone may still send.
      if (req.method === 'GET' && req.path === '/api/mobile-diag') {
        return res.status(403).json({ error: 'Forbidden', code: 'FORBIDDEN' });
      }
      // Record-rewriting and money-out writes: owner-only. Everyday counter
      // writes (sales, payments, stocktake, photos, client add) stay open.
      if ((req.method === 'PUT' || req.method === 'DELETE') && (
        req.path.startsWith('/api/payments/') ||
        req.path.startsWith('/api/expenses/') ||
        req.path === '/api/settings'
      )) {
        return res.status(403).json({ error: 'Forbidden', code: 'FORBIDDEN' });
      }
      if (req.method === 'POST' && (
        req.path === '/api/void' ||
        req.path === '/api/suppliers' ||
        req.path === '/api/petty-cash' ||
        req.path === '/api/sms-reminders' ||
        (req.path.startsWith('/api/purchase-orders/') && req.path.endsWith('/receive'))
      )) {
        return res.status(403).json({ error: 'Forbidden', code: 'FORBIDDEN' });
      }
      if (CASHIER_BLOCKED.some(re => re.test(req.path))) {
        return res.status(403).json({ error: 'Forbidden', code: 'FORBIDDEN' });
      }
    } catch (e) {}
    next();
  });

  router.use((req, res, next) => {
    const clientIp = req.ip || req.connection.remoteAddress;
    
    if (_ipBlacklist.has(clientIp)) {
      return res.status(403).json({ error: 'Forbidden', code: 'FORBIDDEN' });
    }
    
    if (_ipWhitelist.size > 0 && !_ipWhitelist.has(clientIp)) {
      return res.status(403).json({ error: 'Forbidden', code: 'FORBIDDEN' });
    }
    
    next();
  });

  const active = (t) => t.status !== 'voided' && t.status !== 'interest';
  const dayTotal = (arr, f) => arr.filter(f).reduce((s, x) => s + (x.amount || x.grandTotal || 0), 0);
  // Local calendar date — matches the renderer's today() so mobile and desktop
  // aggregates agree even between midnight and 8 AM (PH is UTC+8).
  const localDate = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const todayStr = () => localDate(new Date());

  // Rows for the named stores: straight from SQLite, or from the renderer dump as a fallback.
  async function load(...names) {
    const info = await deps.db.init(deps.userDataPath());
    if (info && info.ok) {
      const out = {};
      for (const n of names) out[n] = await deps.db.all(n);
      return out;
    }
    if (!deps.rendererReady()) throw Object.assign(new Error('Window not ready'), { status: 503 });
    const dump = await deps.getRendererDump();
    const out = {};
    for (const n of names) out[n] = dump[n] || [];
    return out;
  }

  const log = (...a) => { if (deps.logger && typeof deps.logger.error === 'function') deps.logger.error(...a); };

  function wrap(fn) {
    return (req, res) => fn(req, res).catch((err) => {
      log('lanApi ' + req.path + ' failed: ' + (err && err.message ? err.message : err));
      let status = 500;
      let code = 'INTERNAL_ERROR';
      const msg = (err && err.message) || 'Internal server error';
      if (err && err.status) {
        status = err.status;
        if (status === 400) code = 'VALIDATION_ERROR';
        else if (status === 404) code = 'NOT_FOUND';
        else if (status === 429) code = 'RATE_LIMITED';
        else if (status === 503) code = 'SERVICE_UNAVAILABLE';
      } else if (msg && /validation|invalid/i.test(msg)) {
        status = 400; code = 'VALIDATION_ERROR';
      } else if (msg && /not found/i.test(msg)) {
        status = 404; code = 'NOT_FOUND';
      }
      res.status(status).json({ error: msg, code, status });
    });
  }

  router.get('/api/clients', wrap(async (req, res) => {
    res.json((await load('clients')).clients);
  }));

  // Client add/edit from phones (counter work: names, phones, addresses).
  // Balance is deliberately NOT writable here — only the desktop edits debt.
  router.post('/api/clients', wrap(async (req, res) => {
    const b = req.body || {};
    const name = String(b.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Client name required' });
    if (name.length > 80) return res.status(400).json({ error: 'Name too long (max 80)' });
    if (!deps.rendererReady()) return res.status(503).json({ error: 'Window not ready' });
    const rec = {
      name, phone: String(b.phone || '').trim().slice(0, 20),
      address: String(b.address || '').trim().slice(0, 200),
      balance: 0, dueDate: String(b.dueDate || '').slice(0, 10),
      isSC: !!b.isSC, isPWD: !!b.isPWD, createdAt: new Date().toISOString()
    };
    const id = JSON.parse(await deps.rendererExec(`JSON.stringify(await dbAdd('clients', ${JSON.stringify(rec)}))`));
    try { await deps.rendererExec(`(async()=>{try{await logAudit('client-add','Added client ' + ${JSON.stringify(name)} + ${JSON.stringify(devTag(req))});}catch(e){}})()`); } catch (e) {}
    deps.notify({ source: 'api', kind: 'client' });
    res.json({ success: true, id });
  }));

  router.put('/api/clients/:id', wrap(async (req, res) => {
    const b = req.body || {};
    const name = String(b.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Client name required' });
    if (name.length > 80) return res.status(400).json({ error: 'Name too long (max 80)' });
    if (!deps.rendererReady()) return res.status(503).json({ error: 'Window not ready' });
    const ok = JSON.parse(await deps.rendererExec(`JSON.stringify((async()=>{const c=await dbGet('clients',${JSON.stringify(req.params.id)});if(!c)return false;c.name=${JSON.stringify(name)};c.phone=${JSON.stringify(String(b.phone || '').trim().slice(0, 20))};c.address=${JSON.stringify(String(b.address || '').trim().slice(0, 200))};c.dueDate=${JSON.stringify(String(b.dueDate || '').slice(0, 10))};c.isSC=${!!b.isSC};c.isPWD=${!!b.isPWD};await dbPut('clients',c);return true;})())`));
    if (!ok) return res.status(404).json({ error: 'Client not found' });
    try { await deps.rendererExec(`(async()=>{try{await logAudit('client-edit','Updated client ' + ${JSON.stringify(name)} + ${JSON.stringify(devTag(req))});}catch(e){}})()`); } catch (e) {}
    deps.notify({ source: 'api', kind: 'client' });
    res.json({ success: true });
  }));

  // Client history: profile + recent sales + payments for the timeline and
  // the shareable statement of account.
  router.get('/api/clients/:id/history', wrap(async (req, res) => {
    const dump = await load('clients', 'transactions', 'payments');
    const c = (dump.clients || []).find(x => String(x.id) === String(req.params.id));
    if (!c) return res.status(404).json({ error: 'Client not found' });
    const sales = (dump.transactions || [])
      .filter(t => String(t.clientId) === String(c.id))
      .sort((a, b) => String(b.date || b.createdAt || '').localeCompare(String(a.date || a.createdAt || '')))
      .slice(0, 100)
      .map(t => ({ id: t.id, invoiceNo: t.invoiceNo, date: t.date, grandTotal: t.grandTotal, paymentMethod: t.paymentMethod, status: t.status }));
    const pays = (dump.payments || [])
      .filter(p => String(p.clientId) === String(c.id))
      .sort((a, b) => String(b.date || b.createdAt || '').localeCompare(String(a.date || a.createdAt || '')))
      .slice(0, 100)
      .map(p => ({ id: p.id, date: p.date, amount: p.amount, type: p.type }));
    res.json({
      client: { id: c.id, name: c.name, phone: c.phone, address: c.address, balance: c.balance || 0, loyaltyPoints: c.loyaltyPoints || 0, isSC: !!c.isSC, isPWD: !!c.isPWD },
      sales, payments: pays
    });
  }));

  // Loyalty redemption: 100 points = ₱1 off, banked as redeemedDiscount like
  // the desktop (applied to the client's next sale there).
  router.post('/api/clients/:id/redeem', wrap(async (req, res) => {
    if (!deps.rendererReady()) return res.status(503).json({ error: 'Window not ready' });
    const r = JSON.parse(await deps.rendererExec(`JSON.stringify((async()=>{
      const c=await dbGet('clients',${JSON.stringify(req.params.id)});
      if(!c)return {ok:false,error:'Client not found'};
      const pts=c.loyaltyPoints||0;
      if(pts<100)return {ok:false,error:'Need at least 100 points to redeem'};
      const discountAmount=Math.floor(pts/100), pointsToRedeem=discountAmount*100;
      c.loyaltyPoints=pts-pointsToRedeem;
      c.redeemedDiscount=(c.redeemedDiscount||0)+discountAmount;
      await dbPut('clients',c);
      return {ok:true,points:pointsToRedeem,discount:discountAmount,remaining:c.loyaltyPoints};
    })())`));
    if (!r || !r.ok) return res.status(r && r.error === 'Client not found' ? 404 : 400).json({ success: false, error: (r && r.error) || 'Redeem failed' });
    try { await deps.rendererExec(`(async()=>{try{await logAudit('loyalty-redeem',${JSON.stringify('redeemed ' + r.points + ' points')} + ${JSON.stringify(devTag(req))});}catch(e){}})()`); } catch (e) {}
    deps.notify({ source: 'api', kind: 'loyalty' });
    res.json({ success: true, points: r.points, discount: r.discount, remaining: r.remaining });
  }));

  router.get('/api/inventory', wrap(async (req, res) => {
    const dump = await load('inventory');
    res.json((dump.inventory || []).map(i => ({
      id: i.id, name: i.name, price: parseFloat(i.sellPrice || i.price || 0) || 0,
      stock: i.stock || 0, lowStock: i.lowStock ?? i.minStock ?? 5,
      hasImage: !!i.image,
      sku: i.sku || '', barcode: i.barcode || '',
      variants: i.variants || [], createdAt: i.createdAt
    })).sort((a, b) => (a.name || '').localeCompare(b.name || '')));
  }));

  // Inventory valuation totals for the phone stock overview. Money figures:
  // owner-only (role gate below).
  router.get('/api/inventory/valuation', wrap(async (req, res) => {
    const dump = await load('inventory');
    let cost = 0, retail = 0, units = 0;
    for (const i of (dump.inventory || [])) {
      const st = i.stock || 0;
      cost += st * (parseFloat(i.costPrice) || 0);
      retail += st * (parseFloat(i.sellPrice || i.price) || 0);
      units += st;
    }
    res.json({
      items: (dump.inventory || []).length, units,
      costValue: Math.round(cost * 100) / 100,
      retailValue: Math.round(retail * 100) / 100
    });
  }));

  function cleanInvInput(b) {
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
      variants: variants.length ? variants : undefined,
      expiryDate: String(b.expiryDate || '').slice(0, 10)
    };
  }

  // Item add/edit from phones. Duplicates rejected like the desktop
  // (name/sku/barcode); stock changes audit-logged with before → after.
  router.post('/api/inventory', wrap(async (req, res) => {
    const rec = cleanInvInput(req.body);
    if (!rec.name) return res.status(400).json({ error: 'Item name required' });
    if (rec.name.length > 80) return res.status(400).json({ error: 'Name too long (max 80)' });
    const dump = await load('inventory');
    const all = dump.inventory || [];
    const dup = all.find(i => String(i.name || '').trim().toLowerCase() === rec.name.toLowerCase())
      || (rec.sku && all.find(i => i.sku && String(i.sku).toLowerCase() === rec.sku.toLowerCase()))
      || (rec.barcode && all.find(i => i.barcode && i.barcode === rec.barcode));
    if (dup) return res.status(400).json({ error: 'Duplicate item, SKU or barcode' });
    if (!deps.rendererReady()) return res.status(503).json({ error: 'Window not ready' });
    rec.createdAt = new Date().toISOString();
    const id = JSON.parse(await deps.rendererExec(`JSON.stringify(await dbAdd('inventory', ${JSON.stringify(rec)}))`));
    try { await deps.rendererExec(`(async()=>{try{await logAudit('inventory','New item: ' + ${JSON.stringify(rec.name)} + ${JSON.stringify(devTag(req))});}catch(e){}})()`); } catch (e) {}
    deps.notify({ source: 'api', kind: 'inventory' });
    res.json({ success: true, id });
  }));

  router.put('/api/inventory/:id', wrap(async (req, res) => {
    const rec = cleanInvInput(req.body);
    if (!rec.name) return res.status(400).json({ error: 'Item name required' });
    if (rec.name.length > 80) return res.status(400).json({ error: 'Name too long (max 80)' });
    const dump = await load('inventory');
    const all = dump.inventory || [];
    const self = all.find(i => String(i.id) === String(req.params.id));
    if (!self) return res.status(404).json({ error: 'Item not found' });
    const dup = all.find(i => String(i.id) !== String(req.params.id) && (
      String(i.name || '').trim().toLowerCase() === rec.name.toLowerCase()
      || (rec.sku && i.sku && String(i.sku).toLowerCase() === rec.sku.toLowerCase())
      || (rec.barcode && i.barcode && i.barcode === rec.barcode)));
    if (dup) return res.status(400).json({ error: 'Duplicate item, SKU or barcode' });
    if (!deps.rendererReady()) return res.status(503).json({ error: 'Window not ready' });
    const before = self.stock || 0;
    const r = JSON.parse(await deps.rendererExec(`JSON.stringify((async()=>{
      const e=await dbGet('inventory',${JSON.stringify(req.params.id)});
      if(!e)return false;
      const upd=${JSON.stringify(rec)};
      upd.id=e.id; upd.createdAt=e.createdAt; upd.image=e.image;
      await dbPut('inventory',upd); return true;
    })())`));
    if (!r) return res.status(404).json({ error: 'Item not found' });
    if (before !== rec.stock) {
      try { await deps.rendererExec(`(async()=>{try{await logAudit('inventory',${JSON.stringify(self.name || '')} + ': stock ' + ${before} + ' → ' + ${rec.stock} + ' (adj: ' + ${rec.stock - before} + ')' + ${JSON.stringify(devTag(req))});}catch(e){}})()`); } catch (e) {}
    }
    deps.notify({ source: 'api', kind: 'inventory' });
    res.json({ success: true });
  }));

  // Thumbnails on demand: photos ride here instead of inside every list
  // payload, so refreshes stay small and only new items are fetched.
  router.get('/api/inventory/images', wrap(async (req, res) => {    const ids = String(req.query.ids || '').split(',').map(s => s.trim()).filter(Boolean).slice(0, 200);
    if (!ids.length) return res.json({});
    const dump = await load('inventory');
    const byId = {};
    (dump.inventory || []).forEach(i => { byId[String(i.id)] = i; });
    const out = {};
    for (const id of ids) out[id] = (byId[id] && byId[id].image) || null;
    res.json(out);
  }));

  // Stock alerts for phones: out-of-stock first, then lowest stock.
  // Counter-visible, so cashier-allowed.
  router.get('/api/alerts', wrap(async (req, res) => {
    const dump = await load('inventory');
    const items = (dump.inventory || []).map(i => ({
      id: i.id, name: i.name, stock: i.stock || 0,
      lowStock: i.lowStock ?? i.minStock ?? 5,
      price: parseFloat(i.sellPrice || i.price || 0) || 0
    }));
    const out = items.filter(i => i.stock <= 0).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    const low = items.filter(i => i.stock > 0 && i.stock <= i.lowStock).sort((a, b) => a.stock - b.stock).slice(0, 100);
    res.json({ out, low, outCount: out.length, lowCount: low.length });
  }));

  // Dataset revision for the refresh diet: phones skip every heavy endpoint
  // when this matches their cached copy. Counter-visible metadata.
  router.get('/api/version', wrap(async (req, res) => {
    res.json({ v: _dataVersion });
  }));

  // Phone diagnostics:Ring buffer persisted to userData, mirrored to desktop
  // logs. POST is open to every paired phone (broken phones need it most);
  // reading is owner-only (role gate below).
  const DIAG_MAX_KEEP = 200;
  function diagFile() {
    try { return path.join(deps.userDataPath(), 'mobile-diag.json'); } catch (e) { return null; }
  }
  router.post('/api/mobile-diag', wrap(async (req, res) => {
    const entries = (req.body && req.body.entries) || [];
    if (!Array.isArray(entries) || !entries.length) return res.status(400).json({ error: 'entries required' });
    const who = (req.device && req.device.name) || 'phone';
    const clean = entries.slice(0, 20).map(e => ({
      at: String((e && e.at) || '').slice(0, 40),
      kind: String((e && e.kind) || 'error').slice(0, 20),
      message: String((e && e.message) || '').slice(0, 500),
      device: who, receivedAt: new Date().toISOString()
    }));
    try {
      const fp = diagFile();
      let kept = [];
      if (fp && fs.existsSync(fp)) { try { kept = JSON.parse(fs.readFileSync(fp, 'utf8')); } catch (e) {} }
      if (!Array.isArray(kept)) kept = [];
      kept = kept.concat(clean).slice(-DIAG_MAX_KEEP);
      if (fp) fs.writeFileSync(fp, JSON.stringify(kept));
    } catch (e) {}
    try { if (deps.logger) deps.logger.warn('mobile-diag [' + who + ']: ' + clean.map(c => c.kind + ': ' + c.message).join(' | ').slice(0, 500)); } catch (e) {}
    res.json({ success: true, stored: clean.length });
  }));
  router.get('/api/mobile-diag', wrap(async (req, res) => {
    try {
      const fp = diagFile();
      if (!fp || !fs.existsSync(fp)) return res.json([]);
      const kept = JSON.parse(fs.readFileSync(fp, 'utf8'));
      res.json(Array.isArray(kept) ? kept.slice(-100) : []);
    } catch (e) { res.json([]); }
  }));

  router.get('/api/transactions', wrap(async (req, res) => {
    const dump = await load('transactions');    const limit = Math.min(parseInt(req.query.limit) || 200, 500);
    const list = (dump.transactions || [])
      .sort((a, b) => String(b.date || b.createdAt || '').localeCompare(String(a.date || a.createdAt || '')))
      .slice(0, limit)
      .map(t => ({
        id: t.id, invoiceNo: t.invoiceNo, clientName: t.clientName, paymentMethod: t.paymentMethod,
        date: t.date, createdAt: t.createdAt, grandTotal: t.grandTotal, subtotal: t.subtotal,
        totalInterest: t.totalInterest, discount: t.discount, scDiscount: t.scDiscount,
        status: t.status, items: (t.items || []).length
      }));
    res.json(list);
  }));

  router.get('/api/stats', wrap(async (req, res) => {
    const dump = await load('transactions', 'expenses', 'payments', 'clients', 'inventory');
    const tStr = todayStr();
    const todayTx = (dump.transactions || []).filter(t => t.date === tStr && active(t));
    const todaySales = todayTx.reduce((s, t) => s + (t.grandTotal || 0), 0);
    const todayExpTotal = dayTotal(dump.expenses || [], e => e.date === tStr);
    const todayPayTotal = dayTotal(dump.payments || [], p => p.date === tStr);
    const totalUtang = (dump.clients || []).reduce((s, c) => s + (c.balance || 0), 0);
    const lowStock = (dump.inventory || []).filter(i => (i.stock || 0) <= (i.lowStock ?? i.minStock ?? 5));
    const monthSales = (dump.transactions || []).filter(t => (t.date || '').startsWith(tStr.slice(0, 7)) && active(t))
      .reduce((s, t) => s + (t.grandTotal || 0), 0);
    const monthPay = dayTotal(dump.payments || [], p => (p.date || '').startsWith(tStr.slice(0, 7)));
    const monthExp = dayTotal(dump.expenses || [], e => (e.date || '').startsWith(tStr.slice(0, 7)));
    const refundAbs = (t) => Math.abs(t.grandTotal || 0);
    const todayRefunds = (dump.transactions || []).filter(t => t.date === tStr && t.status === 'return').reduce((s, t) => s + refundAbs(t), 0);
    const monthRefunds = (dump.transactions || []).filter(t => (t.date || '').startsWith(tStr.slice(0, 7)) && t.status === 'return').reduce((s, t) => s + refundAbs(t), 0);
    res.json({
      clients: (dump.clients || []).length,
      inventory: (dump.inventory || []).length,
      totalUtang, lowStockCount: lowStock.length,
      todaySales, todayExpenses: todayExpTotal, todayCollected: todayPayTotal,
      todayProfit: todaySales - todayExpTotal,
      todayRefunds, monthRefunds,
      monthSales, monthCollected: monthPay, monthExpenses: monthExp,
      monthProfit: monthSales - monthExp,
      recent: (dump.transactions || [])
        .filter(t => active(t))
        .sort((a, b) => String(b.date || b.createdAt || '').localeCompare(String(a.date || a.createdAt || '')))
        .slice(0, 5)
        .map(t => ({ invoiceNo: t.invoiceNo, clientName: t.clientName, grandTotal: t.grandTotal, date: t.date }))
    });
  }));

  router.get('/api/expenses', wrap(async (req, res) => {
    const dump = await load('expenses');
    const list = (dump.expenses || [])
      .sort((a, b) => String(b.date || b.createdAt || '').localeCompare(String(a.date || a.createdAt || '')))
      .map(e => ({ id: e.id, date: e.date, category: e.category, description: e.description, amount: e.amount, payee: e.payee, createdAt: e.createdAt }));
    res.json(list);
  }));

  router.post('/api/expenses', wrap(async (req, res) => {
    if (req.query.offline === 'true') {      _offlineQueue.push({ type: 'expense', body: req.body, timestamp: Date.now() });
      return res.json({ success: true, queued: true, queueLength: _offlineQueue.length });
    }
    if (!deps.rendererReady()) return res.status(503).json({ error: 'Window not ready' });
    const { description, amount, category, date, payee } = req.body;
    if (!validateAmount(amount)) return res.status(400).json({ error: 'Valid amount required (0-999999999)' });
    const amountNum = Math.round((parseFloat(amount) || 0) * 100) / 100;
    if (amountNum <= 0) return res.status(400).json({ error: 'Amount must be greater than 0' });
    const cat = EXPENSE_CATS.includes(category) ? category : 'Other';
    const safeDesc = sanitize(description);
    const safePayee = sanitize(payee);
    const safeDate = sanitize(date) || todayStr();
    await deps.rendererExec(`
      (async () => {
        await dbAdd('expenses', { date: ${JSON.stringify(safeDate)}, category: ${JSON.stringify(cat)}, description: ${JSON.stringify(safeDesc)}, amount: ${amountNum}, payee: ${JSON.stringify(safePayee)}, createdAt: new Date().toISOString() });
        try { await logAudit('expense-add', ${JSON.stringify(cat)} + ': ₱' + ${amountNum}.toFixed(2) + ' - ' + ${JSON.stringify(safeDesc)} + ${JSON.stringify(devTag(req))}); } catch (e) {}
      })()
    `);
    bump({ source: 'api', kind: 'expense' });
    res.json({ success: true });
  }));

  // Expense edit/delete. Owner-only (money records).
  router.put('/api/expenses/:id', wrap(async (req, res) => {
    const b = req.body || {};
    const amountNum = Math.round((parseFloat(b.amount) || 0) * 100) / 100;
    if (!validateAmount(amountNum) || amountNum <= 0) return res.status(400).json({ error: 'Valid amount required' });
    if (!deps.rendererReady()) return res.status(503).json({ error: 'Window not ready' });
    const ok = JSON.parse(await deps.rendererExec(`JSON.stringify((async()=>{
      const e=await dbGet('expenses',${JSON.stringify(req.params.id)});
      if(!e)return false;
      e.description=${JSON.stringify(sanitize(b.description))};
      e.amount=${amountNum};
      e.category=${JSON.stringify(EXPENSE_CATS.includes(b.category) ? b.category : 'Other')};
      e.date=${JSON.stringify(sanitize(b.date) || todayStr())};
      e.payee=${JSON.stringify(sanitize(b.payee))};
      await dbPut('expenses',e);return true;
    })())`));
    if (!ok) return res.status(404).json({ error: 'Expense not found' });
    try { await deps.rendererExec(`(async()=>{try{await logAudit('expense-edit','Mobile expense edit' + ${JSON.stringify(devTag(req))});}catch(e){}})()`); } catch (e) {}
    bump({ source: 'api', kind: 'expense' });
    res.json({ success: true });
  }));

  router.delete('/api/expenses/:id', wrap(async (req, res) => {
    if (!deps.rendererReady()) return res.status(503).json({ error: 'Window not ready' });
    const ok = JSON.parse(await deps.rendererExec(`JSON.stringify((async()=>{const e=await dbGet('expenses',${JSON.stringify(req.params.id)});if(!e)return false;await dbDel('expenses',e.id);return true;})())`));
    if (!ok) return res.status(404).json({ error: 'Expense not found' });
    try { await deps.rendererExec(`(async()=>{try{await logAudit('expense-delete','Mobile expense delete' + ${JSON.stringify(devTag(req))});}catch(e){}})()`); } catch (e) {}
    bump({ source: 'api', kind: 'expense' });
    res.json({ success: true });
  }));

  // Petty cash: balance + typed history. Mirrors the desktop (setting plus
  // type-tagged expense rows). Reads open to counter eyes; writes owner-only.
  router.get('/api/petty-cash', wrap(async (req, res) => {
    const dump = await load('settings', 'expenses');
    const s = {};
    (dump.settings || []).forEach(x => { s[x.key] = x.value; });
    const log = (dump.expenses || [])
      .filter(e => e.type === 'petty-cash')
      .sort((a, b) => String(b.date || b.createdAt || '').localeCompare(String(a.date || a.createdAt || '')))
      .slice(0, 50)
      .map(e => ({ id: e.id, date: e.date, description: e.description, amount: e.amount, createdAt: e.createdAt }));
    res.json({ balance: parseFloat(s.pettyCashBalance) || 0, log });
  }));

  router.post('/api/petty-cash', wrap(async (req, res) => {
    const amt = Math.round((parseFloat(req.body && req.body.amount) || 0) * 100) / 100;
    const dir = req.body && req.body.dir === 'withdraw' ? -1 : 1;
    if (!validateAmount(amt) || amt <= 0) return res.status(400).json({ error: 'Valid amount required' });
    if (!deps.rendererReady()) return res.status(503).json({ error: 'Window not ready' });
    const today = todayStr();
    const r = JSON.parse(await deps.rendererExec(`JSON.stringify((async()=>{
      const all=await dbAll('settings');
      const row=all.find(x=>x.key==='pettyCashBalance');
      const bal=parseFloat(row?row.value:0)||0;
      const next=bal+(${dir}*${amt});
      if(next<0)return {ok:false,error:'Insufficient petty cash'};
      if(row){row.value=String(next);await dbPut('settings',row);}
      else{await dbAdd('settings',{key:'pettyCashBalance',value:String(next)});}
      await dbAdd('expenses',{date:${JSON.stringify(today)},category:'Other',description:${JSON.stringify(dir > 0 ? 'Petty cash top-up' : 'Petty cash withdrawal')},amount:${amt},type:'petty-cash',createdAt:new Date().toISOString()});
      return {ok:true,balance:next};
    })())`));
    if (!r || !r.ok) return res.status(400).json({ success: false, error: (r && r.error) || 'Petty cash failed' });
    try { await deps.rendererExec(`(async()=>{try{await logAudit('petty-cash','Mobile petty cash ' + ${JSON.stringify(dir > 0 ? 'top-up' : 'withdrawal')} + ${JSON.stringify(devTag(req))});}catch(e){}})()`); } catch (e) {}
    bump({ source: 'api', kind: 'petty-cash' });
    res.json({ success: true, balance: r.balance });
  }));

  router.get('/api/suppliers', wrap(async (req, res) => {
    const dump = await load('suppliers', 'supplierPayments', 'purchaseOrders');
    const paid = {}, purchased = {};
    (dump.supplierPayments || []).forEach(p => { paid[p.supplierId] = (paid[p.supplierId] || 0) + (p.amount || 0); });
    (dump.purchaseOrders || []).forEach(po => { purchased[po.supplierId] = (purchased[po.supplierId] || 0) + (po.total || 0); });
    const list = (dump.suppliers || []).map(s => ({
      id: s.id, name: s.name, contact: s.contact, email: s.email, category: s.category, address: s.address,
      purchased: purchased[s.id] || 0, paid: paid[s.id] || 0, owed: Math.max(0, (purchased[s.id] || 0) - (paid[s.id] || 0))
    })).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    res.json(list);
  }));

  // Supplier add + payment history. Vendor master data and money movement:
  // owner-only (role gate below).
  router.post('/api/suppliers', wrap(async (req, res) => {
    const b = req.body || {};
    const name = String(b.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Supplier name required' });
    if (name.length > 80) return res.status(400).json({ error: 'Name too long (max 80)' });
    if (!deps.rendererReady()) return res.status(503).json({ error: 'Window not ready' });
    const id = JSON.parse(await deps.rendererExec(`JSON.stringify(await dbAdd('suppliers', ${JSON.stringify({ name, contact: String(b.contact || '').trim().slice(0, 40), email: String(b.email || '').trim().slice(0, 80), category: String(b.category || '').trim().slice(0, 40), address: String(b.address || '').trim().slice(0, 200), createdAt: new Date().toISOString() })}))`));
    try { await deps.rendererExec(`(async()=>{try{await logAudit('supplier','New supplier: ' + ${JSON.stringify(name)} + ${JSON.stringify(devTag(req))});}catch(e){}})()`); } catch (e) {}
    bump({ source: 'api', kind: 'supplier' });
    res.json({ success: true, id });
  }));

  router.get('/api/suppliers/:id/payments', wrap(async (req, res) => {
    const dump = await load('suppliers', 'supplierPayments', 'purchaseOrders');
    const s = (dump.suppliers || []).find(x => String(x.id) === String(req.params.id));
    if (!s) return res.status(404).json({ error: 'Supplier not found' });
    const pays = (dump.supplierPayments || [])
      .filter(p => String(p.supplierId) === String(s.id))
      .sort((a, b) => String(b.date || b.createdAt || '').localeCompare(String(a.date || a.createdAt || '')))
      .slice(0, 50)
      .map(p => ({ id: p.id, date: p.date, amount: p.amount, paymentMethod: p.paymentMethod, notes: p.notes }));
    const purchased = (dump.purchaseOrders || [])
      .filter(p => String(p.supplierId) === String(s.id) && p.status === 'Received')
      .reduce((sum, p) => sum + (p.total || 0), 0);
    const paid = (dump.supplierPayments || [])
      .filter(p => String(p.supplierId) === String(s.id))
      .reduce((sum, p) => sum + (p.amount || 0), 0);
    res.json({ supplier: { id: s.id, name: s.name }, purchased, paid, owed: Math.max(0, purchased - paid), payments: pays });
  }));

  router.get('/api/purchase-orders', wrap(async (req, res) => {
    const dump = await load('purchaseOrders');    const list = (dump.purchaseOrders || [])
      .sort((a, b) => String(b.date || b.createdAt || '').localeCompare(String(a.date || a.createdAt || '')))
      .map(po => ({ id: po.id, poNo: po.poNo, supplierId: po.supplierId, supplierName: po.supplierName, date: po.date, items: po.items || [], total: po.total, status: po.status, createdAt: po.createdAt }));
    res.json(list);
  }));

  router.post('/api/purchase-orders', wrap(async (req, res) => {
    if (!deps.rendererReady()) return res.status(503).json({ error: 'Window not ready' });
    const { supplierId, items, date } = req.body;
    if (!items || !items.length) return res.status(400).json({ error: 'No items' });
    const dump = await load('suppliers', 'purchaseOrders');
    const supplier = (dump.suppliers || []).find(s => s.id === supplierId) || null;
    const supplierName = supplier ? supplier.name : 'Unknown';
    const poNos = (dump.purchaseOrders || []).filter(p => p.poNo && String(p.poNo).startsWith('PO-')).map(p => parseInt(String(p.poNo).replace('PO-', '')) || 0);
    const poNo = 'PO-' + String((poNos.length > 0 ? Math.max(...poNos) : 0) + 1).padStart(5, '0');
    const total = items.reduce((s, i) => s + ((parseFloat(i.price) || 0) * (parseInt(i.qty) || 1)), 0);
    const cleanItems = items.map(i => ({ invId: i.invId || null, name: String(i.name || 'Item'), price: parseFloat(i.price) || 0, qty: parseInt(i.qty) || 1, variantName: i.variantName || null }));
    await deps.rendererExec(`dbAdd('purchaseOrders', ${JSON.stringify({ poNo, supplierId: supplierId || null, supplierName, date: date || todayStr(), items: cleanItems, total, status: 'Pending', createdAt: new Date().toISOString() })})`);
    try { await deps.rendererExec(`logAudit('po', 'PO ${poNo} created from ${supplierName} (mobile)${devTag(req)}')`); } catch (e) {}
    bump({ source: 'api', kind: 'po' });
    res.json({ success: true, poNo });
  }));

  // PO receiving: marks Received, adds stock, books a purchase expense and
  // updates price history — mirroring the desktop receive flow. Owner-only.
  router.post('/api/purchase-orders/:id/receive', wrap(async (req, res) => {
    if (!deps.rendererReady()) return res.status(503).json({ error: 'Window not ready' });
    const today = todayStr();
    const r = JSON.parse(await deps.rendererExec(`JSON.stringify((async()=>{
      const all=await dbAll('purchaseOrders');
      const po=all.find(p=>String(p.id)===${JSON.stringify(String(req.params.id))});
      if(!po)return {ok:false,error:'Purchase order not found'};
      if(po.status==='Received')return {ok:false,error:'Already received'};
      po.status='Received';po.receivedAt=new Date().toISOString();
      await dbPut('purchaseOrders',po);
      for(const it of (po.items||[])){
        if(it.invId){const i=await dbGet('inventory',it.invId);if(i){i.stock=(i.stock||0)+(parseInt(it.qty)||1);await dbPut('inventory',i);}}
      }
      await dbAdd('expenses',{date:po.date||${JSON.stringify(today)},category:'Purchases',description:'PO '+(po.poNo||'')+' received',amount:po.total||0,payee:po.supplierName||'',createdAt:new Date().toISOString()});
      return {ok:true,poNo:po.poNo};
    })())`));
    if (!r || !r.ok) return res.status((r && r.error === 'Purchase order not found') ? 404 : 400).json({ success: false, error: (r && r.error) || 'Receive failed' });
    try { await deps.rendererExec(`(async()=>{try{await logAudit('po','Mobile PO received ' + ${JSON.stringify(r.poNo || '')} + ${JSON.stringify(devTag(req))});}catch(e){}})()`); } catch (e) {}
    bump({ source: 'api', kind: 'po-receive' });
    res.json({ success: true, poNo: r.poNo });
  }));

  router.get('/api/reports', wrap(async (req, res) => {
    const dump = await load('transactions', 'expenses', 'payments');
    const tStr = todayStr();
    const mStr = /^\d{4}-\d{2}$/.test(req.query.month || '') ? req.query.month : tStr.slice(0, 7);
    const todaySales = (dump.transactions || []).filter(t => active(t) && t.date === tStr).reduce((s, t) => s + (t.grandTotal || 0), 0);
    const todayExp = dayTotal(dump.expenses || [], e => e.date === tStr);
    const todayPay = dayTotal(dump.payments || [], p => p.date === tStr);
    const monthSales = (dump.transactions || []).filter(t => active(t) && (t.date || '').startsWith(mStr)).reduce((s, t) => s + (t.grandTotal || 0), 0);
    const monthExp = dayTotal(dump.expenses || [], e => (e.date || '').startsWith(mStr));
    const monthPay = dayTotal(dump.payments || [], p => (p.date || '').startsWith(mStr));
    const topItems = {};
    (dump.transactions || []).filter(active).forEach(t => {
      (t.items || []).forEach(it => {
        const nm = it.description || it.name || 'Item';
        const q = parseInt(it.qty) || 1;
        const amt = (it.amount || (q * (it.unitCost || 0))) || 0;
        if (!topItems[nm]) topItems[nm] = { name: nm, qty: 0, amount: 0 };
        topItems[nm].qty += q; topItems[nm].amount += amt;
      });
    });
    const week = [];
    const refundAbs = (t) => Math.abs(t.grandTotal || 0);
    const todayRefunds = (dump.transactions || []).filter(t => t.status === 'return' && t.date === tStr).reduce((s, t) => s + refundAbs(t), 0);
    const monthRefunds = (dump.transactions || []).filter(t => t.status === 'return' && (t.date || '').startsWith(mStr)).reduce((s, t) => s + refundAbs(t), 0);
    for (let i = 6; i >= 0; i--) {
      const d = localDate(new Date(Date.now() - i * 86400000));
      week.push({
        date: d,
        sales: (dump.transactions || []).filter(t => active(t) && t.date === d).reduce((s, t) => s + (t.grandTotal || 0), 0),
        expenses: dayTotal(dump.expenses || [], e => e.date === d),
        refunds: (dump.transactions || []).filter(t => t.status === 'return' && t.date === d).reduce((s, t) => s + refundAbs(t), 0)
      });
    }
    res.json({
      monthStr: mStr,
      today: { sales: todaySales, expenses: todayExp, collected: todayPay, profit: todaySales - todayExp, refunds: todayRefunds },
      month: { sales: monthSales, expenses: monthExp, collected: monthPay, profit: monthSales - monthExp, refunds: monthRefunds },
      topItems: Object.values(topItems).sort((a, b) => b.amount - a.amount).slice(0, 5),
      week
    });
  }));

  // Monthly CSV for Excel/Sheets: sales lines plus an expenses section.
  // BOM first so Excel renders Filipino text correctly. Owner-only via roles.
  function csvCell(v) {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  router.get('/api/reports/export.csv', wrap(async (req, res) => {
    const tStr = todayStr();
    const m = /^\d{4}-\d{2}$/.test(req.query.month || '') ? req.query.month : tStr.slice(0, 7);
    const dump = await load('transactions', 'expenses');
    const L = [];
    L.push(['Date', 'Invoice', 'Client', 'Item', 'Qty', 'Price', 'Amount', 'Payment', 'Status'].map(csvCell).join(','));
    (dump.transactions || [])
      .filter(t => active(t) && (t.date || '').startsWith(m))
      .sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')))
      .forEach(t => {
        (t.items && t.items.length ? t.items : [{}]).forEach(it => {
          const q = parseFloat(it.qty) || 1;
          const p = it.unitCost || it.price || 0;
          L.push([t.date || '', t.invoiceNo || '', t.clientName || '', it.description || it.name || '', q, p, (it.amount ?? (q * p)), t.paymentMethod || '', t.status || ''].map(csvCell).join(','));
        });
      });
    L.push('');
    L.push(['EXPENSES', '', '', '', '', '', '', '', ''].map(csvCell).join(','));
    L.push(['Date', 'Category', 'Description', 'Amount', 'Payee', '', '', '', ''].map(csvCell).join(','));
    (dump.expenses || [])
      .filter(e => (e.date || '').startsWith(m))
      .sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')))
      .forEach(e => {
        L.push([e.date || '', e.category || '', e.description || '', e.amount || 0, e.payee || '', '', '', '', ''].map(csvCell).join(','));
      });
    res.set('Content-Type', 'text/csv; charset=utf-8');
    res.set('Content-Disposition', `attachment; filename="ShopLedger-${m}.csv"`);
    res.send('﻿' + L.join('\n'));
  }));

  router.get('/api/settings', wrap(async (req, res) => {
    const dump = await load('settings');
    const s = {};
    (dump.settings || []).forEach(x => { s[x.key] = x.value; });
    res.json({ shopName: s.shopName || 'My Sari-Sari Store', shopContact: s.shopContact || '', shopAddress: s.shopAddress || '', currency: s.currency || '₱', receiptFooter: s.receiptFooter || '', pettyCashBalance: parseFloat(s.pettyCashBalance) || 0, vatRate: parseFloat(s.vatRate) || 0 });
  }));

  // Shop settings edit from owner phones: strict allowlist (never secrets,
  // balances, or tokens — those stay desktop-only).
  const EDITABLE_SETTINGS = ['shopName', 'shopAddress', 'shopContact', 'receiptFooter', 'receiptHeaderText'];
  router.put('/api/settings', wrap(async (req, res) => {
    const b = req.body || {};
    const key = String(b.key || '');
    if (!EDITABLE_SETTINGS.includes(key)) return res.status(400).json({ error: 'That setting cannot be edited from a phone' });
    const value = String(b.value ?? '').slice(0, 500);
    if (typeof deps.setSetting !== 'function') return res.status(503).json({ error: 'Settings not available' });
    const r = await deps.setSetting(key, value);
    if (!r || r.success === false) return res.status(500).json({ error: 'Save failed' });
    deps.notify({ source: 'api', kind: 'settings' });
    res.json({ success: true });
  }));

  // Activity log for owner phones (role-gated above): newest first, capped.
  router.get('/api/audit', wrap(async (req, res) => {
    const dump = await load('auditLogs');
    const limit = Math.min(parseInt(req.query.limit) || 100, 200);
    const list = (dump.auditLogs || [])
      .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
      .slice(0, limit)
      .map(l => ({ id: l.id, action: l.action || '', details: l.details || '', user: l.user || '', createdAt: l.createdAt || '' }));
    res.json(list);
  }));

  // Shelf stocktake: set an item's counted stock. Both roles (counting is
  // floor work); every adjustment is audit-tagged with the phone's name.
  router.post('/api/inventory/adjust', wrap(async (req, res) => {
    const qty = parseInt(req.body && req.body.stock, 10);
    const id = req.body && req.body.id;
    if (id === undefined || id === null || id === '' || isNaN(qty) || qty < 0 || qty > 999999) {
      return res.status(400).json({ error: 'Valid id and stock (0-999999) required' });
    }
    if (!deps.rendererReady()) return res.status(503).json({ error: 'Window not ready' });
    const found = await deps.rendererExec(`(async()=>{const i=await dbGet('inventory',${JSON.stringify(id)});if(!i)return null;const before=i.stock||0;i.stock=${qty};await dbPut('inventory',i);return JSON.stringify({name:i.name,before});})()`);
    let info = null;
    try { info = JSON.parse(found); } catch (e) {}
    if (!info) return res.status(404).json({ error: 'Item not found' });
    try { await deps.rendererExec(`(async()=>{try{await logAudit('stocktake',${JSON.stringify(info.name)} + ': stock ' + ${info.before} + ' → ' + ${qty} + ${JSON.stringify(devTag(req))});}catch(e){}})()`); } catch (e) {}
    bump({ source: 'api', kind: 'stocktake' });
    res.json({ success: true, name: info.name, before: info.before, stock: qty });
  }));

  // Supplier payment from an owner phone: money-out, so cashiers are blocked
  // by the role gate above.
  router.post('/api/supplier-payments', wrap(async (req, res) => {
    const { supplierId, amount, paymentMethod, notes } = req.body || {};
    if (!validateAmount(amount)) return res.status(400).json({ error: 'Valid amount required' });
    const amtNum = Math.round((parseFloat(amount) || 0) * 100) / 100;
    if (amtNum <= 0) return res.status(400).json({ error: 'Amount must be greater than 0' });
    if (!deps.rendererReady()) return res.status(503).json({ error: 'Window not ready' });
    const dump = await load('suppliers');
    const s = (dump.suppliers || []).find(x => String(x.id) === String(supplierId));
    if (!s) return res.status(404).json({ error: 'Supplier not found' });
    const pm = ['Cash', 'GCash', 'Maya', 'Bank Transfer'].includes(paymentMethod) ? paymentMethod : 'Cash';
    await deps.rendererExec(`dbAdd('supplierPayments', ${JSON.stringify({ supplierId: s.id, supplierName: s.name || '', amount: amtNum, date: todayStr(), notes: sanitize(notes), paymentMethod: pm, createdAt: new Date().toISOString() })})`);
    try { await deps.rendererExec(`(async()=>{try{await logAudit('supplier-payment','Paid ' + ${JSON.stringify(s.name || '')} + ' - ₱' + ${amtNum}.toFixed(2) + ${JSON.stringify(devTag(req))});}catch(e){}})()`); } catch (e) {}
    bump({ source: 'api', kind: 'supplier-payment' });
    res.json({ success: true });
  }));

  router.post('/api/payments', wrap(async (req, res) => {
    if (req.query.offline === 'true') {
      _offlineQueue.push({ type: 'payment', body: req.body, timestamp: Date.now() });
      return res.json({ success: true, queued: true, queueLength: _offlineQueue.length });
    }
    if (!deps.rendererReady()) return res.status(503).json({ error: 'Window not ready' });
    const { clientId, amount, type, date } = req.body;
    if (!validateAmount(amount)) return res.status(400).json({ error: 'Valid amount required' });
    if (clientId && typeof clientId !== 'number' && typeof clientId !== 'string') return res.status(400).json({ error: 'Invalid client ID' });
    const amtNum = Math.round((parseFloat(amount) || 0) * 100) / 100;
    if (amtNum <= 0) return res.status(400).json({ error: 'Amount must be greater than 0' });
    const cId = JSON.stringify(clientId);
    const amt = JSON.stringify(amtNum);
    const payType = JSON.stringify(amtNum > 0 ? (type === 'Full' || type === 'Partial' ? type : null) : null);
    const safeDate = sanitize(date) || new Date().toISOString().split('T')[0];
    await deps.rendererExec(`
      (async () => {
        const c = await dbGet('clients', ${cId});
        const balBefore = c ? (c.balance || 0) : 0;
        const pt = ${payType} || (${amt} >= balBefore ? 'Full' : 'Partial');
        await dbAdd('payments', { clientId: ${cId}, amount: ${amt}, type: pt, date: ${JSON.stringify(safeDate)}, notes: ${JSON.stringify('')}, createdAt: new Date().toISOString() });
        if (c) await dbPut('clients', { ...c, balance: Math.max(0, balBefore - ${amt}) });
        try { await logAudit('payment', 'Mobile payment ' + (c ? c.name : 'client') + ' - ₱' + ${amt}.toFixed(2) + ${JSON.stringify(devTag(req))}); } catch (e) {}
        return { success: true };
      })()
    `);
    bump({ source: 'api', kind: 'payment' });
    res.json({ success: true });
  }));

  router.post('/api/sales', wrap(async (req, res) => {
    if (req.query.offline === 'true') {
      _offlineQueue.push({ type: 'sale', body: req.body, timestamp: Date.now() });
      return res.json({ success: true, queued: true, queueLength: _offlineQueue.length });
    }
    if (!deps.rendererReady()) return res.status(503).json({ error: 'Window not ready' });
    const { clientId, items, paymentMethod, discount } = req.body;
    if (!items || !Array.isArray(items) || items.length === 0) return res.status(400).json({ error: 'At least one item required' });
    if (items.length > 100) return res.status(400).json({ error: 'Too many items (max 100)' });
    for (const item of items) {
      if (!item.description || typeof item.description !== 'string') return res.status(400).json({ error: 'Each item must have a description' });
      if (!validateAmount(item.unitCost)) return res.status(400).json({ error: 'Invalid item price' });
      if (item.qty && (isNaN(parseInt(item.qty)) || parseInt(item.qty) < 1)) return res.status(400).json({ error: 'Invalid item quantity' });
    }
    if (discount && !validateAmount(discount)) return res.status(400).json({ error: 'Invalid discount' });
    if (paymentMethod && !['Cash','GCash','Maya','Bank Transfer'].includes(paymentMethod)) return res.status(400).json({ error: 'Invalid payment method' });
    _invoiceMutex = _invoiceMutex.then(async () => {
      const invNos = JSON.parse(await deps.rendererExec(`JSON.stringify(state.transactions.filter(t=>t.invoiceNo?.startsWith('INV-')).map(t=>parseInt(t.invoiceNo.replace('INV-',''))||0))`));
      const nextNo = invNos.length > 0 ? Math.max(...invNos) + 1 : 1;
      const invoiceNo = 'INV-' + String(nextNo).padStart(5,'0');
      const subtotal = items.reduce((s, i) => s + ((i.qty||1) * (i.unitCost || 0)), 0);
      const totalInterest = items.reduce((s, i) => s + ((i.qty||1) * (i.unitCost || 0)) * ((i.intRate||0)/100), 0);
      const d = parseFloat(discount) || 0;
      const grandTotal = Math.max(0, subtotal + totalInterest - d);
      const clientData = clientId ? JSON.parse(await deps.rendererExec(`JSON.stringify(await dbGet('clients', ${JSON.stringify(clientId)}))`)) : null;
      const clientName = clientData ? clientData.name : 'Walk-in';
      const payMethod = paymentMethod || 'Cash';
      const txnData = JSON.stringify({ invoiceNo, clientId: clientId || null, clientName, date: todayStr(), createdAt: new Date().toISOString(), items: items.map(i => ({ ...i, amount: ((i.qty||1) * (i.unitCost || 0)) + ((i.qty||1) * (i.unitCost || 0)) * ((i.intRate||0)/100) })), subtotal, totalInterest, discount: d, scDiscount: 0, grandTotal, paymentMethod: payMethod, status: grandTotal <= 0 ? 'paid' : 'pending', balanceAdded: !!(clientId && payMethod !== 'Cash') });
      await deps.rendererExec(`dbAdd('transactions', ${txnData})`);
      await deps.rendererExec(`(async()=>{try{await logAudit('sale','Mobile sale ${invoiceNo} - ₱${grandTotal.toFixed(2)}${devTag(req)}');}catch(e){}})()`);
      for (const item of items) {
        let invId = item.invId;
        if (!invId && item.description) {
          invId = await deps.rendererExec(`(async()=>{
            const desc = ${JSON.stringify(String(item.description).trim())};
            const qty = ${Math.max(1, parseInt(item.qty) || 1)};
            const unitCost = ${item.unitCost || 0};
            if (!desc) return null;
            const all = await dbAll('inventory');
            const f = all.find(i => String(i.name || '').trim().toLowerCase() === desc.toLowerCase());
            if (f) return f.id;
            const n = { name: desc, description: '', sku: '', category: '', stock: qty, minStock: 5, lowStock: 5, costPrice: 0, sellPrice: unitCost, price: unitCost, image: null, variants: [], createdAt: new Date().toISOString() };
            const id = await dbAdd('inventory', n);
            try { await logAudit('inventory', 'Auto-created from sale: ' + desc + ${JSON.stringify(devTag(req))}); } catch (e) {}
            return id;
          })()`);
          item.invId = invId;
        }
        if (invId) await deps.rendererExec(`(async()=>{const i=await dbGet('inventory',${JSON.stringify(invId)});if(i){i.stock=(i.stock||0)-${parseInt(item.qty)||1};const vn=${JSON.stringify(item.variantName || null)};if(vn&&i.variants){const v=i.variants.find(x=>x.name===vn);if(v)v.stock=(v.stock||0)-${parseInt(item.qty)||1};}await dbPut('inventory',i);}})()`);
      }
      if (clientId) await deps.rendererExec(`(async()=>{const c=await dbGet('clients',${JSON.stringify(clientId)});if(c && ${JSON.stringify(payMethod)} !== 'Cash'){c.balance=(c.balance||0)+${grandTotal};await dbPut('clients',c);}})()`);
      // Loyalty earn mirrors the desktop: floor(grandTotal × pointsPerPeso)
      // setting (default 1) plus lifetime spend tracking.
      if (clientId) {
        const ppp = parseFloat(((await load('settings')).settings || []).find(s => s.key === 'pointsPerPeso')?.value) || 1;
        const earned = Math.floor((Number(grandTotal) || 0) * ppp);
        if (earned > 0) await deps.rendererExec(`(async()=>{const c=await dbGet('clients',${JSON.stringify(clientId)});if(c){c.loyaltyPoints=(c.loyaltyPoints||0)+${earned};c.totalSpent=(c.totalSpent||0)+${grandTotal};await dbPut('clients',c);}})()`);
      }
      bump({ source: 'api', kind: 'sale' });
      return { success: true, invoiceNo };
    });
    await _invoiceMutex;
    res.json(_invoiceMutex.__result || { success: true });
  }));

  router.get('/api/sqlite-status', async (req, res) => {
    try {
      const s = await deps.db.init(deps.userDataPath());
      res.json({ ok: !!s.ok, backend: s.ok ? 'sqlite' : 'indexeddb', path: s.path || null, size: s.size || 0, stores: s.stores || 0, needMigration: s.ok ? !!s.needMigration : false, error: s.error || null });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  router.post('/api/sqlite/enable', async (req, res) => {
    try {
      const s = await deps.db.init(deps.userDataPath());
      res.json({ ok: !!s.ok, backend: s.ok ? 'sqlite' : 'indexeddb', path: s.path || null, size: s.size || 0, stores: s.stores || 0, needMigration: s.ok ? !!s.needMigration : false, error: s.error || null });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  router.post('/api/settings/api-key', wrap(async (req, res) => {
    const { apiKey, type } = req.body || {};
    if (!apiKey) return res.status(400).json({ error: 'apiKey required' });
    const r = await deps.setSetting(type === 'cloud' ? 'cloudApiKey' : 'smsApiKey', String(apiKey));
    if (!r.success) return res.status(503).json(r);
    res.json(r);
  }));

  router.post('/api/settings/cashier', wrap(async (req, res) => {
    const { username } = req.body || {};
    if (!username) return res.status(400).json({ error: 'username required' });
    const r = await deps.setSetting('currentCashier', String(username));
    if (!r.success) return res.status(503).json(r);
    res.json(r);
  }));

  router.post('/api/settings/theme', wrap(async (req, res) => {
    const { theme } = req.body || {};
    if (!theme || !['dark', 'light'].includes(theme)) return res.status(400).json({ error: 'theme must be dark or light' });
    const r = await deps.setSetting('theme', theme);
    if (!r.success) return res.status(503).json(r);
    res.json(r);
  }));

  router.get('/api/backups', (req, res) => {
    try {
      res.json({ backups: deps.backupService.readBackupIndex().map(b => ({ name: b.name, date: b.date, size: b.size || 0, status: b.status, type: b.type, encrypted: !!b.encrypted, error: b.error || null })).reverse() });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  router.get('/api/offline-queue', (req, res) => {
    res.json({ queue: getOfflineQueue(), length: _offlineQueue.length });
  });

  router.post('/api/offline-queue/process', wrap(async (req, res) => {
    if (_offlineQueue.length === 0) return res.json({ success: true, processed: 0 });
    if (!deps.rendererReady()) return res.status(503).json({ error: 'Window not ready', code: 'SERVICE_UNAVAILABLE', status: 503 });
    const items = _offlineQueue.slice();
    _offlineQueue.length = 0;
    let processed = 0;
    const errors = [];
    for (const item of items) {
      try {
        if (item.type === 'expense') {
          const { description, amount, category, date, payee } = item.body;
          if (!validateAmount(amount)) { errors.push({ type: 'expense', error: 'Invalid amount' }); continue; }
          const amountNum = Math.round((parseFloat(amount) || 0) * 100) / 100;
          if (amountNum <= 0) { errors.push({ type: 'expense', error: 'Amount must be greater than 0' }); continue; }
          const cat = EXPENSE_CATS.includes(category) ? category : 'Other';
          await deps.rendererExec(`dbAdd('expenses', { date: ${JSON.stringify(sanitize(date) || todayStr())}, category: ${JSON.stringify(cat)}, description: ${JSON.stringify(sanitize(description))}, amount: ${amountNum}, payee: ${JSON.stringify(sanitize(payee))}, createdAt: new Date().toISOString() })`);
        } else if (item.type === 'payment') {
          const { clientId, amount, type, date } = item.body;
          if (!validateAmount(amount)) { errors.push({ type: 'payment', error: 'Invalid amount' }); continue; }
          const amtNum = Math.round((parseFloat(amount) || 0) * 100) / 100;
          if (amtNum <= 0) { errors.push({ type: 'payment', error: 'Amount must be greater than 0' }); continue; }
          const safeDate = sanitize(date) || new Date().toISOString().split('T')[0];
          await deps.rendererExec(`(async()=>{const c=await dbGet('clients',${JSON.stringify(clientId)});const balBefore=c?(c.balance||0):0;const pt=${JSON.stringify(type)}||(amtNum>=balBefore?'Full':'Partial');await dbAdd('payments',{clientId:${JSON.stringify(clientId)},amount:${amtNum},type:pt,date:${JSON.stringify(safeDate)},notes:'',createdAt:new Date().toISOString()});if(c)await dbPut('clients',{...c,balance:Math.max(0,balBefore-${amtNum})});})()`);
        } else if (item.type === 'sale') {
          const { clientId, items, paymentMethod, discount } = item.body;
          if (!items || !Array.isArray(items) || items.length === 0) { errors.push({ type: 'sale', error: 'No items' }); continue; }
          const invNos = JSON.parse(await deps.rendererExec(`JSON.stringify(state.transactions.filter(t=>t.invoiceNo?.startsWith('INV-')).map(t=>parseInt(t.invoiceNo.replace('INV-',''))||0))`));
          const nextNo = invNos.length > 0 ? Math.max(...invNos) + 1 : 1;
          const invoiceNo = 'INV-' + String(nextNo).padStart(5,'0');
          const subtotal = items.reduce((s, i) => s + ((i.qty||1) * (i.unitCost || 0)), 0);
          const totalInterest = items.reduce((s, i) => s + ((i.qty||1) * (i.unitCost || 0)) * ((i.intRate||0)/100), 0);
          const d = parseFloat(discount) || 0;
          const grandTotal = Math.max(0, subtotal + totalInterest - d);
          const clientData = clientId ? JSON.parse(await deps.rendererExec(`JSON.stringify(await dbGet('clients', ${JSON.stringify(clientId)}))`)) : null;
          const clientName = clientData ? clientData.name : 'Walk-in';
          const payMethod = paymentMethod || 'Cash';
          const txnData = JSON.stringify({ invoiceNo, clientId: clientId || null, clientName, date: todayStr(), createdAt: new Date().toISOString(), items: items.map(i => ({ ...i, amount: ((i.qty||1) * (i.unitCost || 0)) + ((i.qty||1) * (i.unitCost || 0)) * ((i.intRate||0)/100) })), subtotal, totalInterest, discount: d, scDiscount: 0, grandTotal, paymentMethod: payMethod, status: grandTotal <= 0 ? 'paid' : 'pending', balanceAdded: !!(clientId && payMethod !== 'Cash') });
          await deps.rendererExec(`dbAdd('transactions', ${txnData})`);
          for (const item of items) {
            let invId = item.invId;
            if (!invId && item.description) {
              invId = await deps.rendererExec(`(async()=>{const desc=${JSON.stringify(String(item.description).trim())};const qty=${Math.max(1,parseInt(item.qty)||1)};const unitCost=${item.unitCost||0};if(!desc)return null;const all=await dbAll('inventory');const f=all.find(i=>String(i.name||'').trim().toLowerCase()===desc.toLowerCase());if(f)return f.id;const n={name:desc,description:'',sku:'',category:'',stock:qty,minStock:5,lowStock:5,costPrice:0,sellPrice:unitCost,price:unitCost,image:null,variants:[],createdAt:new Date().toISOString()};const id=await dbAdd('inventory',n);return id;})()`);
              item.invId = invId;
            }
            if (invId) await deps.rendererExec(`(async()=>{const i=await dbGet('inventory',${JSON.stringify(invId)});if(i){i.stock=(i.stock||0)-${parseInt(item.qty)||1};const vn=${JSON.stringify(item.variantName||null)};if(vn&&i.variants){const v=i.variants.find(x=>x.name===vn);if(v)v.stock=(v.stock||0)-${parseInt(item.qty)||1};}await dbPut('inventory',i);}})()`);
          }
          if (clientId) await deps.rendererExec(`(async()=>{const c=await dbGet('clients',${JSON.stringify(clientId)});if(c && ${JSON.stringify(payMethod)} !== 'Cash'){c.balance=(c.balance||0)+${grandTotal};await dbPut('clients',c);}})()`);
        }
        processed++;
      } catch (e) { errors.push({ type: item.type, error: e.message }); }
    }
    bump({ source: 'api', kind: 'offline-process' });
    res.json({ success: true, processed, errors });
  }));

  // Counter receipt printing from a phone: reprints a sale on the desktop's
  // configured thermal printer. Cashier-allowed (counter work).
  router.post('/api/print-thermal', wrap(async (req, res) => {
    try {
      if (typeof deps.printThermal !== 'function') return res.status(503).json({ success: false, error: 'Printing not available' });
      const id = req.body && (req.body.transactionId ?? req.body.id);
      if (id === undefined || id === null || id === '') return res.status(400).json({ success: false, error: 'transactionId required' });
      const dump = await load('transactions', 'settings');
      const t = (dump.transactions || []).find(x => String(x.id) === String(id) || x.invoiceNo === String(id));
      if (!t) return res.status(404).json({ success: false, error: 'Transaction not found' });
      const s = {};
      (dump.settings || []).forEach(x => { s[x.key] = x.value; });
      if (!s.thermalHost) return res.status(400).json({ success: false, error: 'Set the Thermal Printer IP in desktop Settings first' });
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
      (t.items || []).forEach(item => {
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
      const r = await deps.printThermal({ host: s.thermalHost, port: s.thermalPort || '9100', lines });
      if (!r || !r.success) return res.status(502).json({ success: false, error: (r && r.error) || 'Print failed' });
      try { await deps.rendererExec(`(async()=>{try{await logAudit('print','Mobile reprint ' + ${JSON.stringify(t.invoiceNo || '')} + ${JSON.stringify(devTag(req))});}catch(e){}})()`); } catch (e) {}
      res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false, error: 'Print failed' }); }
  }));

  // Full sale detail (items included) for receipts and sharing. Counter-visible.
  router.get('/api/transactions/:id', wrap(async (req, res) => {
    const dump = await load('transactions');
    const t = (dump.transactions || []).find(x => String(x.id) === String(req.params.id) || x.invoiceNo === String(req.params.id));
    if (!t) return res.status(404).json({ error: 'Transaction not found' });
    res.json({
      id: t.id, invoiceNo: t.invoiceNo, clientId: t.clientId || null, clientName: t.clientName,
      paymentMethod: t.paymentMethod, date: t.date, createdAt: t.createdAt,
      grandTotal: t.grandTotal, subtotal: t.subtotal, totalInterest: t.totalInterest,
      discount: t.discount, scDiscount: t.scDiscount, status: t.status, items: t.items || []
    });
  }));

  // Void a sale: reverses stock and any added credit balance, marks voided.
  // Destroys nothing (record kept for audit). Owner-only: voids rewrite books.
  router.post('/api/void', wrap(async (req, res) => {
    const ref = req.body && (req.body.invoiceNo ?? req.body.id);
    if (ref === undefined || ref === null || String(ref).trim() === '') {
      return res.status(400).json({ error: 'invoiceNo required' });
    }
    if (!deps.rendererReady()) return res.status(503).json({ error: 'Window not ready' });
    const ok = JSON.parse(await deps.rendererExec(`JSON.stringify((async()=>{
      const list=await dbAll('transactions');
      const t=list.find(x=>x.invoiceNo===${JSON.stringify(String(ref))}||String(x.id)===${JSON.stringify(String(ref))});
      if(!t||t.status==='voided')return false;
      for(const it of (t.items||[])){
        if(it.invId){const i=await dbGet('inventory',it.invId);if(i){i.stock=(i.stock||0)+(parseInt(it.qty)||1);await dbPut('inventory',i);}}
      }
      if(t.balanceAdded&&t.clientId){const c=await dbGet('clients',t.clientId);if(c){c.balance=Math.max(0,(c.balance||0)-(t.grandTotal||0));await dbPut('clients',c);}}
      t.status='voided';t.voidedAt=new Date().toISOString();
      await dbPut('transactions',t);return t.invoiceNo||true;
    })())`));
    if (!ok) return res.status(404).json({ error: 'Sale not found or already voided' });
    try { await deps.rendererExec(`(async()=>{try{await logAudit('sale-void','Mobile void ' + ${JSON.stringify(String(ref))} + ${JSON.stringify(devTag(req))});}catch(e){}})()`); } catch (e) {}
    deps.notify({ source: 'api', kind: 'void' });
    res.json({ success: true });
  }));

  // Payment edit/delete with balance rebalancing. Owner-only (money records).
  router.put('/api/payments/:id', wrap(async (req, res) => {
    const amt = parseFloat(req.body && req.body.amount);
    if (!validateAmount(amt) || amt <= 0) return res.status(400).json({ error: 'Valid amount required' });
    if (!deps.rendererReady()) return res.status(503).json({ error: 'Window not ready' });
    const ok = JSON.parse(await deps.rendererExec(`JSON.stringify((async()=>{
      const p=await dbGet('payments',${JSON.stringify(req.params.id)});
      if(!p)return false;
      const diff=${Math.round(amt * 100) / 100}-(p.amount||0);
      p.amount=${Math.round(amt * 100) / 100};
      await dbPut('payments',p);
      if(p.clientId){const c=await dbGet('clients',p.clientId);if(c){c.balance=Math.max(0,(c.balance||0)-diff);await dbPut('clients',c);}}
      return true;
    })())`));
    if (!ok) return res.status(404).json({ error: 'Payment not found' });
    try { await deps.rendererExec(`(async()=>{try{await logAudit('payment','Mobile payment edit' + ${JSON.stringify(devTag(req))});}catch(e){}})()`); } catch (e) {}
    deps.notify({ source: 'api', kind: 'payment' });
    res.json({ success: true });
  }));

  router.delete('/api/payments/:id', wrap(async (req, res) => {
    if (!deps.rendererReady()) return res.status(503).json({ error: 'Window not ready' });
    const ok = JSON.parse(await deps.rendererExec(`JSON.stringify((async()=>{
      const p=await dbGet('payments',${JSON.stringify(req.params.id)});
      if(!p)return false;
      await dbDel('payments',p.id);
      if(p.clientId){const c=await dbGet('clients',p.clientId);if(c){c.balance=(c.balance||0)+(p.amount||0);await dbPut('clients',c);}}
      return true;
    })())`));
    if (!ok) return res.status(404).json({ error: 'Payment not found' });
    try { await deps.rendererExec(`(async()=>{try{await logAudit('payment','Mobile payment delete' + ${JSON.stringify(devTag(req))});}catch(e){}})()`); } catch (e) {}
    deps.notify({ source: 'api', kind: 'payment' });
    res.json({ success: true });
  }));
  // restocks the items and reverses a credit balance. Money-out, so the role
  // gate above keeps cashier phones out. Partial lines are validated against
  // what is still returnable (original minus earlier returns).
  router.post('/api/returns', wrap(async (req, res) => {
    const ref = req.body && (req.body.invoiceNo ?? req.body.id);
    if (ref === undefined || ref === null || String(ref).trim() === '') {
      return res.status(400).json({ error: 'invoiceNo required' });
    }
    const wantItems = req.body && req.body.items;
    if (wantItems !== undefined) {
      if (!Array.isArray(wantItems) || !wantItems.length || wantItems.length > 100) {
        return res.status(400).json({ error: 'items must be a non-empty list (max 100)' });
      }
      for (const li of wantItems) {
        const q = parseInt(li && li.qty, 10);
        if (!li || (!li.invId && !li.description) || isNaN(q) || q < 1) {
          return res.status(400).json({ error: 'each line needs an item and qty ≥ 1' });
        }
      }
    }
    if (!deps.rendererReady()) return res.status(503).json({ error: 'Window not ready' });
    const orig = JSON.parse(await deps.rendererExec(`JSON.stringify((await dbAll('transactions')).find(t => t.invoiceNo === ${JSON.stringify(String(ref))} || String(t.id) === ${JSON.stringify(String(ref))}) || null)`));
    if (!orig) return res.status(404).json({ error: 'Original sale not found' });
    if (!Array.isArray(orig.items) || !orig.items.length) return res.status(400).json({ error: 'Original sale has no item lines' });
    const prior = JSON.parse(await deps.rendererExec(`JSON.stringify((await dbAll('transactions')).filter(t => t.status === 'return' && (${JSON.stringify(orig.id)} !== null && t.refId === ${JSON.stringify(orig.id)} || t.refInvoiceNo === ${JSON.stringify(orig.invoiceNo || '')})))`)) || [];
    const keyOf = (i) => (i.invId !== undefined && i.invId !== null && i.invId !== '' ? 'id:' + i.invId : 'nm:' + String(i.description || i.name || '').trim().toLowerCase());
    const remaining = {};
    for (const i of orig.items) {
      const k = keyOf(i);
      remaining[k] = remaining[k] || { item: i, left: 0 };
      remaining[k].left += parseInt(i.qty) || 1;
    }
    for (const r of prior) {
      for (const i of (r.items || [])) {
        const k = keyOf(i);
        if (remaining[k]) remaining[k].left -= Math.abs(parseInt(i.qty) || 0);
      }
    }
    let requested = [];
    if (wantItems && wantItems.length) {
      for (const li of wantItems) {
        const probe = { invId: li.invId ?? null, description: li.description || '', name: li.description || '' };
        const k = keyOf(probe);
        const slot = remaining[k];
        const q = parseInt(li.qty, 10);
        if (!slot || slot.left < q) {
          return res.status(400).json({ error: 'Cannot return that much: ' + (probe.description || ('#' + probe.invId)) });
        }
        slot.left -= q;
        requested.push({ ...slot.item, qty: q });
      }
    } else {
      for (const k of Object.keys(remaining)) {
        if (remaining[k].left > 0) requested.push({ ...remaining[k].item, qty: remaining[k].left });
      }
      if (!requested.length) return res.status(400).json({ error: 'That sale was already fully returned' });
    }
    _invoiceMutex = _invoiceMutex.then(async () => {
      const invNos = JSON.parse(await deps.rendererExec(`JSON.stringify(state.transactions.filter(t=>t.invoiceNo?.startsWith('INV-')).map(t=>parseInt(t.invoiceNo.replace('INV-',''))||0))`));
      const nextNo = invNos.length > 0 ? Math.max(...invNos) + 1 : 1;
      const invoiceNo = 'INV-' + String(nextNo).padStart(5, '0');
      // Line amounts already carry per-line interest (as stored by /api/sales);
      // discounts are prorated so a full return refunds exactly grandTotal.
      const unitOf = (line) => {
        const q = parseInt(line.qty) || 1;
        const a = parseFloat(line.amount);
        if (a) return a / q;
        return parseFloat(line.unitCost || line.price) || 0;
      };
      const origSub = (orig.items || []).reduce((s, i) => s + ((parseInt(i.qty) || 1) * unitOf(i)), 0);
      let retSub = 0;
      const items = requested.map(r => {
        const unit = unitOf(r);
        const amt = (parseInt(r.qty) || 1) * unit;
        retSub += amt;
        return { ...r, qty: -(parseInt(r.qty) || 1), amount: -amt };
      });
      const discShare = origSub > 0 ? (parseFloat(orig.discount) || 0) * (retSub / origSub) : 0;
      const grandTotal = -(Math.max(0, retSub - discShare));
      const absTotal = Math.abs(grandTotal);
      const partial = requested.length !== (orig.items || []).length || (orig.items || []).some(i => {
        const k = keyOf(i);
        return (remaining[k] ? remaining[k].left : 0) > 0;
      });
      const txnData = JSON.stringify({ invoiceNo, clientId: orig.clientId || null, clientName: orig.clientName || 'Walk-in', date: todayStr(), createdAt: new Date().toISOString(), items, subtotal: -retSub, totalInterest: 0, discount: 0, scDiscount: 0, grandTotal, paymentMethod: orig.paymentMethod || 'Cash', status: 'return', refId: orig.id || null, refInvoiceNo: orig.invoiceNo || null, partial: !!partial });
      await deps.rendererExec(`dbAdd('transactions', ${txnData})`);
      for (const item of items) {
        if (item.invId) await deps.rendererExec(`(async()=>{const i=await dbGet('inventory',${JSON.stringify(item.invId)});if(i){i.stock=(i.stock||0)+${Math.abs(parseInt(item.qty) || 1)};await dbPut('inventory',i);}})()`);
      }
      if (orig.clientId) await deps.rendererExec(`(async()=>{const c=await dbGet('clients',${JSON.stringify(orig.clientId)});if(c && ${JSON.stringify(orig.paymentMethod || 'Cash')} !== 'Cash'){c.balance=Math.max(0,(c.balance||0)-${absTotal});await dbPut('clients',c);}})()`);
      await deps.rendererExec(`(async()=>{try{await logAudit('return','Mobile return ' + ${JSON.stringify(orig.invoiceNo || '')} + ' → ' + ${JSON.stringify(invoiceNo)} + ' - ₱' + ${absTotal}.toFixed(2) + ${partial ? ' (partial)' : ''} + ${JSON.stringify(devTag(req))});}catch(e){}})()`);
      bump({ source: 'api', kind: 'return' });
      return { success: true, invoiceNo };
    });
    await _invoiceMutex;
    res.json(_invoiceMutex.__result || { success: true });
  }));

  // Product photo from a phone camera. Owner-only (catalog data); images are
  // downscaled on the phone before upload, capped again here.
  router.post('/api/inventory/:id/photo', wrap(async (req, res) => {
    const img = req.body && req.body.image;
    if (typeof img !== 'string' || !img.startsWith('data:image/') || img.length > 700000) {
      return res.status(400).json({ error: 'Photo must be an image data URL under ~700KB' });
    }
    if (!deps.rendererReady()) return res.status(503).json({ error: 'Window not ready' });
    const saved = JSON.parse(await deps.rendererExec(`JSON.stringify((async()=>{const i=await dbGet('inventory',${JSON.stringify(req.params.id)});if(!i)return null;i.image=${JSON.stringify(img)};i.updatedAt=new Date().toISOString();await dbPut('inventory',i);return {name:i.name};})())`));
    if (!saved) return res.status(404).json({ error: 'Item not found' });
    try { await deps.rendererExec(`(async()=>{try{await logAudit('inventory','Photo updated: ' + ${JSON.stringify(saved.name || '')} + ${JSON.stringify(devTag(req))});}catch(e){}})()`); } catch (e) {}
    bump({ source: 'api', kind: 'inventory-photo' });
    res.json({ success: true });
  }));

  router.post('/api/auth/verify', wrap(async (req, res) => {
    const { token } = req.body;
    let valid = false;
    try {
      if (typeof deps.verifyToken === 'function') valid = !!(deps.verifyToken(token) || {}).ok;
      else valid = !!token && token === deps.lanToken;
    } catch (e) { valid = false; }
    if (!valid) {
      return res.json({ valid: false });
    }
    const dump = await load('settings');
    const s = {};
    (dump.settings || []).forEach(x => { s[x.key] = x.value; });
    res.json({ valid: true, shopName: s.shopName || 'My Sari-Sari Store' });
  }));

  // Overdue SMS reminders via the desktop's configured gateway (costs apply
  // per message — owner-only). Runs the same routine as Settings → Reminders.
  router.post('/api/sms-reminders', wrap(async (req, res) => {
    if (!deps.rendererReady()) return res.status(503).json({ error: 'Window not ready' });
    if (typeof deps.sendRemindersNow !== 'function') return res.status(503).json({ error: 'SMS not available' });
    const r = await deps.sendRemindersNow();
    if (r && r.error) return res.status(400).json({ success: false, error: r.error });
    res.json({ success: true, sent: (r && r.sent) || 0, failed: (r && r.failed) || 0, total: (r && r.total) || 0 });
  }));

  // Quick-sale presets for the phone counter screen. Read-only list.
  router.get('/api/quick-items', wrap(async (req, res) => {
    const dump = await load('quickItems');
    res.json((dump.quickItems || []).map(q => ({ id: q.id, name: q.name, price: q.price, invId: q.invId || null })));
  }));

  router.get('/api/access-control', (req, res) => {
    res.json(getAccessControl());
  });

  router.post('/api/access-control/whitelist', (req, res) => {
    const { action, ip } = req.body;
    if (!ip) return res.status(400).json({ error: 'IP required' });
    if (action === 'add') {
      addToWhitelist(ip);
    } else if (action === 'remove') {
      removeFromWhitelist(ip);
    } else {
      return res.status(400).json({ error: 'Action must be add or remove' });
    }
    res.json(getAccessControl());
  });

  router.post('/api/access-control/blacklist', (req, res) => {
    const { action, ip } = req.body;
    if (!ip) return res.status(400).json({ error: 'IP required' });
    if (action === 'add') {
      addToBlacklist(ip);
    } else if (action === 'remove') {
      removeFromBlacklist(ip);
    } else {
      return res.status(400).json({ error: 'Action must be add or remove' });
    }
    res.json(getAccessControl());
  });

  return router;
}

module.exports = { createLanApiRouter, getOfflineQueue, clearOfflineQueue, getAccessControl, addToWhitelist, removeFromWhitelist, addToBlacklist, removeFromBlacklist };
