// Smoke test for the LAN/mobile API router (src/main/lanApi.js):
// every read endpoint must serve from SQLite with no renderer available
// (rendererReady=false proves the window is no longer required).
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const { registerDbIpc, closeDb } = require('../src/main/db.js');
const { createLanApiRouter, lineInterest } = require('../src/main/lanApi.js');
const express = require('express');

let passed = 0, failed = 0;
const ok = (cond, name) => { if (cond) { passed++; console.log('  ok ' + name); } else { failed++; console.error('  FAIL ' + name); } };

const userData = mkdtempSync(join(tmpdir(), 'slp-lanapi-smoke-'));
const handlers = new Map();
registerDbIpc({ handle: (name, fn) => handlers.set(name, fn) }, userData);
const invoke = (name, arg) => handlers.get(name)({}, arg);
await invoke('db-open');

// Local calendar date — must match lanApi's local todayStr() exactly, even at
// hours where UTC and PH dates differ (00:00-07:59 local).
const _d = new Date();
const TODAY = _d.getFullYear() + '-' + String(_d.getMonth() + 1).padStart(2, '0') + '-' + String(_d.getDate()).padStart(2, '0');
const _m = new Date(_d.getTime() - 30 * 86400000);
const MONTH_AGO = _m.getFullYear() + '-' + String(_m.getMonth() + 1).padStart(2, '0') + '-' + String(_m.getDate()).padStart(2, '0');
ok(lineInterest(30, 10, TODAY, TODAY) === 0.1, 'LAN sale interest is monthly-prorated (same day)');
ok(lineInterest(100, 10, MONTH_AGO, TODAY) === 10, 'LAN sale interest prorates over 30 days');
ok(lineInterest(100, 0, MONTH_AGO, TODAY) === 0, 'LAN sale interest ignores zero rate');
await invoke('db-migrate', { dump: {
  clients: [{ id: 1, name: 'Aling Nena', balance: 125.5 }, { id: 2, name: 'Mang Jose', balance: 10 }],
  inventory: [{ id: 1, name: 'Coke', stock: 3, lowStock: 5, sellPrice: 30, createdAt: '2026-01-01' }, { id: 2, name: 'Bread', stock: 10, lowStock: 2, price: 25, createdAt: '2026-01-01' }],
  transactions: [
    { id: 1, invoiceNo: 'INV-00001', clientId: 1, clientName: 'Aling Nena', date: TODAY, createdAt: TODAY + 'T10:00:00.000Z', status: 'paid', paymentMethod: 'Cash', grandTotal: 100, subtotal: 100, totalInterest: 0, discount: 0, scDiscount: 0, items: [{ description: 'Coke', qty: 1, unitCost: 30, amount: 30 }] },
    { id: 2, invoiceNo: 'INV-00002', clientName: 'Walk-in', date: TODAY, createdAt: TODAY + 'T11:00:00.000Z', status: 'pending', paymentMethod: 'GCash', grandTotal: 50, subtotal: 50, totalInterest: 0, discount: 0, scDiscount: 0, items: [{ description: 'Bread', qty: 5, unitCost: 20, amount: 100 }, { description: 'Water', qty: 1, unitCost: 10, amount: 10 }] },
    { id: 3, invoiceNo: 'INV-00003', clientName: 'X', date: '2026-01-01', createdAt: '2026-01-01T00:00:00.000Z', status: 'voided', paymentMethod: 'Cash', grandTotal: 999, subtotal: 999, totalInterest: 0, discount: 0, scDiscount: 0, items: [] },
    { id: 4, invoiceNo: 'INV-00004-R', clientName: 'Aling Nena', date: TODAY, createdAt: TODAY + 'T12:00:00.000Z', status: 'return', paymentMethod: 'Cash', grandTotal: -30, subtotal: -30, totalInterest: 0, discount: 0, scDiscount: 0, refId: 1, items: [{ description: 'Coke', qty: -1, unitCost: 30, amount: -30 }] }
  ],
  expenses: [{ id: 1, date: TODAY, category: 'Rent', description: 'rent', amount: 20, payee: 'X', createdAt: TODAY + 'T09:00:00.000Z' }],
  payments: [{ id: 1, date: TODAY, amount: 30, clientId: 1, createdAt: TODAY + 'T09:30:00.000Z' }],
  suppliers: [{ id: 1, name: 'Nena Supply', contact: '0917' }],
  supplierPayments: [{ id: 1, supplierId: 1, amount: 100 }],
  purchaseOrders: [{ id: 1, supplierId: 1, supplierName: 'Nena Supply', poNo: 'PO-00001', date: TODAY, items: [{ name: 'Box', price: 100, qty: 5 }], total: 500, status: 'Pending', createdAt: TODAY + 'T08:00:00.000Z' }],
  settings: [{ id: 1, key: 'shopName', value: 'Nena Store' }, { id: 2, key: 'currency', value: '₱' }, { id: 3, key: 'thermalHost', value: '127.0.0.1' }]
} });

