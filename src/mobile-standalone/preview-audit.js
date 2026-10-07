// ---------- PREVIEW AUDIT (browser functional audit, never shipped) ----------
// Loaded BEFORE preview-boot.js in the audit bundle. Hooks T() for i18n-key
// coverage and collects window errors. preview-boot.js calls
// runStandaloneAudit() at the end instead of showing the app.
try { window.__SLP_PREVIEW__ = true; } catch (e) {}
const AUDIT = { pass: [], fail: [], keys: new Set(), errors: [] };
try {
  window.addEventListener('error', (e) => {
    try { AUDIT.errors.push(String((e && e.message) || 'error')); } catch (_) {}
  });
  window.addEventListener('unhandledrejection', (e) => {
    try { AUDIT.errors.push('rejection:' + String((e && e.reason && (e.reason.message || e.reason)) || e.reason)); } catch (_) {}
  });
} catch (e) {}
try {
  const _realT = T;
  T = function (k, v) { try { AUDIT.keys.add(k); } catch (_) {} return _realT(k, v); };
} catch (e) {}
function auditStep(name, fn) {
  try { document.title = 'AUDIT-RUN ' + name; } catch (e) {}
  try {
    const r = fn();
    if (r && typeof r.then === 'function') {
      return r.then(() => AUDIT.pass.push(name)).catch((e) => AUDIT.fail.push(name + ' :: ' + ((e && e.message) || e)));
    }
    AUDIT.pass.push(name);
  } catch (e) {
    AUDIT.fail.push(name + ' :: ' + ((e && e.message) || e));
  }
  return Promise.resolve();
}
function auditViewHasContent(name) {
  const v = document.getElementById('view');
  const html = (v && v.innerHTML) || '';
  if (html.length < 200) throw new Error('empty render (' + html.length + ' chars)');
  if (/undefined|NaN|function Object/.test(html.replace(/data:[^"']*/g, ''))) {
    const m = html.match(/undefined|NaN/) || ['?'];
    throw new Error('suspicious output: ' + m[0]);
  }
}
async function runStandaloneAudit() {
  const A = async (name, fn) => auditStep(name, fn);
  // every view renders with content
  for (const vw of ['home', 'sale', 'catalog', 'pay', 'inventory', 'transactions', 'expenses', 'suppliers', 'purchase-orders', 'reports', 'settings', 'stocktake', 'audit', 'help', 'debts', 'clients']) {
    await A('render:' + vw, async () => { showView(vw); await new Promise(r => setTimeout(r, 30)); auditViewHasContent(vw); });
  }
  // detail + modal flows
  await A('client-detail', async () => { await openClientDetail(1); });
  await A('txn-detail', async () => { const t = (data.transactions || [])[0]; await openTxnDetail(t.invoiceNo || t.id); });
  await A('receipt-preview', async () => { const t = (data.transactions || [])[0]; await previewReceiptTxn(t.invoiceNo || t.id); });
  await A('item-form', async () => { const it = (data.inventory || [])[0]; renderItemForm(it.id); });
  await A('client-form', async () => { renderClientForm(null); });
  await A('po-sheet', async () => { addPO(); });
  await A('presets-manager', async () => { showView('sale'); managePresets(); });
  await A('stocktake-submit-dry', async () => { showView('stocktake'); });
  await A('pay-submit', async () => {
    showView('pay');
    document.getElementById('pay-client').value = '1';
    document.getElementById('pay-amount').value = '10';
    await submitPay();
  });
  await A('quick-sell', async () => { const it = (data.inventory || []).find(i => (i.stock || 0) > 0); await quickSell(it.id); });
  await A('sale-submit', async () => {
    showView('sale');
    const it = (data.inventory || []).find(i => (i.stock || 0) > 1);
    cart.length = 0;
    cart.push({ invId: it.id, name: it.name, qty: 1, price: it.price || 0 });
    updateCartUI();
    await submitSale();
  });
  await A('returns-flow', async () => {
    const t = (data.transactions || []).find(x => x.status !== 'voided' && x.status !== 'return');
    await openTxnDetail(t.invoiceNo || t.id);
    const r = await apiPost('/api/returns', { invoiceNo: t.invoiceNo });
    if (!r.invoiceNo) throw new Error('no return invoice');
  });
  await A('void-flow', async () => {
    const s = await apiPost('/api/sales', { items: [{ description: 'Audit item', qty: 1, unitCost: 5 }], paymentMethod: 'Cash' });
    await apiPost('/api/void', { invoiceNo: s.invoiceNo, reason: 'audit' });
    const d = await apiGet('/api/transactions/' + s.invoiceNo);
    if (d.status !== 'voided' || d.voidReason !== 'audit') throw new Error('void not recorded');
  });
  await A('delete-flows', async () => {
    const tmp = await apiPost('/api/inventory', { name: 'Audit Temp', sellPrice: 1, stock: 1 });
    await apiPost('/api/inventory/' + tmp.id, {}, 'DELETE');
    const tmpC = await apiPost('/api/clients', { name: 'Audit Temp Client' });
    await apiPost('/api/clients/' + tmpC.id, {}, 'DELETE');
    const po = await apiPost('/api/purchase-orders', { items: [{ name: 'X', price: 1, qty: 1 }] });
    const poId = (await apiGet('/api/purchase-orders')).find(p => p.poNo === po.poNo).id;
    await apiPost('/api/purchase-orders/' + poId, { items: [{ name: 'Y', price: 2, qty: 2 }] }, 'PUT');
    await apiPost('/api/purchase-orders/' + poId, {}, 'DELETE');
  });
  await A('backup-roundtrip', async () => {
    const exp = await apiGet('/api/backup/export');
    const r = await apiPost('/api/backup/import', { backup: exp.backup });
    if (!r.success || !r.counts || !r.counts.clients) throw new Error('import failed');
  });
  await A('backup-crypto', async () => {
    // Headless virtual-time can stall SubtleCrypto forever; race it so the
    // audit can't hang (crypto itself is verified in Node, not here).
    if (!crypto.subtle) throw new Error('no subtle crypto');
    const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error('subtle-timeout')), 15000));
    const work = (async () => {
      const enc = await backupEncrypt(JSON.stringify({ hello: 1 }), 'pw123');
      const dec = await backupDecrypt(enc, 'pw123');
      if (JSON.parse(dec).hello !== 1) throw new Error('round trip mismatch');
      let threw = false;
      try { await backupDecrypt(enc, 'wrong'); } catch (e) { threw = true; }
      if (!threw) throw new Error('wrong password accepted');
    })();
    await Promise.race([work, timeout]);
  });
  await A('csv-exports', async () => {
    for (const p of ['/api/reports/export.csv', '/api/payments/export.csv', '/api/inventory/export.csv']) {
      const r = await apiGet(p);
      if (!r || !r.csv || r.csv.charCodeAt(0) !== 0xFEFF) throw new Error('bad csv ' + p);
    }
  });
  await A('print-encoder', async () => {
    const b64 = escposBytes([{ t: 'center', bold: true, text: 'Hi ₱1' }, { t: 'divider' }]);
    const bin = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    if (bin[0] !== 0x1b || bin[1] !== 0x40) throw new Error('no INIT');
    const tail = [...bin.slice(-5)];
    if (tail.join(',') !== '10,10,29,86,0') throw new Error('no CUT, got ' + tail.join(','));
  });
  await A('first-run-pin', async () => {
    try { localStorage.removeItem('slpPinHash'); } catch (e) {}
    renderFirstRunPin();
    document.getElementById('pin-setup-new').value = '1234';
    document.getElementById('pin-setup-confirm').value = '1234';
    const realStart = startStandalone;
    startStandalone = async () => {};
    try { await saveFirstRunPin(); } finally { startStandalone = realStart; }
    if (!pinHashGet()) throw new Error('PIN not saved');
    try { localStorage.removeItem('slpPinHash'); } catch (e) {}
  });
  await A('pin-lock-unlock', async () => {
    try { localStorage.setItem('slpPinHash', await sha256hex('slp-pin:9999')); } catch (e) {}
    pinSessionSet(false);
    renderPinLock(true);
    document.getElementById('pin-unlock').value = '9999';
    const realStart = startApp;
    startApp = () => {};
    try { await unlockPhone(true); } finally { startApp = realStart; }
    if (!pinSessionOk()) throw new Error('unlock failed');
    try { localStorage.removeItem('slpPinHash'); } catch (e) {}
    pinSessionSet(false);
  });
  await A('interest-apply', async () => {
    const r = await apiPost('/api/interest/apply', {});
    if (!r || typeof r.applied !== 'number') throw new Error('bad shape');
  });
  await A('sms-texts', async () => {
    const r = await apiPost('/api/sms-reminders', {});
    if (!r || !Array.isArray(r.texts)) throw new Error('no texts');
  });
  await A('thermal-print-stub', async () => {
    setPrinterFn(async () => ({ success: true }));
    const r = await apiPost('/api/print-thermal', { transactionId: (data.transactions || [])[0].invoiceNo });
    if (!r.success) throw new Error('stub print failed');
    setPrinterFn(null);
  });
  // i18n coverage: every called key must exist in en + fil
  await A('i18n-coverage', async () => {
    const miss = [...AUDIT.keys].filter(k => !(LANG_STRINGS.en || {})[k] && !(LANG_STRINGS.fil || {})[k]);
    if (miss.length) throw new Error('missing keys: ' + miss.slice(0, 8).join(', '));
    const missFil = [...AUDIT.keys].filter(k => !(LANG_STRINGS.fil || {})[k]);
    if (missFil.length) throw new Error('missing Filipino: ' + missFil.slice(0, 8).join(', '));
  });
  const report = {
    pass: AUDIT.pass.length, fail: AUDIT.fail.length,
    failures: AUDIT.fail.slice(0, 20),
    jsErrors: AUDIT.errors.slice(0, 10),
    keysUsed: AUDIT.keys.size
  };
  document.title = 'AUDIT-DONE pass=' + report.pass + ' fail=' + report.fail;
  document.body.innerHTML = '<pre id="audit-report" style="color:#fff;padding:1rem;font-size:12px;white-space:pre-wrap">' +
    JSON.stringify(report, null, 1).replace(/</g, '&lt;') + '</pre>';
}
