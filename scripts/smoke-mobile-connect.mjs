// Smoke: native-app bootstrap page (mobile-app/www/connect.js) — URL
// normalization, QR validity handling, saved-server rendering. DOM stubbed.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import vm from 'node:vm';
import { join, resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const src = readFileSync(join(root, 'mobile-app', 'www', 'connect.js'), 'utf8');

let failures = 0;
const ok = (cond, msg) => { if (cond) console.log('PASS - ' + msg); else { failures++; console.error('FAIL - ' + msg); } };

const store = new Map();
const els = new Map();
const makeEl = () => ({ value: '', textContent: '', innerHTML: '', style: {}, classList: { add() {}, remove() {}, toggle() {} }, addEventListener() {}, querySelectorAll: () => [] });
const sandbox = {
  console, URL, JSON,
  window: { Capacitor: undefined, location: { href: '' } },
  document: {
    getElementById: (id) => { if (!els.has(id)) els.set(id, makeEl()); return els.get(id); },
    addEventListener: () => {},
  },
  localStorage: {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  },
  fetch: async () => ({ ok: true, json: async () => ({ status: 'ok' }) }),
  setTimeout: (fn) => { fn(); return 0; },
  clearTimeout: () => {},
};
vm.createContext(sandbox);
vm.runInContext(src + '\n;globalThis.__t = { normalizeUrl, escapeHtml, loadServers, saveServers };', sandbox);
const T = vm.runInContext('__t', sandbox);

const u1 = T.normalizeUrl('192.168.1.5:3456');
ok(u1 && u1.origin === 'http://192.168.1.5:3456', 'bare IP:port gets http://');
ok(T.normalizeUrl('https://shop.example.com/')?.protocol === 'https:', 'https preserved, trailing slash fine');
ok(T.normalizeUrl('') === null && T.normalizeUrl('not a url at all !!!') === null, 'garbage rejected');
ok(T.normalizeUrl('ftp://x/y') === null, 'non-http scheme rejected');
ok(T.escapeHtml(`<'"&>`) === '&lt;&#39;&quot;&amp;&gt;', 'escapeHtml covers markup chars');

store.set('slpServers', JSON.stringify([{ name: 'Shop', url: 'http://192.168.1.5:3456' }]));
vm.runInContext('renderServers()', sandbox);
const listHtml = els.get('srv-list').innerHTML;
ok(listHtml.includes('Shop') && listHtml.includes('data-connect'), 'saved servers render with connect buttons');

if (failures) { console.error('CONNECT SMOKE FAILED: ' + failures); process.exit(1); }
console.log('CONNECT SMOKE OK');

// version stamp: versions a scratch build.gradle without touching the project
{
  const dir = join(tmpdir(), 'slp-stamp-' + Date.now());
  mkdirSync(dir, { recursive: true });
  const g = join(dir, 'build.gradle');
  writeFileSync(g, 'android {\n    defaultConfig {\n        versionCode 1\n        versionName "1.0"\n    }\n}\n');
  execFileSync(process.execPath, [join(root, 'mobile-app', 'scripts', 'stamp-android-version.mjs')], {
    env: { ...process.env, STAMP_GRADLE: g, STAMP_VERSION: '3.30.0' }, stdio: 'pipe',
  });
  const out = readFileSync(g, 'utf8');
  if (!out.includes('versionCode 3030000') || !out.includes('versionName "3.30.0"')) {
    console.error('FAIL - stamp writes versionCode/versionName');
    process.exit(1);
  }
  console.log('PASS - stamp writes versionCode/versionName');
  console.log('STAMP SMOKE OK');
}
