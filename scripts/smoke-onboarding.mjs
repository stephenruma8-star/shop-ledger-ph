// Smoke test for the offline banner and first-run onboarding wizard.
// Boots the built bundle with DOM stubs, then verifies:
//  - conn-banner toggles when navigator.onLine flips
//  - maybeOnboard guards (admin only, onboardingDone, shopName set)
//  - wizard renders, validates, persists settings, and closes
const noop = () => {};
const writes = [];
class TrackedClassList {
  constructor() { this.calls = []; }
  add(...c) { this.calls.push(['add', ...c]); }
  remove(...c) { this.calls.push(['remove', ...c]); }
  toggle(name, force) { this.calls.push(['toggle', name, force]); return force === undefined ? false : force; }
  contains() { return false; }
}
const sharedParent = { innerHTML: '', textContent: '', value: '', classList: { add: noop, remove: noop, toggle: noop, contains: () => false } };
const els = {};
function makeEl(id) {
  return {
    id, innerHTML: '', textContent: '', value: '', className: '', disabled: false,
    style: {}, dataset: {},
    classList: new TrackedClassList(),
    parentElement: sharedParent, parentNode: sharedParent,
    addEventListener: noop, removeEventListener: noop,
    append: noop, appendChild: (el) => { if (id === 'toasts') toasts.push(el.textContent); },
    remove: noop,
    querySelector: () => makeEl(), querySelectorAll: () => [],
    closest: () => makeEl(),
    focus: noop, click: noop, setAttribute: noop, getAttribute: () => null,
    getContext: () => null, getBoundingClientRect: () => ({ width: 100, height: 100 }),
    outerHTML: '',
  };
}
function getEl(id) { if (!els[id]) els[id] = makeEl(id); return els[id]; }
const toasts = [];
function makeIDBReq(result) { const r = { result, onsuccess: null, onerror: null, error: null }; queueMicrotask(() => { if (r.onsuccess) r.onsuccess({ target: { result: r.result } }); }); return r; }
const fakeOS = {
  name: '',
  getAll: () => makeIDBReq([]), get: () => makeIDBReq(undefined),
  put: (v) => { writes.push({ store: fakeOS.name, method: 'put', value: v }); return makeIDBReq(1); },
  add: (v) => { writes.push({ store: fakeOS.name, method: 'add', value: v }); return makeIDBReq(1); },
  delete: () => makeIDBReq(undefined), clear: () => makeIDBReq(undefined),
};
const fakeDB = {
  transaction: (name) => {
    fakeOS.name = name;
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
Object.defineProperty(globalThis, 'navigator', { value: { onLine: undefined }, configurable: true });
globalThis.requestAnimationFrame = () => 0;
globalThis.cancelAnimationFrame = () => {};
process.on('unhandledRejection', () => {});
process.on('uncaughtException', () => {});
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
  if (typeof W.boot !== 'function') throw new Error('window.boot missing');
  await Promise.race([
    W.boot(),
    new Promise((_, rej) => setTimeout(() => rej(new Error('boot() timed out in harness')), 8000)),
  ]);
  const banner = getEl('conn-banner');
  const modalRoot = getEl('modal-root');

  // --- offline banner ---
  if (typeof W.updateConnStatus !== 'function') throw new Error('window.updateConnStatus missing');
  const bootToggle = banner.classList.calls.find(c => c[0] === 'toggle' && c[1] === 'hidden');
  if (!bootToggle || bootToggle[2] !== false) throw new Error('banner not visible while offline at boot: ' + JSON.stringify(banner.classList.calls));
  navigator.onLine = true;
  await W.updateConnStatus();
  const onlineToggle = banner.classList.calls.filter(c => c[0] === 'toggle' && c[1] === 'hidden').pop();
  if (!onlineToggle || onlineToggle[2] !== true) throw new Error('banner not hidden when back online');
  console.log('PASS - conn-banner visible while offline, hidden when back online');

  // --- maybeOnboard guards ---
  if (typeof W.maybeOnboard !== 'function') throw new Error('window.maybeOnboard missing');
  if (W.__app._onAfterLogin !== W.maybeOnboard) throw new Error('boot did not wire maybeOnboard as _onAfterLogin');
  const S = W.state;
  S.user = null; S.settings = [];
  if (W.maybeOnboard() !== undefined) throw new Error('wizard shown to void user');
  S.user = { role: 'staff' };
  if (W.maybeOnboard() !== undefined) throw new Error('wizard shown to non-admin');
  S.user = { role: 'admin' }; S.settings = [{ key: 'onboardingDone', value: 'true' }];
  if (W.maybeOnboard() !== undefined) throw new Error('wizard shown when onboardingDone=true');
  S.settings = [{ key: 'shopName', value: "Aling Nena's Store" }];
  if (W.maybeOnboard() !== undefined) throw new Error('wizard shown when shopName customized');
  console.log('PASS - maybeOnboard guards: admin only, skips when done or shopName set');
  console.log('PASS - boot wired maybeOnboard as _onAfterLogin');

  // --- wizard flow ---
  S.settings = [];
  W.maybeOnboard();
  if (!modalRoot.innerHTML.includes('Set up your store')) throw new Error('wizard step 1 not rendered');
  const writesBefore = writes.length;
  getEl('onb-name').value = '';
  await W.onbNext();
  if (modalRoot.innerHTML.includes('Receipt footer')) throw new Error('empty store name advanced the wizard');
  if (toasts.filter(t => t === 'Enter your store name').length === 0) throw new Error('no warning toast for empty store name');
  if (writes.length !== writesBefore) throw new Error('settings written despite validation failure');
  console.log('PASS - empty store name blocked with warning toast, nothing written');

  getEl('onb-name').value = "Aling Nena's Store";
  getEl('onb-contact').value = '0917 123 4567';
  getEl('onb-address').value = 'Tondo, Manila';
  await W.onbNext();
  if (!modalRoot.innerHTML.includes('Receipt footer')) throw new Error('wizard did not advance to step 2');
  const writtenKeys = writes.map(w => w.value && w.value.key);
  for (const k of ['shopName', 'shopContact', 'shopAddress']) {
    if (!writtenKeys.includes(k)) throw new Error('missing settings write: ' + k);
  }
  console.log('PASS - step 1 saves shopName / shopContact / shopAddress and advances');

  getEl('onb-footer').value = '';
  await W.onbFinish();
  const finalKeys = writes.map(w => w.value && w.value.key);
  if (!finalKeys.includes('receiptFooter')) throw new Error('receiptFooter not saved');
  const footerWrite = writes.find(w => w.value && w.value.key === 'receiptFooter');
  if (footerWrite.value.value !== 'Salamat po sa pagbili!') throw new Error('receipt footer default not applied');
  if (!finalKeys.includes('onboardingDone')) throw new Error('onboardingDone not saved');
  if (modalRoot.innerHTML !== '') throw new Error('wizard did not close on finish');
  if (writes.filter(w => w.value && w.value.key === undefined && w.store === 'auditLogs').length === 0) throw new Error('setup not audited');
  if (toasts.filter(t => t === 'Store setup complete').length === 0) throw new Error('no success toast after setup');
  console.log('PASS - finish saves receipt footer (default applied) + onboardingDone, audits, closes, toasts');

  console.log('ONBOARDING SMOKE OK: banner + wizard guards + step flow all verified');
  process.exit(0);
} catch (e) {
  console.error('ONBOARDING SMOKE FAIL:', e.message);
  console.error(e.stack && e.stack.split('\n').slice(0, 8).join('\n'));
  process.exit(1);
}