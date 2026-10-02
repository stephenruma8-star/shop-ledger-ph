// Device pairing + per-device access tokens: the phone types a short-lived
// 6-digit code (shown on the desktop) or scans a single-use QR claim, and gets
// its OWN token instead of the shared house token. Each device can then be
// revoked individually without kicking every other phone.
// Pure Node (no electron import) so the logic stays unit-testable.
const crypto = require('crypto');

let _getToken = () => null;
let _wsPort = 3458;
let _ttlMs = 10 * 60 * 1000;
let _pairCode = null; // { code, expiresAt, attempts }
let _devices = []; // { id, token, name, createdAt, lastSeen }
let _claims = []; // { claim, expiresAt }
const MAX_DEVICES = 25;
const CLAIM_TTL_MS = 15 * 60 * 1000;

function configure(opts) {
  opts = opts || {};
  if (typeof opts.getToken === 'function') _getToken = opts.getToken;
  if (opts.wsPort) _wsPort = opts.wsPort;
  if (opts.ttlMs) _ttlMs = opts.ttlMs;
}

function cleanName(name) {
  // Display names end up in desktop HTML and rendererExec JS strings: strip
  // quotes, backslashes and newlines so a hostile name cannot break out.
  return String(name || '').replace(/['"`\\\n\r]/g, '').trim().slice(0, 24) || 'Phone';
}

function cleanRole(role) {
  return role === 'owner' ? 'owner' : 'cashier';
}

function createPairCode() {
  const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  _pairCode = { code, expiresAt: Date.now() + _ttlMs, attempts: 0 };
  return { success: true, code, expiresIn: Math.floor(_ttlMs / 1000) };
}

// Issues a device-bound token. New phones start as cashier (least privilege);
// the shop owner promotes their own phone on the desktop. Throws when the
// registry is full so the shop revokes a stale phone instead of growing unbounded.
function issueDeviceToken(name, role) {
  if (_devices.length >= MAX_DEVICES) throw new Error('Too many paired phones — revoke one on the desktop first');
  const id = 'dev-' + crypto.randomBytes(4).toString('hex');
  const token = 'dev_' + crypto.randomBytes(24).toString('hex');
  const rec = { id, token, name: cleanName(name), role: cleanRole(role), createdAt: Date.now(), lastSeen: null };
  _devices.push(rec);
  return { id, token, name: rec.name, role: rec.role, wsPort: _wsPort };
}

// Single verification point for every LAN entry (HTTP middleware, WS auth,
// /api/auth/verify). Master house token stays valid for PC-to-PC sync and
// legacy bookmarked links; device tokens identify one phone each.
function verifyToken(t) {
  try {
    if (!t || typeof t !== 'string') return { ok: false };
    if (t === _getToken()) return { ok: true, master: true, device: null };
    const d = _devices.find(x => x.token === t);
    if (!d) return { ok: false };
    d.lastSeen = Date.now();
    return { ok: true, master: false, device: { id: d.id, name: d.name, role: d.role || 'cashier' } };
  } catch (e) { return { ok: false }; }
}

function listDevices() {
  // Never exposes the token secrets — revocation works by id.
  return _devices.map(d => ({ id: d.id, name: d.name, role: d.role || 'cashier', createdAt: d.createdAt, lastSeen: d.lastSeen }));
}

// Changes a phone's role from the desktop (owner <-> cashier).
function setDeviceRole(id, role) {
  const d = _devices.find(x => x.id === String(id));
  if (!d) return false;
  d.role = cleanRole(role);
  return true;
}

function revokeDeviceToken(id) {
  const i = _devices.findIndex(d => d.id === String(id));
  if (i < 0) return false;
  _devices.splice(i, 1);
  return true;
}

function clearDeviceTokens() { _devices = []; }

// Full records (including secrets) for persistence to the desktop prefs file.
// Never sent to the renderer — the UI only ever sees listDevices().
function exportDevices() {
  return _devices.map(d => ({ id: d.id, token: d.token, name: d.name, role: d.role || 'cashier', createdAt: d.createdAt }));
}

// Restores persisted registry at boot. Malformed entries are dropped, never trusted.
function restoreDevices(arr) {
  _devices = [];
  for (const d of Array.isArray(arr) ? arr : []) {
    if (!d || typeof d.id !== 'string' || typeof d.token !== 'string') continue;
    if (!/^dev-[0-9a-f]{8}$/.test(d.id) || !/^dev_[0-9a-f]{48}$/.test(d.token)) continue;
    _devices.push({ id: d.id, token: d.token, name: cleanName(d.name), role: cleanRole(d.role), createdAt: Number(d.createdAt) || Date.now(), lastSeen: null });
  }
  return _devices.length;
}

function redeemPairCode(input, name) {
  const code = String(input || '').replace(/\D/g, '');
  if (!_pairCode || Date.now() > _pairCode.expiresAt) { _pairCode = null; return { ok: false, error: 'Code expired — generate a new one on the desktop app' }; }
  if (_pairCode.attempts >= 5) { _pairCode = null; return { ok: false, error: 'Too many attempts — generate a new code' }; }
  if (code !== _pairCode.code) {
    _pairCode.attempts++;
    if (_pairCode.attempts >= 5) _pairCode = null;
    return { ok: false, error: 'Wrong code' };
  }
  _pairCode = null;
  try {
    const d = issueDeviceToken(name, 'cashier');
    return { ok: true, token: d.token, deviceId: d.id, name: d.name, role: d.role, wsPort: d.wsPort };
  } catch (e) { return { ok: false, error: e.message }; }
}

// Single-use QR claims: the desktop QR embeds one, the phone exchanges it for
// a device token. The shared house token never travels in QR links anymore.
function createClaim() {
  pruneClaims();
  const claim = crypto.randomBytes(9).toString('hex');
  _claims.push({ claim, expiresAt: Date.now() + CLAIM_TTL_MS });
  return { claim, expiresIn: Math.floor(CLAIM_TTL_MS / 1000) };
}

function pruneClaims() {
  const now = Date.now();
  _claims = _claims.filter(c => c && c.expiresAt > now);
}

function redeemClaim(input, name) {
  pruneClaims();
  const claim = String(input || '').trim();
  const i = _claims.findIndex(c => c.claim === claim);
  if (i < 0) return { ok: false, error: 'QR code expired — reopen Mobile Access on the desktop for a fresh one' };
  _claims.splice(i, 1);
  try {
    const d = issueDeviceToken(name, 'cashier');
    return { ok: true, token: d.token, deviceId: d.id, name: d.name, role: d.role, wsPort: d.wsPort };
  } catch (e) { return { ok: false, error: e.message }; }
}

function invalidate() { _pairCode = null; _claims = []; }

module.exports = { configure, createPairCode, redeemPairCode, createClaim, redeemClaim, issueDeviceToken, verifyToken, listDevices, exportDevices, setDeviceRole, revokeDeviceToken, clearDeviceTokens, restoreDevices, invalidate, MAX_DEVICES };
