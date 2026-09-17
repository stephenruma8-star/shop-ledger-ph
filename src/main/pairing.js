// Device pairing codes: the phone types a short-lived 6-digit code (shown on the
// desktop) instead of scanning a QR. Pure Node (no electron import) so the logic
// stays unit-testable; the token is read through a getter so LAN token rotation
// is always honored. Single active code, TTL-guarded, burned after 5 wrong guesses.
const crypto = require('crypto');

let _getToken = () => null;
let _wsPort = 3458;
let _ttlMs = 10 * 60 * 1000;
let _pairCode = null; // { code, expiresAt, attempts }

function configure(opts) {
  opts = opts || {};
  if (typeof opts.getToken === 'function') _getToken = opts.getToken;
  if (opts.wsPort) _wsPort = opts.wsPort;
  if (opts.ttlMs) _ttlMs = opts.ttlMs;
}

function createPairCode() {
  const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  _pairCode = { code, expiresAt: Date.now() + _ttlMs, attempts: 0 };
  return { success: true, code, expiresIn: Math.floor(_ttlMs / 1000) };
}

function redeemPairCode(input) {
  const code = String(input || '').replace(/\D/g, '');
  if (!_pairCode || Date.now() > _pairCode.expiresAt) { _pairCode = null; return { ok: false, error: 'Code expired — generate a new one on the desktop app' }; }
  if (_pairCode.attempts >= 5) { _pairCode = null; return { ok: false, error: 'Too many attempts — generate a new code' }; }
  if (code !== _pairCode.code) {
    _pairCode.attempts++;
    if (_pairCode.attempts >= 5) _pairCode = null;
    return { ok: false, error: 'Wrong code' };
  }
  _pairCode = null;
  return { ok: true, token: _getToken(), wsPort: _wsPort };
}

function invalidate() { _pairCode = null; }

module.exports = { configure, createPairCode, redeemPairCode, invalidate };
