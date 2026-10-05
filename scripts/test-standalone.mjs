// Standalone store test: loads src/mobile-standalone/store.js in a vm
// sandbox, drives it with the node:sqlite driver, and asserts every
// feature end to end (sales math, returns prorate, loyalty, voids,
// payments, expenses, petty cash, suppliers/PO, reports, photos, CSV).
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { makeNodeDriver } from '../src/mobile-standalone/driver-node.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(resolve(root, 'src', 'mobile-standalone', 'store.js'), 'utf8');
const sandbox = { console };
vm.createContext(sandbox);
vm.runInContext(src + '\nthis.__api = { localApi, initStore, setStoreDriver, setPrinterFn };', sandbox);
const { localApi, initStore } = sandbox.__api;

let pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; }
  else { fail++; console.error('FAIL - ' + name); }
}
async function throws(status, fn, name) {
  try { await fn(); fail++; console.error('FAIL (no throw) - ' + name); }
  catch (e) { ok(e && e.status === status, name + ' [got ' + (e && e.status) + ']'); }
}
async function throwsJson(status, fn, name) {
  try { await fn(); fail++; console.error('FAIL (no throw) - ' + name); }
  catch (e) { ok(e && e.status === status && e.json && e.json.success === false, name); }
}

await initStore(makeNodeDriver());
const A = (m, p, b, over) => localApi(over || m, p, b);

// settings
const s0 = await A('GET', '/api/settings');
ok(s0.shopName === 'My Sari-Sari Store' && s0.currency === '₱', 'settings defaults');
await A('POST', '/api/settings', { key: 'shopName', value: 'Tindahan' }, 'PUT');
ok((await A('GET', '/api/settings')).shopName === 'Tindahan', 'settings edit');
await throws(400, () => A('POST', '/api/settings', { key: 'smsApiKey', value: 'x' }, 'PUT'), 'settings allowlist');

// clients
await throws(400, () => A('POST', '/api/clients', { name: '' }), 'client name required');
const c1 = await A('POST', '/api/clients', { name: 'Maria', phone: '0917', address: 'St', dueDate: '2026-12-31', isSC: true });
ok(c1.success && c1.id, 'client add');
const c2 = await A('POST', '/api/clients', { name: 'Walk Client' });
const all = await A('GET', '/api/clients');
ok(Array.isArray(all) && all.length === 2 && all[0].balance === 0, 'clients list raw array');
await A('POST', '/api/clients/' + c1.id, { name: 'Maria C', phone: '0918' }, 'PUT');
await throws(404, () => A('POST', '/api/clients/9999', { name: 'X' }, 'PUT'), 'client edit 404');
const h0 = await A('GET', '/api/clients/' + c1.id + '/history');
ok(h0.client && h0.client.name === 'Maria C' && h0.sales.length === 0, 'history empty');

// inventory
const it1 = await A('POST', '/api/inventory', { name: 'Rice', sellPrice: 50, costPrice: 40, stock: 100, sku: 'R1', barcode: 'B1', variants: [{ name: '1kg', stock: 60 }, { name: '5kg', stock: 40 }] });
ok(it1.success, 'inventory add variants (stock=100)');
await throws(400, () => A('POST', '/api/inventory', { name: 'rice', sellPrice: 1 }), 'dup name rejected');
await throws(400, () => A('POST', '/api/inventory', { name: 'Other', sku: 'r1' }), 'dup sku rejected');
const it2 = await A('POST', '/api/inventory', { name: 'Oil', sellPrice: 30, stock: 50 });
const inv = await A('GET', '/api/inventory');
ok(inv.length === 2 && inv[0].name === 'Oil' && inv[0].hasImage === false && inv[1].variants.length === 2, 'inventory compact sorted');
const adj = await A('POST', '/api/inventory/adjust', { id: it2.id, stock: 45 });
ok(adj.success && adj.before === 50 && adj.stock === 45, 'stocktake adjust');
const val = await A('GET', '/api/inventory/valuation');
ok(val.units === 145 && val.costValue === 40 * 100 && val.retailValue === 50 * 100 + 30 * 45, 'valuation');
await throws(400, () => A('POST', '/api/inventory/' + it2.id + '/photo', { image: 'nope' }), 'photo validation');
const photo = 'data:image/jpeg;base64,' + 'A'.repeat(1000);
await A('POST', '/api/inventory/' + it2.id + '/photo', { image: photo });
const imgs = await A('GET', '/api/inventory/images?ids=' + it2.id + ',' + it1.id);
ok(imgs[it2.id] === photo && imgs[it1.id] === null, 'images map');
const alerts = await A('GET', '/api/alerts');
ok(alerts.outCount === 0 && alerts.lowCount === 0, 'alerts empty');

