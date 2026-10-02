// Smoke: OS-protected secrets layer (src/main/db.js dpapiEncrypt/dpapiDecrypt).
// Runs in plain Node with an injected fake store (same shape as Electron
// safeStorage). Covers: round-trip, prefixing, idempotency, passthroughs,
// corrupt/wrong-machine blobs, and renderer/main key-list sync.
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { dpapiEncrypt, dpapiDecrypt, SENSITIVE_SETTINGS } = require('../src/main/db.js');

let passed = 0, failed = 0;
const ok = (cond, name) => { if (cond) { passed++; console.log('  ok ' + name); } else { failed++; console.error('  FAIL ' + name); } };

// Reversible fake store; throws on blobs it did not create (like DPAPI on a
// foreign machine or corrupted input).
const fakeStore = {
  encryptString: (s) => Buffer.from('X' + s.split('').reverse().join('')),
  decryptString: (b) => {
    const s = Buffer.from(b).toString();
    if (!s.startsWith('X')) throw new Error('bad blob');
    return s.slice(1).split('').reverse().join('');
  }
};
const otherStore = {
  encryptString: (s) => Buffer.from('Y' + s),
  decryptString: () => { throw new Error('wrong machine'); }
};

ok(Array.isArray(SENSITIVE_SETTINGS) && SENSITIVE_SETTINGS.length >= 5, 'sensitive key list non-empty');
for (const key of SENSITIVE_SETTINGS) {
  const secret = 's3cr3t-for-' + key + '-!@#';
  const enc = dpapiEncrypt(secret, fakeStore);
  ok(typeof enc === 'string' && enc.startsWith('dpapi:v1:') && enc !== secret, key + ' encrypts with prefix');
  ok(dpapiDecrypt(enc, fakeStore) === secret, key + ' round-trips');
}
ok(dpapiDecrypt(dpapiEncrypt('', fakeStore), fakeStore) === '', 'empty string round-trips');

// Idempotency: never double-wrap.
const once = dpapiEncrypt('abc', fakeStore);
ok(dpapiEncrypt(once, fakeStore) === once, 'encrypt is idempotent');

// Plaintext passes through decrypt untouched (pre-migration values).
ok(dpapiDecrypt('plaintext', fakeStore) === 'plaintext', 'decrypt passes plaintext through');
ok(dpapiDecrypt('dpapi:v0:old', fakeStore) === 'dpapi:v0:old', 'decrypt ignores foreign prefix');

// Non-string inputs pass through encrypt ('' is a string: it gets encrypted).
for (const v of [null, undefined, 123, false]) {
  ok(dpapiEncrypt(v, fakeStore) === v, 'encrypt passes through ' + JSON.stringify(v));
}
ok(dpapiDecrypt(null, fakeStore) === null && dpapiDecrypt(123, fakeStore) === 123, 'decrypt passes non-strings through');

// Corrupt / wrong-machine blobs decrypt to '' (user re-enters the secret).
ok(dpapiDecrypt('dpapi:v1:!!!not-base64!!!', fakeStore) === '', 'corrupt blob -> empty');
ok(dpapiDecrypt(dpapiEncrypt('x', fakeStore), otherStore) === '', 'foreign-store blob -> empty');

// Headless fallback (no Electron store): encrypt passes through, decrypt yields ''.
ok(dpapiEncrypt('abc', null) === 'abc', 'no store: encrypt passes through');
ok(dpapiDecrypt('dpapi:v1:eQ==', null) === '', 'no store: decrypt yields empty');

// Renderer migration list must mirror the main-process list.
const settingsSrc = readFileSync(resolve(root, 'src', 'renderer', 'js', 'settings.js'), 'utf8');
const m = settingsSrc.match(/PROTECTED_SETTING_KEYS\s*=\s*\[([^\]]*)\]/);
const rendererKeys = m ? [...m[1].matchAll(/'([^']+)'/g)].map(x => x[1]) : [];
ok(rendererKeys.length > 0, 'renderer key list found');
ok(JSON.stringify([...rendererKeys].sort()) === JSON.stringify([...SENSITIVE_SETTINGS].sort()), 'renderer/main key lists in sync');

if (failed) { console.error(`Secrets smoke: ${passed} passed, ${failed} failed`); process.exit(1); }
console.log(`Secrets smoke: ${passed} passed, 0 failed`);
