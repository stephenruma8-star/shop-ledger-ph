// Deep smoke test: executes the built bundle with DOM stubs, then fires DOMContentLoaded
// to run boot() -> navigate -> every view function. Catches missing imports,
// strict-mode implicit globals, and cross-module call errors.
const noop = () => {};
const sharedParent = { innerHTML: '', textContent: '', value: '', classList: { add: noop, remove: noop, toggle: noop, contains: () => false } };
function makeEl() {
  return {
    value: '', textContent: '', innerHTML: '', checked: false, dataset: {}, disabled: false,
    style: {}, classList: { add: noop, remove: noop, toggle: noop, contains: () => false, [Symbol.iterator]: () => [][Symbol.iterator]() },
    parentElement: sharedParent, parentNode: sharedParent,
    addEventListener: noop, removeEventListener: noop, append: noop, appendChild: noop, remove: noop,
    querySelector: () => makeEl(), querySelectorAll: () => [], closest: () => makeEl(),
    focus: noop, click: noop, setAttribute: noop, getAttribute: () => null,
    getContext: () => null, getBoundingClientRect: () => ({ width: 100, height: 100 }),
  };
}
function makeIDBReq(result) { const r = { result, onsuccess: null, onerror: null, error: null }; queueMicrotask(() => { if (r.onsuccess) r.onsuccess({ target: r }); }); return r; }
const fakeOS = {
  getAll: () => makeIDBReq([]), get: () => makeIDBReq(undefined),
  put: () => makeIDBReq(1), add: () => makeIDBReq(1),
  delete: () => makeIDBReq(undefined), clear: () => makeIDBReq(undefined),
};
const fakeDB = {
  transaction: () => {
    const tx = { objectStore: () => fakeOS };
    queueMicrotask(() => { if (tx.oncomplete) tx.oncomplete({}); });
    return tx;
  },
  objectStoreNames: { contains: () => true },
  createObjectStore: () => ({}),
};
const domListeners = {};
const win = new Proxy({
  __app: {},
  location: { origin: 'http://localhost', href: 'http://localhost/index.html', search: '' },
  addEventListener: noop, removeEventListener: noop,
  getComputedStyle: () => ({}), requestAnimationFrame: (f) => 0, cancelAnimationFrame: noop,
  matchMedia: () => ({ matches: false, addEventListener: noop }),
}, {
  get(t, p) { if (p in t) return t[p]; return undefined; },
  set(t, p, v) { t[p] = v; return true; },
});
globalThis.window = win;
globalThis.self = win;
win.Chart = class { constructor() {} destroy() {} update() {} resize() {} };
win.XLSX = { utils: { json_to_sheet: () => ({}), aoa_to_sheet: () => ({}), book_new: () => ({}), book_append_sheet: () => {} }, writeFile: (wb, name) => { win.__xlsxCalls = win.__xlsxCalls || []; win.__xlsxCalls.push({ wb, name }); } };
win.JsBarcode = () => ({ render: () => {} });
Object.defineProperty(globalThis, 'document', { value: {
  getElementById: () => makeEl(),
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
globalThis.fetch = async () => ({ json: async () => ({ current_condition: [{ temp_C: 0, weatherDesc: [{ value: '' }], humidity: 0, windspeedKmph: 0 }], nearest_area: [{ areaName: [{ value: '' }] }] }), ok: true, text: async () => '' });
globalThis.requestAnimationFrame = () => 0;
globalThis.cancelAnimationFrame = () => {}
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
import { createHash } from 'node:crypto';

const bundlePath = process.argv[2] || findBundle();
function findBundle() {
  const dir = fileURLToPath(new URL('../out/renderer/assets/', import.meta.url));
  const files = readdirSync(dir).filter(f => /^index-[A-Za-z0-9_-]+\.js$/.test(f));
  if (files.length === 0) throw new Error('No built bundle found in out/renderer/assets — run npm run build first');
  return join(dir, files[0]);
}
try {
  await import('file:///' + bundlePath.replace(/\\/g, '/'));
  const listeners = domListeners.DOMContentLoaded || [];
  console.log('DOMContentLoaded listeners:', listeners.length);
  for (const fn of listeners) await fn();
  const routes = ['dashboard','clients','utang','transactions','catalog','inventory','stocktake','expenses','suppliers','payments','purchase-orders','reports','settings'];
  for (const r of routes) {
    console.log('ROUTE: ' + r);
    await Promise.race([
      win.navigate(r),
      new Promise(res => setTimeout(res, 5000)).then(() => { throw new Error('TIMEOUT navigating route: ' + r); })
    ]);
  }
  console.log('ALL VIEWS OK: ' + routes.length + ' routes executed');
  win.pushSysNotif('update', 'Version 9.9.9 is ready to download', 'download', '⬆️');
  win.pushSysNotif('update', 'Version 9.9.9 is ready to download', 'download', '⬆️');
  if ((win.__sysNotifs || []).filter(n => n.id === 'update').length !== 1) throw new Error('pushSysNotif did not dedupe by id');
  win.pushSysNotif('ready', 'Version 9.9.9 downloaded', 'restart', '✅');
  if ((win.__sysNotifs || []).length !== 2) throw new Error('pushSysNotif rows missing after two pushes');
  win.dismissSysNotif('update');
  if ((win.__sysNotifs || []).some(n => n.id === 'update')) throw new Error('dismissSysNotif failed to remove row');
  win.dismissSysNotif('ready');
  if ((win.__sysNotifs || []).length !== 0) throw new Error('system notifications not fully cleared');
  console.log('BELL OK: system notifications push / dedupe / dismiss verified');
  await win.exportXlsx();
  const xlsxCalls = win.__xlsxCalls || [];
  if (xlsxCalls.length !== 1 || !xlsxCalls[0].name.endsWith('.xlsx')) throw new Error('exportXlsx did not write a single .xlsx file: ' + JSON.stringify(xlsxCalls.map(c => c.name)));
  console.log('XLSX OK: exportXlsx wrote ' + xlsxCalls[0].name);
  const bt = win.buildReturnTxn(
    { id: 77, invoiceNo: 'INV-00077', clientId: 3, clientName: 'Maria', paymentMethod: 'Cash' },
    [{ description: 'Coke', name: '-2', qty: -2, unitCost: 15 }],
    'defective'
  );
  if (bt.status !== 'return' || bt.invoiceNo !== 'INV-00077-R' || bt.refId !== 77 || bt.grandTotal !== -30 || bt.reason !== 'defective' || bt.subtotal !== -30) throw new Error('buildReturnTxn output wrong: ' + JSON.stringify(bt));
  console.log('REFUND OK: buildReturnTxn → ' + bt.invoiceNo + ' total ' + bt.grandTotal);
  const rs = win.redactSettings([
    { key: 'shopName', value: 'Nena Store' },
    { key: 'cloudBackupPassword', value: 'supersecret' },
    { key: 'smtpConfig', value: JSON.stringify({ host: 'smtp.example.com', user: 'a@b.c', pass: 'hunter2' }) }
  ]);
  const rsText = JSON.stringify(rs);
  if (rsText.includes('supersecret') || rsText.includes('hunter2')) throw new Error('redactSettings leaked a secret');
  if (rs[0].value !== 'Nena Store') throw new Error('redactSettings touched a non-secret setting');
  if (JSON.parse(rs[2].value).pass !== '********') throw new Error('smtpConfig pass not masked');
  console.log('REDACT OK: secrets masked in backup settings, plain settings untouched');
  const salted1 = await win.hashPassword('secret123');
  const salted2 = await win.hashPassword('secret123');
  if (!salted1.startsWith('pbkdf2$')) throw new Error('hashPassword no longer returns a salted PBKDF2 hash: ' + salted1);
  if (salted1 === salted2) throw new Error('hashPassword salted hash must be unique per call (random salt)');
  if (!(await win.verifyPassword('secret123', salted1))) throw new Error('verifyPassword rejects a correct PBKDF2 password');
  if (await win.verifyPassword('wrong', salted1)) throw new Error('verifyPassword accepts a wrong PBKDF2 password');
  const legacyHex = createHash('sha256').update('legacy').digest('hex');
  if (!(await win.verifyPassword('legacy', legacyHex))) throw new Error('verifyPassword must still accept v3.9.2 unsalted SHA-256 hashes (migration)');
  if (await win.verifyPassword('wrong', legacyHex)) throw new Error('verifyPassword accepts a wrong legacy password');
  if (!(await win.verifyPassword('plainpw', 'plainpw'))) throw new Error('verifyPassword must still accept legacy plaintext passwords');
  if (await win.verifyPassword('pl4inpw', 'plainpw')) throw new Error('verifyPassword accepts a wrong plaintext password');
  if (await win.verifyPassword('x', 'pbkdf2$999$AAAA$AAAA')) throw new Error('verifyPassword must reject malformed pbkdf2 hashes');
  console.log('PASSWORD OK: salted PBKDF2 hashing + legacy SHA-256/plaintext migration verified');
  console.log('DEEP SMOKE OK: boot() + all views executed without errors');
  process.exit(0);
} catch (e) {
  console.error('DEEP SMOKE FAIL:', e.message);
  console.error(e.stack && e.stack.split('\n').slice(0, 8).join('\n'));
  process.exit(1);
}
