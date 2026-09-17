// Smoke test for the monthly report generator (reports.js):
// month aggregation, Excel-table modal HTML, print HTML and styled .xlsx export.
// Runs the built bundle with DOM stubs + real in-memory IDB, no Electron needed.
const noop = () => {};
const sharedParent = { innerHTML: '', textContent: '', value: '', classList: { add: noop, remove: noop, toggle: noop, contains: () => false } };
const registry = new Map();
function makeEl(id) {
  return {
    id, value: '', textContent: '', innerHTML: '', checked: false, dataset: {}, disabled: false,
    style: {}, type: 'text', className: '',
    classList: { add: noop, remove: noop, toggle: noop, contains: () => false, [Symbol.iterator]: () => [][Symbol.iterator]() },
    parentElement: sharedParent, parentNode: sharedParent,
    addEventListener: noop, removeEventListener: noop, append: noop, appendChild: noop, remove: noop,
    querySelector: () => makeEl(), querySelectorAll: () => [], closest: () => makeEl(),
    focus: noop, click: noop, setAttribute: noop, getAttribute: () => null,
    getContext: () => null, getBoundingClientRect: () => ({ width: 100, height: 100 }),
  };
}
function getEl(id) { if (!registry.has(id)) registry.set(id, makeEl(id)); return registry.get(id); }

// --- real in-memory IDB so dbAdd/dbLoad round-trip ---
const storeData = new Map();
function getStore(name) {
  if (!storeData.has(name)) { storeData.set(name, []); storeData.get(name).__next = 1; }
  return storeData.get(name);
}
function makeIDBReq(result) { const r = { result, onsuccess: null, onerror: null, error: null }; queueMicrotask(() => { if (r.onsuccess) r.onsuccess({ target: r }); }); return r; }
const fakeOS = {
  getAll: (name) => makeIDBReq([...getStore(name)]),
  get: (name, key) => makeIDBReq(getStore(name).find(o => o.id === key)),
  put: (name, obj) => { const s = getStore(name); if (obj.id == null) obj.id = s.__next++; const i = s.findIndex(o => o.id === obj.id); if (i >= 0) s[i] = obj; else s.push(obj); return makeIDBReq(obj.id); },
  add: (name, obj) => { const s = getStore(name); if (obj.id == null) obj.id = s.__next++; s.push(obj); return makeIDBReq(obj.id); },
  delete: (name, key) => { const s = getStore(name); const i = s.findIndex(o => o.id === key); if (i >= 0) s.splice(i, 1); return makeIDBReq(undefined); },
  clear: (name) => { getStore(name).length = 0; return makeIDBReq(undefined); },
};
const fakeDB = {
  transaction: (name) => {
    const tx = { objectStore: () => ({
      getAll: () => fakeOS.getAll(name), get: (key) => fakeOS.get(name, key),
      put: (obj) => fakeOS.put(name, obj), add: (obj) => fakeOS.add(name, obj),
      delete: (key) => fakeOS.delete(name, key), clear: () => fakeOS.clear(name),
    }) };
    queueMicrotask(() => { if (tx.oncomplete) tx.oncomplete({}); });
    return tx;
  },
  objectStoreNames: { contains: () => true },
  createObjectStore: () => ({}),
};
const domListeners = {};
const xlsxCalls = [];
const printed = [];
const win = new Proxy({
  __app: {},
  location: { origin: 'http://localhost', href: 'http://localhost/index.html', search: '' },
  addEventListener: noop, removeEventListener: noop,
  getComputedStyle: () => ({}), requestAnimationFrame: (f) => 0, cancelAnimationFrame: noop,
  matchMedia: () => ({ matches: false, addEventListener: noop }),
  open: (url, target, features) => ({ document: { write: (s) => printed.push(s), close: noop }, close: noop, focus: noop }),
}, {
  get(t, p) { if (p in t) return t[p]; return undefined; },
  set(t, p, v) { t[p] = v; return true; },
});
globalThis.window = win;
globalThis.self = win;
win.XLSX = { utils: { json_to_sheet: () => ({}), aoa_to_sheet: () => ({}), book_new: () => ({}), book_append_sheet: () => {} }, writeFile: (wb, name) => { xlsxCalls.push({ wb, name }); } };
Object.defineProperty(globalThis, 'document', { value: {
  getElementById: (id) => getEl(id),
  querySelector: () => makeEl(),
  querySelectorAll: () => [makeEl()],
  createElement: () => makeEl(),
  createTextNode: () => ({}),
  addEventListener: (ev, fn) => { (domListeners[ev] ||= []).push(fn); },
  body: makeEl(), documentElement: makeEl(), head: makeEl(),
}, configurable: true });
Object.defineProperty(globalThis, 'localStorage', { value: { getItem: () => null, setItem: noop, removeItem: noop }, configurable: true });
Object.defineProperty(globalThis, 'sessionStorage', { value: { getItem: () => null, setItem: noop, removeItem: noop }, configurable: true });
Object.defineProperty(globalThis, 'indexedDB', { value: {
  open: () => {
    const r = { onupgradeneeded: null, onsuccess: null, onerror: null, result: fakeDB };
    queueMicrotask(() => { if (r.onsuccess) r.onsuccess({ target: { result: fakeDB } }); });
    return r;
  },
}, configurable: true });
Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true });
globalThis.fetch = async () => ({ json: async () => ({}), ok: true, text: async () => '' });
globalThis.requestAnimationFrame = () => 0;
globalThis.cancelAnimationFrame = () => {};
process.on('unhandledRejection', () => {});
process.on('uncaughtException', () => {});
globalThis.MutationObserver = class { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } };
globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
for (const g of ['tailwind', 'Chart', 'XLSX', 'JsBarcode']) {
  Object.defineProperty(globalThis, g, { get: () => win[g], configurable: true });
}

