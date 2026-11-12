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
const blobs = [];
class CapturingBlob {
  constructor(parts, opts) { this.parts = parts; this.type = opts && opts.type; blobs.push(this); }
}
globalThis.Blob = CapturingBlob;
URL.createObjectURL = () => 'blob:test';
URL.revokeObjectURL = () => {};
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
win.XLSX = {
  utils: {
    json_to_sheet: () => ({}),
    aoa_to_sheet: (aoa) => ({ __aoa: aoa }),
    book_new: () => ({ Sheets: {}, SheetNames: [] }),
    book_append_sheet: (wb, ws, name) => { wb.Sheets[name] = ws; wb.SheetNames.push(name); },
  },
  writeFile: (wb, name) => { xlsxCalls.push({ wb, name }); }
};
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
  Object.defineProperty(globalThis, g, { get: () => win[g], set: () => {}, configurable: true });
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

  // VAT settings + February sale/return + April phone-created sale
  await win.dbAdd('settings', { key: 'shopName', value: 'Test Shop' });
  await win.dbAdd('settings', { key: 'vatRate', value: '12' });
  await win.dbAdd('settings', { key: 'registeredForVat', value: 'true' });
  await win.dbAdd('settings', { key: 'businessTin', value: '123-456-789' });
  await win.dbAdd('settings', { key: 'vatRegNo', value: 'VAT-001' });
  const vatSaleId = await win.dbAdd('transactions', { invoiceNo: 'INV-VAT', date: '2025-02-10', clientName: 'Walk-in', clientId: null, paymentMethod: 'Cash', status: 'pending', grandTotal: 224, vatExclusive: 200, vatAmount: 24, vatRate: 0.12, items: [{ description: 'VAT Item', name: '2', unitCost: 112, invId }], createdAt: '2025-02-10T10:00:00.000Z' });
  await win.dbAdd('transactions', { invoiceNo: 'INV-EXEMPT', date: '2025-02-11', clientName: 'Walk-in', clientId: null, paymentMethod: 'Cash', status: 'pending', grandTotal: 50, vatExclusive: 0, vatAmount: 0, items: [], createdAt: '2025-02-11T10:00:00.000Z' });
  await win.dbAdd('transactions', { invoiceNo: 'INV-VAT-R', date: '2025-02-12', clientName: 'Walk-in', clientId: null, paymentMethod: 'Cash', status: 'return', grandTotal: -112, refId: vatSaleId, items: [{ description: 'VAT Item', name: '-1', qty: -1, unitCost: 112, invId }], createdAt: '2025-02-12T10:00:00.000Z' });
  await win.dbAdd('transactions', { invoiceNo: 'INV-PHONE', date: '2025-04-05', clientName: 'Walk-in', clientId: null, paymentMethod: 'Cash', status: 'pending', grandTotal: 30, items: [{ description: 'Phone item', qty: 3, unitCost: 10 }], createdAt: '2025-04-05T10:00:00.000Z' });

  // --- aggregation ---
  await win.dbLoad('transactions'); await win.dbLoad('payments');
  await win.dbLoad('expenses'); await win.dbLoad('inventory'); await win.dbLoad('clients'); await win.dbLoad('settings');
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
  const mRow = d.collections.find(r => r.name === 'Maria Santos');
  ok(mRow && mRow.opening === 0 && mRow.paid === 50 && mRow.current === 200, 'collections merges name-only payment into client row');
  ok(d.collections.filter(r => r.name === 'Maria Santos').length === 1, 'no duplicate client rows');

  // --- VAT rate normalization (settings store a percentage) ---
  const vatSetting = win.state.settings.find(s => s.key === 'vatRate');
  let vb = win.formatVATBreakdown(112);
  ok(vb.vatExclusive === 100 && vb.vatAmount === 12, 'saved VAT percent is treated as 12%, not 1200%');
  vatSetting.value = '0.12';
  vb = win.formatVATBreakdown(112);
  ok(vb.vatExclusive === 100 && vb.vatAmount === 12, 'legacy fractional VAT setting still works');
  vatSetting.value = '12';

  // --- February returns: monthly profit nets refunds and return COGS ---
  const dFeb = win.monthlyReportData('2025-02');
  ok(dFeb.revenue === 274 && dFeb.refunds === 112, 'February revenue 274, refunds 112');
  ok(dFeb.cogs === 60, 'February COGS nets returned units (120 - 60)');
  ok(dFeb.profit === 274 - 112 - 60, 'February profit subtracts refunds and return COGS');

  // --- BIR exports: net VAT, refunds and configured rate ---
  getEl('bir-month').value = '02';
  getEl('bir-year').value = '2025';
  await win.exportBIR2550M();
  let csv = blobs[blobs.length - 1].parts.join('');
  let birRow = csv.split('\r\n')[1].split(',');
  ok(birRow[3] === '100.00', 'BIR 2550M taxable sales are net of VAT');
  ok(birRow[4] === '12.00', 'BIR 2550M VAT output is computed from net taxable sales');
  ok(birRow[5] === '0.00' && birRow[6] === '50.00', 'BIR 2550M zero-rated/exempt split');
  ok(birRow[7] === '162.00', 'BIR 2550M total sales net of the return');
  ok(birRow[8] === '2', 'BIR 2550M counts sales, not return rows');
  ok(csv.includes('VAT Output (12%)'), 'BIR 2550M header shows the configured VAT rate');
  vatSetting.value = '10';
  await win.exportBIR2550M();
  csv = blobs[blobs.length - 1].parts.join('');
  birRow = csv.split('\r\n')[1].split(',');
  ok(birRow[3] === '101.82' && birRow[4] === '10.18', 'BIR 2550M uses the configured 10% VAT rate');
  ok(csv.includes('VAT Output (10%)'), 'BIR 2550M header follows a custom VAT rate');
  vatSetting.value = '12';
  getEl('bir-quarter').value = '1';
  getEl('bir-qyear').value = '2025';
  await win.exportBIR2551Q();
  csv = blobs[blobs.length - 1].parts.join('');
  const qRow = csv.split('\r\n')[1].split(',');
  ok(qRow[3] === '612.00', 'BIR 2551Q gross sales net of refunds');
  ok(qRow[4] === '18.36', 'BIR 2551Q 3% tax on net gross sales');
  ok(qRow[5] === '4', 'BIR 2551Q counts sales, not return rows');

  // --- Excel + thermal reprints show qty for phone-created lines ---
  await win.exportXlsx();
  const xlsxWb = xlsxCalls[xlsxCalls.length - 1].wb;
  const txSheet = xlsxWb.Sheets['Transactions'];
  const phoneRow = txSheet && txSheet.__aoa.find(r => r[0] === 'INV-PHONE');
  ok(phoneRow && phoneRow[3].includes('Phone item x3'), '.xlsx export shows qty from a phone-created line');
  await win.exportExcel();
  const xlsHtml = blobs[blobs.length - 1].parts.join('');
  ok(xlsHtml.includes('Phone item x3'), 'legacy .xls export shows qty from a phone-created line');
  const thermalPhone = win.thermalReceipt({ invoiceNo: 'INV-T1', createdAt: '2025-01-05T10:00:00.000Z', items: [{ description: 'Phone item', qty: 3, unitCost: 10 }], subtotal: 30, grandTotal: 30 });
  ok(thermalPhone.includes('x3') && thermalPhone.includes('30.00'), 'thermal receipt shows phone line qty 3');
  const thermalDesk = win.thermalReceipt({ invoiceNo: 'INV-T2', createdAt: '2025-01-05T10:00:00.000Z', items: [{ description: 'Coke', name: '2', unitCost: 50 }], subtotal: 100, grandTotal: 100 });
  ok(thermalDesk.includes('x2') && thermalDesk.includes('100.00'), 'thermal receipt shows desktop qty from name');

  // --- opening snapshots ---
  const nowKey = new Date().getFullYear() + '-' + String(new Date().getMonth() + 1).padStart(2, '0');
  const snap1 = await win.ensureBalanceSnapshot();
  ok(snap1 && snap1.month === nowKey, 'snapshot recorded for current month');
  const snapCount = (await win.dbAll('balanceSnapshots')).length;
  await win.ensureBalanceSnapshot();
  ok((await win.dbAll('balanceSnapshots')).length === snapCount, 'snapshot is idempotent within a month');
  ok(win.getBalanceSnapshot(nowKey) && win.getBalanceSnapshot(nowKey).balances.some(b => b.balance === 200), 'snapshot captured Maria balance 200');
  const dNow = win.monthlyReportData(nowKey);
  ok(dNow.openingTotal === 200, 'report opening total 200 from snapshot');
  const mNow = dNow.collections.find(r => r.name === 'Maria Santos');
  ok(mNow && mNow.opening === 200 && mNow.paid === 0 && mNow.current === 200, 'collections row: opening 200, paid 0, current 200');

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

  // --- modal with snapshot month shows opening columns ---
  getEl('rep-month').value = nowKey;
  await win.generateMonthlyReport();
  ok(getEl('modal-root').innerHTML.includes('Opening'), 'modal shows opening columns when snapshot exists');

  // --- Excel export (stub engine: plain sheets, no styling crash) ---
  getEl('rep-month').value = '2025-01';
  const xlsxBefore = xlsxCalls.length;
  await win.exportMonthlyReportXlsx();
  ok(xlsxCalls.length === xlsxBefore + 1 && xlsxCalls[xlsxCalls.length - 1].name === 'Monthly_Report_2025-01.xlsx', 'monthly xlsx downloaded with month filename');

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
