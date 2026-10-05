// ---------- BACKUP CRYPTO ----------
// Password protection for phone ledger backups: PBKDF2-SHA256 (150k) +
// AES-GCM. Unlike CBC, GCM authenticates: a wrong password ALWAYS throws,
// deterministically. WebCrypto only (secure context — true in Capacitor).
// Concatenated, no imports/exports.
function _b64e(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}
function _b64d(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
async function _backupKey(password, salt) {
  const enc = new TextEncoder();
  const base = await crypto.subtle.importKey('raw', enc.encode(String(password || '')), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 150000, hash: 'SHA-256' },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']
  );
}
async function backupEncrypt(jsonText, password) {
  if (!password) throw new Error('Backup password required');
  if (!crypto.subtle) throw new Error('Secure crypto unavailable on this phone');
  const enc = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await _backupKey(password, salt);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(String(jsonText)));
  return { app: 'shop-ledger-standalone-backup', v: 1, enc: 'aes-gcm/pbkdf2', salt: _b64e(salt), iv: _b64e(iv), data: _b64e(new Uint8Array(ct)) };
}
async function backupDecrypt(obj, password) {
  if (!obj || obj.app !== 'shop-ledger-standalone-backup' || !obj.data || !obj.salt || !obj.iv) {
    throw new Error('Not a Shop Ledger phone backup file');
  }
  if (!password) throw new Error('This backup needs its password');
  if (!crypto.subtle) throw new Error('Secure crypto unavailable on this phone');
  const key = await _backupKey(password, _b64d(obj.salt));
  let pt;
  try {
    pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: _b64d(obj.iv) }, key, _b64d(obj.data));
  } catch (e) {
    throw new Error('Wrong backup password');
  }
  return new TextDecoder().decode(pt);
}
