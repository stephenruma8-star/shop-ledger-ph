// Unit tests for pure functions — run with: node scripts/test-unit.mjs
import assert from 'node:assert/strict';

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failed++; console.error(`  ✗ ${name}: ${e.message}`); }
}

console.log('\n=== round2 ===');
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
test('rounds 1.005 to 1.00 (JS float edge case)', () => assert.strictEqual(round2(1.005), 1.00));
test('rounds 2.675 to 2.68', () => assert.strictEqual(round2(2.675), 2.68));
test('rounds 0.1 + 0.2 to 0.3', () => assert.strictEqual(round2(0.1 + 0.2), 0.3));
test('handles null', () => assert.strictEqual(round2(null), 0));
test('handles undefined', () => assert.strictEqual(round2(undefined), 0));
test('handles empty string', () => assert.strictEqual(round2(''), 0));
test('handles negative', () => assert.strictEqual(round2(-1.005), -1.00));
test('rounds 99999.999 to 100000', () => assert.strictEqual(round2(99999.999), 100000));

console.log('\n=== peso ===');
const peso = (n) => '₱' + (Math.round(Number(n || 0) * 100) / 100).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
test('formats 0', () => assert.strictEqual(peso(0), '₱0.00'));
test('formats 100', () => assert.strictEqual(peso(100), '₱100.00'));
test('formats 1234.5', () => assert.strictEqual(peso(1234.5), '₱1,234.50'));
test('formats 1000000', () => assert.strictEqual(peso(1000000), '₱1,000,000.00'));
test('formats null', () => assert.strictEqual(peso(null), '₱0.00'));
test('formats string', () => assert.strictEqual(peso('1234.5'), '₱1,234.50'));

console.log('\n=== dp (date parser) ===');
const dp = (d) => { const p = (d||'').split('-'); return { y: p[0]||'', m: p[1]||'', d: p[2]||'' }; };
test('parses 2026-08-25', () => assert.deepStrictEqual(dp('2026-08-25'), { y: '2026', m: '08', d: '25' }));
test('parses empty', () => assert.deepStrictEqual(dp(''), { y: '', m: '', d: '' }));
test('parses null', () => assert.deepStrictEqual(dp(null), { y: '', m: '', d: '' }));

console.log('\n=== validateNumber ===');
const validateNumber = (v) => !isNaN(parseFloat(v)) && isFinite(v) && parseFloat(v) >= 0;
test('accepts 0', () => assert.ok(validateNumber(0)));
test('accepts 100', () => assert.ok(validateNumber(100)));
test('accepts 3.14', () => assert.ok(validateNumber(3.14)));
test('accepts "50"', () => assert.ok(validateNumber('50')));
test('rejects -1', () => assert.ok(!validateNumber(-1)));
test('rejects NaN', () => assert.ok(!validateNumber(NaN)));
test('rejects Infinity', () => assert.ok(!validateNumber(Infinity)));
test('rejects "abc"', () => assert.ok(!validateNumber('abc')));
test('rejects null', () => assert.ok(!validateNumber(null)));

console.log('\n=== validatePhone ===');
const validatePhone = (v) => /^(\+63|0)?\d{10,11}$/.test(String(v).trim());
test('accepts 09171234567', () => assert.ok(validatePhone('09171234567')));
test('accepts +639171234567', () => assert.ok(validatePhone('+639171234567')));
test('accepts 9171234567', () => assert.ok(validatePhone('9171234567')));
test('rejects 123', () => assert.ok(!validatePhone('123')));
test('rejects abc', () => assert.ok(!validatePhone('abc')));
test('rejects empty', () => assert.ok(!validatePhone('')));

