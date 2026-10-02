// Unit tests for pairing + per-device tokens + QR claims (src/main/pairing.js):
// code format, single-use redeem, wrong-code burn, expiry, invalidation,
// device issue/verify/revoke/persist-round-trip, claim redeem, registry cap.
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const pairing = require('../src/main/pairing.js');

let failures = 0;
function ok(cond, msg) {
  if (cond) console.log('PASS - ' + msg);
  else { failures++; console.error('FAIL - ' + msg); }
}
const wait = (ms) => new Promise(r => setTimeout(r, ms));

pairing.configure({ getToken: () => 'tok-live-1', wsPort: 3458, ttlMs: 600000 });
pairing.clearDeviceTokens();

// create: 6-digit format
const c1 = pairing.createPairCode();
ok(c1.success === true && /^\d{6}$/.test(c1.code), 'created code is 6 digits');

// redeem issues a DEVICE token (never the house token), tagged with the phone name
const r1 = pairing.redeemPairCode(c1.code, 'Ana');
ok(r1.ok === true && typeof r1.token === 'string' && r1.token.startsWith('dev_') && r1.token !== 'tok-live-1', 'valid code issues device token');
ok(/^dev-[0-9a-f]+$/.test(r1.deviceId || '') && r1.name === 'Ana' && r1.wsPort === 3458, 'redeem returns device id + name + wsPort');
ok(r1.role === 'cashier', 'new phones pair as cashier by default');

// verify: device token, house token, garbage
const v1 = pairing.verifyToken(r1.token);
ok(v1.ok === true && v1.master === false && v1.device && v1.device.name === 'Ana', 'device token verifies with identity');
ok(v1.device.role === 'cashier', 'verify reports the device role');
ok(pairing.verifyToken('tok-live-1').ok === true && pairing.verifyToken('tok-live-1').master === true, 'house token still verifies as master');
for (const bad of ['nope', '', null, undefined, 'dev_zzz', 'tok-live-1x']) {
  ok(pairing.verifyToken(bad).ok === false, 'rejects ' + JSON.stringify(String(bad)));
}

// device list exposes no secrets, records last-seen after verify
const listed = pairing.listDevices();
ok(listed.length === 1 && listed[0].token === undefined && typeof listed[0].lastSeen === 'number', 'list hides secrets, tracks last-seen');

// code is single-use (second redeem fails)
ok(pairing.redeemPairCode(c1.code, 'Ana').ok === false, 'code is single-use (second redeem fails)');

// wrong code burns after 5 guesses
const c2 = pairing.createPairCode();
for (let i = 0; i < 4; i++) pairing.redeemPairCode('000000');
ok(pairing.redeemPairCode('000000').ok === false, '5th wrong guess burns the code');
ok(pairing.redeemPairCode(c2.code).ok === false, 'burned code rejects even the right answer');

// non-digit noise tolerated; blank name defaults to Phone
const c3 = pairing.createPairCode();
const r5 = pairing.redeemPairCode(c3.code.slice(0, 3) + '-' + c3.code.slice(3), '   ');
ok(r5.ok === true && r5.name === 'Phone', 'dashes stripped, blank name defaults');

// long names truncated
const c3b = pairing.createPairCode();
const r5b = pairing.redeemPairCode(c3b.code, 'x'.repeat(50));
ok(r5b.ok === true && r5b.name.length === 24, 'long device name truncated to 24');

// expiry
pairing.configure({ getToken: () => 'tok-live-1', wsPort: 3458, ttlMs: 30 });
const c4 = pairing.createPairCode();
await wait(60);
const r6 = pairing.redeemPairCode(c4.code);
ok(r6.ok === false && /expired/i.test(r6.error), 'expired code rejected');
pairing.configure({ ttlMs: 600000 });