// quick presets
const q1 = await A('POST', '/api/quick-items', { name: 'Rice 1kg', price: 50 });
ok((await A('GET', '/api/quick-items')).length === 1, 'quick add/list');
await A('POST', '/api/quick-items/' + q1.id, {}, 'DELETE');
ok((await A('GET', '/api/quick-items')).length === 0, 'quick delete');

// sale: 2 Rice @50 + 3 Oil @30 intRate 10, discount 5, GCash (credit)
const sale = await A('POST', '/api/sales', {
  clientId: c1.id,
  items: [
    { description: 'Rice', qty: 2, unitCost: 50, intRate: 0, invId: it1.id },
    { description: 'Oil', qty: 3, unitCost: 30, intRate: 10, invId: it2.id }
  ],
  paymentMethod: 'GCash', discount: 5
});
ok(sale.success && sale.invoiceNo === 'INV-00001', 'sale invoice');
const det = await A('GET', '/api/transactions/INV-00001');
ok(det.subtotal === 190 && det.totalInterest === 9 && det.grandTotal === 194 && det.status === 'pending', 'sale math');
ok(det.items[1].amount === 99, 'line amount with interest');
const invAfter = await A('GET', '/api/inventory');
ok(invAfter.find(i => i.name === 'Rice').stock === 98, 'stock decremented');
const h1 = await A('GET', '/api/clients/' + c1.id + '/history');
ok(h1.client.balance === 194 && h1.client.loyaltyPoints === 194 && h1.sales.length === 1, 'balance + loyalty + history');
// cash sale: no balance
const cs = await A('POST', '/api/sales', { items: [{ description: 'Oil', qty: 1, unitCost: 30, invId: it2.id }], paymentMethod: 'Cash' });
ok(cs.invoiceNo === 'INV-00002', 'cash sale invoice');
ok((await A('GET', '/api/clients/' + c1.id + '/history')).client.balance === 194, 'cash sale adds no balance');
await throws(400, () => A('POST', '/api/sales', { items: [] }), 'sale needs items');
const txns = await A('GET', '/api/transactions?limit=100');
const cashTx = txns.find(t => t.invoiceNo === 'INV-00002');
ok(txns.length === 2 && cashTx && cashTx.items === 1, 'transactions list');

// payments
await A('POST', '/api/payments', { clientId: c1.id, amount: 100 });
let h2 = await A('GET', '/api/clients/' + c1.id + '/history');
ok(h2.client.balance === 94 && h2.payments.length === 1 && h2.payments[0].type === 'Partial', 'payment partial');
await A('POST', '/api/payments/' + h2.payments[0].id, { amount: 120 }, 'PUT');
h2 = await A('GET', '/api/clients/' + c1.id + '/history');
ok(h2.client.balance === 74, 'payment edit rebalances');
await A('POST', '/api/payments/' + h2.payments[0].id, {}, 'DELETE');
h2 = await A('GET', '/api/clients/' + c1.id + '/history');
ok(h2.client.balance === 194 && h2.payments.length === 0, 'payment delete refunds balance');

