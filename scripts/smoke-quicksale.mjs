// Functional test for the v3.4.22 Quick Cart flow (catalog.js):
// single-item Quick Sale (qty, interest, SC/PWD, discount, paper size) and
// multi-item Add-to-Cart sale with client balance + stock adjustment + print.
// Uses a REAL in-memory IDB (records persist across dbAdd/dbGet/dbPut/dbAll)
// so the actual sale code paths execute, not stubs.
const noop = () => {};
const sharedParent = { innerHTML: '', textContent: '', value: '', classList: { add: noop, remove: noop, toggle: noop, contains: () => false } };
const registry = new Map();
function makeEl(id) {
  const el = {
    id, value: '', textContent: '', innerHTML: '', checked: false, dataset: {}, disabled: false,
    style: {}, type: 'text', className: '', outerHTML: '',
    classList: { add: noop, remove: noop, toggle: noop, contains: () => false, [Symbol.iterator]: () => [][Symbol.iterator]() },
    parentElement: sharedParent, parentNode: sharedParent,
    addEventListener: noop, removeEventListener: noop, append: noop,
    appendChild: (child) => { if (child && child.id) registry.set(child.id, child); },
    remove: () => { if (el.id) registry.delete(el.id); },
    querySelector: () => makeEl(), querySelectorAll: () => [], closest: () => makeEl(),
    focus: noop, click: noop, setAttribute: noop, getAttribute: () => null,
    getContext: () => null, getBoundingClientRect: () => ({ width: 100, height: 100 }),
    select: noop, offsetParent: null,
  };
  Object.defineProperty(el, 'textContent', {
    get() { return el.__text || ''; },
    set(v) { el.__text = v; el.innerHTML = v; },
    configurable: true,
  });
  return el;
}
function getEl(id) {
  if (!registry.has(id)) registry.set(id, makeEl(id));
  return registry.get(id);
}

// --- real in-memory IDB (per-store maps, auto-increment ids) ---
const storeData = new Map();
function getStore(name) {
  if (!storeData.has(name)) { storeData.set(name, []); storeData.get(name).__next = 1; }
  return storeData.get(name);
}
function makeIDBReq(result, error) { const r = { result, error, onsuccess: null, onerror: null }; queueMicrotask(() => { if (r.onsuccess) r.onsuccess({ target: r }); }); return r; }
const fakeOS = {
  getAll: (name) => makeIDBReq([...getStore(name)]),
  get: (name, key) => makeIDBReq(getStore(name).find(o => o.id === key)),
  put: (name, obj) => { const s = getStore(name); if (obj.id == null) obj.id = s.__next++; const i = s.findIndex(o => o.id === obj.id); if (i >= 0) s[i] = obj; else s.push(obj); return makeIDBReq(obj.id); },
  add: (name, obj) => { const s = getStore(name); obj.id = obj.id ?? s.__next++; s.push(obj); return makeIDBReq(obj.id); },
  delete: (name, key) => { const s = getStore(name); const i = s.findIndex(o => o.id === key); if (i >= 0) s.splice(i, 1); return makeIDBReq(undefined); },
  clear: (name) => { getStore(name).length = 0; return makeIDBReq(undefined); },
};
const fakeDB = {
  transaction: (name, mode) => {
    const tx = {
      objectStore: () => ({
        getAll: () => fakeOS.getAll(name), get: (key) => fakeOS.get(name, key),
        put: (obj) => fakeOS.put(name, obj), add: (obj) => fakeOS.add(name, obj),
        delete: (key) => fakeOS.delete(name, key), clear: () => fakeOS.clear(name),
      }),
    };
    queueMicrotask(() => { if (tx.oncomplete) tx.oncomplete({}); });
    return tx;
  },
  objectStoreNames: { contains: () => true },
  createObjectStore: () => ({}),
};