import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

let failures = 0;
function ok(cond, msg) {
  if (cond) console.log('PASS - ' + msg);
  else { failures++; console.error('FAIL - ' + msg); }
}

try {
  const dir = fileURLToPath(new URL('../out/renderer/assets/', import.meta.url));
  const files = readdirSync(dir).filter(f => /^index-[A-Za-z0-9_-]+\.js$/.test(f));
  if (files.length === 0) throw new Error('No built bundle — run npm run build first');
  await import('file:///' + join(dir, files[0]).replace(/\\/g, '/'));
  for (const fn of domListeners.DOMContentLoaded || []) await fn();
  for (const k of Object.getOwnPropertyNames(win)) {
    try { Object.defineProperty(globalThis, k, { get: () => win[k], configurable: true }); } catch (e) {}
  }

  // --- seed January 2025 fixture data ---
  const invId = await win.dbAdd('inventory', { name: 'Coke 500ml', price: 100, sellPrice: 100, costPrice: 60, stock: 50, lowStock: 5, createdAt: '2025-01-01T00:00:00.000Z' });
  const cliId = await win.dbAdd('clients', { name: 'Maria Santos', phone: '0917', address: '', balance: 200, dueDate: '2025-02-01', createdAt: '2025-01-01T00:00:00.000Z' });
  await win.dbAdd('transactions', { invoiceNo: 'INV-00001', date: '2025-01-05', clientName: 'Walk-in', clientId: null, paymentMethod: 'Cash', status: 'pending', grandTotal: 200, items: [{ description: 'Coke 500ml', name: '2', unitCost: 100, invId }], createdAt: '2025-01-05T10:00:00.000Z' });
  await win.dbAdd('transactions', { invoiceNo: 'INV-00002', date: '2025-01-20', clientName: 'Maria Santos', clientId: cliId, paymentMethod: 'GCash', status: 'pending', grandTotal: 250, items: [], createdAt: '2025-01-20T10:00:00.000Z' });
  await win.dbAdd('transactions', { invoiceNo: 'INV-2024', date: '2024-12-15', clientName: 'Walk-in', clientId: null, paymentMethod: 'Cash', status: 'pending', grandTotal: 9999, items: [], createdAt: '2024-12-15T10:00:00.000Z' });
  await win.dbAdd('payments', { date: '2025-01-21', clientName: 'Maria Santos', clientId: cliId, amount: 50, type: 'Partial', createdAt: '2025-01-21T10:00:00.000Z' });
  await win.dbAdd('expenses', { date: '2025-01-10', category: 'Rent', description: 'stall rent', amount: 1000, payee: 'X', createdAt: '2025-01-10T10:00:00.000Z' });

  // --- aggregation ---
  await win.dbLoad('transactions'); await win.dbLoad('payments');
  await win.dbLoad('expenses'); await win.dbLoad('inventory'); await win.dbLoad('clients');
  const d = win.monthlyReportData('2025-01');
  ok(d.label === 'January 2025', 'month label January 2025 (got ' + d.label + ')');
  ok(d.sales.length === 2, '2 January sales picked up, December excluded');
  ok(d.revenue === 450, 'revenue 200 + 250 = 450');
  ok(d.cogs === 120, 'COGS 2 x 60 cost = 120');
  ok(d.expTotal === 1000 && d.payTotal === 50, 'expenses 1000, payments 50');
  ok(d.profit === 450 - 120 - 1000, 'profit = revenue - cogs - expenses');
  ok(d.creditSales === 250, 'GCash sale counted as credit sales');
  ok(d.topItems.length === 1 && d.topItems[0].name === 'Coke 500ml' && d.topItems[0].qty === 2, 'top items aggregates qty');
  ok(d.topClients[0].name === 'Maria Santos' && d.topClients[0].spent === 250, 'top client Maria 250');
  ok(d.debtors.length === 1 && d.debtTotal === 200, 'live debtor balance carried with as-of-today note');

  // --- modal HTML ---
  getEl('rep-month').value = '2025-01';
  await win.generateMonthlyReport();
  const modalHtml = getEl('modal-root').innerHTML;
  ok(modalHtml.includes('Monthly Report — January 2025'), 'modal shows report title');
  ok(modalHtml.includes('excel-table'), 'modal tables use Excel-table styling');
  ok(modalHtml.includes('450.00'), 'modal shows revenue figure');
  ok(modalHtml.includes('Receivables'), 'modal includes receivables section');

  // --- print HTML ---
  await win.printMonthlyReport();
  ok(printed.length === 1 && printed[0].includes('excel-table'), 'print output uses Excel-table styling');
  ok(printed[0].includes('January 2025'), 'print output titled for the month');

  // --- Excel export (stub engine: plain sheets, no styling crash) ---
  await win.exportMonthlyReportXlsx();
  ok(xlsxCalls.length === 1 && xlsxCalls[0].name === 'Monthly_Report_2025-01.xlsx', 'monthly xlsx downloaded with month filename');

  if (failures === 0) {
    console.log('MONTHLY REPORT OK: aggregation + modal + print + Excel export verified');
    process.exit(0);
  } else {
    console.error('MONTHLY REPORT FAILED: ' + failures + ' assertion(s) failed');
    process.exit(1);
  }
} catch (e) {
  console.error('MONTHLY REPORT ERROR:', e.message);
  console.error(e.stack && e.stack.split('\n').slice(0, 10).join('\n'));
  process.exit(1);
}