// returns: partial 1 Rice from INV-00001 (unit 50, origSub 199, discount 5)
const ret = await A('POST', '/api/returns', { invoiceNo: 'INV-00001', items: [{ invId: it1.id, description: 'Rice', qty: 1 }] });
ok(ret.success && ret.invoiceNo === 'INV-00003', 'partial return invoice');
const retDet = await A('GET', '/api/transactions/' + ret.invoiceNo);
const expectSub = 50, expectDisc = 5 * (50 / 199);
ok(Math.abs(retDet.subtotal - (-expectSub)) < 1e-9 && Math.abs(retDet.grandTotal - (-(expectSub - expectDisc))) < 1e-9 && retDet.status === 'return', 'return prorate math');
ok((await A('GET', '/api/inventory')).find(i => i.name === 'Rice').stock === 99, 'return restocks');
ok((await A('GET', '/api/clients/' + c1.id + '/history')).client.balance < 194, 'return reduces credit');
await throws(400, () => A('POST', '/api/returns', { invoiceNo: 'INV-00001', items: [{ invId: it1.id, description: 'Rice', qty: 99 }] }), 'return over-qty rejected');

// void cash sale INV-00002 (1 Oil)
await A('POST', '/api/void', { invoiceNo: 'INV-00002' });
ok((await A('GET', '/api/transactions/INV-00002')).status === 'voided', 'void marks');
ok((await A('GET', '/api/inventory')).find(i => i.name === 'Oil').stock === 42, 'void restocks');
await throws(404, () => A('POST', '/api/void', { invoiceNo: 'INV-00002' }), 'double void rejected');

// expenses + petty
await A('POST', '/api/expenses', { description: 'Rent', amount: 5000, category: 'Rent', payee: 'LL' });
ok((await A('GET', '/api/expenses')).length === 1, 'expense add');
const e1 = (await A('GET', '/api/expenses'))[0];
await A('POST', '/api/expenses/' + e1.id, { description: 'Rent!', amount: 4500, category: 'Rent' }, 'PUT');
await A('POST', '/api/expenses/' + e1.id, {}, 'DELETE');
ok((await A('GET', '/api/expenses')).length === 0, 'expense edit/delete');
const p1 = await A('POST', '/api/petty-cash', { amount: 1000 });
ok(p1.balance === 1000, 'petty top-up');
await throwsJson(400, () => A('POST', '/api/petty-cash', { amount: 1500, dir: 'withdraw' }), 'petty insufficient');
await A('POST', '/api/petty-cash', { amount: 200, dir: 'withdraw' });
ok((await A('GET', '/api/petty-cash')).balance === 800, 'petty withdraw');

// suppliers + PO
const sup = await A('POST', '/api/suppliers', { name: 'Acme', contact: 'C' });
const po = await A('POST', '/api/purchase-orders', { supplierId: sup.id, items: [{ invId: it2.id, name: 'Oil', price: 20, qty: 10 }] });
ok(po.poNo === 'PO-00001', 'PO number');
const poId = (await A('GET', '/api/purchase-orders')).find(p => p.poNo === 'PO-00001').id;
const rec = await A('POST', '/api/purchase-orders/' + poId + '/receive', {});
ok(rec.poNo === 'PO-00001', 'PO receive');
ok((await A('GET', '/api/inventory')).find(i => i.name === 'Oil').stock === 52, 'PO receive adds stock');
await throwsJson(400, async () => A('POST', '/api/purchase-orders/' + poId + '/receive', {}), 'double receive rejected');
await A('POST', '/api/supplier-payments', { supplierId: sup.id, amount: 100, paymentMethod: 'GCash' });
const supDet = await A('GET', '/api/suppliers/' + sup.id + '/payments');
ok(supDet.purchased === 200 && supDet.paid === 100 && supDet.owed === 100, 'supplier balances');

