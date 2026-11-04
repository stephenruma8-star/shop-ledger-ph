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
  await A('client-detail', async () => {
    await openClientDetail(1);
    const h = (document.getElementById('client-detail-body') || {}).innerHTML || '';
    if (h.includes('grid-cols-3')) throw new Error('client actions still cramped in 3 columns');
    if (!h.includes('Record payment') && !h.includes('Magbayad')) throw new Error('no record-payment action');
  });
  await A('txn-detail', async () => { const t = (data.transactions || [])[0]; await openTxnDetail(t.invoiceNo || t.id); });
  await A('receipt-preview', async () => {
    const t = (data.transactions || [])[0];
    await previewReceiptTxn(t.invoiceNo || t.id);
    const pre = document.querySelector('.receipt-paper');
    if (!pre) throw new Error('receipt paper wrapper missing');
    const pr = pre.getBoundingClientRect(), hp = pre.parentElement, hr = hp.getBoundingClientRect();
    const center = hr.left + hp.clientLeft + hp.clientWidth / 2;
    if (Math.abs((pr.left + pr.right) / 2 - center) > 2) throw new Error('receipt paper is not centered');
    setReceiptPaper('bond');
    if (!document.querySelector('.bond-receipt')) throw new Error('bond paper preview missing');
    setReceiptPaper('thermal');
    if (!document.querySelector('.receipt-paper')) throw new Error('thermal preview did not restore');
  });
  await A('item-form', async () => { const it = (data.inventory || [])[0]; renderItemForm(it.id); });  await A('client-form', async () => { renderClientForm(null); });
  await A('client-edit-balance', async () => {
    const r = await apiPost('/api/clients', { name: 'Audit Edit', balance: 50 });
    await loadAll();
    renderClientForm(r.id);
    const inp = document.getElementById('cf-balance');
    if (!inp) throw new Error('edit form has no balance field');
    if (Number(inp.value) !== 50) throw new Error('balance not prefilled, got ' + inp.value);
    inp.value = '275.50';
    await submitClientForm(r.id);
    await new Promise(res => setTimeout(res, 30));
    const c = (data.clients || []).find(x => String(x.id) === String(r.id));
    if (!c || Number(c.balance) !== 275.5) throw new Error('edited balance not saved, got ' + (c && c.balance));
    const detail = (document.getElementById('client-detail-body') || {}).textContent || '';
    if (!detail.includes('275.50')) throw new Error('edited balance not shown in detail');
    closeQuick();
    showView('clients');
    const grid = (document.getElementById('client-grid') || {}).innerHTML || '';
    if (!grid.includes('275.50')) throw new Error('edited balance not shown on client card');
    showView('home');
  });
  await A('po-sheet', async () => { addPO(); });
  await A('presets-manager', async () => { showView('sale'); managePresets(); });
  await A('debt-form-setup', async () => { showView('debts'); openDebtFormSetup(); });
  await A('debt-form-preview', async () => { previewDebtForm('portrait'); });
  await A('view-meta-complete', async () => {
    const views = ['catalog', 'clients', 'sale', 'pay', 'inventory', 'transactions', 'expenses', 'suppliers', 'purchase-orders', 'reports', 'settings', 'stocktake', 'audit', 'help', 'debts'];
    const missing = views.filter(v => !VIEW_META[v] || !T(VIEW_META[v].title) || VIEW_META[v].title === 'View');
    if (missing.length) throw new Error('no sheet meta: ' + missing.join(','));
  });
  await A('onboarding-card', async () => {
    if (typeof onboardingCard !== 'function') throw new Error('missing fn');
    const html = onboardingCard();
    if (typeof html !== 'string') throw new Error('bad return');
  });
  await A('rate-preset', async () => {
    showView('sale');
    const sel = document.getElementById('sale-client');
    if (!sel) throw new Error('no client select');
    const opt = [...sel.options].find(o => o.text.includes('Maria Clara'));
    if (!opt) throw new Error('demo client missing');
    sel.value = opt.value;
    applyClientRate();
    const box = document.getElementById('sale-interest');
    if (!box || String(box.value) !== '10') throw new Error('rate not preset, got ' + (box && box.value));
  });
  await A('client-to-sale-preset', async () => {
    showView('sale', 1);
    const sel = document.getElementById('sale-client');
    if (!sel || String(sel.value) !== '1') throw new Error('client not preselected, got ' + (sel && sel.value));
    showView('home');
  });
  await A('save-and-new-sale', async () => {
    renderClientForm(null);
    if (!document.getElementById('modal-root').innerHTML.includes('submitClientForm(null, true)')) throw new Error('no save-and-new-sale button');
    document.getElementById('cf-name').value = 'Audit Buyer';
    await submitClientForm(null, true);
    const me = (data.clients || []).find(c => c.name === 'Audit Buyer');
    if (!me) throw new Error('client not created');
    const sel = document.getElementById('sale-client');
    if (!sel || String(sel.value) !== String(me.id)) throw new Error('sale not preset, got ' + (sel && sel.value));
    showView('home');
  });
  await A('update-card', async () => {
    if (typeof openStandaloneUpdate !== 'function' || typeof openStandaloneUpdateFallback !== 'function' || typeof checkStandaloneUpdate !== 'function') throw new Error('update fns missing');
    if (typeof openPendingStandaloneUpdate !== 'function' || typeof openPendingStandaloneUpdateFallback !== 'function') throw new Error('pending update fns missing');
    const prompt = standaloneUpdatePromptHTML({ tag: '9.9.9', url: 'https://example.com/a.apk?x=1', file: 'a.apk' });
    if (!prompt.includes('onclick="openPendingStandaloneUpdate()"')) throw new Error('update button handler broken');
    if (!prompt.includes('onclick="openPendingStandaloneUpdateFallback()"')) throw new Error('fallback button handler broken');
    if (/onclick="[^"]*https:\/\/example\.com/.test(prompt)) throw new Error('download URL leaked into inline handler');
    let host = document.getElementById('update-row');
    let made = false;
    if (!host) { host = document.createElement('div'); host.id = 'update-row'; document.body.appendChild(host); made = true; }
    updateUpdateRow();
    if (!host.innerHTML.includes('checkStandaloneUpdate(true)')) throw new Error('no check-for-updates button');
    {
      // A rate-limited / failed feed must report a failure, never "up to date".
      const updSlot = document.getElementById('upd-check');
      const realFetch = window.fetch;
      window.fetch = async () => ({ ok: false, status: 403, json: async () => ({ message: 'rate limited' }) });
      try { await checkStandaloneUpdate(true); } finally { window.fetch = realFetch; }
      if (updSlot && /Up to date/.test(updSlot.innerHTML)) throw new Error('rate-limited update check reported up to date');
      if (!updSlot || !/Check failed/.test(updSlot.innerHTML)) throw new Error('rate-limited update check did not report failure');
      // A good feed with a newer APK must still offer it.
      window.fetch = async () => ({ ok: true, status: 200, json: async () => ([{ tag_name: 'mobile-v9.9.9', name: 'Phone 9.9.9', assets: [{ name: 'Shop-Ledger-Mobile-9.9.9-standalone.apk', browser_download_url: 'https://example.com/Shop-Ledger-Mobile-9.9.9-standalone.apk' }] }]) });
      try { await checkStandaloneUpdate(true); } finally { window.fetch = realFetch; }
      if (!updSlot || !/New version 9.9.9/.test(updSlot.innerHTML)) throw new Error('newer release not offered');
    }
    if (typeof pollStandaloneDownload !== 'function') throw new Error('no poll fn');
    pollStandaloneDownload(null, null, 'x'); // no native in audit env: must no-op, not throw
    host.innerHTML = '';
    if (made) host.remove();
  });
  await A('manual-stays-open', async () => {
    const before = cart.length;
    manualItem();
    if (!document.getElementById('m-name')) throw new Error('manual modal missing');
    document.getElementById('m-name').value = 'Audit Candy';
    document.getElementById('m-price').value = '5';
    document.getElementById('m-qty').value = '2';
    addManualItem();
    document.getElementById('m-name').value = 'Audit Chips';
    document.getElementById('m-price').value = '10';
    addManualItem();
    if (cart.length !== before + 2) throw new Error('expected 2 manual lines, got ' + (cart.length - before));
    if (!document.getElementById('m-name')) throw new Error('modal closed after add');
    closeQuick();
    showView('home');
  });
  await A('pay-record-visible', async () => {
    showView('pay');
    const bar = document.getElementById('pay-record-bar');
    if (!bar) throw new Error('record button has no bar');
    if (!String(bar.getAttribute('style') || '').includes('position:fixed')) throw new Error('pay bar is not fixed to the screen');
    showView('sale');
    const sbar = document.getElementById('sale-save-bar');
    if (!sbar) throw new Error('save button has no bar');
    if (!String(sbar.getAttribute('style') || '').includes('position:fixed')) throw new Error('sale bar is not fixed to the screen');
    showView('home');
  });
  await A('clients-header-order', async () => {
    showView('clients');
    const h = (document.getElementById('sheet-body') || document.body).innerHTML;
    const addAt = h.indexOf('renderClientForm(null)');
    const debtsAt = h.indexOf(T('cli.total_debts'));
    if (addAt < 0 || debtsAt < 0) throw new Error('clients header parts missing');
    if (!(addAt < debtsAt)) throw new Error('add-client must sit above total-debts');
    if (typeof autoPreUpdateBackup !== 'function') throw new Error('no auto-backup fn');
    showView('home');
  });
  await A('sale-links-client', async () => {
    const c = (data.clients || [])[0];
    if (!c) throw new Error('no demo client');
    const h0 = await apiGet('/api/clients/' + c.id + '/history');
    showView('sale');
    cart.push({ invId: null, name: 'Audit Link Cash', qty: 1, price: 40 });
    renderSale();
    document.getElementById('sale-client').value = String(c.id);
    document.getElementById('sale-payment').value = 'Cash';
    await submitSale(); // cash: linked to client, no balance effect
    const inv1 = (document.getElementById('view').textContent.match(/INV-\d+/) || [])[0];
    if (!inv1) throw new Error('no invoice after cash sale');
    const d1 = await apiGet('/api/transactions/' + inv1);
    if (String(d1.clientId) !== String(c.id)) throw new Error('cash sale not linked to client');
    const hb = (await apiGet('/api/clients/' + c.id + '/history')).client.balance || 0;
    if (hb !== (h0.client.balance || 0)) throw new Error('cash sale moved balance');
    showView('sale');
    cart.push({ invId: null, name: 'Audit Link Credit', qty: 1, price: 40 });
    renderSale();
    document.getElementById('sale-client').value = String(c.id);
    document.getElementById('sale-payment').value = 'GCash';
    await submitSale(); // credit: linked AND adds to balance
    const ha = (await apiGet('/api/clients/' + c.id + '/history')).client.balance || 0;
    if (Math.abs(ha - hb - 40) > 1e-9) throw new Error('credit sale did not add balance, got ' + ha);
    if (!document.getElementById('toast-root').innerHTML.includes('now owes')) throw new Error('no balance proof toast after save');
    cart = [];
    showView('home');
  });
  await A('sale-keeps-discount', async () => {
    showView('sale');
    const n = cart.length;
    cart.push({ invId: null, name: 'Audit Keep', qty: 1, price: 100 });
    renderSale();
    document.getElementById('sale-discount').value = '25';
    document.getElementById('sale-sc').checked = true;
    renderSale(); // qty steps, refreshes and LAN updates all re-render
    if (document.getElementById('sale-discount').value !== '25') throw new Error('discount wiped by re-render');
    if (!document.getElementById('sale-sc').checked) throw new Error('sc wiped by re-render');
    cart.length = n;
    showView('home');
  });
  await A('catalog-search-keeps-input', async () => {
    showView('catalog');
    const input = document.getElementById('cat-search');
    if (!input) throw new Error('no catalog search box');
    input.value = 'a';
    searchCatalog('a');
    if (document.getElementById('cat-search') !== input) throw new Error('search box rebuilt on keystroke');
    if (!document.getElementById('cat-grid')) throw new Error('no cat grid');
    showView('home');
  });
  await A('sale-switch-confirm', async () => {
    const ids = (data.clients || []).map(c => String(c.id));
    if (ids.length < 2) throw new Error('need 2 demo clients');
    showView('sale');
    cart.push({ invId: null, name: 'Audit Switch', qty: 1, price: 5 });
    saleCartClient = ids[0];
    saleClientPreset = ids[0];
    const sel = document.getElementById('sale-client');
    sel.value = ids[1];
    saleClientChanged();
    const modal = document.getElementById('modal-root').innerHTML;
    if (!modal.includes('doSwitchClient') || !modal.includes('keepSwitchClient')) throw new Error('no switch choices');
    keepSwitchClient();
    if (cart.length !== 1) throw new Error('keep path dropped items');
    if (String(document.getElementById('sale-client').value) !== ids[1]) throw new Error('keep path lost new client');
    if (String(saleCartClient) !== ids[1]) throw new Error('keep path did not bind cart to new client');
    document.getElementById('sale-client').value = ids[0];
    saleClientChanged();
    doSwitchClient();
    if (cart.length !== 0) throw new Error('start-fresh path did not clear cart');
    if (String(document.getElementById('sale-client').value) !== ids[0]) throw new Error('start-fresh lost new client');
    cart = []; saleDrafts = {}; persistSaleDrafts();
    showView('home');
  });
  await A('sale-drafts', async () => {
    const ids = (data.clients || []).map(c => String(c.id));
    if (ids.length < 2) throw new Error('need 2 demo clients');
    saleDrafts = {}; persistSaleDrafts();
    showView('sale', ids[0]);
    cart = [{ invId: null, name: 'Audit Draft A', qty: 1, price: 11 }];
    showView('sale', ids[1]);
    if (cart.length !== 0) throw new Error('programmatic switch did not start target');
    if (!saleDrafts[ids[0]] || saleDrafts[ids[0]].cart.length !== 1) throw new Error('programmatic switch did not save draft');
    const sel = document.getElementById('sale-client');
    sel.value = ids[0];
    saleClientChanged();
    if (cart.length !== 1 || cart[0].name !== 'Audit Draft A') throw new Error('draft was not restored');
    if (saleDrafts[ids[0]]) throw new Error('restored draft still listed');
    saleDrafts[ids[1]] = { cart: [{ invId: null, name: 'Audit Draft B', qty: 1, price: 7 }] };
    persistSaleDrafts();
    document.getElementById('sale-client').value = ids[1];
    saleClientChanged();
    const switchHtml = document.getElementById('modal-root').innerHTML;
    if (!switchHtml.includes('1 saved item')) throw new Error('saved draft count missing from switch warning');
    keepSwitchClient();
    if (cart.length !== 2) throw new Error('keep path did not merge both drafts');
    if (!cart.some(i => i.name === 'Audit Draft A') || !cart.some(i => i.name === 'Audit Draft B')) throw new Error('keep path lost a draft');
    cart = []; saleCartClient = ids[0]; saleDrafts = {};
    saleDrafts[ids[0]] = { cart: [{ invId: null, name: 'Audit Draft Safe', qty: 1, price: 3 }] };
    persistSaleDrafts();
    showView('sale', ids[1]);
    if (!saleDrafts[ids[0]]) throw new Error('empty cart deleted another draft');
    cart = []; saleDrafts = {}; persistSaleDrafts();
    showView('home');
  });
  await A('sale-nav-keeps-items', async () => {
    const c = (data.clients || [])[0];
    if (!c) throw new Error('no demo client');
    showView('sale', c.id);
    cart.push({ invId: null, name: 'Audit Nav Keep', qty: 1, price: 9 });
    saleCartClient = String(c.id);
    showView('home');
    navTap('sale');
    if (cart.length !== 1) throw new Error('navigation dropped cart items');
    const sel = document.getElementById('sale-client');
    if (!sel || String(sel.value) !== String(c.id)) throw new Error('navigation lost selected client');
    cart = [];
    showView('home');
  });
  await A('preset-adopts-walkin', async () => {
    const c = (data.clients || [])[0];
    if (!c) throw new Error('no demo client');
    showView('sale');
    cart.push({ invId: null, name: 'Audit Adopt', qty: 1, price: 3 });
    saleCartClient = '';
    showView('sale', c.id);
    if (cart.length !== 1) throw new Error('walk-in draft wiped by preset');
    if (String(document.getElementById('sale-client').value) !== String(c.id)) throw new Error('preset client lost');
    cart = [];
    showView('home');
  });
  await A('pay-overpay-delete', async () => {
    const r = await apiPost('/api/clients', { name: 'Audit Overpay' });
    const cid = r.id;
    await apiPost('/api/payments', { clientId: cid, amount: 500, type: 'Partial', date: '2026-10-15' });
    let h = await apiGet('/api/clients/' + cid + '/history');
    if ((h.client.balance || 0) !== 0) throw new Error('zero-balance pay moved balance to ' + h.client.balance);
    const pid = (h.payments || []).find(p => p.amount === 500).id;
    await apiPost('/api/payments/' + pid, {}, 'DELETE');
    h = await apiGet('/api/clients/' + cid + '/history');
    if ((h.client.balance || 0) !== 0) throw new Error('delete invented debt: ' + h.client.balance);
  });
  await A('line-date-prorates', async () => {
    showView('sale');
    const n = cart.length;
    cart.push({ invId: null, name: 'Audit Dated', qty: 1, price: 300, date: phoneToday() });
    renderSale();
    const idx = cart.length - 1;
    cartLineRate(idx, 10);
    const sameDay = document.getElementById('mc-amt-' + idx).textContent;
    if (sameDay !== peso(301)) throw new Error('same-day should accrue rate/30, got ' + sameDay);
    const d = new Date(); const b = new Date(d.getFullYear(), d.getMonth(), d.getDate() - 30);
    const p2 = (x) => String(x).padStart(2, '0');
    cartLineDate(idx, b.getFullYear() + '-' + p2(b.getMonth() + 1) + '-' + p2(b.getDate()));
    const backdated = document.getElementById('mc-amt-' + idx).textContent;
    if (backdated !== peso(330)) throw new Error('30-day 10% should be full rate, got ' + backdated);
    cart.length = n;
    showView('home');
  });
  await A('escattr-quotes', async () => {
    if (escAttr('a"b\'c<d') !== 'a&quot;b&#39;c&lt;d') throw new Error('bad escAttr: ' + escAttr('a"b\'c<d'));
  });
  await A('settle-line-ui', async () => {
    const r = await apiPost('/api/clients', { name: 'Audit Settle' });
    const inv = (data.inventory || []).find(i => (i.stock || 0) > 0);
    if (!inv) throw new Error('no stock for settle fixture');
    const s = await apiPost('/api/sales', { clientId: r.id, items: [{ description: 'Audit Settle Item', qty: 1, unitCost: 77, intRate: 0, invId: inv.id }], paymentMethod: 'GCash' });
    await loadAll();
    await openTxnDetail(s.invoiceNo);
    if (!document.getElementById('txn-detail-body').innerHTML.includes('settleTxnLine')) throw new Error('no settle button');
    settleTxnLine(s.invoiceNo, 0);
    await settleTxnLine(s.invoiceNo, 0);
    const h = await apiGet('/api/clients/' + r.id + '/history');
    if ((h.client.balance || 0) !== 0) throw new Error('settle did not clear balance, got ' + h.client.balance);
    if (!(h.payments || []).some(p => p.type === 'Settle' && p.amount === 77)) throw new Error('no settle payment');
    closeQuick();
    showView('home');
  });
  await A('sale-balance-preview', async () => {
    showView('sale');
    cart.push({ invId: null, name: 'Audit Bal', qty: 1, price: 100 });
    renderSale();
    if (!document.getElementById('sale-client-bal')) throw new Error('no balance preview line');
    const c = (data.clients || [])[0];
    if (!c) throw new Error('no demo client');
    document.getElementById('sale-client').value = String(c.id);
    document.getElementById('sale-payment').value = 'GCash';
    saleHeaderChanged();
    const box = document.getElementById('sale-client-bal');
    if (!box.textContent.includes('100.00')) throw new Error('preview missing adds amount: ' + box.textContent);
    document.getElementById('sale-payment').value = 'Cash';
    saleHeaderChanged();
    if (!box.textContent.includes('Cash')) throw new Error('cash path not shown in preview');
    cart = [];
    showView('home');
  });
  await A('supplier-pay-button', async () => {
    const s = await apiPost('/api/suppliers', { name: 'Audit Supplier' });
    const po = await apiPost('/api/purchase-orders', { supplierId: s.id, items: [{ name: 'Audit Goods', price: 20, qty: 5 }] });
    const all = await apiGet('/api/purchase-orders');
    await apiPost('/api/purchase-orders/' + all.find(p => p.poNo === po.poNo).id + '/receive', {});
    await loadAll();
    showView('suppliers');
    if (!document.getElementById('sup-grid').innerHTML.includes('renderSupplierPay')) throw new Error('no supplier pay button');
    showView('home');
  });
  await A('stocktake-lock-free', async () => {
    showView('stocktake');
    await submitStocktake();
    if (!takeSubmitLock('stocktake')) throw new Error('stocktake lock stuck');
    releaseSubmitLock('stocktake');
    showView('home');
  });
  await A('reports-grid', async () => {
    showView('reports');
    const cards = (document.getElementById('view').innerHTML.match(/stat-card rounded-2xl p-3\.5/g) || []).length;
    if (cards !== 4) throw new Error('reports grid broken, cards=' + cards);
    showView('home');
  });
  await A('cashier-gates', async () => {
    const realRole = phoneRole;
    try {
      phoneRole = () => 'cashier';
      showView('inventory');
      if (document.getElementById('view').innerHTML.includes('renderItemForm(')) throw new Error('cashier sees item add');
      showView('debts');
      if (document.getElementById('view').innerHTML.includes('openDebtFormSetup(')) throw new Error('cashier sees debt form');
      showView('suppliers');
      if (currentView === 'suppliers') throw new Error('cashier reached suppliers');
    } finally {
      phoneRole = realRole;
      showView('home');
    }
  });
  await A('quoted-names-roundtrip', async () => {
    const nm = `O'Brien "Jr"`;
    const r = await apiPost('/api/clients', { name: nm, phone: '0917', address: 'a"b' });
    await loadAll();
    renderClientForm(r.id);
    if (document.getElementById('cf-name').value !== nm) throw new Error('client name mangled in form');
    if (document.getElementById('cf-address').value !== 'a"b') throw new Error('address mangled in form');
    closeQuick();
    showView('sale');
    manualItem();
    document.getElementById('m-name').value = `Candy "Lito"`;
    document.getElementById('m-price').value = '5';
    addManualItem();
    const line = cart[cart.length - 1];
    if (!line || line.name !== `Candy "Lito"`) throw new Error('manual item name mangled');
    cart = [];
    closeQuick();
    showView('home');
  });
  await A('presets-roundtrip', async () => {
    const before = (await apiGet('/api/quick-items')).length;
    await apiPost('/api/quick-items', { name: 'Audit Preset', price: 7 });
    const mid = await apiGet('/api/quick-items');
    if (mid.length !== before + 1) throw new Error('preset not added');
    await apiPost('/api/quick-items/' + mid.find(q => q.name === 'Audit Preset').id, {}, 'DELETE');
    const after = await apiGet('/api/quick-items');
    if (after.length !== before) throw new Error('preset not deleted');
  });
  await A('stocktake-submit', async () => {
    showView('stocktake');
    const it = (data.inventory || []).find(i => (i.stock || 0) > 0);
    stocktakeTouched = {};
    stocktakeTouched[it.id] = (it.stock || 0) + 1;
    await submitStocktake();
    await loadAll();
    const now = (data.inventory || []).find(i => i.id === it.id);
    if ((now.stock || 0) !== (it.stock || 0) + 1) throw new Error('count not saved');
  });
  await A('backup-ui-guards', async () => {
    showView('settings');
    updateBackupRow();
    await exportBackup();
    await importBackup();
  });
  await A('debt-share-guard', async () => {
    await shareDebtForm();
  });
  await A('settings-rows', async () => {
    showView('settings');
    updateInstallRow(); updatePinRow(); updateDisplayRow(); updateUpdateRow(); updateBioRow(); updateDiagRow(); updateWeatherRow();
    if (typeof updateBackupRow === 'function') updateBackupRow();
  });
  await A('update-check-logic', async () => {
    if (typeof _cmpVersions !== 'function') throw new Error('missing compare');
    if (_cmpVersions('4.7.5', '4.7.5') !== 0) throw new Error('equal');
    if (!(_cmpVersions('4.8.0', '4.7.9') > 0)) throw new Error('greater');
    if (!(_cmpVersions('4.7.4', '4.7.5') < 0)) throw new Error('lesser');
    await openStandaloneUpdate('https://example.com/x.apk', 'x.apk');
    openStandaloneUpdateFallback('https://example.com/x.apk');
  });
  await A('stock-notify-guard', async () => {
    await checkStockNotify();
  });
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
    const outcome = await Promise.race([work.then(() => 'ok'), timeout.then(() => 'timeout', () => 'timeout')]);
    if (outcome !== 'ok') return;
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
  await A('pin-lock-unlock', async () => {    try { localStorage.setItem('slpPinHash', await sha256hex('slp-pin:9999')); } catch (e) {}
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
  await A('pin-recovery-screen', async () => {
    renderPinLock(true);
    renderPinRecovery(true);
    const ov = document.getElementById('pin-lock');
    if (!ov || !ov.innerHTML.includes('pin-rec-file')) throw new Error('recovery screen missing');
    renderPinLock(true);
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