const domListeners = {};
const printed = [];
let lanSignals = 0;
let capturedUpdateProgress = null;
const win = new Proxy({
  __app: {},
  location: { origin: 'http://localhost', href: 'http://localhost/index.html', search: '' },
  addEventListener: noop, removeEventListener: noop,
  getComputedStyle: () => ({}), requestAnimationFrame: (f) => 0, cancelAnimationFrame: noop,
  matchMedia: () => ({ matches: false, addEventListener: noop }),
  electronAPI: {
    signalLanUpdate: () => { lanSignals++; },
    printReceipt: async (p) => { printed.push(p); },
    onShortcut: noop, onUpdateAvailable: noop, onUpdateNotAvailable: noop,
    onUpdateError: noop, onUpdateDownloaded: noop, onUpdateProgress: (cb) => { capturedUpdateProgress = cb; }, onLanUpdateSignal: noop,
    onConfirmExit: noop, onHiddenToTray: noop, onLanDataRefresh: noop,
    generateMobileQR: async () => ({ qr: '', url: '', tailscale: null }),
  },
}, {
  get(t, p) { if (p in t) return t[p]; return undefined; },
  set(t, p, v) { t[p] = v; return true; },
});
globalThis.window = win;
globalThis.self = win;
win.Chart = class { constructor() {} destroy() {} update() {} resize() {} };
win.XLSX = { utils: { json_to_sheet: () => ({}), aoa_to_sheet: () => ({}), book_new: () => ({}), book_append_sheet: () => {} }, writeFile: () => {} };
win.JsBarcode = () => ({ render: () => {} });
Object.defineProperty(globalThis, 'document', { value: {
  getElementById: (id) => getEl(id),
  querySelector: () => makeEl(),
  querySelectorAll: () => [makeEl()],
  createElement: (tag) => { const el = makeEl(); el.tagName = (tag || 'div').toUpperCase(); return el; },
  createTextNode: () => ({}),
  addEventListener: (ev, fn) => { (domListeners[ev] ||= []).push(fn); },
  body: { appendChild: (child) => { if (child && child.id) registry.set(child.id, child); }, classList: { add: noop, remove: noop }, innerHTML: '' },
  documentElement: { classList: { add: noop, remove: noop, toggle: noop, contains: () => false } },
  head: makeEl(),
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
globalThis.fetch = async () => ({ json: async () => ({ current_condition: [{ temp_C: 0, weatherDesc: [{ value: '' }], humidity: 0, windspeedKmph: 0 }], nearest_area: [{ areaName: [{ value: '' }] }] }), ok: true, text: async () => '' });
globalThis.requestAnimationFrame = () => 0;
globalThis.cancelAnimationFrame = () => {}
globalThis.playSound = () => {};
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

const bundlePath = process.argv[2] || findBundle();
function findBundle() {
  const dir = fileURLToPath(new URL('../out/renderer/assets/', import.meta.url));
  const files = readdirSync(dir).filter(f => /^index-[A-Za-z0-9_-]+\.js$/.test(f));
  if (files.length === 0) throw new Error('No built bundle found in out/renderer/assets — run npm run build first');
  return join(dir, files[0]);
}

let failures = 0;
function ok(cond, msg) {
  if (cond) console.log('PASS - ' + msg);
  else { failures++; console.error('FAIL - ' + msg); }
}
function eq(actual, expected, msg) {
  const pass = String(actual) === String(expected);
  if (pass) console.log(`PASS - ${msg} (= ${expected})`);
  else { failures++; console.error(`FAIL - ${msg}: got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`); }
}

try {
  await import('file:///' + bundlePath.replace(/\\/g, '/'));
  await win.openDB();
  const invId1 = await win.dbAdd('inventory', { name: 'Coke 500ml', price: 100, sellPrice: 100, stock: 10, lowStock: 5, createdAt: new Date().toISOString() });
  const invId2 = await win.dbAdd('inventory', { name: 'Biscuit Pack', price: 50, sellPrice: 50, stock: 5, lowStock: 2, createdAt: new Date().toISOString() });
  const cliId = await win.dbAdd('clients', { name: 'Maria Santos', phone: '0917', address: '', balance: 0, createdAt: new Date().toISOString() });
  const listeners = domListeners.DOMContentLoaded || [];
  for (const fn of listeners) await fn();
  await win.navigate('catalog');

  // --- single-item modal: qty/interest/SC/discount math ---
  win.openQuickSaleModal(invId1);
  ok(document.getElementById('modal-root').innerHTML.includes('Quick Sale'), 'Quick Sale modal rendered');
  getEl('qs-qty').value = '2';
  getEl('qs-interest').value = '10';
  getEl('qs-sc').checked = true;
  win.qsUpd();
  eq(getEl('qs-total').textContent, '₱160.67', 'single sale total: 2x100 + 0.67 interest - 40 SC');
  ok(getEl('qs-interestline').textContent === '₱0.67', 'single sale interest line ₱0.67');
  ok(getEl('qs-scline').textContent === '-₱40.00', 'single sale SC line -₱40.00');

  // --- add first item to cart ---
  win.qsAddToCart();
  eq(getEl('qs-cart').innerHTML.includes('Coke 500ml'), true, 'cart shows Coke 500ml line');
  eq(getEl('qs-cart').innerHTML.includes('Quick Cart (1)'), true, 'cart header shows 1 item');

  // --- second item to cart: qty 3, 0% interest ---
  win.openQuickSaleModal(invId2);
  getEl('qs-qty').value = '3';
  getEl('qs-interest').value = '0';
  getEl('qs-sc').checked = false;
  win.qsUpd();
  win.qsAddToCart();
  eq(getEl('qs-cart').innerHTML.includes('Quick Cart (2)'), true, 'cart header shows 2 items');

  // --- cart-level controls: client, global interest 20%, SC, paper size ---
  getEl('qs-cart-client').value = String(cliId);
  win.qsCartInterest('20');
  getEl('qs-cart-sc').checked = true;
  getEl('qs-cart-discount').value = '0';
  getEl('qs-cart-rpsize').value = '80mm';
  win.qsCartTotals();
  eq(getEl('qs-cart-total').textContent, '₱282.33', 'cart total: 350 + 2.33 interest - 70 SC');
  ok(getEl('qs-cart-int').textContent === '₱2.33', 'cart interest line ₱2.33 (20%/mo both lines)');
  ok(getEl('qs-cart-sc2').textContent === '-₱70.00', 'cart SC line -₱70.00');
  ok(getEl('qs-cart-balance').textContent === '₱0.00', 'cart client balance shown ₱0.00');

  // --- SELL THE CART (no print) ---
  const cartSellPromise = win.qsCartSell(false);
  await cartSellPromise;
  const tx = await win.dbGet('transactions', 1);
  ok(!!tx, 'transaction #1 saved');
  eq(tx.invoiceNo, 'INV-00001', 'invoice number INV-00001');
  eq(tx.grandTotal, 282.33, 'tx grandTotal 282.33');
  eq(tx.subtotal, 350, 'tx subtotal 350');
  eq(tx.totalInterest, 2.33, 'tx totalInterest 2.33');
  eq(tx.scDiscount, 70, 'tx scDiscount 70');
  eq(tx.discount, 70, 'tx discount 70 (incl SC)');
  eq(tx.clientId, cliId, 'tx clientId set');
  eq(tx.items.length, 2, 'tx has 2 items');
  eq(tx.items[0].name, '2', 'tx item1 qty encoded in name');
  const inv1 = await win.dbGet('inventory', invId1);
  const inv2 = await win.dbGet('inventory', invId2);
  eq(inv1.stock, 8, 'item1 stock 10 -> 8');
  eq(inv2.stock, 2, 'item2 stock 5 -> 2');
  const cli = await win.dbGet('clients', cliId);
  eq(cli.balance, 282.33, 'client balance += 282.33');
  eq(getEl('qs-cart').innerHTML, '', 'cart cleared after sale');
  const audits = await win.dbAll('auditLogs');
  ok(audits.some(a => a.action === 'sale'), 'audit log written for sale');
  ok(lanSignals === 1, 'LAN update signaled after cart sale');
  const stx = await win.dbAll('transactions');
  eq(stx.length, 1, 'state has 1 transaction');

  // --- single-item sale WITH PRINT (58mm): SC + interest + paper size ---
  win.openQuickSaleModal(invId1);
  getEl('qs-qty').value = '1';
  getEl('qs-interest').value = '10';
  getEl('qs-sc').checked = true;
  getEl('qs-rpsize').value = '58mm';
  win.qsUpd();
  eq(getEl('qs-total').textContent, '₱80.33', 'single sale 2: 100 + 0.33 interest - 20 SC = 80.33');
  await win.qsSell(true);
  const tx2 = await win.dbGet('transactions', 2);
  eq(tx2.invoiceNo, 'INV-00002', 'second invoice INV-00002');
  eq(tx2.grandTotal, 80.33, 'tx2 grandTotal 80.33');
  eq(tx2.clientId, null, 'tx2 walk-in client');
  const inv1b = await win.dbGet('inventory', invId1);
  eq(inv1b.stock, 7, 'item1 stock 8 -> 7 after single sale');
  eq(printed.length, 1, 'one receipt printed');
  eq(printed[0].width, 220, '58mm paper -> width 220');
  ok(printed[0].html.includes('INV-00002'), 'receipt html has invoice no');
  ok(printed[0].html.includes('SC/PWD'), 'receipt html has SC/PWD row');
  ok(printed[0].html.includes('TOTAL'), 'receipt html has TOTAL row');
  ok(!registry.has('rp-size'), 'temporary rp-size input removed after print');

  // --- cart sale WITH PRINT (80mm), walk-in, cash ---
  getEl('qs-cart-sc').checked = false;
  getEl('qs-cart-discount').value = '0';
  win.openQuickSaleModal(invId2);
  getEl('qs-qty').value = '1';
  getEl('qs-interest').value = '0';
  getEl('qs-sc').checked = false;
  win.qsAddToCart();
  win.openQuickSaleModal(invId1);
  getEl('qs-qty').value = '1';
  getEl('qs-interest').value = '0';
  getEl('qs-sc').checked = false;
  win.qsAddToCart();
  getEl('qs-cart-client').value = '';
  getEl('qs-cart-rpsize').value = '80mm';
  win.qsCartTotals();
  eq(getEl('qs-cart-total').textContent, '₱150.00', 'cart 3: 100 + 50 = 150');
  await win.qsCartSell(true);
  const tx3 = await win.dbGet('transactions', 3);
  eq(tx3.invoiceNo, 'INV-00003', 'third invoice INV-00003');
  eq(printed.length, 2, 'second receipt printed');
  eq(printed[1].width, 300, '80mm paper -> width 300');
  ok(printed[1].html.includes('INV-00003'), 'receipt 2 html has invoice no');
  const inv1c = await win.dbGet('inventory', invId1);
  const inv2c = await win.dbGet('inventory', invId2);
  eq(inv1c.stock, 6, 'item1 stock 7 -> 6');
  eq(inv2c.stock, 1, 'item2 stock 2 -> 1');

  // --- blank row: typed description auto-links to matching inventory item and deducts stock ---
  getEl('tm-client').options = [{ text: 'Walk-in' }];
  getEl('tm-client').selectedIndex = 0;
  getEl('tm-payment').value = 'Cash';
  getEl('tm-sc').checked = false;
  getEl('tm-discount').value = '0';
  win.txCart = [{ date: new Date().toISOString().split('T')[0], description: 'Coke 500ml', name: '1', unitCost: 100, intRate: 0, invId: null }];
  await win.doSaveTransaction();
  const tx4 = await win.dbGet('transactions', 4);
  eq(tx4.invoiceNo, 'INV-00004', 'blank-row sale saved as INV-00004');
  eq(tx4.items[0].invId, invId1, 'typed description auto-linked to matching inventory item');
  const inv1d = await win.dbGet('inventory', invId1);
  eq(inv1d.stock, 5, 'linked item stock 6 -> 5');

  // --- blank row: unknown description auto-creates an inventory item ---
  win.txCart = [{ date: new Date().toISOString().split('T')[0], description: 'Pancit Canton', name: '2', unitCost: 30, intRate: 0, invId: null }];
  await win.doSaveTransaction();
  const tx5 = await win.dbGet('transactions', 5);
  eq(tx5.invoiceNo, 'INV-00005', 'auto-create sale saved as INV-00005');
  const newInv = (await win.dbAll('inventory')).find(i => i.name === 'Pancit Canton');
  ok(!!newInv, 'unknown description auto-created inventory item');
  eq(newInv.stock, 0, 'auto-created item stock = qty sold (2) - 2');
  eq(tx5.items[0].invId, newInv.id, 'auto-created item linked on transaction line');
  const audits2 = await win.dbAll('auditLogs');
  ok(audits2.some(a => a.action === 'inventory' && (a.details || '').includes('Pancit Canton')), 'inventory audit written for auto-created item');

  // --- variants: sale with variantName deducts variant + parent stock ---
  const varId = await win.dbAdd('inventory', { name: 'Shirt', price: 200, sellPrice: 200, stock: 10, minStock: 2, variants: [{ name: 'M', stock: 6 }, { name: 'L', stock: 4 }], createdAt: new Date().toISOString() });
  win.txCart = [{ date: new Date().toISOString().split('T')[0], description: 'Shirt', name: '1', unitCost: 200, intRate: 0, invId: varId, variantName: 'L' }];
  await win.doSaveTransaction();
  const varInv = await win.dbGet('inventory', varId);
  eq(varInv.stock, 9, 'variant sale: parent stock 10 -> 9');
  eq(varInv.variants.find(v => v.name === 'L').stock, 3, 'variant sale: L stock 4 -> 3');
  eq(varInv.variants.find(v => v.name === 'M').stock, 6, 'variant sale: M stock untouched');
  eq((await win.dbGet('transactions', 6)).invoiceNo, 'INV-00006', 'variant sale invoice INV-00006');
  eq(win.getQty('-2'), -2, 'getQty parses negative qty (return lines)');
  eq(win.getQty('3 pieces'), 3, 'getQty still parses plain qty with suffix');

  // --- update download progress modal (boot.js) ---
  win.showUpdateProgress('Starting download…');
  ok(document.getElementById('modal-root').innerHTML.includes('Downloading Update'), 'download progress modal shown');
  ok(document.getElementById('modal-root').innerHTML.includes('update-progress-bar'), 'progress bar element present');
  ok(typeof capturedUpdateProgress === 'function', 'main sends download-progress to renderer');
  capturedUpdateProgress({ percent: 42, bytesPerSecond: 1048576, transferred: 10485760, total: 24956160 });
  eq(getEl('update-progress-bar').style.width, '42%', 'progress bar reflects 42%');
  eq(getEl('update-progress-text').textContent, 'Downloading… 42%', 'progress text shows 42%');
  eq(getEl('update-progress-meta').textContent, '10.0 MB of 23.8 MB · 1.0 MB/s', 'progress meta shows transferred/total/speed');

  if (failures === 0) {
    console.log('QUICK CART FLOW OK: single sale + multi-item cart + SC/PWD + interest + paper sizes + client balance + stock + print all verified');
    process.exit(0);
  } else {
    console.error('QUICK CART FLOW FAILED: ' + failures + ' assertion(s) failed');
    process.exit(1);
  }
} catch (e) {
  console.error('QUICK CART FLOW ERROR:', e.message);
  console.error(e.stack && e.stack.split('\n').slice(0, 10).join('\n'));
  process.exit(1);
}