console.log('\n=== parseCSVLine ===');
function parseCSVLine(line) {
  const result = []; let current = ''; let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"') { if (line[i+1] === '"') { current += '"'; i++; } else { inQuotes = false; } }
      else { current += c; }
    } else {
      if (c === '"') { inQuotes = true; }
      else if (c === ',') { result.push(current); current = ''; }
      else { current += c; }
    }
  }
  result.push(current);
  return result;
}
test('parses simple CSV', () => assert.deepStrictEqual(parseCSVLine('a,b,c'), ['a', 'b', 'c']));
test('parses quoted fields', () => assert.deepStrictEqual(parseCSVLine('"a","b","c"'), ['a', 'b', 'c']));
test('parses escaped quotes', () => assert.deepStrictEqual(parseCSVLine('"a""b",c'), ['a"b', 'c']));
test('parses empty fields', () => assert.deepStrictEqual(parseCSVLine('a,,c'), ['a', '', 'c']));

console.log('\n=== PBKDF2 password hashing ===');
const crypto = await import('node:crypto');
const webcrypto = globalThis.crypto || crypto.webcrypto;
if (!globalThis.crypto) globalThis.crypto = { subtle: webcrypto.subtle, getRandomValues: (arr) => crypto.randomBytes(arr.length) };

const _pwEnc = new TextEncoder();
const _pwB64enc = (bytes) => { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(s); };
const _pwB64dec = (str) => { const bin = atob(str); return Uint8Array.from(bin, c => c.charCodeAt(0)); };
const _pwTimingSafeEq = (a, b) => { if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a[i] ^ b[i]; return d === 0; };
const PBKDF2_ITER = 210000;

async function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const key = await globalThis.crypto.subtle.importKey('raw', _pwEnc.encode(pw), 'PBKDF2', false, ['deriveBits']);
  const bits = await globalThis.crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: PBKDF2_ITER, hash: 'SHA-256' }, key, 256);
  return `pbkdf2$${PBKDF2_ITER}$${_pwB64enc(salt)}$${_pwB64enc(new Uint8Array(bits))}`;
}

async function verifyPassword(pw, stored) {
  if (!stored) return false;
  if (stored.startsWith('pbkdf2$')) {
    const parts = stored.split('$');
    const iter = parseInt(parts[1]); const salt = _pwB64dec(parts[2]); const hash = _pwB64dec(parts[3]);
    const key = await globalThis.crypto.subtle.importKey('raw', _pwEnc.encode(pw), 'PBKDF2', false, ['deriveBits']);
    const derived = new Uint8Array(await globalThis.crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: iter, hash: 'SHA-256' }, key, 256));
    return _pwTimingSafeEq(derived, hash);
  }
  if (/^[a-f0-9]{64}$/i.test(stored)) {
    const h = await globalThis.crypto.subtle.digest('SHA-256', _pwEnc.encode(pw));
    const hex = Array.from(new Uint8Array(h)).map(b => b.toString(16).padStart(2, '0')).join('');
    const ok = hex === stored;
    return ok;
  }
  return pw === stored;
}

test('hashPassword returns pbkdf2 format', async () => {
  const h = await hashPassword('test123');
  assert.ok(h.startsWith('pbkdf2$'));
  assert.ok(h.split('$').length === 4);
});

test('verifyPassword matches correct password', async () => {
  const h = await hashPassword('mypassword');
  assert.ok(await verifyPassword('mypassword', h));
});

test('verifyPassword rejects wrong password', async () => {
  const h = await hashPassword('mypassword');
  assert.ok(!(await verifyPassword('wrongpassword', h)));
});

test('verifyPassword handles legacy SHA-256', async () => {
  const h = await globalThis.crypto.subtle.digest('SHA-256', _pwEnc.encode('legacy'));
  const hex = Array.from(new Uint8Array(h)).map(b => b.toString(16).padStart(2, '0')).join('');
  assert.ok(await verifyPassword('legacy', hex));
});

test('verifyPassword handles plaintext', async () => {
  assert.ok(await verifyPassword('plaintext', 'plaintext'));
});

test('verifyPassword rejects null', async () => {
  assert.ok(!(await verifyPassword('test', null)));
});

test('verifyPassword rejects empty', async () => {
  assert.ok(!(await verifyPassword('test', '')));
});

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
process.exit(failed > 0 ? 1 : 0);