// loyalty redeem (Maria has 194 pts from the ₱194 sale)
const red = await A('POST', '/api/clients/' + c1.id + '/redeem', {});
ok(red.points === 100 && red.discount === 1 && red.remaining === 94, 'loyalty redeem');
await throwsJson(400, () => A('POST', '/api/clients/' + c2.id + '/redeem', {}), 'redeem needs 100pts');

// stats / reports / audit / version / csv / sms
const stats = await A('GET', '/api/stats');
ok(stats.todaySales > 0 && stats.totalUtang > 0 && stats.recent.length > 0, 'stats');
const rep = await A('GET', '/api/reports');
ok(rep.month && rep.week.length === 7 && rep.topItems.length > 0, 'reports');
const csv = await A('GET', '/api/reports/export.csv?month=' + rep.monthStr);
ok(csv.success && csv.csv.charCodeAt(0) === 0xFEFF && csv.csv.includes('EXPENSES'), 'csv bom+sections');
ok((await A('GET', '/api/audit?limit=100')).length > 10, 'audit trail');
const v1 = await A('GET', '/api/version');
await A('POST', '/api/expenses', { description: 'X', amount: 1 });
ok((await A('GET', '/api/version')).v === v1.v + 1, 'version bumps on mutation');
const sms = await A('POST', '/api/sms-reminders', {});
ok(sms.success && sms.total >= 1 && sms.texts.length >= 1 && sms.texts[0].text.includes('₱'), 'sms reminder texts');

// print: no printer -> 502 shape; stub printer -> success
await throwsJson(502, () => A('POST', '/api/print-thermal', { transactionId: 'INV-00001' }), 'print without printer');
sandbox.__api.setPrinterFn(async () => ({ success: true }));
ok((await A('POST', '/api/print-thermal', { transactionId: 'INV-00001' })).success, 'print with stub');

// deletes with safety rules
await throws(400, () => A('POST', '/api/inventory/' + it1.id, {}, 'DELETE'), 'delete item with sales history blocked');
const tmp = await A('POST', '/api/inventory', { name: 'Temp Item', sellPrice: 5, stock: 3 });
await A('POST', '/api/quick-items', { name: 'Temp preset', price: 5, invId: tmp.id });
ok((await A('POST', '/api/inventory/' + tmp.id, {}, 'DELETE')).success, 'delete unused item');
ok((await A('GET', '/api/quick-items')).length === 0, 'delete cascades to presets');
await throws(404, () => A('POST', '/api/inventory/9999', {}, 'DELETE'), 'delete item 404');
await throws(400, () => A('POST', '/api/clients/' + c1.id, {}, 'DELETE'), 'delete client with balance blocked');
const tmpC = await A('POST', '/api/clients', { name: 'Temp Client' });
ok((await A('POST', '/api/clients/' + tmpC.id, {}, 'DELETE')).success, 'delete clean client');
const histC = await A('POST', '/api/clients', { name: 'Hist Client' });
await A('POST', '/api/payments', { clientId: histC.id, amount: 50 });
ok((await A('GET', '/api/clients/' + histC.id + '/history')).client.balance === 0, 'payment on zero balance keeps zero');
await throws(400, () => A('POST', '/api/clients/' + histC.id, {}, 'DELETE'), 'delete client with payment history blocked');
const poId2 = (await A('POST', '/api/purchase-orders', { supplierId: sup.id, items: [{ name: 'X', price: 1, qty: 1 }] }));
ok((await A('POST', '/api/purchase-orders/' + (await A('GET', '/api/purchase-orders')).find(p => p.poNo === poId2.poNo).id, {}, 'DELETE')).success, 'cancel pending PO');
await throws(400, () => A('POST', '/api/purchase-orders/' + poId, {}, 'DELETE'), 'delete received PO blocked');

