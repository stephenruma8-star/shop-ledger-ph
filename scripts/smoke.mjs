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
win.XLSX = { utils: { json_to_sheet: () => ({}), aoa_to_sheet: () => ({}), book_new: () => ({}), book_append_sheet: () => {} }, writeFile: () => {} };
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
  console.log('DEEP SMOKE OK: boot() + all views executed without errors');
  process.exit(0);
} catch (e) {
  console.error('DEEP SMOKE FAIL:', e.message);
  console.error(e.stack && e.stack.split('\n').slice(0, 8).join('\n'));
  process.exit(1);
}
