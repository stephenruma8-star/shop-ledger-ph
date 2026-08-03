// Deep smoke test: executes the built bundle with DOM stubs, then fires DOMContentLoaded
// to run boot() -> navigate -> every view function. Catches missing imports,
// strict-mode implicit globals, and cross-module call errors.
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
function makeIDBReq(result) { const r = { result, onsuccess: null, onerror: null, error: null }; return r; }
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
  console.log('DEEP SMOKE OK: boot() + all views executed without errors');
  process.exit(0);
} catch (e) {
  console.error('DEEP SMOKE FAIL:', e.message);
  console.error(e.stack && e.stack.split('\n').slice(0, 8).join('\n'));
  process.exit(1);
}
