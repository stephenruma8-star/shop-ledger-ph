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

// sale: 2 Rice @50 + 3 Oil @30 intRate 10 (Oil backdated 30 days so the
// monthly rate applies in full, desktop-style), discount 5, GCash (credit)
const _p2 = (n) => String(n).padStart(2, '0');
const _nowD = new Date();
const _backD = new Date(_nowD.getFullYear(), _nowD.getMonth(), _nowD.getDate() - 30);
const monthAgo = _backD.getFullYear() + '-' + _p2(_backD.getMonth() + 1) + '-' + _p2(_backD.getDate());
const sale = await A('POST', '/api/sales', {
  clientId: c1.id,
  items: [
    { description: 'Rice', qty: 2, unitCost: 50, intRate: 0, invId: it1.id },
    { description: 'Oil', qty: 3, unitCost: 30, intRate: 10, invId: it2.id, date: monthAgo }
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
// cash sale with same-day rated item: accrues rate/30 (desktop parity)
const cs = await A('POST', '/api/sales', { items: [{ description: 'Oil', qty: 1, unitCost: 30, intRate: 10, invId: it2.id }], paymentMethod: 'Cash' });
ok(cs.invoiceNo === 'INV-00002', 'cash sale invoice');
const csDet = await A('GET', '/api/transactions/INV-00002');
ok(Math.abs(csDet.totalInterest - 0.1) < 1e-9 && Math.abs(csDet.grandTotal - 30.1) < 1e-9, 'same-day interest prorated');
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
// overpay clamps (no negative debt) and delete reverses exactly
await A('POST', '/api/payments', { clientId: c1.id, amount: 500 });
h2 = await A('GET', '/api/clients/' + c1.id + '/history');
ok(h2.client.balance === 0 && h2.payments.length === 1, 'overpay clamps to zero');
await A('POST', '/api/payments/' + h2.payments[0].id, {}, 'DELETE');
h2 = await A('GET', '/api/clients/' + c1.id + '/history');
ok(h2.client.balance === 194 && h2.payments.length === 0, 'overpay delete reverses exactly');

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
let printedLines = null;
sandbox.__api.setPrinterFn(async (lines) => { printedLines = lines; return { success: true }; });
ok((await A('POST', '/api/print-thermal', { transactionId: 'INV-00001' })).success, 'print with stub');
ok(printedLines.some(l => l && l.text === 'OFFICIAL RECEIPT'), 'receipt body built');
await A('POST', '/api/settings', { key: 'receiptHeaderText', value: 'Brgy Hall St' }, 'PUT');
await A('POST', '/api/print-thermal', { transactionId: 'INV-00001' });
ok(printedLines[0].text === 'Brgy Hall St', 'receipt header prints first when set');

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

// bulk import (balances allowed, bad rows skipped)
const imp1 = await A('POST', '/api/clients/import', { clients: [
  { name: 'Imp One', phone: '0911', address: 'A', balance: 250.5 },
  { name: '', phone: 'x' },
  { name: 'Imp Two', balance: 'not-a-number' }
] });
ok(imp1.added === 2 && imp1.skipped === 1, 'bulk import counts');
ok((await A('GET', '/api/clients')).some(c => c.name === 'Imp One' && c.balance === 250.5), 'imported balance kept');
await throws(400, () => A('POST', '/api/clients/import', { clients: [] }), 'import rejects empty');
await throws(400, () => A('POST', '/api/clients/import', {}), 'import rejects missing');

// per-client rate attached to list
ok((await A('GET', '/api/clients')).find(c => c.id === c1.id).lastRate === 10, 'lastRate from rated sale');

// daily interest: first run stamps, rated debtor accrues over backdated days
const intFirst = await A('POST', '/api/interest/apply', {});
ok(intFirst.applied === 0 && intFirst.stamped === true, 'first interest run stamps date');
ok((await A('POST', '/api/interest/apply', {})).applied === 0, 'same-day rerun applies nothing');
const intC = await A('POST', '/api/clients', { name: 'Interest Client' });
await A('POST', '/api/sales', {
  clientId: intC.id,
  items: [{ description: 'Oil', qty: 2, unitCost: 30, intRate: 10, invId: it2.id }],
  paymentMethod: 'GCash'
}); // balance 66 (60 + 6 interest), rate 10
{
  const exp0 = await A('GET', '/api/backup/export');
  const bk = JSON.parse(JSON.stringify(exp0.backup));
  const past = new Date(Date.now() - 4 * 86400000);
  const pastStr = past.getFullYear() + '-' + String(past.getMonth() + 1).padStart(2, '0') + '-' + String(past.getDate()).padStart(2, '0');
  const row = bk.tables.settings.find(r => r.key === 'lastInterestDate');
  if (row) row.value = pastStr;
  else bk.tables.settings.push({ key: 'lastInterestDate', value: pastStr });
  await A('POST', '/api/backup/import', { backup: bk });
}
const intRun = await A('POST', '/api/interest/apply', {});
const intAfter = (await A('GET', '/api/clients/' + intC.id + '/history')).client;
ok(intRun.applied >= 1 && intRun.days === 4, 'interest accrues over ' + intRun.days + ' days, ' + intRun.applied + ' client(s)');
ok(Math.abs(intAfter.balance - (66 + Math.round(66 * 0.10 * 4 * 100) / 100)) < 1e-9, 'interest math matches desktop formula');

// void/return reasons stored + returned
const rvSale = await A('POST', '/api/sales', { items: [{ description: 'Oil', qty: 1, unitCost: 30, invId: it2.id }], paymentMethod: 'Cash' });
await A('POST', '/api/void', { invoiceNo: rvSale.invoiceNo, reason: 'double entry' });
ok((await A('GET', '/api/transactions/' + rvSale.invoiceNo)).voidReason === 'double entry', 'void reason stored');
const ret2 = await A('POST', '/api/returns', { invoiceNo: 'INV-00001', reason: 'changed mind' });
ok((await A('GET', '/api/transactions/' + ret2.invoiceNo)).returnReason === 'changed mind', 'return reason stored');

// CSV exports
const payCsv = await A('GET', '/api/payments/export.csv');
ok(payCsv.success && payCsv.csv.includes('Reference') && payCsv.csv.includes('GCash 999'), 'payments CSV');
const invCsv = await A('GET', '/api/inventory/export.csv');
ok(invCsv.success && invCsv.csv.includes('Cost Price') && invCsv.csv.includes('Rice'), 'inventory CSV');

// settings fields round-trip
await A('POST', '/api/settings', { key: 'receiptHeaderText', value: 'Brgy 123' }, 'PUT');
await A('POST', '/api/settings', { key: 'vatRate', value: '12' }, 'PUT');
await A('POST', '/api/settings', { key: 'thermalPort', value: '9101' }, 'PUT');
await A('POST', '/api/settings', { key: 'pointsPerPeso', value: '2' }, 'PUT');
const sAfter = await A('GET', '/api/settings');
ok(sAfter.receiptHeaderText === 'Brgy 123' && sAfter.vatRate === 12 && sAfter.thermalPort === '9101' && sAfter.pointsPerPeso === 2, 'settings fields');

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

// void/return state machine: voided sales can't be returned, live returns void backward
const stC = await A('POST', '/api/clients', { name: 'State Client' });
const stSale = await A('POST', '/api/sales', {
  clientId: stC.id,
  items: [{ description: 'Oil', qty: 2, unitCost: 30, invId: it2.id }],
  paymentMethod: 'GCash'
}); // balance 66 (60 + 6)
await A('POST', '/api/void', { invoiceNo: stSale.invoiceNo });
ok((await A('GET', '/api/clients/' + stC.id + '/history')).client.balance === 0, 'void reverses credit balance');
await throws(400, () => A('POST', '/api/returns', { invoiceNo: stSale.invoiceNo }), 'return of voided sale rejected');
const stSale2 = await A('POST', '/api/sales', {
  clientId: stC.id,
  items: [{ description: 'Oil', qty: 2, unitCost: 30, invId: it2.id }],
  paymentMethod: 'GCash'
});
const stRet = await A('POST', '/api/returns', { invoiceNo: stSale2.invoiceNo, items: [{ invId: it2.id, description: 'Oil', qty: 1 }] });
const oilBefore = (await A('GET', '/api/inventory')).find(i => i.name === 'Oil').stock;
const balBefore = (await A('GET', '/api/clients/' + stC.id + '/history')).client.balance;
await A('POST', '/api/void', { invoiceNo: stRet.invoiceNo });
const oilAfter = (await A('GET', '/api/inventory')).find(i => i.name === 'Oil').stock;
const balAfter = (await A('GET', '/api/clients/' + stC.id + '/history')).client.balance;
ok(oilAfter === oilBefore - 1, 'void-of-return un-restocks the line');
ok(Math.abs(balAfter - (balBefore + Math.abs((await A('GET', '/api/transactions/' + stRet.invoiceNo)).grandTotal))) < 1e-9, 'void-of-return un-refunds the balance');
ok((await A('GET', '/api/transactions/' + stRet.invoiceNo)).status === 'voided', 'return marked voided');
await throws(404, () => A('POST', '/api/void', { invoiceNo: stRet.invoiceNo }), 'double void rejected');

// supplier delete rules
const supTmp = await A('POST', '/api/suppliers', { name: 'Temp Supplier' });
ok((await A('POST', '/api/suppliers/' + supTmp.id, {}, 'DELETE')).success, 'delete clean supplier');
await throws(400, () => A('POST', '/api/suppliers/' + sup.id, {}, 'DELETE'), 'delete supplier with orders blocked');

// strict qty validation
await throws(400, () => A('POST', '/api/sales', { items: [{ description: 'X', qty: 0, unitCost: 5 }] }), 'zero qty rejected');
await throws(400, () => A('POST', '/api/sales', { items: [{ description: 'X', qty: -2, unitCost: 5 }] }), 'negative qty rejected');

// launch-bug regression: initStore given an UNRESOLVED async driver (what
// the real boot passed on device) must still end up usable
{
  const { makeNodeDriver: mk2 } = await import('../src/mobile-standalone/driver-node.mjs');
  const vm3 = (await import('node:vm')).default;
  const sb3 = { console };
  vm3.createContext(sb3);
  const fs3 = (await import('node:fs')).default;
  vm3.runInContext(fs3.readFileSync('src/mobile-standalone/store.js', 'utf8') + '\nthis.__r = { localApi, initStore };', sb3);
  await sb3.__r.initStore(Promise.resolve(mk2())); // bare promise, like the old boot call
  const cc = await sb3.__r.localApi('POST', '/api/clients', { name: 'Promise Driver Client' });
  ok(cc.success && cc.id, 'unawaited async driver still works after init');
}

// parallel sales must mint distinct invoice numbers (mutex check)
  const before = (await A('GET', '/api/transactions?limit=500')).length;
  const results = await Promise.all([1, 2, 3, 4, 5].map(() =>
    A('POST', '/api/sales', { items: [{ description: 'Oil', qty: 1, unitCost: 30, invId: it2.id }], paymentMethod: 'Cash' })
  ));
  const nos = results.map(r => r.invoiceNo);
  ok(new Set(nos).size === 5 && nos.every(n => /^INV-\d{5}$/.test(n)), 'parallel sales get unique invoice numbers');
  ok((await A('GET', '/api/transactions?limit=500')).length === before + 5, 'all parallel sales persisted');

// hostile names must not break lists or detail renders
const evil = await A('POST', '/api/clients', { name: '"><img src=x onerror=alert(1)>', phone: '1' });
{
  const all = await A('GET', '/api/clients');
  ok(all.some(c => c.id === evil.id), 'hostile name stored');
  const h = await A('GET', '/api/clients/' + evil.id + '/history');
  ok(h.client.name.includes('<img'), 'name round-trips raw in API (views escape it)');
}
const evilItem = await A('POST', '/api/inventory', { name: "O'Brien \"Special\" <b>", sellPrice: 9, stock: 5 });
ok((await A('GET', '/api/inventory')).some(i => i.id === evilItem.id), 'quoted name stored');

// full return twice: second must refuse, not corrupt
const frSale = await A('POST', '/api/sales', { items: [{ description: 'Oil', qty: 1, unitCost: 30, invId: it2.id }], paymentMethod: 'Cash' });
const fr1 = await A('POST', '/api/returns', { invoiceNo: frSale.invoiceNo });
ok(fr1.success, 'full return succeeds');
await throws(400, () => A('POST', '/api/returns', { invoiceNo: frSale.invoiceNo }), 'second full return refused');

// oversell is allowed but tracked (matches desktop): stock may go negative
const osItem = await A('POST', '/api/inventory', { name: 'Oversell Item', sellPrice: 5, stock: 1 });
await A('POST', '/api/sales', { items: [{ description: 'Oversell Item', qty: 3, unitCost: 5, invId: osItem.id }], paymentMethod: 'Cash' });
ok((await A('GET', '/api/inventory')).find(i => i.id === osItem.id).stock === -2, 'oversell tracked as negative stock');

// per-line rates + variant lines
const vrSale = await A('POST', '/api/sales', { items: [
  { description: 'Rice', qty: 1, unitCost: 50, intRate: 0, invId: it1.id },
  { description: 'Rice', qty: 1, unitCost: 50, intRate: 20, invId: it1.id, variantName: '1kg' }
], paymentMethod: 'Cash' });
const vrDet = await A('GET', '/api/transactions/' + vrSale.invoiceNo);
ok(vrDet.subtotal === 100 && vrDet.totalInterest === 10 && vrDet.grandTotal === 110, 'per-line interest totals');
ok(vrDet.items[1].variantName === '1kg', 'variant name stored on line');
const vItem = await A('POST', '/api/inventory', { name: 'Var Item', sellPrice: 10, stock: 0, variants: [{ name: 'S', stock: 7 }, { name: 'L', stock: 5 }] });
await A('POST', '/api/sales', { items: [{ description: 'Var Item', qty: 2, unitCost: 10, invId: vItem.id, variantName: 'S' }], paymentMethod: 'Cash' });
const vAfter = await A('GET', '/api/inventory');
const vRow = vAfter.find(i => i.id === vItem.id);
ok(vRow && vRow.variants.find(v => v.name === 'S').stock === 5, 'variant stock decremented on sale');

console.log(`\nSTANDALONE STORE: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
