// LAN / mobile HTTP API as an express Router, backed directly by SQLite (db.js).
// Read endpoints load store rows from the database without touching the renderer, so the
// server keeps working with the window closed. The renderer dump is only a fallback when
// the native module is unavailable, and write endpoints still delegate business logic
// (invoice numbering, audit logs, stock) to the renderer via rendererExec.
const express = require('express');

const EXPENSE_CATS = ['Purchases','Utilities','Rent','Supplies','Transportation','Salaries','Marketing','Maintenance','Food','Other'];

function createLanApiRouter(deps) {
  const router = express.Router();

  const active = (t) => t.status !== 'voided' && t.status !== 'interest';
  const dayTotal = (arr, f) => arr.filter(f).reduce((s, x) => s + (x.amount || x.grandTotal || 0), 0);
  const todayStr = () => new Date().toISOString().split('T')[0];

  // Rows for the named stores: straight from SQLite, or from the renderer dump as a fallback.
  async function load(...names) {
    const info = deps.db.init(deps.userDataPath());
    if (info && info.ok) {
      const out = {};
      for (const n of names) out[n] = deps.db.all(n);
      return out;
    }
    if (!deps.rendererReady()) throw Object.assign(new Error('Window not ready'), { status: 503 });
    const dump = await deps.getRendererDump();
    const out = {};
    for (const n of names) out[n] = dump[n] || [];
    return out;
  }

  function wrap(fn) {
    return (req, res) => fn(req, res).catch((err) => {
      res.status(err && err.status === 503 ? 503 : 500).json({ error: err.message });
    });
  }

  router.get('/api/clients', wrap(async (req, res) => {
    res.json((await load('clients')).clients);
  }));

  router.get('/api/inventory', wrap(async (req, res) => {
    const dump = await load('inventory');
    res.json((dump.inventory || []).map(i => ({
      id: i.id, name: i.name, price: parseFloat(i.sellPrice || i.price || 0) || 0,
      stock: i.stock || 0, lowStock: i.lowStock ?? i.minStock ?? 5, image: i.image || null,
      variants: i.variants || [], createdAt: i.createdAt
    })).sort((a, b) => (a.name || '').localeCompare(b.name || '')));
  }));

  router.get('/api/transactions', wrap(async (req, res) => {
    const dump = await load('transactions');
    const limit = Math.min(parseInt(req.query.limit) || 200, 500);
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
    res.json({
      clients: (dump.clients || []).length,
      inventory: (dump.inventory || []).length,
      totalUtang, lowStockCount: lowStock.length,
      todaySales, todayExpenses: todayExpTotal, todayCollected: todayPayTotal,
      todayProfit: todaySales - todayExpTotal,
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
    if (!deps.rendererReady()) return res.status(503).json({ error: 'Window not ready' });
    const { description, amount, category, date, payee } = req.body;
    const amountNum = parseFloat(amount) || 0;
    if (amountNum <= 0) return res.status(400).json({ error: 'Valid amount required' });
    const cat = EXPENSE_CATS.includes(category) ? category : 'Other';
    await deps.rendererExec(`
      (async () => {
        await dbAdd('expenses', { date: ${JSON.stringify(date || todayStr())}, category: ${JSON.stringify(cat)}, description: ${JSON.stringify(String(description || '').trim())}, amount: ${amountNum}, payee: ${JSON.stringify(String(payee || '').trim())}, createdAt: new Date().toISOString() });
        try { await logAudit('expense-add', ${JSON.stringify(cat)} + ': ₱' + ${amountNum}.toFixed(2) + ' - ' + ${JSON.stringify(String(description || '').trim())}); } catch (e) {}
      })()
    `);
    deps.notify({ source: 'api', kind: 'expense' });
    res.json({ success: true });
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

  router.get('/api/purchase-orders', wrap(async (req, res) => {
    const dump = await load('purchaseOrders');
    const list = (dump.purchaseOrders || [])
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
    try { await deps.rendererExec(`logAudit('po', 'PO ${poNo} created from ${supplierName} (mobile)')`); } catch (e) {}
    deps.notify({ source: 'api', kind: 'po' });
    res.json({ success: true, poNo });
  }));

  router.get('/api/reports', wrap(async (req, res) => {
    const dump = await load('transactions', 'expenses', 'payments');
    const tStr = todayStr();
    const todaySales = (dump.transactions || []).filter(t => active(t) && t.date === tStr).reduce((s, t) => s + (t.grandTotal || 0), 0);
    const todayExp = dayTotal(dump.expenses || [], e => e.date === tStr);
    const todayPay = dayTotal(dump.payments || [], p => p.date === tStr);
    const monthSales = (dump.transactions || []).filter(t => active(t) && (t.date || '').startsWith(tStr.slice(0, 7))).reduce((s, t) => s + (t.grandTotal || 0), 0);
    const monthExp = dayTotal(dump.expenses || [], e => (e.date || '').startsWith(tStr.slice(0, 7)));
    const monthPay = dayTotal(dump.payments || [], p => (p.date || '').startsWith(tStr.slice(0, 7)));
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
    for (let i = 6; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000).toISOString().split('T')[0];
      week.push({
        date: d,
        sales: (dump.transactions || []).filter(t => active(t) && t.date === d).reduce((s, t) => s + (t.grandTotal || 0), 0),
        expenses: dayTotal(dump.expenses || [], e => e.date === d)
      });
    }
    res.json({
      today: { sales: todaySales, expenses: todayExp, collected: todayPay, profit: todaySales - todayExp },
      month: { sales: monthSales, expenses: monthExp, collected: monthPay, profit: monthSales - monthExp },
      topItems: Object.values(topItems).sort((a, b) => b.amount - a.amount).slice(0, 5),
      week
    });
  }));

  router.get('/api/settings', wrap(async (req, res) => {
    const dump = await load('settings');
    const s = {};
    (dump.settings || []).forEach(x => { s[x.key] = x.value; });
    res.json({ shopName: s.shopName || 'My Sari-Sari Store', shopContact: s.shopContact || '', shopAddress: s.shopAddress || '', currency: s.currency || '₱' });
  }));

  router.post('/api/payments', wrap(async (req, res) => {
    if (!deps.rendererReady()) return res.status(503).json({ error: 'Window not ready' });
    const { clientId, amount, type, date } = req.body;
    const amtNum = parseFloat(amount) || 0;
    const cId = JSON.stringify(clientId);
    const amt = JSON.stringify(amtNum);
    const payType = JSON.stringify(amtNum > 0 ? (type === 'Full' || type === 'Partial' ? type : null) : null);
    await deps.rendererExec(`
      (async () => {
        const c = await dbGet('clients', ${cId});
        const balBefore = c ? (c.balance || 0) : 0;
        const pt = ${payType} || (${amt} >= balBefore ? 'Full' : 'Partial');
        await dbAdd('payments', { clientId: ${cId}, amount: ${amt}, type: pt, date: ${JSON.stringify(date || new Date().toISOString().split('T')[0])}, notes: ${JSON.stringify('')}, createdAt: new Date().toISOString() });
        if (c) await dbPut('clients', { ...c, balance: Math.max(0, balBefore - ${amt}) });
        try { await logAudit('payment', 'Mobile payment ' + (c ? c.name : 'client') + ' - ₱' + ${amt}.toFixed(2)); } catch (e) {}
        return { success: true };
      })()
    `);
    deps.notify({ source: 'api', kind: 'payment' });
    res.json({ success: true });
  }));

  router.post('/api/sales', wrap(async (req, res) => {
    if (!deps.rendererReady()) return res.status(503).json({ error: 'Window not ready' });
    const { clientId, items, paymentMethod, discount } = req.body;
    if (!items || !items.length) return res.status(400).json({ error: 'No items' });
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
    await deps.rendererExec(`(async()=>{try{await logAudit('sale','Mobile sale ${invoiceNo} - ₱${grandTotal.toFixed(2)}');}catch(e){}})()`);
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
          try { await logAudit('inventory', 'Auto-created from sale: ' + desc); } catch (e) {}
          return id;
        })()`);
        item.invId = invId;
      }
      if (invId) await deps.rendererExec(`(async()=>{const i=await dbGet('inventory',${JSON.stringify(invId)});if(i){i.stock=(i.stock||0)-${parseInt(item.qty)||1};const vn=${JSON.stringify(item.variantName || null)};if(vn&&i.variants){const v=i.variants.find(x=>x.name===vn);if(v)v.stock=(v.stock||0)-${parseInt(item.qty)||1};}await dbPut('inventory',i);}})()`);
    }
    if (clientId) await deps.rendererExec(`(async()=>{const c=await dbGet('clients',${JSON.stringify(clientId)});if(c && ${JSON.stringify(payMethod)} !== 'Cash'){c.balance=(c.balance||0)+${grandTotal};await dbPut('clients',c);}})()`);
    deps.notify({ source: 'api', kind: 'sale' });
    res.json({ success: true, invoiceNo });
  }));

  router.get('/api/sqlite-status', (req, res) => {
    try {
      const s = deps.db.init(deps.userDataPath());
      res.json({ ok: !!s.ok, backend: s.ok ? 'sqlite' : 'indexeddb', path: s.path || null, size: s.size || 0, stores: s.stores || 0, needMigration: s.ok ? !!s.needMigration : false, error: s.error || null });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  router.post('/api/sqlite/enable', (req, res) => {
    try {
      const s = deps.db.init(deps.userDataPath());
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

  return router;
}

module.exports = { createLanApiRouter };
