// Exercises the v2 renderer migration that repairs legacy interest rows:
// the old daily run charged a full monthly rate, so each stored interest row
// was 30x too high and inflated the borrower's balance. Verifies rows are
// rescaled, balances shrink by the removed amount, and already-fixed rows are
// left alone (idempotent re-run).
globalThis.window = globalThis;
const { MIGRATIONS } = await import('../src/renderer/js/database.js');

let passed = 0, failed = 0;
const ok = (cond, name) => { if (cond) { passed++; console.log('  ok ' + name); } else { failed++; console.error('  FAIL ' + name); } };

const migration = MIGRATIONS.find(m => m.version === 2);
ok(!!migration, 'interest-repair migration v2 exists');

function fakeDb(seed) {
  const tables = {};
  for (const k of Object.keys(seed)) tables[k] = seed[k].map(r => ({ ...r }));
  return {
    tables,
    all: async (s) => tables[s],
    put: async (s, obj) => { const i = tables[s].findIndex(r => String(r.id) === String(obj.id)); tables[s][i] = { ...obj }; }
  };
}

const db = fakeDb({
  transactions: [
    { id: 1, status: 'interest', clientId: 1, grandTotal: 30, totalInterest: 30 },
    { id: 2, status: 'interest', clientId: 1, grandTotal: 60, totalInterest: 60 },
    { id: 3, status: 'pending', clientId: 1, grandTotal: 100, totalInterest: 0, items: [] },
    { id: 4, status: 'interest', clientId: 2, grandTotal: 3, totalInterest: 3, interestVersion: 2 },
    { id: 5, status: 'voided', clientId: 3, grandTotal: 90, totalInterest: 0 }
  ],
  clients: [
    { id: 1, balance: 200 },
    { id: 2, balance: 3 },
    { id: 3, balance: 90 }
  ]
});

await migration.up(db);
const tx = (id) => db.tables.transactions.find(r => r.id === id);
const cl = (id) => db.tables.clients.find(r => r.id === id);

ok(tx(1).grandTotal === 1 && tx(1).totalInterest === 1 && tx(1).interestVersion === 2, 'legacy row 30 -> 1 and stamped');
ok(tx(2).grandTotal === 2 && tx(2).totalInterest === 2, 'legacy row 60 -> 2');
ok(cl(1).balance === 113, 'balance shrinks by the removed 87 (200 -> 113)');
ok(tx(3).grandTotal === 100 && !tx(3).interestVersion, 'sale row untouched');
ok(tx(4).grandTotal === 3 && tx(4).interestVersion === 2, 'already-stamped row untouched');
ok(cl(2).balance === 3, 'already-fixed client balance untouched');
ok(tx(5).grandTotal === 90 && !tx(5).interestVersion, 'voided non-interest row untouched');
ok(cl(3).balance === 90, 'unaffected client balance untouched');

// second run must be a no-op
await migration.up(db);
ok(cl(1).balance === 113 && tx(1).grandTotal === 1, 're-run is idempotent');

// an overpaid client is clamped at zero, never negative
const db2 = fakeDb({
  transactions: [{ id: 1, status: 'interest', clientId: 1, grandTotal: 300, totalInterest: 300 }],
  clients: [{ id: 1, balance: 10 }]
});
await migration.up(db2);
ok(db2.tables.clients[0].balance === 0, 'balance clamps at zero when removed interest exceeds it');

console.log('\nINTEREST REPAIR: ' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);