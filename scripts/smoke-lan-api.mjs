// Smoke test for the LAN/mobile API router (src/main/lanApi.js):
// every read endpoint must serve from SQLite with no renderer available
// (rendererReady=false proves the window is no longer required).
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const { registerDbIpc, closeDb } = require('../src/main/db.js');
const { createLanApiRouter } = require('../src/main/lanApi.js');
const express = require('express');

let passed = 0, failed = 0;
const ok = (cond, name) => { if (cond) { passed++; console.log('  ok ' + name); } else { failed++; console.error('  FAIL ' + name); } };

const userData = mkdtempSync(join(tmpdir(), 'slp-lanapi-smoke-'));
const handlers = new Map();
registerDbIpc({ handle: (name, fn) => handlers.set(name, fn) }, userData);
const invoke = (name, arg) => handlers.get(name)({}, arg);
await invoke('db-open');

const TODAY = new Date().toISOString().split('T')[0];
await invoke('db-migrate', { dump: {
  clients: [{ id: 1, name: 'Aling Nena', balance: 125.5 }, { id: 2, name: 'Mang Jose', balance: 10 }],
  inventory: [{ id: 1, name: 'Coke', stock: 3, lowStock: 5, sellPrice: 30, createdAt: '2026-01-01' }, { id: 2, name: 'Bread', stock: 10, lowStock: 2, price: 25, createdAt: '2026-01-01' }],
  transactions: [
    { id: 1, invoiceNo: 'INV-00001', clientName: 'Aling Nena', date: TODAY, createdAt: TODAY + 'T10:00:00.000Z', status: 'paid', paymentMethod: 'Cash', grandTotal: 100, subtotal: 100, totalInterest: 0, discount: 0, scDiscount: 0, items: [{ description: 'Coke', qty: 1, unitCost: 30, amount: 30 }] },
    { id: 2, invoiceNo: 'INV-00002', clientName: 'Walk-in', date: TODAY, createdAt: TODAY + 'T11:00:00.000Z', status: 'pending', paymentMethod: 'GCash', grandTotal: 50, subtotal: 50, totalInterest: 0, discount: 0, scDiscount: 0, items: [{ description: 'Bread', qty: 5, unitCost: 20, amount: 100 }, { description: 'Water', qty: 1, unitCost: 10, amount: 10 }] },
    { id: 3, invoiceNo: 'INV-00003', clientName: 'X', date: '2026-01-01', createdAt: '2026-01-01T00:00:00.000Z', status: 'voided', paymentMethod: 'Cash', grandTotal: 999, subtotal: 999, totalInterest: 0, discount: 0, scDiscount: 0, items: [] }
  ],
  expenses: [{ id: 1, date: TODAY, category: 'Rent', description: 'rent', amount: 20, payee: 'X', createdAt: TODAY + 'T09:00:00.000Z' }],
  payments: [{ id: 1, date: TODAY, amount: 30, clientId: 1, createdAt: TODAY + 'T09:30:00.000Z' }],
  suppliers: [{ id: 1, name: 'Nena Supply', contact: '0917' }],
  supplierPayments: [{ id: 1, supplierId: 1, amount: 100 }],
  purchaseOrders: [{ id: 1, supplierId: 1, supplierName: 'Nena Supply', poNo: 'PO-00001', date: TODAY, items: [{ name: 'Box', price: 100, qty: 5 }], total: 500, status: 'Pending', createdAt: TODAY + 'T08:00:00.000Z' }],
  settings: [{ id: 1, key: 'shopName', value: 'Nena Store' }, { id: 2, key: 'currency', value: '₱' }]
} });

const setCalls = [];
const router = createLanApiRouter({
  db: require('../src/main/db.js'),
  userDataPath: () => userData,
  rendererReady: () => false,
  getRendererDump: () => { throw new Error('getRendererDump must not be called on the SQLite path'); },
  rendererExec: () => { throw new Error('rendererExec must not be called on the SQLite path'); },
  setSetting: async (key, value) => { setCalls.push([key, value]); return { success: true }; },
  backupService: { readBackupIndex: () => [{ name: 'backup-1.bak', date: TODAY, size: 100, status: 'ok', type: 'snapshot', encrypted: false }] },
  notify: () => {}
});

const app = express();
app.use(express.json());
app.use(router);
const server = app.listen(0, '127.0.0.1', async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const json = async (p, opts) => {
      const r = await fetch(base + p, opts);
      return { status: r.status, body: await r.json() };
    };

    // clients
    let r = await json('/api/clients');
    ok(r.status === 200 && r.body.length === 2 && r.body[0].name === 'Aling Nena' && r.body[0].balance === 125.5, 'GET /api/clients serves full records from SQLite');

    // inventory
    r = await json('/api/inventory');
    ok(r.status === 200 && r.body.length === 2 && r.body[0].name === 'Bread' && r.body[1].price === 30 && r.body[1].lowStock === 5 && r.body[1].sellPrice === undefined, 'GET /api/inventory maps + sorts (price from sellPrice, no raw fields leaked)');

    // transactions
    r = await json('/api/transactions');
    ok(r.status === 200 && r.body.length === 3 && r.body[0].invoiceNo === 'INV-00001' && r.body[1].items === 2 && r.body[2].items === 0, 'GET /api/transactions sorted desc, items collapsed to count');
    r = await json('/api/transactions?limit=2');
    ok(r.status === 200 && r.body.length === 2, 'GET /api/transactions respects limit cap');

    // stats
    r = await json('/api/stats');
    ok(r.status === 200 && r.body.clients === 2 && r.body.inventory === 2 && r.body.totalUtang === 135.5, 'GET /api/stats counts and total utang');
    ok(r.body.todaySales === 150 && r.body.todayExpenses === 20 && r.body.todayCollected === 30 && r.body.todayProfit === 130, 'GET /api/stats today aggregates');
    ok(r.body.monthSales === 150 && r.body.monthProfit === 130, 'GET /api/stats month aggregates');
    ok(r.body.lowStockCount === 1 && r.body.recent.length === 2 && r.body.recent[0].invoiceNo === 'INV-00001', 'GET /api/stats low stock + recent (excludes voided)');

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
    ok(r.status === 200 && r.body.today.sales === 150 && r.body.month.sales === 150 && r.body.today.profit === 130, 'GET /api/reports today/month');
    ok(r.body.topItems.length === 3 && r.body.topItems[0].name === 'Bread' && r.body.week.length === 7, 'GET /api/reports top items (by amount) + 7-day week');

    // settings
    r = await json('/api/settings');
    ok(r.status === 200 && r.body.shopName === 'Nena Store' && r.body.currency === '₱', 'GET /api/settings map from store');

    // sqlite-status + backups
    r = await json('/api/sqlite-status');
    ok(r.status === 200 && r.body.ok === true && r.body.backend === 'sqlite' && r.body.stores === 13, 'GET /api/sqlite-status reports sqlite');
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
  } catch (e) {
    console.error('FAIL harness: ' + e.message);
    failed++;
  } finally {
    try { server.closeAllConnections?.(); } catch (e) {}
    server.close(() => {});
    closeDb();
    rmSync(userData, { recursive: true, force: true });
    console.log(`\nLAN API smoke: ${passed} passed, ${failed} failed`);
    setTimeout(() => process.exit(failed ? 1 : 0), 250);
  }
});