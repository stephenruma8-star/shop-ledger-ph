// Focused harness: verify showMobileAccess() renders QR + tokenized URL via modal
const noop = () => {};
const els = {};
function makeEl() {
  const el = {
    _text: '', _html: '',
    value: '', checked: false, dataset: {}, disabled: false,
    style: {}, classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
    addEventListener: noop, removeEventListener: noop, appendChild: noop, remove: noop,
    querySelector: () => makeEl(), querySelectorAll: () => [], closest: () => makeEl(),
    focus: noop, click: noop, setAttribute: noop, getAttribute: () => null,
    getContext: () => null, getBoundingClientRect: () => ({ width: 100, height: 100 }),
    children: [],
  };
  Object.defineProperty(el, 'textContent', { get() { return el._text; }, set(v) { el._text = String(v); el._html = String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }, configurable: true });
  Object.defineProperty(el, 'innerHTML', { get() { return el._html; }, set(v) { el._html = String(v); el._text = String(v); }, configurable: true });
  return el;
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
const win = new Proxy({
  __app: {},
  electronAPI: {
    generateMobileQR: async () => ({ url: 'http://192.168.1.50:3456?ws=3458&token=abc123xyz', qr: 'data:image/png;base64,FAKEQRDATA', token: 'abc123xyz', wsPort: 3458, tailscale: { url: 'http://100.76.155.97:3456?ws=3458&token=abc123xyz', qr: 'data:image/png;base64,FAKETSQR' } }),
    onShortcut: noop, onUpdateAvailable: noop, onUpdateNotAvailable: noop, onUpdateError: noop,
    onUpdateDownloaded: noop, onUpdateProgress: noop, onLanUpdateSignal: noop, onConfirmExit: noop, onLanDataRefresh: noop,
    onHiddenToTray: noop,
    sendSMS: async () => ({ success: true }),
  },
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
  getElementById: (id) => (els[id] ||= makeEl()),
  querySelector: () => makeEl(),
  querySelectorAll: () => [],
  createElement: () => makeEl(),
  createTextNode: () => ({}),
  addEventListener: noop,
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
const dir = fileURLToPath(new URL('../out/renderer/assets/', import.meta.url));
const files = readdirSync(dir).filter(f => /^index-[A-Za-z0-9_-]+\.js$/.test(f));
if (files.length === 0) throw new Error('No bundle');
const bundlePath = join(dir, files[0]);

try {
  await import('file:///' + bundlePath.replace(/\\/g, '/'));
  if (typeof win.showMobileAccess !== 'function') throw new Error('showMobileAccess global not exposed');
  await win.showMobileAccess();
  const html = els['modal-root'] ? els['modal-root'].innerHTML : '';
  if (!html) throw new Error('modal() did not render (modal-root empty)');
  const checks = {
    'has title': html.includes('Mobile Access'),
    'has QR image': html.includes('data:image/png;base64,FAKEQRDATA'),
    'has tokenized URL': html.includes('http://192.168.1.50:3456?ws=3458&amp;token=abc123xyz'),
    'has copy button': html.includes('copyMobileUrl('),
    'has instructions': html.includes('same Wi-Fi'),
    'has anywhere QR': html.includes('data:image/png;base64,FAKETSQR'),
    'has tailscale URL': html.includes('http://100.76.155.97:3456?ws=3458&amp;token=abc123xyz'),
  };
  let ok = true;
  for (const [k, v] of Object.entries(checks)) { console.log((v ? 'PASS' : 'FAIL') + ' - ' + k); if (!v) ok = false; }
  if (typeof win.copyMobileUrl !== 'function') { console.log('FAIL - copyMobileUrl global'); ok = false; }
  console.log(ok ? 'MOBILE ACCESS HARNESS OK' : 'MOBILE ACCESS HARNESS FAIL');
  process.exit(ok ? 0 : 1);
} catch (e) {
  console.error('HARNESS ERROR:', e.message);
  console.error(e.stack && e.stack.split('\n').slice(0, 8).join('\n'));
  process.exit(1);
}