const setCalls = [];
const printedThermal = [];
const router = createLanApiRouter({
  db: require('../src/main/db.js'),
  userDataPath: () => userData,
  rendererReady: () => false,
  getRendererDump: () => { throw new Error('getRendererDump must not be called on the SQLite path'); },
  rendererExec: () => { throw new Error('rendererExec must not be called on the SQLite path'); },
  setSetting: async (key, value) => { setCalls.push([key, value]); return { success: true }; },
  lanToken: 'test-token-123',
  wsPort: 3458,
  redeemPairCode: (code) => String(code || '') === '123456'
    ? { ok: true, token: 'test-token-123', wsPort: 3458 }
    : { ok: false, error: 'Wrong code' },
  redeemClaim: (claim) => String(claim || '') === 'claim-abc'
    ? { ok: true, token: 'dev_phone-1', deviceId: 'dev-1', name: 'Smoke', wsPort: 3458 }
    : { ok: false, error: 'Invalid or expired QR code' },
  verifyToken: (t) => t === 'test-token-123'
    ? { ok: true, master: true, device: null }
    : (t === 'dev_phone-1'
      ? { ok: true, master: false, device: { id: 'dev-1', name: 'Smoke', role: 'owner' } }
      : (t === 'dev_cash-1'
        ? { ok: true, master: false, device: { id: 'dev-2', name: 'Cash', role: 'cashier' } }
        : { ok: false })),
  onDevicesChanged: () => {},
  printThermal: async ({ host, port, lines }) => { printedThermal.push({ host, port, lines }); return { success: true }; },
  backupService: { readBackupIndex: () => [{ name: 'backup-1.bak', date: TODAY, size: 100, status: 'ok', type: 'snapshot', encrypted: false }] },
  notify: () => {}
});

// The read router above asserts rendererExec is never called (reads must come from
// SQLite). The write router below is the mirror image: a live renderer, backed by a
// vm sandbox with real in-memory stores, so the actual sale scripts execute.
const vm = require('node:vm');
const rstores = {};
const rid = (store) => { if (!rstores[store]) rstores[store] = []; return rstores[store]; };
let rId = 1000;
const rendererFaults = { on: false, step: '', afterN: 1, seen: 0 };
const clone = (v) => (v == null ? v : structuredClone(v));
const rAudits = [];
const rctx = {
  state: { transactions: [] },
  logAudit: async (action, details) => { rAudits.push({ action, details }); },
  // IndexedDB hands out structured clones, never live references: the scripts
  // mutate their own copy and persist it with dbPut, so the fake must too.
  dbAll: async (s) => rid(s).map(clone),
  dbGet: async (s, id) => clone(rid(s).find(x => String(x.id) === String(id)) || null),
  dbAdd: async (s, o) => {
    const rec = { ...clone(o), id: o.id != null ? o.id : ++rId };
    rid(s).push(rec);
    if (s === 'transactions') rctx.state.transactions.push(clone(rec));
    return rec.id;
  },
  dbPut: async (s, o) => {
    if (rendererFaults.on && rendererFaults.step === 'dbPut:' + s) {
      rendererFaults.seen++;
      if (rendererFaults.seen >= rendererFaults.afterN) { rendererFaults.on = false; throw new Error('induced ' + s + ' failure'); }
    }
    const arr = rid(s);
    const i = arr.findIndex(x => String(x.id) === String(o.id));
    if (i >= 0) arr[i] = clone(o); else arr.push(clone(o));
    if (s === 'transactions') {
      const j = rctx.state.transactions.findIndex(x => String(x.id) === String(o.id));
      if (j >= 0) rctx.state.transactions[j] = clone(o);
    }
    return o.id;
  },
  dbDel: async (s, id) => {
    const arr = rid(s);
    const i = arr.findIndex(x => String(x.id) === String(id));
    if (i >= 0) arr.splice(i, 1);
    if (s === 'transactions') {
      const j = rctx.state.transactions.findIndex(x => String(x.id) === String(id));
      if (j >= 0) rctx.state.transactions.splice(j, 1);
    }
  }
};
vm.createContext(rctx);
const writeRouter = createLanApiRouter({
  db: require('../src/main/db.js'),
  userDataPath: () => userData,
  rendererReady: () => true,
  getRendererDump: () => { throw new Error('getRendererDump must not be called on the SQLite path'); },
  // Electron's executeJavaScript allows top-level await; plain vm scripts do not.
  // Retry only those (a SyntaxError) inside an async IIFE so production semantics
  // — where `JSON.stringify(await dbGet(...))` is a valid script — are reproduced.
  rendererExec: (js) => {
    try { return vm.runInContext(js, rctx); }
    catch (e) {
      // (vm SyntaxErrors come from another realm, so match on name, not instanceof)
      if (!(e && e.name === 'SyntaxError')) throw e;
      return vm.runInContext('(async () => (' + js + '))()', rctx);
    }
  },
  setSetting: async () => ({ success: true }),
  lanToken: 'test-token-123',
  wsPort: 3458,
  verifyToken: (t) => (t === 'test-token-123' ? { ok: true, master: true, device: null } : { ok: false }),
  notify: () => {}
});

