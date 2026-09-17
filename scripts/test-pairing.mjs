// Unit tests for the device pairing-code service (src/main/pairing.js):
// format, single-use redeem, wrong-code burn, expiry, rotation invalidation.
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

// create: 6-digit format
const c1 = pairing.createPairCode();
ok(c1.success === true && /^\d{6}$/.test(c1.code), 'created code is 6 digits');

// redeem ok + single use
const r1 = pairing.redeemPairCode(c1.code);
ok(r1.ok === true && r1.token === 'tok-live-1' && r1.wsPort === 3458, 'valid code redeems token + wsPort');
const r2 = pairing.redeemPairCode(c1.code);
ok(r2.ok === false, 'code is single-use (second redeem fails)');

// wrong code burns after 5 guesses
const c2 = pairing.createPairCode();
for (let i = 0; i < 4; i++) pairing.redeemPairCode('000000');
const r3 = pairing.redeemPairCode('000000');
ok(r3.ok === false, '5th wrong guess burns the code');
const r4 = pairing.redeemPairCode(c2.code);
ok(r4.ok === false, 'burned code rejects even the right answer');

// non-digit noise tolerated
const c3 = pairing.createPairCode();
const r5 = pairing.redeemPairCode(c3.code.slice(0, 3) + '-' + c3.code.slice(3));
ok(r5.ok === true && r5.token === 'tok-live-1', 'dashes/spaces stripped before compare');

// expiry
pairing.configure({ getToken: () => 'tok-live-1', wsPort: 3458, ttlMs: 30 });
const c4 = pairing.createPairCode();
await wait(60);
const r6 = pairing.redeemPairCode(c4.code);
ok(r6.ok === false && /expired/i.test(r6.error), 'expired code rejected');
pairing.configure({ ttlMs: 600000 });

// rotation invalidates pending codes
const c5 = pairing.createPairCode();
pairing.invalidate();
const r7 = pairing.redeemPairCode(c5.code);
ok(r7.ok === false, 'invalidated code rejected (rotation)');

if (failures === 0) {
  console.log('PAIRING OK: create/redeem/burn/expiry/invalidate verified');
  process.exit(0);
} else {
  console.error('PAIRING FAILED: ' + failures + ' assertion(s) failed');
  process.exit(1);
}
