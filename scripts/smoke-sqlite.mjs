// Smoke test for the main-process SQLite storage layer (src/main/db.js).
// Runs in plain Node with a fake ipcMain and a temp user-data dir.
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const { registerDbIpc, closeDb } = require('../src/main/db.js');

let passed = 0, failed = 0;
const ok = (cond, name) => { if (cond) { passed++; console.log('  ok ' + name); } else { failed++; console.error('  FAIL ' + name); } };

const userData = mkdtempSync(join(tmpdir(), 'slp-sqlite-smoke-'));
const invoke = (handlers, name, arg) => handlers.get(name)({}, arg);
const register = () => {
  const handlers = new Map();
  registerDbIpc({ handle: (name, fn) => handlers.set(name, fn) }, userData);
  return handlers;
};
const json = (o) => JSON.parse(JSON.stringify(o));

const fixture = {
  clients: [
    { id: 1, name: 'Aling Nena', balance: 125.5 },
    { id: 3, name: 'Mang Jose', balance: 0 }
  ],
  transactions: [
    { id: 7, clientId: 1, items: [{ name: 'Sardines', qty: 2, price: 25 }, { name: 'Coffee 3in1', qty: 1, price: 12 }], grandTotal: 62 },
    { id: 9, clientId: null, items: [], grandTotal: 0 }
  ],
  users: [{ id: 1, username: 'admin', passwordHash: 'abc123' }],
  settings: [{ id: 1, key: 'storeName', value: 'Nena Store' }]
};

const h = register();

// 1 fresh open -> needs migration
const open1 = await invoke(h, 'db-open');
ok(open1.ok === true, 'open fresh ok');
ok(open1.needMigration === true, 'fresh DB needs migration');
ok(typeof open1.path === 'string' && open1.path.endsWith('.sqlite'), 'db file path reported');
ok(existsSync(open1.path), 'db file created');

// 2 migrate
const mig = await invoke(h, 'db-migrate', { dump: json(fixture) });
ok(mig.migrated === true, 'migration ran');
ok(mig.counts.clients === 2 && mig.counts.transactions === 2, 'migration counts');
ok(mig.counts.inventory === 0 && mig.counts.notifications === 0, 'empty stores migrated as 0');

// 3 id + JSON integrity after migration
const t9 = await invoke(h, 'db-get', { store: 'transactions', id: 9 });
ok(t9 && t9.id === 9 && t9.grandTotal === 0, 'migrated record with null clientId intact');
const t7 = await invoke(h, 'db-get', { store: 'transactions', id: 7 });
ok(t7 && t7.items.length === 2 && t7.items[0].name === 'Sardines' && t7.items[1].price === 12, 'nested items JSON preserved');
const c1 = await invoke(h, 'db-get', { store: 'clients', id: 1 });
ok(c1 && c1.name === 'Aling Nena' && c1.balance === 125.5, 'client record intact');

// 4 second open -> no migration needed
const open2 = await invoke(h, 'db-open');
ok(open2.needMigration === false, 'open again: migration flag set');
const mig2 = await invoke(h, 'db-migrate', { dump: {} });
ok(mig2.migrated === false, 'migrate again is a no-op');

// 5 add without id
const add1 = await invoke(h, 'db-add', { store: 'inventory', obj: { name: 'Sukang Puti', stock: 12 } });
ok(typeof add1 === 'number' && add1 === 1, 'db-add without id -> autoincrement key 1');
const it1 = await invoke(h, 'db-get', { store: 'inventory', id: add1 });
ok(it1 && it1.name === 'Sukang Puti' && it1.id === 1, 'added record round-trip');

// 6 add with explicit id
const add2 = await invoke(h, 'db-add', { store: 'inventory', obj: { id: 50, name: 'Soap', stock: 5 } });
ok(add2 === 50, 'db-add with explicit id uses it');
ok((await invoke(h, 'db-get', { store: 'inventory', id: 50 })).name === 'Soap', 'explicit-id record stored');

// 7 put update + insert
const put1 = await invoke(h, 'db-put', { store: 'clients', obj: { id: 3, name: 'Mang Jose Sr', balance: 25 } });
ok(put1 === 3, 'db-put returns id');
ok((await invoke(h, 'db-get', { store: 'clients', id: 3 })).name === 'Mang Jose Sr', 'db-put updated value');
const put2 = await invoke(h, 'db-put', { store: 'clients', obj: { id: 5, name: 'Bagong Client', balance: 0 } });
ok(put2 === 5 && (await invoke(h, 'db-all', { store: 'clients' })).length === 3, 'db-put inserts when id is new');

// 8 put without id throws
let putErr = false;
try { await invoke(h, 'db-put', { store: 'clients', obj: { name: 'NoId' } }); } catch (e) { putErr = true; }
ok(putErr, 'db-put without id throws');

// 9 db-all ordered by id
const allClients = await invoke(h, 'db-all', { store: 'clients' });
ok(allClients.length === 3 && allClients.map(c => c.id).join(',') === '1,3,5', 'db-all ordered by id');
ok(allClients[2].name === 'Bagong Client', 'db-all returns parsed records');

// 10 del
await invoke(h, 'db-del', { store: 'clients', id: 5 });
ok((await invoke(h, 'db-all', { store: 'clients' })).length === 2, 'db-del removes record');

// 11 clear
await invoke(h, 'db-clear', { store: 'inventory' });
ok((await invoke(h, 'db-all', { store: 'inventory' })).length === 0, 'db-clear empties store');

// 12 unknown store rejected
let storeErr = false;
try { await invoke(h, 'db-all', { store: 'bogus' }); } catch (e) { storeErr = true; }
ok(storeErr, 'unknown store throws');

// 13 stats
const st = await invoke(h, 'db-stats');
ok(st.ok === true && st.counts.clients === 2 && st.counts.transactions === 2 && st.size > 0, 'db-stats counts + size');

// 14 persistence across reopen
closeDb();
const h2 = register();
const reopen = await invoke(h2, 'db-open');
ok(reopen.needMigration === false, 'reopen after close: data persisted, no migration');
ok((await invoke(h2, 'db-all', { store: 'clients' })).length === 2, 'reopen: records persisted');

closeDb();
rmSync(userData, { recursive: true, force: true });

console.log(`\nSQLite smoke: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
