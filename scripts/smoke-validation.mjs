// Field-validation test: runs the built bundle with DOM stubs, then exercises
// requireFields/setFieldError directly and through real save handlers.
const noop = () => {};
function makeEl() {
  return {
    value: '', textContent: '', innerHTML: '', checked: false, dataset: {}, disabled: false,
    style: {}, classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
    addEventListener: noop, removeEventListener: noop, appendChild: noop, remove: noop,
    querySelector: () => makeEl(), querySelectorAll: () => [], closest: () => makeEl(),
    focus: noop, click: noop, setAttribute: noop, getAttribute: () => null,
    getContext: () => null, getBoundingClientRect: () => ({ width: 100, height: 100 }),
  };
}
function makeIDBReq(result) { const r = { result, onsuccess: null, onerror: null, error: null }; queueMicrotask(() => { if (r.onsuccess) r.onsuccess({ target: { result: r.result } }); }); return r; }
const fakeOS = {
  getAll: () => makeIDBReq([]), get: () => makeIDBReq(undefined),
  put: () => makeIDBReq(1), add: () => makeIDBReq(1),
  delete: () => makeIDBReq(undefined), clear: () => makeIDBReq(undefined),
};
const fakeDB = {
  transaction: () => ({ objectStore: () => fakeOS }),
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
Object.defineProperty(globalThis, 'indexedDB', { value: {
  open: () => {
    const r = { onupgradeneeded: null, onsuccess: null, onerror: null, result: fakeDB };
    queueMicrotask(() => { if (r.onsuccess) r.onsuccess({ target: { result: fakeDB } }); });
    return r;
  },
}, configurable: true });
Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true });
globalThis.fetch = async () => ({ json: async () => ({}), ok: true, text: async () => '' });
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
  const W = win;
  for (const k of Object.getOwnPropertyNames(win)) {
    Object.defineProperty(globalThis, k, { get: () => win[k], configurable: true });
  }
  for (const fn of domListeners.DOMContentLoaded || []) await fn();

  if (typeof W.requireFields !== 'function') throw new Error('window.requireFields missing');
  if (typeof W.setFieldError !== 'function') throw new Error('window.setFieldError missing');

  const made = [];
  function fakeField(value, parentQueryResult) {
    const cls = { added: [], removed: [], add: (...c) => cls.added.push(...c), remove: (...c) => cls.removed.push(...c), toggle: noop, contains: () => false };
    const el = {
      value, classList: cls, parentElement: {
        querySelector: (sel) => parentQueryResult === undefined ? null : parentQueryResult,
      },
      insertAdjacentElement: (pos, s) => { made.push({ pos, s }); },
      focus: noop, setAttribute: noop,
    };
    return el;
  }

  const bad = fakeField('');
  const good = fakeField('filled');
  const bad2 = fakeField('', null);
  const first = W.requireFields([{ el: bad, msg: 'Please fill out this field' }, { el: good }, { el: bad2, msg: 'X' }]);
  if (first !== bad) throw new Error('requireFields did not return first bad field');
  if (made.length !== 2) throw new Error('expected 2 error spans, got ' + made.length);
  if (!bad.classList.added.includes('border-red-500')) throw new Error('red border not applied');
  W.requireFields([{ el: bad }, { el: good }, { el: bad2 }]);
  if (!good.classList.removed.includes('border-red-500')) throw new Error('error not cleared on pass');

  const prevEls = { 'ef-amount': fakeField('') };
  const savedDoc = globalThis.document;
  Object.defineProperty(globalThis, 'document', { value: { ...savedDoc, getElementById: (id) => prevEls[id] || makeEl() }, configurable: true });
  await W.saveExpense(null);
  console.log('DEBUG added:', JSON.stringify(prevEls['ef-amount'].classList.added), 'made:', made.length);
  if (!prevEls['ef-amount'].classList.added.includes('border-red-500')) throw new Error('saveExpense did not flag empty amount inline');

  prevEls['ef-amount'] = fakeField('250.50');
  prevEls['ef-date'] = fakeField('2026-07-31');
  prevEls['ef-category'] = fakeField('Rent');
  prevEls['ef-desc'] = fakeField('desc');
  prevEls['ef-payee'] = fakeField('payee');
  const before = made.length;
  await W.saveExpense(null);
  console.log('DEBUG2 removed:', JSON.stringify(prevEls['ef-amount'].classList.removed), 'made:', made.length);
  if (made.length !== before) throw new Error('saveExpense should not add error when amount valid');
  if (!prevEls['ef-amount'].classList.removed.includes('border-red-500')) throw new Error('valid amount did not clear the error');

  Object.defineProperty(globalThis, 'document', { value: savedDoc, configurable: true });

  console.log('VALIDATION SMOKE OK: requireFields/setFieldError + saveExpense wiring verified');
  process.exit(0);
} catch (e) {
  console.error('VALIDATION SMOKE FAIL:', e.message);
  console.error(e.stack && e.stack.split('\n').slice(0, 8).join('\n'));
  process.exit(1);
}