// backup export/import round-trip
const exp = await A('GET', '/api/backup/export');
ok(exp.success && exp.backup.app === 'shop-ledger-standalone' && exp.backup.tables.clients.length >= 3, 'backup export');
const expJson = JSON.stringify(exp.backup);
await A('POST', '/api/clients', { name: 'After Backup' });
const imp = await A('POST', '/api/backup/import', { backup: JSON.parse(expJson) });
ok(imp.success && imp.counts.clients === exp.backup.tables.clients.length, 'backup import restores counts');
ok(!(await A('GET', '/api/clients')).some(c => c.name === 'After Backup'), 'import wipes newer rows');
await throws(400, () => A('POST', '/api/backup/import', { backup: { app: 'nope' } }), 'import rejects foreign backup');
await throws(400, () => A('POST', '/api/backup/import', { backup: { app: 'shop-ledger-standalone', tables: { clients: 'oops' } } }), 'import rejects corrupt tables');

// payment reference numbers
await A('POST', '/api/payments', { clientId: histC.id, amount: 25, referenceNo: 'GCash 123456' });
const hpays = (await A('GET', '/api/clients/' + histC.id + '/history')).payments;
ok(hpays.some(p => p.referenceNo === 'GCash 123456'), 'payment ref saved + returned');
const pref = hpays.find(p => p.referenceNo === 'GCash 123456');
await A('POST', '/api/payments/' + pref.id, { amount: 25, referenceNo: 'GCash 999' }, 'PUT');
ok((await A('GET', '/api/clients/' + histC.id + '/history')).payments.some(p => p.referenceNo === 'GCash 999'), 'payment ref editable');

// PO edit (pending only)
const poEdit = await A('POST', '/api/purchase-orders', { supplierId: sup.id, items: [{ name: 'Sugar', price: 10, qty: 5 }] });
const poEditId = (await A('GET', '/api/purchase-orders')).find(p => p.poNo === poEdit.poNo).id;
const poUpd = await A('POST', '/api/purchase-orders/' + poEditId, { items: [{ name: 'Sugar', price: 12, qty: 5 }] }, 'PUT');
ok(poUpd.poNo === poEdit.poNo, 'PO edit keeps number');
ok((await A('GET', '/api/purchase-orders')).find(p => p.poNo === poEdit.poNo).total === 60, 'PO edit recomputes total');
await throws(400, () => A('POST', '/api/purchase-orders/' + poId, {}, 'PUT'), 'edit received PO blocked');

// expiring alerts
await A('POST', '/api/inventory/' + it2.id, { name: 'Oil', sellPrice: 30, stock: 52, expiryDate: '2026-10-20' }, 'PUT');
const alerts2 = await A('GET', '/api/alerts');
ok(Array.isArray(alerts2.expiring) && alerts2.expiring.some(e => e.id === it2.id) && alerts2.expiringCount >= 1, 'expiring list');

// migration: a 4.0/4.1 ledger whose payments table lacks referenceNo
{
  const { makeNodeDriver: mk } = await import('../src/mobile-standalone/driver-node.mjs');
  const old = mk();
  await old.exec('CREATE TABLE payments (id INTEGER PRIMARY KEY AUTOINCREMENT, clientId INTEGER, amount REAL DEFAULT 0, date TEXT, type TEXT, notes TEXT, createdAt TEXT)');
  await old.exec('CREATE TABLE settings (id INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT UNIQUE NOT NULL, value TEXT)');
  const vm2 = (await import('node:vm')).default;
  const sb2 = { console };
  vm2.createContext(sb2);
  const fs2 = (await import('node:fs')).default;
  vm2.runInContext(fs2.readFileSync('src/mobile-standalone/store.js', 'utf8') + '\nthis.__m = { localApi, initStore };', sb2);
  await sb2.__m.initStore(old);
  const cols = await old.all('PRAGMA table_info(payments)', []);
  ok(cols.some(c => c.name === 'referenceNo'), 'migration adds referenceNo');
  const r2 = await sb2.__m.localApi('POST', '/api/payments', { amount: 10, referenceNo: 'X1' });
  ok(r2.success, 'payments work after migration');
}

console.log(`\nSTANDALONE STORE: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