const app = express();
app.use(express.json());
app.use('/w', writeRouter);
app.use(router);
const server = app.listen(0, '127.0.0.1', async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const json = async (p, opts) => {
      const r = await fetch(base + p + (p.includes('?') ? '&' : '?') + 'token=test-token-123', opts);
      return { status: r.status, body: await r.json() };
    };

    // auth enforced
    const unauth = await fetch(base + '/api/clients');
    ok(unauth.status === 401, 'GET /api/clients without token is rejected (401)');

    // device pairing (no token needed)
    const pr = await json('/api/pair', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: '123456' }) });
    ok(pr.status === 200 && pr.body.success === true && pr.body.token === 'test-token-123' && pr.body.wsPort === 3458, 'POST /api/pair redeems a valid code for the token');
    const prBad = await json('/api/pair', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: '000000' }) });
    ok(prBad.status === 401 && prBad.body.success === false, 'POST /api/pair rejects a wrong code (401)');

    // QR-claim pairing (no token needed)
    const cl = await json('/api/claim', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ claim: 'claim-abc', name: 'Smoke' }) });
    ok(cl.status === 200 && cl.body.success === true && cl.body.token === 'dev_phone-1' && cl.body.deviceId === 'dev-1', 'POST /api/claim redeems a claim for a device token');
    const clBad = await json('/api/claim', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ claim: 'nope' }) });
    ok(clBad.status === 401 && clBad.body.success === false, 'POST /api/claim rejects a bad claim (401)');

    // per-device token auth
    const dev = await fetch(base + '/api/clients?token=dev_phone-1');
    ok(dev.status === 200, 'device token authorizes API access');
    const bogus = await fetch(base + '/api/clients?token=dev_unknown');
    ok(bogus.status === 401, 'unknown device token is rejected (401)');

    // cashier role gate: counter reads pass, sensitive areas 403
    const cashInv = await fetch(base + '/api/inventory?token=dev_cash-1');
    ok(cashInv.status === 200, 'cashier can read inventory');
    for (const p of ['/api/reports', '/api/expenses', '/api/stats', '/api/audit', '/api/settings/api-key', '/api/suppliers', '/api/purchase-orders', '/api/suppliers/1/payments']) {
      const r = await fetch(base + p + '?token=dev_cash-1');
      ok(r.status === 403, 'cashier blocked from ' + p + ' (403)');
    }
    const cashPO = await fetch(base + '/api/purchase-orders?token=dev_cash-1', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    ok(cashPO.status === 403, 'cashier blocked from creating purchase orders (403)');
    const cashSP = await fetch(base + '/api/supplier-payments?token=dev_cash-1', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    ok(cashSP.status === 403, 'cashier blocked from supplier payments (403)');

    // activity log (empty fixture, contract shape)
    const au = await json('/api/audit?limit=5');
    ok(au.status === 200 && Array.isArray(au.body), 'GET /api/audit serves a list');

    // clients: validation first, renderer needed for writes
    const cliBad = await json('/api/clients', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    ok(cliBad.status === 400, 'POST /api/clients requires a name (400)');
    const cliPost = await json('/api/clients', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Tet' }) });
    ok(cliPost.status === 503, 'POST /api/clients requires the renderer (503 in harness)');
    const cliPut = await json('/api/clients/1', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Aling Nena!' }) });
    ok(cliPut.status === 503, 'PUT /api/clients/:id requires the renderer (503 in harness)');
    const cliH404 = await json('/api/clients/999/history');
    ok(cliH404.status === 404, 'GET /api/clients/:id/history 404s cleanly');
    const cliH = await json('/api/clients/1/history');
    ok(cliH.status === 200 && cliH.body.client && cliH.body.client.name === 'Aling Nena' && Array.isArray(cliH.body.sales) && Array.isArray(cliH.body.payments), 'GET /api/clients/:id/history serves profile + sales + payments');
    ok(cliH.body.sales.some(s => Array.isArray(s.items) && s.items.length > 0 && s.items[0].description === 'Coke'), 'GET /api/clients/:id/history includes purchased items');
    const cliRedeem = await json('/api/clients/1/redeem', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    ok(cliRedeem.status === 503, 'POST /api/clients/:id/redeem requires the renderer (503 in harness)');

    // inventory valuation + item add/edit (dup checks run without renderer)
    const val = await json('/api/inventory/valuation');
    ok(val.status === 200 && typeof val.body.costValue === 'number' && typeof val.body.retailValue === 'number', 'GET /api/inventory/valuation serves cost/retail totals');
    const valCash = await fetch(base + '/api/inventory/valuation?token=dev_cash-1');
    ok(valCash.status === 403, 'cashier blocked from valuation (403)');
    const invBad = await json('/api/inventory', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    ok(invBad.status === 400, 'POST /api/inventory requires a name (400)');
    const invDup = await json('/api/inventory', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Coke' }) });
    ok(invDup.status === 400, 'POST /api/inventory rejects duplicate names (400)');
    const invPut404 = await json('/api/inventory/999', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Ghost' }) });
    ok(invPut404.status === 404, 'PUT /api/inventory/:id 404s cleanly');

    // dataset version for the refresh diet
    const ver = await json('/api/version');
    ok(ver.status === 200 && typeof ver.body.v === 'number', 'GET /api/version serves a revision number');

    // phone diagnostics: validation, store, role-gated reads
    const dgBad = await json('/api/mobile-diag', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    ok(dgBad.status === 400, 'POST /api/mobile-diag requires entries (400)');
    const dg = await json('/api/mobile-diag', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ entries: [{ at: 't', kind: 'js-error', message: 'boom' }] }) });
    ok(dg.status === 200 && dg.body.success === true, 'POST /api/mobile-diag stores entries');
    const dgGet = await json('/api/mobile-diag');
    ok(dgGet.status === 200 && Array.isArray(dgGet.body), 'GET /api/mobile-diag serves stored entries');
    const dgCash = await fetch(base + '/api/mobile-diag?token=dev_cash-1');
    ok(dgCash.status === 403, 'cashier blocked from reading diagnostics (403)');
    const dgCashPost = await fetch(base + '/api/mobile-diag?token=dev_cash-1', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ entries: [{ message: 'x' }] }) });
    ok(dgCashPost.status === 200, 'cashier phones can still send diagnostics');

    // monthly reports parameter
    const repM = await json('/api/reports?month=2000-01');
    ok(repM.status === 200 && repM.body.monthStr === '2000-01' && repM.body.month && repM.body.month.sales === 0, 'GET /api/reports?month scopes the month block');
    const repD = await json('/api/reports');
    ok(repD.body.monthStr && /^\d{4}-\d{2}$/.test(repD.body.monthStr), 'GET /api/reports defaults monthStr to current month');

    // stocktake + supplier payments need the desktop window (503 here proves routing + validation order)
    const adj = await json('/api/inventory/adjust', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: 1, stock: 5 }) });
    ok(adj.status === 503, 'POST /api/inventory/adjust requires the renderer (503 in harness)');
    const adjBad = await json('/api/inventory/adjust', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: 1, stock: -3 }) });
    ok(adjBad.status === 400, 'POST /api/inventory/adjust rejects negative stock (400)');
    const sp = await json('/api/supplier-payments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ supplierId: 1, amount: 50 }) });
    ok(sp.status === 503, 'POST /api/supplier-payments requires the renderer (503 in harness)');
    const spBad = await json('/api/supplier-payments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ supplierId: 1, amount: -5 }) });
    ok(spBad.status === 400, 'POST /api/supplier-payments rejects negative amounts (400)');

    // full sale detail for receipts/sharing
    const td = await json('/api/transactions/1');
    ok(td.status === 200 && td.body.invoiceNo === 'INV-00001', 'GET /api/transactions/:id serves the sale');
    const td404 = await json('/api/transactions/9999');
    ok(td404.status === 404, 'GET /api/transactions/:id 404s cleanly');
    // payment-method edit: validation first, renderer for the real thing
    const tpBad = await json('/api/transactions/1', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ paymentMethod: 'Bitcoin' }) });
    ok(tpBad.status === 400, 'PUT /api/transactions/:id rejects an unknown payment method (400)');
    const tpNoRenderer = await json('/api/transactions/1', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ paymentMethod: 'Credit (Utang)' }) });
    ok(tpNoRenderer.status === 503, 'PUT /api/transactions/:id requires the renderer (503 in harness)');
    const tpCashier = await fetch(base + '/api/transactions/1?token=dev_cash-1', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ paymentMethod: 'Credit (Utang)' }) });
    ok(tpCashier.status === 403, 'cashier blocked from editing a sale payment method (403)');

    // returns: validation first, renderer needed for the real thing
    const retBad = await json('/api/returns', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    ok(retBad.status === 400, 'POST /api/returns requires an invoiceNo (400)');
    const ret = await json('/api/returns', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ invoiceNo: 'INV-00001' }) });
    ok(ret.status === 503, 'POST /api/returns requires the renderer (503 in harness)');
    const retOver = await json('/api/returns', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ invoiceNo: 'INV-00001', items: [{ description: 'x', qty: 0 }] }) });
    ok(retOver.status === 400, 'POST /api/returns validates line quantities (400)');
    const retCash = await fetch(base + '/api/returns?token=dev_cash-1', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ invoiceNo: 'INV-00001' }) });
    ok(retCash.status === 403, 'cashier blocked from returns (403)');

    // monthly CSV export for Excel/Sheets (raw text, not JSON)
    const csvR = await fetch(base + '/api/reports/export.csv?month=2000-01&token=test-token-123');
    const csvT = await csvR.text();
    ok(csvR.status === 200 && (csvR.headers.get('content-type') || '').includes('text/csv') && csvT.includes('Date,Invoice,Client') && csvT.includes('EXPENSES'), 'GET /api/reports/export.csv serves a download');
    const csvCash = await fetch(base + '/api/reports/export.csv?token=dev_cash-1');
    ok(csvCash.status === 403, 'cashier blocked from CSV export (403)');

    // product photos: validation first, renderer needed for the real thing
    const phBad = await json('/api/inventory/1/photo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image: 'not-a-data-url' }) });
    ok(phBad.status === 400, 'POST /api/inventory/:id/photo rejects non-images (400)');
    const ph = await json('/api/inventory/1/photo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image: 'data:image/jpeg;base64,AAA' }) });
    ok(ph.status === 503, 'POST /api/inventory/:id/photo requires the renderer (503 in harness)');
    const phCash = await fetch(base + '/api/inventory/1/photo?token=dev_cash-1', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image: 'data:image/jpeg;base64,AAA' }) });
    ok(phCash.status === 403, 'cashier blocked from product photos (403)');

    // void / payment rewrite / expense rewrite / petty / suppliers / PO receive / SMS / settings
    const vdBad = await json('/api/void', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    ok(vdBad.status === 400, 'POST /api/void requires an invoiceNo (400)');
    const vd = await json('/api/void', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ invoiceNo: 'INV-00001' }) });
    ok(vd.status === 503, 'POST /api/void requires the renderer (503 in harness)');
    const vdCash = await fetch(base + '/api/void?token=dev_cash-1', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ invoiceNo: 'INV-00001' }) });
    ok(vdCash.status === 403, 'cashier blocked from voids (403)');
    const payPut = await json('/api/payments/1', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ amount: -5 }) });
    ok(payPut.status === 400, 'PUT /api/payments/:id validates amounts (400)');
    const payDelCash = await fetch(base + '/api/payments/1?token=dev_cash-1', { method: 'DELETE' });
    ok(payDelCash.status === 403, 'cashier blocked from payment delete (403)');
    const expDelCash = await fetch(base + '/api/expenses/1?token=dev_cash-1', { method: 'DELETE' });
    ok(expDelCash.status === 403, 'cashier blocked from expense delete (403)');
    const supBad = await json('/api/suppliers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    ok(supBad.status === 400, 'POST /api/suppliers requires a name (400)');
    const supCash = await fetch(base + '/api/suppliers?token=dev_cash-1', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'X' }) });
    ok(supCash.status === 403, 'cashier blocked from supplier add (403)');
    const supPay404 = await json('/api/suppliers/999/payments');
    ok(supPay404.status === 404, 'GET /api/suppliers/:id/payments 404s cleanly');
    const poRecv = await json('/api/purchase-orders/1/receive', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    ok(poRecv.status === 503, 'POST /api/purchase-orders/:id/receive requires the renderer (503 in harness)');
    const poRecvCash = await fetch(base + '/api/purchase-orders/1/receive?token=dev_cash-1', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    ok(poRecvCash.status === 403, 'cashier blocked from PO receive (403)');
    const smsCash = await fetch(base + '/api/sms-reminders?token=dev_cash-1', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    ok(smsCash.status === 403, 'cashier blocked from SMS reminders (403)');
    const setBad = await json('/api/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: 'lanToken', value: 'x' }) });
    ok(setBad.status === 400, 'PUT /api/settings rejects non-editable keys (400)');
    const setCash = await fetch(base + '/api/settings?token=dev_cash-1', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: 'shopName', value: 'x' }) });
    ok(setCash.status === 403, 'cashier blocked from settings edit (403)');
    const qi = await json('/api/quick-items');
    ok(qi.status === 200 && Array.isArray(qi.body), 'GET /api/quick-items serves presets');

    // stock alerts shape (fixture: Coke 3/5 low, Bread 10/2 fine)
    const al = await json('/api/alerts');
    ok(al.status === 200 && al.body.lowCount === 1 && al.body.outCount === 0 && al.body.low[0].name === 'Coke', 'GET /api/alerts flags low stock');

    // phone thermal reprint: unknown sale 404s before touching the printer
    const pr404 = await json('/api/print-thermal', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ transactionId: 9999 }) });
    ok(pr404.status === 404 && printedThermal.length === 0, 'POST /api/print-thermal 404s on unknown sale');
    const pr1 = await json('/api/print-thermal', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ transactionId: 1 }) });
    ok(pr1.status === 200 && pr1.body.success === true, 'POST /api/print-thermal reprints a sale');
    ok(printedThermal.length === 1 && printedThermal[0].host === '127.0.0.1' && printedThermal[0].lines.some(l => String(l.text || '').includes('TOTAL')) && printedThermal[0].lines.some(l => String(l.text || '').includes('INV-00001')), 'thermal lines carry the receipt with invoice + TOTAL');

    // clients
    let r = await json('/api/clients');
    ok(r.status === 200 && r.body.length === 2 && r.body[0].name === 'Aling Nena' && r.body[0].balance === 125.5, 'GET /api/clients serves full records from SQLite');

    // inventory
    r = await json('/api/inventory');
    ok(r.status === 200 && r.body.length === 2 && r.body[0].name === 'Bread' && r.body[1].price === 30 && r.body[1].lowStock === 5 && r.body[1].sellPrice === undefined, 'GET /api/inventory maps + sorts (price from sellPrice, no raw fields leaked)');
    ok(r.body.every(i => i.image === undefined) && r.body.every(i => typeof i.hasImage === 'boolean'), 'GET /api/inventory ships no photo blobs (hasImage flag instead)');
    const imgs = await json('/api/inventory/images?ids=1,2,999');
    ok(imgs.status === 200 && imgs.body['1'] === null && imgs.body['999'] === null, 'GET /api/inventory/images serves thumbnails by id (null when absent)');

    // transactions
    r = await json('/api/transactions');
    ok(r.status === 200 && r.body.length === 4 && r.body[0].invoiceNo === 'INV-00001' && r.body[1].items === 2 && r.body[2].invoiceNo === 'INV-00004-R' && r.body[2].status === 'return' && r.body[2].grandTotal === -30 && r.body[2].items === 1 && r.body[3].items === 0, 'GET /api/transactions sorted desc (stable), items collapsed to count, refund rows served');
    r = await json('/api/transactions?limit=2');
    ok(r.status === 200 && r.body.length === 2, 'GET /api/transactions respects limit cap');

    // stats
    r = await json('/api/stats');
    ok(r.status === 200 && r.body.clients === 2 && r.body.inventory === 2 && r.body.totalUtang === 135.5, 'GET /api/stats counts and total utang');
    ok(r.body.todaySales === 120 && r.body.todayExpenses === 20 && r.body.todayCollected === 30 && r.body.todayProfit === 100, 'GET /api/stats today aggregates (refund nets revenue)');
    ok(r.body.monthSales === 120 && r.body.monthProfit === 100, 'GET /api/stats month aggregates');
    ok(r.body.todayRefunds === 30 && r.body.monthRefunds === 30, 'GET /api/stats refund totals (absolute of return rows)');
    ok(r.body.lowStockCount === 1 && r.body.recent.length === 3 && r.body.recent[0].invoiceNo === 'INV-00001' && r.body.recent[2].invoiceNo === 'INV-00004-R', 'GET /api/stats low stock + recent (excludes voided, includes return)');

    // expenses
    r = await json('/api/expenses');
    ok(r.status === 200 && r.body.length === 1 && r.body[0].amount === 20 && r.body[0].payee === 'X', 'GET /api/expenses mapped');

    // suppliers
    r = await json('/api/suppliers');
    ok(r.status === 200 && r.body.length === 1 && r.body[0].purchased === 500 && r.body[0].paid === 100 && r.body[0].owed === 400, 'GET /api/suppliers aggregates purchased/paid/owed');

    // purchase orders
    r = await json('/api/purchase-orders');
    ok(r.status === 200 && r.body.length === 1 && r.body[0].poNo === 'PO-00001' && r.body[0].total === 500 && Array.isArray(r.body[0].items), 'GET /api/purchase-orders mapped with items');

    // reports
    r = await json('/api/reports');
    ok(r.status === 200 && r.body.today.sales === 120 && r.body.month.sales === 120 && r.body.today.profit === 100, 'GET /api/reports today/month');
    ok(r.body.today.refunds === 30 && r.body.month.refunds === 30 && r.body.week.every(w => typeof w.refunds === 'number'), 'GET /api/reports refund totals + week refund series');
    ok(r.body.topItems.length === 3 && r.body.topItems[0].name === 'Bread' && r.body.week.length === 7, 'GET /api/reports top items (by amount) + 7-day week');

    // settings
    r = await json('/api/settings');
    ok(r.status === 200 && r.body.shopName === 'Nena Store' && r.body.currency === '₱', 'GET /api/settings map from store');

    // sqlite-status + backups
    r = await json('/api/sqlite-status');
    ok(r.status === 200 && r.body.ok === true && r.body.backend === 'sqlite' && typeof r.body.stores === 'number' && r.body.stores >= 14, 'GET /api/sqlite-status reports sqlite');
    r = await json('/api/backups');
    ok(r.status === 200 && r.body.backups.length === 1 && r.body.backups[0].name === 'backup-1.bak', 'GET /api/backups routes through backupService');

    // failsafe: no renderer available means POST writes stay guarded (503, not 500)
    r = await json('/api/expenses', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ description: 'x', amount: 5 }) });
    ok(r.status === 503 && r.body.error === 'Window not ready', 'POST write paths return 503 without a renderer');

    // settings write endpoints go through setSetting
    r = await json('/api/settings/theme', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ theme: 'dark' }) });
    ok(r.status === 200 && r.body.success === true && setCalls.some(c => c[0] === 'theme' && c[1] === 'dark'), 'POST /api/settings/theme persists via setSetting');
    r = await json('/api/settings/api-key', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
    ok(r.status === 400, 'POST /api/settings/api-key validates missing key');

    r = await json('/api/settings/cashier', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'Nena' }) });
    ok(r.status === 200 && r.body.success === true && setCalls.some(c => c[0] === 'currentCashier' && c[1] === 'Nena'), 'POST /api/settings/cashier persists via setSetting');

    // --- write path: a real sale through a live (vm-backed) renderer --------------
    rstores.clients = [{ id: 1, name: 'Nena', balance: 0 }];
    rstores.inventory = [{ id: 11, name: 'Coke', stock: 5, sellPrice: 30, variants: [] }];
    rctx.state.transactions = [];

    const sale = await json('/w/api/sales', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clientId: 1, paymentMethod: 'Credit (Utang)', items: [{ description: 'Coke', qty: 2, unitCost: 30, invId: 11 }] }) });
    ok(sale.status === 200 && sale.body.success === true, 'POST /api/sales writes through a live renderer (200)');
    ok(sale.body.invoiceNo === 'INV-00001', 'POST /api/sales returns the new invoiceNo (regression: the response used to drop it)');
    ok(rstores.inventory[0].stock === 3, 'POST /api/sales decrements stock');
    ok(rstores.clients[0].balance === 60, 'POST /api/sales adds the utang balance for credit sales');
    ok(rstores.transactions.length === 1 && rstores.transactions[0].items[0].amount === 60 && rstores.transactions[0].status === 'pending', 'POST /api/sales records the transaction with line totals');

    // A sale that fails halfway must roll back AND must not poison later sales.
    const stockBefore = rstores.inventory[0].stock;
    rendererFaults.step = 'dbPut:clients';
    rendererFaults.afterN = 1;
    rendererFaults.seen = 0;
    rendererFaults.on = true;
    const badSale = await json('/w/api/sales', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clientId: 1, paymentMethod: 'Credit (Utang)', items: [{ description: 'Coke', qty: 1, unitCost: 30, invId: 11 }] }) });
    ok(badSale.status === 500, 'POST /api/sales surfaces a mid-sale failure (500)');
    ok(rendererFaults.on === false, 'the induced fault fired exactly once');
    ok(rstores.inventory[0].stock === stockBefore, 'a failed sale rolls the stock move back');
    ok(rstores.clients[0].balance === 60, 'a failed sale leaves the utang balance untouched');
    ok(rstores.transactions.length === 1, 'a failed sale leaves no transaction row behind');

    // Same, but the failure lands after the balance already moved (loyalty step):
    // the rollback has to undo a real balance change.
    rendererFaults.afterN = 2;
    rendererFaults.seen = 0;
    rendererFaults.on = true;
    const badSale2 = await json('/w/api/sales', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clientId: 1, paymentMethod: 'Credit (Utang)', items: [{ description: 'Coke', qty: 1, unitCost: 30, invId: 11 }] }) });
    ok(badSale2.status === 500, 'a failure after the balance move still fails loudly (500)');
    ok(rstores.clients[0].balance === 60, 'the rollback undoes a balance that had already been applied');
    ok(rstores.inventory[0].stock === stockBefore, 'the rollback also restores stock for that sale');
    ok(rstores.transactions.length === 1, 'no transaction row survives the second failure');

    const recovered = await json('/w/api/sales', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items: [{ description: 'Bread', qty: 1, unitCost: 25 }], paymentMethod: 'Cash' }) });
    ok(recovered.status === 200 && recovered.body.success === true && /^INV-\d{5}$/.test(recovered.body.invoiceNo || ''), 'a sale right after a failure still succeeds (regression: the invoice mutex used to stay rejected forever)');
    ok(rstores.transactions.length === 2, 'the recovered sale is recorded');
    ok(rstores.inventory.some(i => i.name === 'Bread' && i.stock === 0), 'an unknown item is auto-created from the sale line');

    // Free-text handling: stored verbatim (no HTML-entity mangling), markup stripped.
    const exp = await json('/w/api/expenses', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ description: 'LPG & rice', amount: 250, category: 'Purchases', payee: "Maria's Store" }) });
    ok(exp.status === 200 && exp.body.success === true, 'POST /api/expenses writes through a live renderer (200)');
    ok(rstores.expenses[0].description === 'LPG & rice' && rstores.expenses[0].payee === "Maria's Store", 'expense text is stored verbatim (regression: values used to be HTML-entity encoded on the way in)');
    const exp2 = await json('/w/api/expenses', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ description: '<img src=x onerror=1>ok', amount: 5, category: 'Other' }) });
    ok(exp2.status === 200 && rstores.expenses[1].description === 'img src=x onerror=1ok', 'angle brackets are stripped from stored free text');
    ok(rAudits.some(a => a.action === 'expense-add' && String(a.details).includes('₱250.00')), 'the expense audit line carries a formatted amount (regression: a whole-number amount generated invalid JS and failed the whole write)');

    // Integer amounts on the payment path used to build "250".toFixed(2), which threw
    // inside the generated script and silently dropped the audit entry.
    const pay = await json('/w/api/payments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clientId: 1, amount: 30, type: 'Partial' }) });
    ok(pay.status === 200 && pay.body.success === true, 'POST /api/payments writes through a live renderer (200)');
    ok(rstores.payments && rstores.payments.length === 1 && rstores.payments[0].amount === 30, 'the payment row is stored');
    ok(rAudits.some(a => a.action === 'payment' && String(a.details).includes('₱30.00')), 'the payment audit line survives an integer amount');
  } catch (e) {
    console.error('FAIL harness: ' + e.message);
    failed++;
  } finally {
    try { server.closeAllConnections?.(); } catch (e) {}
    server.close(() => {});
    // closeDb is async now (native handle release): cleanup must wait for it.
    closeDb().then(() => {
      rmSync(userData, { recursive: true, force: true });
      console.log(`\nLAN API smoke: ${passed} passed, ${failed} failed`);
      setTimeout(() => process.exit(failed ? 1 : 0), 250);
    });
  }
});