// rotation invalidates pending codes AND claims
const c5 = pairing.createPairCode();
const cl0 = pairing.createClaim();
pairing.invalidate();
ok(pairing.redeemPairCode(c5.code).ok === false, 'invalidated code rejected (rotation)');
ok(pairing.redeemClaim(cl0.claim, 'X').ok === false, 'invalidated claim rejected (rotation)');

// claims: single-use exchange for a device token
const cl1 = pairing.createClaim();
ok(/^[0-9a-f]{18}$/.test(cl1.claim), 'claim is 18 hex chars');
const rc1 = pairing.redeemClaim(cl1.claim, 'Ben');
ok(rc1.ok === true && (rc1.token || '').startsWith('dev_') && rc1.name === 'Ben', 'claim redeems a named device token');
ok(pairing.verifyToken(rc1.token).ok === true, 'claimed device token verifies');
ok(pairing.redeemClaim(cl1.claim, 'Ben').ok === false, 'claim is single-use');
ok(pairing.redeemClaim('deadbeefdeadbeef12', 'Ben').ok === false, 'unknown claim rejected');

// hostile names cannot break out of HTML/JS contexts downstream
const cN = pairing.createPairCode();
const rN = pairing.redeemPairCode(cN.code, `x');alert(1);//`);
ok(rN.ok === true && !/['"`\\]/.test(rN.name), 'device name strips quotes and backslashes');

// roles: promote, demote, invalid id, invalid role
ok(pairing.setDeviceRole(r1.deviceId, 'owner') === true, 'promote to owner');
ok(pairing.verifyToken(r1.token).device.role === 'owner', 'verify reflects promotion');
ok(pairing.setDeviceRole(r1.deviceId, 'superadmin') === true && pairing.verifyToken(r1.token).device.role === 'cashier', 'unknown role falls back to cashier');
ok(pairing.setDeviceRole('dev-ffff', 'owner') === false, 'role change on unknown id fails');

// revoke by id kills that phone only
const before = pairing.listDevices().map(d => d.id);
ok(before.length >= 4, 'several devices registered (' + before.length + ')');
ok(pairing.revokeDeviceToken(before[0]) === true, 'revoke known device');
ok(pairing.verifyToken(r1.token).ok === false, 'revoked phone no longer verifies');
ok(pairing.revokeDeviceToken(before[0]) === false, 'double revoke reports false');
ok(pairing.revokeDeviceToken('dev-ffff') === false, 'revoke unknown id reports false');

// export/restore round-trip; malformed entries dropped
const snap = pairing.exportDevices();
ok(snap.length > 0 && snap.every(d => typeof d.token === 'string'), 'export keeps secrets for persistence');
pairing.clearDeviceTokens();
ok(pairing.verifyToken(rc1.token).ok === false, 'cleared registry rejects everything');
const restored = pairing.restoreDevices([...snap, null, { id: 'x' }, { id: 'dev-12345678', token: 'short' }]);
ok(restored === snap.length && pairing.verifyToken(rc1.token).ok === true, 'restore round-trips, drops malformed');
ok(pairing.verifyToken(rc1.token).device.role === 'cashier', 'restore preserves roles');

// registry cap: full house refuses new phones with guidance
pairing.clearDeviceTokens();
for (let i = 0; i < pairing.MAX_DEVICES; i++) pairing.issueDeviceToken('P' + i);
let threw = false;
try { pairing.issueDeviceToken('overflow'); } catch (e) { threw = /revoke/i.test(e.message); }
ok(threw, 'registry cap refuses with revoke guidance');
const c6 = pairing.createPairCode();
const r8 = pairing.redeemPairCode(c6.code, 'Late');
ok(r8.ok === false && /revoke/i.test(r8.error || ''), 'pairing fails gracefully when registry full');
pairing.clearDeviceTokens();

if (failures === 0) {
  console.log('PAIRING OK: codes, claims, device tokens, revoke, restore, cap verified');
  process.exit(0);
} else {
  console.error('PAIRING FAILED: ' + failures + ' assertion(s) failed');
  process.exit(1);
}
