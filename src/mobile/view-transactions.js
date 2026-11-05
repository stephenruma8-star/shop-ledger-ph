// ---------- TRANSACTIONS ----------
async function renderTransactions() {
  const v = document.getElementById('view');
  if (!data.transactions.length) { v.innerHTML = skeleton(T('common.loading')); await loadAll(); }
  const total = data.transactions.reduce((s, t) => s + (t.grandTotal || 0), 0);
  v.innerHTML = `
    <div class="flex items-center justify-between gap-2 mb-3 fade-in">
      <h2 class="card-title text-base"><span class="icon-tile bg-blue-500/15 text-blue-400"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg></span>${T('view.transactions.title')}</h2>
      <span class="chip chip-blue">${peso(total)} ${T('txn.total_word')}</span>
    </div>
    <div class="relative mb-3 fade-in">
      <svg class="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
      <input id="txn-search" type="text" placeholder="Invoice, client, or item…" oninput="filterTransactions(this.value)" autocomplete="off" class="inp pl-10" />
    </div>
    <div class="grid gap-2.5 md:grid-cols-2 fade-in" id="txn-grid">${txnListHTML(data.transactions)}</div>`;
}
function txnListHTML(items) {
  if (!(items || []).length) return `<div class="text-center text-gray-500 py-10 fade-in md:col-span-2"><svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#475569" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="mx-auto mb-2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg><p class="text-sm">No sales found.</p></div>`;
  return items.map(t => `
        <div class="glass-card rounded-2xl p-3 row card-hover" onclick='openTxnDetail(${jsArg(t.invoiceNo || t.id)})' style="cursor:pointer">
          <div class="flex-1 min-w-0">
            <div class="font-semibold text-sm text-gray-200 truncate">${esc(t.clientName || 'Walk-in')}</div>
            <div class="text-[11px] text-gray-500 truncate">${esc(t.invoiceNo || '')} · ${fmtDate(t.date)} · ${esc(t.paymentMethod || 'Cash')}${t.items ? ' · ' + t.items + ' ' + (t.items === 1 ? T('cat.item') : T('cat.items')) : ''}</div>
          </div>
          <div class="text-right shrink-0">
            <div class="font-bold text-sm ${Number(t.grandTotal) < 0 ? 'text-red-400' : 'text-green-400'} num">${peso(t.grandTotal)}</div>
            <span class="chip ${(t.status || '') === 'pending' ? 'chip-amber' : (t.status === 'return' ? 'chip-red' : 'chip-green')}" style="padding:.1rem .5rem;font-size:.68rem">${esc(t.status == null ? '' : t.status === 'pending' ? T('txn.credit') : t.status === 'return' ? T('txn.returned_chip') : T('txn.paid'))}</span>
          </div>
        </div>`).join('');
}
function filterTransactions(q) {
  q = (q || '').toLowerCase();
  const g = document.getElementById('txn-grid');
  if (g) g.innerHTML = txnListHTML((data.transactions || []).filter(t => ((t.invoiceNo || '') + ' ' + (t.clientName || '') + ' ' + (t.paymentMethod || '') + ' ' + (t.status || '')).toLowerCase().includes(q)));
}
let returnArmedFor = null;
let voidArmedFor = null;
async function voidTxn(id) {
  const btn = document.getElementById('void-btn');
  if (voidArmedFor !== id) {
    voidArmedFor = id;
    if (btn) btn.textContent = T('txn.void_confirm');
    setTimeout(() => {
      if (voidArmedFor === id) {
        voidArmedFor = null;
        const b = document.getElementById('void-btn');
        if (b) b.textContent = T('txn.void');
      }
    }, 5000);
    return;
  }
  voidArmedFor = null;
  if (!takeSubmitLock('void')) return;
  try {
    const reason = ((document.getElementById('txn-reason') || {}).value || '').trim().slice(0, 200);
    await apiPost('/api/void', { invoiceNo: id, reason });
    closeQuick();
    feelSale();
    toast(T('txn.voided'), 'ok');
    await refreshAll();
  } catch (e) { feelErr(); toast(T('txn.void_failed', { msg: e.message }), 'err'); }
  finally { releaseSubmitLock('void'); }
}
let returnArmTimer = null;
let detailTxn = null;
let returnSel = new Set();
let settleArmedFor = null;
let settleArmTimer = null;
async function openTxnDetail(id) {
  // A stale arm from another invoice must never confirm a new one.
  returnArmedFor = null;
  settleArmedFor = null;
  returnSel = new Set();
  detailTxn = null;
  try { if (returnArmTimer) clearTimeout(returnArmTimer); } catch (e) {}
  try { if (settleArmTimer) clearTimeout(settleArmTimer); } catch (e) {}
  document.getElementById('modal-root').innerHTML = `
    <div class="fixed inset-0 bg-black/70 z-[45] flex items-end sm:items-center justify-center fade-in" onclick="if(event.target===this)closeQuick()">
      <div class="w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-4 pb-6 slide-up glass-card" style="max-height:94vh;max-height:94dvh;overflow-y:auto" onclick="event.stopPropagation()">
        <div class="grabber mb-3" style="margin-bottom:.9rem"></div>
        <div id="txn-detail-body">${skeleton(T('common.loading'))}</div>
      </div>
    </div>`;
  let t = null;
  try { t = await apiGet('/api/transactions/' + encodeURIComponent(id)); }
  catch (e) { toast(T('txn.load_fail', { msg: e.message }), 'err'); closeQuick(); return; }
  const box = document.getElementById('txn-detail-body');
  if (!box) return;
  detailTxn = t;
  const owner = phoneRole() !== 'cashier';
  const canReturn = owner && t.status !== 'return';
  box.innerHTML = `
    <div class="flex items-center justify-between gap-2 mb-1"><h3 class="font-bold text-gray-100 text-sm flex items-center gap-2"><span class="icon-tile bg-blue-500/15 text-blue-400"><svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg></span>${esc(t.invoiceNo || 'Receipt')}</h3><button onclick="closeQuick()" aria-label="Close" class="w-9 h-9 rounded-xl btn-ghost flex items-center justify-center text-gray-400 shrink-0"><svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button></div>
    <p class="text-[11px] text-gray-500 mb-3">${esc(t.clientName || 'Walk-in')} · ${esc(t.date || '')} · ${esc(t.paymentMethod || 'Cash')}</p>
    ${canReturn && (t.items || []).length ? `<p class="text-[11px] text-gray-500 mb-2">${T('ret.pick_hint')}</p>` : ''}
    <div class="space-y-1.5 mb-3">
      ${(t.items || []).map((it, idx) => {
        const payoff = (parseFloat(it.amount) || 0) > 0 ? parseFloat(it.amount) : (parseFloat(it.qty) || 1) * (it.unitCost || it.price || 0);
        const clientBal = t.clientId ? ((((data.clients || []).find(x => String(x.id) === String(t.clientId))) || {}).balance || 0) : 0;
        const canSettle = t.clientId && (t.status === 'pending') && !it.settled && clientBal > 0;
        return `<div class="py-1">
        <div class="flex justify-between text-sm gap-2 ${canReturn ? 'rounded-xl px-2 -mx-2 py-1' : ''}" ${canReturn ? `id="ret-line-${idx}" onclick="toggleReturnLine(${idx})" style="cursor:pointer"` : ''}>
          <span class="text-gray-200 truncate">${esc(it.description || it.name || 'Item')} <span class="text-gray-500">x${it.qty || 1}</span></span>
          <span class="num shrink-0">${peso((parseFloat(it.qty) || 1) * (it.unitCost || it.price || 0))}</span>
        </div>
        ${it.settled ? `<div class="text-[11px] text-green-400 font-semibold mt-0.5">${esc(T('txn.settled_chip', { amt: peso(it.settled.amount), date: it.settled.date || '' }))}</div>`
          : (canSettle ? `<button id="settle-btn-${idx}" onclick="event.stopPropagation();settleTxnLine(${jsArg(t.invoiceNo || t.id)}, ${idx})" class="btn btn-sm mt-1 w-full" style="background:rgba(59,130,246,.14);border:1px solid rgba(59,130,246,.4);color:#93c5fd">${esc(T('txn.settle_item', { amt: peso(payoff) }))}</button>` : '')}
        </div>`;
      }).join('') || `<p class="text-xs text-gray-500">${T('txn.no_lines')}</p>`}
    </div>
    <div class="flex justify-between items-center border-t border-white/10 pt-2 mb-3">
      <span class="font-bold text-gray-200">${T('txn.total')}</span>
      <span class="font-bold text-green-400 num">${peso(t.grandTotal)}</span>
    </div>
    ${(t.voidReason || t.returnReason) ? `<p class="text-[11px] text-gray-500 mb-3">Reason: ${esc(t.voidReason || t.returnReason)}</p>` : ''}
    ${(() => { const vr = parseFloat((data.settings || {}).vatRate) || 0; return vr > 0 ? `<div class="flex justify-between text-[11px] text-gray-500 mb-3"><span>VAT (${vr}%) incl.</span><span class="num">${peso((t.grandTotal || 0) * vr / (100 + vr))}</span></div>` : ''; })()}
    <div class="grid grid-cols-2 gap-2">
      <button onclick="printSaleReceipt(${jsArg(t.invoiceNo || '')})" class="btn btn-ghost btn-sm"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="shrink-0"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>${T('txn.print')}</button>
      ${(canReturn || (owner && t.status !== 'voided' && t.status !== 'return')) ? `<input id="txn-reason" type="text" maxlength="200" placeholder="Reason (optional)" autocomplete="off" class="inp col-span-2" style="height:2.4rem" />` : ''}
      ${owner && t.status !== 'voided' && t.status !== 'return' ? `<button onclick="closeQuick();editTxnPayment(${jsArg(t.invoiceNo || t.id)})" class="btn btn-ghost btn-sm col-span-2"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="shrink-0"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>${esc(T('txn.change_payment'))}: ${esc(t.paymentMethod || 'Cash')}</button>` : ''}
      ${owner && t.status !== 'voided' && t.status !== 'return' ? `<button onclick="closeQuick();editSaleFromDetail(${jsArg(t.invoiceNo || t.id)})" class="btn btn-ghost btn-sm col-span-2"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="shrink-0"><path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z"/></svg>Edit items</button>` : ''}
      <button onclick="previewReceiptTxn(${jsArg(t.invoiceNo || t.id)})" class="btn btn-ghost btn-sm"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="shrink-0"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>${T('txn.preview')}</button>
      <button onclick="shareReceiptTxn(${jsArg(t.invoiceNo || t.id)})" class="btn btn-ghost btn-sm col-span-2"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="shrink-0"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.6" y1="13.5" x2="15.4" y2="17.5"/><line x1="15.4" y1="6.5" x2="8.6" y2="10.5"/></svg>${T('txn.share')}</button>
      ${canReturn ? `<button id="return-btn" onclick="returnTxn(${jsArg(t.invoiceNo || t.id)})" class="btn btn-sm col-span-2" style="background:rgba(239,68,68,.12);border:1px solid rgba(239,68,68,.4);color:#f87171"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="shrink-0"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>${T('txn.return')}</button>` : ''}
      ${owner && t.status !== 'voided' && t.status !== 'return' ? `<button id="void-btn" onclick="voidTxn(${jsArg(t.invoiceNo || t.id)})" class="btn btn-sm col-span-2" style="background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.12);color:#94a3b8"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="shrink-0"><circle cx="12" cy="12" r="10"/><line x1="4.9" y1="4.9" x2="19.1" y2="19.1"/></svg>${T('txn.void')}</button>` : ''}
    </div>`;
}
async function editTxnPayment(id) {
  let t = (detailTxn && (String(detailTxn.id) === String(id) || detailTxn.invoiceNo === String(id))) ? detailTxn : null;
  if (!t) {
    try { t = await apiGet('/api/transactions/' + encodeURIComponent(id)); }
    catch (e) { toast(T('txn.load_fail', { msg: e.message }), 'err'); return; }
  }
  const opts = ['Cash', 'GCash', 'Maya', 'Bank Transfer', 'Credit (Utang)']
    .map(m => `<option${t.paymentMethod === m ? ' selected' : ''}>${esc(m)}</option>`).join('');
  document.getElementById('modal-root').innerHTML = `
    <div class="fixed inset-0 bg-black/70 z-[45] flex items-end sm:items-center justify-center fade-in" onclick="if(event.target===this)closeQuick()">
      <div class="w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-5 pb-6 slide-up glass-card" onclick="event.stopPropagation()">
        <div class="grabber mb-3" style="margin-bottom:.9rem"></div>
        <h3 class="font-bold text-gray-100 text-sm mb-1">${esc(T('txn.payment_title'))}</h3>
        <p class="text-[11px] text-gray-500 mb-3">${esc(t.invoiceNo || '')} · ${esc(t.clientName || 'Walk-in')}</p>
        <label class="text-[11px] text-gray-500 block mb-1">${esc(T('txn.payment_method'))}</label>
        <select id="tp-payment" class="inp mb-3">${opts}</select>
        <button onclick="submitTxnPayment(${jsArg(t.invoiceNo || t.id)})" class="btn btn-primary btn-lg mb-2">${esc(T('cli.save'))}</button>
        <button onclick="closeQuick()" class="btn btn-ghost btn-lg">Cancel</button>
      </div>
    </div>`;
}
async function submitTxnPayment(id) {
  const pm = (document.getElementById('tp-payment') || {}).value;
  if (!pm) return;
  if (!takeSubmitLock('txnpay')) return;
  try {
    await apiPost('/api/transactions/' + encodeURIComponent(id), { paymentMethod: pm }, 'PUT');
    feelOk();
    toast(T('txn.payment_saved'), 'ok');
    closeQuick();
    await refreshAll();
    openTxnDetail(id);
  } catch (e) { feelErr(); toast(T('txn.save_failed', { msg: e.message }), 'err'); }
  finally { releaseSubmitLock('txnpay'); }
}
async function toggleReturnLine(idx) {
  try {
    if (returnSel.has(idx)) returnSel.delete(idx);
    else returnSel.add(idx);
    const row = document.getElementById('ret-line-' + idx);
    if (row) row.classList.toggle('picked', returnSel.has(idx));
    const btn = document.getElementById('return-btn');
    if (btn) btn.textContent = returnSel.size ? T('ret.selected', { n: returnSel.size }) : T('txn.return');
  } catch (e) {}
}
// Per-item settlement: two-tap confirm (first tap arms, second posts),
// same pattern as return/void. Reopens the detail so settled flags show.
async function settleTxnLine(inv, idx) {
  const key = String(inv) + ':' + idx;
  const btn = document.getElementById('settle-btn-' + idx);
  if (settleArmedFor !== key) {
    settleArmedFor = key;
    if (btn) btn.textContent = T('txn.settle_confirm');
    try { if (settleArmTimer) clearTimeout(settleArmTimer); } catch (e) {}
    settleArmTimer = setTimeout(() => { settleArmedFor = null; }, 5000);
    return;
  }
  settleArmedFor = null;
  try { if (settleArmTimer) clearTimeout(settleArmTimer); } catch (e) {}
  if (!takeSubmitLock('settle')) return;
  try {
    const r = await apiPost('/api/sales/settle-item', { invoiceNo: inv, index: idx });
    closeQuick();
    feelSale();
    toast(T('txn.settled', { amt: peso(r.amount) }), 'ok');
    await refreshAll();
    openTxnDetail(inv);
  } catch (e) { feelErr(); toast(T('txn.settle_failed', { msg: e.message }), 'err'); }
  finally { releaseSubmitLock('settle'); }
}
async function returnTxn(id) {
  const btn = document.getElementById('return-btn');
  // Two-tap confirm: first tap arms, second tap posts (mobile has no modal confirm).
  if (returnArmedFor !== id) {
    returnArmedFor = id;
    if (btn) { btn.textContent = T('txn.return_confirm'); btn.style.background = 'rgba(239,68,68,.3)'; }
    try { if (returnArmTimer) clearTimeout(returnArmTimer); } catch (e) {}
    returnArmTimer = setTimeout(() => {
      returnArmedFor = null;
      const b = document.getElementById('return-btn');
      if (b) { b.textContent = returnSel.size ? T('ret.selected', { n: returnSel.size }) : T('txn.return'); b.style.background = ''; }
    }, 5000);
    return;
  }
  returnArmedFor = null;
  try { if (returnArmTimer) clearTimeout(returnArmTimer); } catch (e) {}
  const reason = ((document.getElementById('txn-reason') || {}).value || '').trim().slice(0, 200);
  const body = { invoiceNo: id, reason };
  if (returnSel.size && detailTxn && Array.isArray(detailTxn.items)) {
    body.items = [...returnSel]
      .map(i => detailTxn.items[i])
      .filter(Boolean)
      .map(it => ({ invId: it.invId ?? null, description: it.description || it.name || '', qty: 1 }));
  }
  try {
    const r = await apiPost('/api/returns', body);
    closeQuick();
    feelSale();
    toast(r && r.invoiceNo ? T('txn.returned_as', { inv: r.invoiceNo }) : T('txn.returned'), 'ok');
    await refreshAll();
  } catch (e) { feelErr(); toast(T('txn.failed', { msg: e.message }), 'err'); }
}
// ---------- receipt preview ----------
// 32-column thermal layout in monospace — what the printer gets, before it
// gets it. Print + Share act on the same sale from here.
// Pure line builder shared by the saved-sale preview and the pre-save draft.
function receiptLines(t) {
  const s = (typeof data !== 'undefined' && data.settings) || {};
  const W = 32;
  const clip = (x) => String(x == null ? '' : x).slice(0, W);
  const center = (x) => { x = clip(x); const p = Math.max(0, Math.floor((W - x.length) / 2)); return ' '.repeat(p) + x; };
  const row2 = (l, r) => { l = String(l); r = String(r); return (l + ' '.repeat(Math.max(1, W - l.length - r.length)) + r); };
  const pesoPlain = (n) => 'P' + (Number(n) || 0).toFixed(2);
  const L = [];
  if (s.receiptHeaderText) L.push(s.receiptHeaderText);
  L.push(center(s.shopName || 'Shop Ledger PH'));
  if (s.shopAddress) L.push(center(s.shopAddress));
  if (s.shopContact) L.push(center('Contact: ' + s.shopContact));
  L.push('-'.repeat(W));
  L.push(center('OFFICIAL RECEIPT'));
  if (t.status === 'voided') L.push(center('*** VOIDED ***'));
  if (t.status === 'return') L.push(center('*** RETURN ***'));
  L.push(clip('Invoice: ' + (t.invoiceNo || 'N/A')));
  L.push(clip('Date: ' + (t.createdAt || t.date || '')));
  if (t.clientName && t.clientName !== 'Walk-in') L.push(clip('Client: ' + t.clientName));
  L.push('-'.repeat(W));
  (t.items || []).forEach(it => {
    const q = parseFloat((it.qty != null && it.qty !== '') ? it.qty : it.name) || 1;
    const p = it.unitCost || it.price || 0;
    L.push(String(it.description || 'Item').slice(0, W));
    L.push(row2('  ' + q + ' x ' + pesoPlain(p), pesoPlain(q * p)));
  });
  L.push('-'.repeat(W));
  L.push(row2('Subtotal:', pesoPlain(t.subtotal)));
  if (t.totalInterest > 0) L.push(row2('Interest:', pesoPlain(t.totalInterest)));
  if (t.discount > 0) L.push(row2('Discount:', '-' + pesoPlain(t.discount)));
  L.push(row2('TOTAL:', pesoPlain(t.grandTotal)));
  L.push('-'.repeat(W));
  L.push('Payment: ' + (t.paymentMethod || 'Cash'));
  L.push('');
  L.push(center(s.receiptFooter || 'Thank you for your patronage!'));
  return L;
}
function bondReceiptCss() {
  return `.bond-receipt{background:#fff;color:#0f172a;border:1px solid #cbd5e1;border-radius:.7rem;padding:1rem 1.05rem;font-family:'Segoe UI',Arial,Helvetica,sans-serif;font-size:12px;line-height:1.4;box-shadow:0 6px 24px rgba(0,0,0,.18)}
.bond-receipt *{box-sizing:border-box}
.bond-receipt .bond-top{height:6px;border-radius:3px;background:linear-gradient(90deg,#2563eb,#38bdf8,#22c55e);margin:-1rem -1.05rem .8rem}
.bond-receipt .bond-head{display:flex;justify-content:space-between;align-items:flex-start;gap:.9rem;border-bottom:2px solid #0f172a;padding-bottom:.55rem;margin-bottom:.65rem}
.bond-receipt .bond-shop{font-size:1.15rem;font-weight:800;letter-spacing:.2px}
.bond-receipt .bond-muted{color:#475569;font-size:.72rem;margin-top:.12rem}
.bond-receipt .bond-badge{align-self:flex-start;border:2px solid #2563eb;color:#2563eb;border-radius:.4rem;padding:.28rem .5rem;font-weight:800;font-size:.66rem;letter-spacing:1px;white-space:nowrap}
.bond-receipt .bond-status{text-align:center;font-weight:800;font-size:.8rem;letter-spacing:2px;border:2px solid;border-radius:.4rem;padding:.3rem;margin-bottom:.5rem}
.bond-receipt .bond-meta{display:grid;grid-template-columns:1fr 1fr;gap:.1rem .9rem;font-size:.72rem;margin:.15rem 0 .6rem}
.bond-receipt .bond-meta div{display:flex;justify-content:space-between;gap:.5rem;border-bottom:1px dotted #cbd5e1;padding:.16rem 0}
.bond-receipt .bond-meta span{color:#64748b}
.bond-receipt .bond-meta b{font-weight:700}
.bond-receipt table.bond-table{width:100%;border-collapse:collapse;margin:.3rem 0 .15rem;border:1px solid #94a3b8}
.bond-receipt table.bond-table th{background:#e2e8f0;border:1px solid #94a3b8;padding:.36rem .42rem;font-size:.63rem;text-transform:uppercase;letter-spacing:.4px;text-align:left}
.bond-receipt table.bond-table td{border:1px solid #cbd5e1;padding:.34rem .42rem;vertical-align:top}
.bond-receipt table.bond-table tbody tr:nth-child(odd){background:#ffffff}
.bond-receipt table.bond-table tbody tr:nth-child(even){background:#f1f5f9}
.bond-receipt table.bond-table .num{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}
.bond-receipt .bond-totals{width:100%;border-collapse:collapse;margin-top:.15rem}
.bond-receipt .bond-totals td{padding:.28rem .42rem;border:1px solid #cbd5e1}
.bond-receipt .bond-totals .lbl{background:#f8fafc;font-weight:600}
.bond-receipt .bond-totals .num{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}
.bond-receipt .bond-totals tr.grand td{background:#0f172a;color:#fff;font-weight:800;font-size:1rem;border-color:#0f172a}
.bond-receipt .bond-sign{display:flex;gap:1.6rem;margin-top:1.15rem}
.bond-receipt .bond-sign .line{flex:1;text-align:center;border-top:1px solid #94a3b8;padding-top:.26rem;font-size:.62rem;color:#475569}
.bond-receipt .bond-foot{text-align:center;border-top:1px dashed #cbd5e1;margin-top:.9rem;padding-top:.5rem;font-size:.7rem;color:#475569}`;
}
function bondReceiptHtml(t) {
  const s = (typeof data !== 'undefined' && data.settings) || {};
  const hasInt = (t.items || []).some(i => (Number(i.intRate) || 0) > 0);
  const money = (n) => peso(n);
  const rows = (t.items || []).map(i => {
    const qty = Number(i.qty) || 1;
    const unit = Number(i.unitCost ?? i.price) || 0;
    const amt = Number(i.amount) || qty * unit + lineIntCalc(qty * unit, i.intRate, i.date);
    return `<tr><td>${esc(i.description || 'Item')}${i.variantName ? ' - ' + esc(i.variantName) : ''}</td><td class="num">${qty}</td><td class="num">${money(unit)}</td>${hasInt ? `<td class="num">${Number(i.intRate) || 0}%</td>` : ''}<td class="num">${money(amt)}</td></tr>`;
  }).join('');
  const sc = Number(t.scDiscount) || 0;
  const extraDisc = Math.max(0, (Number(t.discount) || 0) - sc);
  const stamped = new Date().toLocaleString('en-PH', { year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  const dateOnly = String(t.createdAt || t.date || '').slice(0, 10);
  return `<div class="bond-receipt">
    <div class="bond-top"></div>
    ${t.status === 'voided' ? '<div class="bond-status" style="border-color:#dc2626;color:#dc2626">VOIDED</div>' : ''}
    ${t.status === 'return' ? '<div class="bond-status" style="border-color:#7c3aed;color:#7c3aed">RETURN / REFUND</div>' : ''}
    <div class="bond-head">
      <div>
        <div class="bond-shop">${esc(s.shopName || 'Shop Ledger PH')}</div>
        ${s.shopAddress ? `<div class="bond-muted">${esc(s.shopAddress)}</div>` : ''}
        ${s.shopContact ? `<div class="bond-muted">${esc(s.shopContact)}</div>` : ''}
        ${s.receiptHeaderText ? `<div class="bond-muted">${esc(s.receiptHeaderText)}</div>` : ''}
      </div>
      <div class="bond-badge">OFFICIAL RECEIPT</div>
    </div>
    <div class="bond-meta">
      <div><span>Invoice</span><b>${esc(t.invoiceNo || 'N/A')}</b></div>
      <div><span>Date</span><b>${esc(dateOnly)}</b></div>
      <div><span>Client</span><b>${esc(t.clientName || 'Walk-in')}</b></div>
      <div><span>Payment</span><b>${esc(t.paymentMethod || 'Cash')}</b></div>
    </div>
    <table class="bond-table">
      <thead><tr><th>Item</th><th class="num">Qty</th><th class="num">Price</th>${hasInt ? '<th class="num">Int</th>' : ''}<th class="num">Amount</th></tr></thead>
      <tbody>${rows || `<tr><td colspan="${hasInt ? 5 : 4}" style="text-align:center;color:#94a3b8">No items</td></tr>`}</tbody>
    </table>
    <table class="bond-totals">
      <tr><td class="lbl">Subtotal</td><td class="num">${money(t.subtotal)}</td></tr>
      ${Number(t.totalInterest) > 0 ? `<tr><td class="lbl">Interest</td><td class="num">${money(t.totalInterest)}</td></tr>` : ''}
      ${sc > 0 ? `<tr><td class="lbl">SC/PWD 20%</td><td class="num">-${money(sc)}</td></tr>` : ''}
      ${extraDisc > 0 ? `<tr><td class="lbl">Discount</td><td class="num">-${money(extraDisc)}</td></tr>` : ''}
      ${Number(t.vatExclusive) > 0 ? `<tr><td class="lbl">VAT Excl</td><td class="num">${money(t.vatExclusive)}</td></tr><tr><td class="lbl">VAT (${((Number(t.vatRate) || 0) * 100).toFixed(0)}%)</td><td class="num">${money(t.vatAmount)}</td></tr>` : ''}
      <tr class="grand"><td>TOTAL</td><td class="num">${money(t.grandTotal)}</td></tr>
    </table>
    <div class="bond-sign">
      <div class="line">Served by${s.cashierName ? ' — ' + esc(s.cashierName) : ''}</div>
      <div class="line">Received by (signature)</div>
    </div>
    <div class="bond-foot">${esc(s.receiptFooter || 'Thank you for your patronage!')}<br>Printed ${esc(stamped)}</div>
  </div>`;
}
function bondPrintDocument(t) {
  const size = (receiptPreviewState && receiptPreviewState.bondSize) || 'A4';
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Receipt ${esc(t.invoiceNo || '')}</title><style>@page{size:${size};margin:12mm}body{margin:0;background:#fff}${bondReceiptCss()}</style></head><body>${bondReceiptHtml(t)}</body></html>`;
}
let receiptPreviewState = { t: null, draft: false, paper: 'thermal', bondSize: 'A4' };
function setReceiptPaper(paper) {
  if (!receiptPreviewState.t) return;
  showReceiptPreview(receiptPreviewState.t, { draft: receiptPreviewState.draft, paper, bondSize: receiptPreviewState.bondSize });
}
function setReceiptBondSize(bondSize) {
  if (!receiptPreviewState.t) return;
  showReceiptPreview(receiptPreviewState.t, { draft: receiptPreviewState.draft, paper: 'bond', bondSize });
}
function printPreviewReceipt() {
  const st = receiptPreviewState;
  if (!st.t) return;
  if (st.paper === 'bond') printBondReceipt(st.t);
  else printSaleReceipt(st.t.invoiceNo || st.t.id);
}
function printBondReceipt(t) {
  systemPrintHtml(bondPrintDocument(t), 'Receipt ' + (t.invoiceNo || ''));
}
// 32-column receipt rendered as a printable page for the system print dialog.
function thermalPrintDocument(t) {
  const L = receiptLines(t);
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Receipt ${esc(t.invoiceNo || '')}</title><style>@page{size:A4;margin:12mm}body{margin:0;background:#fff;color:#111;font-family:"Courier New",Consolas,monospace;font-size:12px;white-space:pre-wrap}</style></head><body>${esc(L.join('\n'))}</body></html>`;
}
// Renders arbitrary printer lines as a printable page (systemPrintHtml fallback).
function printLinesHtml(lines, title) {
  const W = 32;
  const body = (lines || []).map(l => {
    if (!l) return '';
    if (l.t === 'spacer') return '';
    if (l.t === 'divider') return '-'.repeat(W);
    const text = String(l.text == null ? '' : l.text);
    if (l.t === 'center') { const p = Math.max(0, Math.floor((W - text.length) / 2)); return ' '.repeat(p) + text; }
    return text;
  }).join('\n');
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${esc(title || 'Receipt')}</title><style>@page{size:A4;margin:12mm}body{margin:0;background:#fff;color:#111;font-family:"Courier New",Consolas,monospace;font-size:12px;white-space:pre-wrap}</style></head><body>${esc(body)}</body></html>`;
}
// Opens the OS printer selection/search for the receipt currently previewed.
function findPrinterForReceipt() {
  const st = receiptPreviewState;
  if (!st || !st.t) return;
  const html = st.paper === 'bond' ? bondPrintDocument(st.t) : thermalPrintDocument(st.t);
  systemPrintHtml(html, 'Receipt ' + (st.t.invoiceNo || ''));
}
// Open the OS printer chooser for a saved sale (used from the success sheet).
async function openSystemPrintForSale(invoiceNo) {
  if (!invoiceNo) return;
  let t = (receiptPreviewState.t && (String(receiptPreviewState.t.invoiceNo) === String(invoiceNo) || String(receiptPreviewState.t.id) === String(invoiceNo))) ? receiptPreviewState.t : null;
  if (!t) {
    try { t = await apiGet('/api/transactions/' + encodeURIComponent(invoiceNo)); }
    catch (e) { toast(T('txn.load_fail', { msg: e.message }), 'err'); return; }
  }
  if (!t) return;
  systemPrintHtml(bondPrintDocument(t), 'Receipt ' + (t.invoiceNo || ''));
}
// Modal shell for a receipt preview. opts.draft = unsaved sale: shows a
// not-saved banner and only a "back to sale" action (no print/share yet �?"
// there is no invoice to print until the sale is saved).
function showReceiptPreview(t, opts) {
  const o = opts || {};
  const draft = !!o.draft;
  const paper = o.paper || 'thermal';
  const bondSize = o.bondSize || 'A4';
  receiptPreviewState = { t, draft, paper, bondSize };
  const L = receiptLines(t);
  const tab = (val, label) => `<button onclick="setReceiptPaper('${val}')" class="flex-1 py-1.5 rounded-lg text-xs font-semibold" style="${paper === val ? 'background:rgba(59,130,246,.9);color:#fff' : 'background:transparent;color:#94a3b8'}">${esc(label)}</button>`;
  document.getElementById('modal-root').innerHTML = `
    <div class="fixed inset-0 bg-black/70 z-[45] flex items-end sm:items-center justify-center fade-in" onclick="if(event.target===this)closeQuick()">
      <div class="w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-4 pb-6 slide-up glass-card" style="max-height:94vh;max-height:94dvh;overflow-y:auto" onclick="event.stopPropagation()">
        <style>${bondReceiptCss()}</style>
        <div class="grabber mb-3" style="margin-bottom:.9rem"></div>
        <h3 class="font-bold text-gray-100 text-sm mb-3 flex items-center gap-2"><span class="icon-tile bg-blue-500/15 text-blue-400"><svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg></span>${draft ? esc(T('sale.preview_title')) : esc(t.invoiceNo || 'Receipt')}</h3>
        ${draft ? `<p class="text-[11px] font-semibold uppercase tracking-wider text-amber-400 mb-2">${esc(T('sale.preview_note'))}</p>` : ''}
        <div class="mb-2"><div class="text-[10px] uppercase tracking-wider text-gray-500 mb-1">${esc(T('receipt.paper'))}</div><div class="flex gap-1 p-1 rounded-xl" style="background:rgba(255,255,255,.05)">${tab('thermal', T('receipt.thermal'))}${tab('bond', T('receipt.bond'))}</div></div>
        ${paper === 'bond' ? `<div class="mb-2"><div class="text-[10px] uppercase tracking-wider text-gray-500 mb-1">${esc(T('receipt.bond_size'))}</div><div class="flex gap-1 p-1 rounded-xl" style="background:rgba(255,255,255,.05)">${['A4', 'Letter', 'Legal'].map(sz => `<button onclick="setReceiptBondSize('${sz}')" class="flex-1 py-1.5 rounded-lg text-xs font-semibold" style="${bondSize === sz ? 'background:rgba(59,130,246,.9);color:#fff' : 'background:transparent;color:#94a3b8'}">${sz}</button>`).join('')}</div></div>` : ''}
        ${paper === 'bond' ? bondReceiptHtml(t) : `<pre class="receipt-paper">${esc(L.join('\n'))}</pre>`}
        ${draft
          ? `<button onclick="closeQuick()" class="btn btn-primary w-full">${esc(T('sale.preview_ok'))}</button>`
          : `<div class="grid grid-cols-2 gap-2">
          <button onclick="printPreviewReceipt()" class="btn btn-primary btn-sm"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="shrink-0"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>${T('txn.print')}</button>
          <button onclick="shareReceiptTxn(${jsArg(t.invoiceNo || t.id)})" class="btn btn-ghost btn-sm"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="shrink-0"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.6" y1="13.5" x2="15.4" y2="17.5"/><line x1="15.4" y1="6.5" x2="8.6" y2="10.5"/></svg>${T('txn.share')}</button>
        </div>
        <button onclick="findPrinterForReceipt()" class="btn btn-ghost w-full mt-2">${T('receipt.find_printer')}</button>
        <button onclick="openTxnDetail(${jsArg(t.invoiceNo || t.id)})" class="btn btn-ghost w-full mt-2"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="shrink-0"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>${T('txn.back_detail')}</button>`}
      </div>
    </div>`;
}
async function previewReceiptTxn(id) {
  let t = (typeof detailTxn !== 'undefined' && detailTxn && (String(detailTxn.id) === String(id) || detailTxn.invoiceNo === String(id))) ? detailTxn : null;
  if (!t) {
    try { t = await apiGet('/api/transactions/' + encodeURIComponent(id)); }
    catch (e) { toast(T('txn.load_fail', { msg: e.message }), 'err'); return; }
  }
  showReceiptPreview(t);
}
// Open the receipt preview (with the Thermal/Bond chooser) for a saved sale,
// so Print / Find printer are consistent instead of silently picking a paper.
async function previewSaleReceipt(invoiceNo, paper) {
  if (!invoiceNo) return;
  let t = (receiptPreviewState.t && (String(receiptPreviewState.t.invoiceNo) === String(invoiceNo) || String(receiptPreviewState.t.id) === String(invoiceNo))) ? receiptPreviewState.t : null;
  if (!t) {
    try { t = await apiGet('/api/transactions/' + encodeURIComponent(invoiceNo)); }
    catch (e) { toast(T('txn.load_fail', { msg: e.message }), 'err'); return; }
  }
  if (!t) return;
  showReceiptPreview(t, { paper: paper || 'thermal' });
}

