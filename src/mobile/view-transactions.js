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
    <div class="grid gap-2.5 md:grid-cols-2 fade-in">
      ${data.transactions.map(t => `
        <div class="glass-card rounded-2xl p-3 row card-hover" onclick='openTxnDetail(${JSON.stringify(t.invoiceNo || t.id)})' style="cursor:pointer">
          <div class="flex-1 min-w-0">
            <div class="font-semibold text-sm text-gray-200 truncate">${esc(t.clientName || 'Walk-in')}</div>
            <div class="text-[11px] text-gray-500 truncate">${esc(t.invoiceNo || '')} · ${fmtDate(t.date)} · ${esc(t.paymentMethod || 'Cash')}${t.items ? ' · ' + t.items + ' ' + (t.items === 1 ? T('cat.item') : T('cat.items')) : ''}</div>
          </div>
          <div class="text-right shrink-0">
            <div class="font-bold text-sm ${Number(t.grandTotal) < 0 ? 'text-red-400' : 'text-green-400'} num">${peso(t.grandTotal)}</div>
            <span class="chip ${(t.status || '') === 'pending' ? 'chip-amber' : (t.status === 'return' ? 'chip-red' : 'chip-green')}" style="padding:.1rem .5rem;font-size:.68rem">${esc(t.status == null ? '' : t.status === 'pending' ? T('txn.credit') : t.status === 'return' ? T('txn.returned_chip') : T('txn.paid'))}</span>
          </div>
        </div>`).join('')}
    </div>`;
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
    await apiPost('/api/void', { invoiceNo: id });
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
async function openTxnDetail(id) {
  // A stale arm from another invoice must never confirm a new one.
  returnArmedFor = null;
  returnSel = new Set();
  detailTxn = null;
  try { if (returnArmTimer) clearTimeout(returnArmTimer); } catch (e) {}
  document.getElementById('modal-root').innerHTML = `
    <div class="fixed inset-0 bg-black/70 z-[45] flex items-end sm:items-center justify-center fade-in" onclick="if(event.target===this)closeQuick()">
      <div class="w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-4 pb-6 slide-up glass-card" style="max-height:92dvh;overflow-y:auto" onclick="event.stopPropagation()">
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
    <h3 class="font-bold text-gray-100 text-sm mb-1">${esc(t.invoiceNo || 'Receipt')}</h3>
    <p class="text-[11px] text-gray-500 mb-3">${esc(t.clientName || 'Walk-in')} · ${esc(t.date || '')} · ${esc(t.paymentMethod || 'Cash')}</p>
    ${canReturn && (t.items || []).length ? `<p class="text-[11px] text-gray-500 mb-2">${T('ret.pick_hint')}</p>` : ''}
    <div class="space-y-1.5 mb-3">
      ${(t.items || []).map((it, idx) => `
        <div class="flex justify-between text-sm gap-2 ${canReturn ? 'rounded-xl px-2 -mx-2 py-1' : ''}" ${canReturn ? `id="ret-line-${idx}" onclick="toggleReturnLine(${idx})" style="cursor:pointer"` : ''}>
          <span class="text-gray-200 truncate">${esc(it.description || it.name || 'Item')} <span class="text-gray-500">x${it.qty || 1}</span></span>
          <span class="num shrink-0">${peso((parseFloat(it.qty) || 1) * (it.unitCost || it.price || 0))}</span>
        </div>`).join('') || `<p class="text-xs text-gray-500">${T('txn.no_lines')}</p>`}
    </div>
    <div class="flex justify-between items-center border-t border-white/10 pt-2 mb-3">
      <span class="font-bold text-gray-200">${T('txn.total')}</span>
      <span class="font-bold text-green-400 num">${peso(t.grandTotal)}</span>
    </div>
    ${(() => { const vr = parseFloat((data.settings || {}).vatRate) || 0; return vr > 0 ? `<div class="flex justify-between text-[11px] text-gray-500 mb-3"><span>VAT (${vr}%) incl.</span><span class="num">${peso((t.grandTotal || 0) * vr / (100 + vr))}</span></div>` : ''; })()}
    <div class="grid grid-cols-2 gap-2">
      <button onclick="printSaleReceipt('${esc(t.invoiceNo || '')}')" class="btn btn-ghost btn-sm">${T('txn.print')}</button>
      <button onclick="previewReceiptTxn(${JSON.stringify(t.invoiceNo || t.id)})" class="btn btn-ghost btn-sm">👁 ${T('txn.preview')}</button>
      <button onclick="shareReceiptTxn(${JSON.stringify(t.invoiceNo || t.id)})" class="btn btn-ghost btn-sm col-span-2">${T('txn.share')}</button>
      ${canReturn ? `<button id="return-btn" onclick="returnTxn(${JSON.stringify(t.invoiceNo || t.id)})" class="btn btn-sm col-span-2" style="background:rgba(239,68,68,.12);border:1px solid rgba(239,68,68,.4);color:#f87171">${T('txn.return')}</button>` : ''}
      ${owner && t.status !== 'voided' && t.status !== 'return' ? `<button id="void-btn" onclick="voidTxn(${JSON.stringify(t.invoiceNo || t.id)})" class="btn btn-sm col-span-2" style="background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.12);color:#94a3b8">${T('txn.void')}</button>` : ''}
    </div>`;
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
  const body = { invoiceNo: id };
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
async function previewReceiptTxn(id) {
  let t = (typeof detailTxn !== 'undefined' && detailTxn && (String(detailTxn.id) === String(id) || detailTxn.invoiceNo === String(id))) ? detailTxn : null;
  if (!t) {
    try { t = await apiGet('/api/transactions/' + encodeURIComponent(id)); }
    catch (e) { toast(T('txn.load_fail', { msg: e.message }), 'err'); return; }
  }
  const s = (typeof data !== 'undefined' && data.settings) || {};
  const W = 32;
  const clip = (x) => String(x == null ? '' : x).slice(0, W);
  const center = (x) => { x = clip(x); const p = Math.max(0, Math.floor((W - x.length) / 2)); return ' '.repeat(p) + x; };
  const row2 = (l, r) => { l = String(l); r = String(r); return (l + ' '.repeat(Math.max(1, W - l.length - r.length)) + r); };
  const pesoPlain = (n) => 'P' + (Number(n) || 0).toFixed(2);
  const L = [];
  L.push(center(s.shopName || 'Shop Ledger PH'));
  if (s.shopAddress) L.push(center(s.shopAddress));
  if (s.shopContact) L.push(center('Contact: ' + s.shopContact));
  L.push('-'.repeat(W));
  L.push(center('OFFICIAL RECEIPT'));
  L.push(clip('Invoice: ' + (t.invoiceNo || 'N/A')));
  L.push(clip('Date: ' + (t.createdAt || t.date || '')));
  if (t.clientName && t.clientName !== 'Walk-in') L.push(clip('Client: ' + t.clientName));
  L.push('-'.repeat(W));
  (t.items || []).forEach(it => {
    const q = parseFloat(it.qty) || 1;
    const p = it.unitCost || it.price || 0;
    L.push(String(it.description || it.name || 'Item').slice(0, W));
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
  document.getElementById('modal-root').innerHTML = `
    <div class="fixed inset-0 bg-black/70 z-[45] flex items-end sm:items-center justify-center fade-in" onclick="if(event.target===this)closeQuick()">
      <div class="w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-4 pb-6 slide-up glass-card" style="max-height:92dvh;overflow-y:auto" onclick="event.stopPropagation()">
        <div class="grabber mb-3" style="margin-bottom:.9rem"></div>
        <h3 class="font-bold text-gray-100 text-sm mb-3">${esc(t.invoiceNo || 'Receipt')}</h3>
        <pre class="text-gray-200 rounded-xl p-3 mb-3" style="font-family:ui-monospace,Menlo,Consolas,monospace;font-size:11.5px;line-height:1.5;background:rgba(0,0,0,.45);border:1px solid rgba(255,255,255,.08);overflow-x:auto;white-space:pre">${esc(L.join('\n'))}</pre>
        <div class="grid grid-cols-2 gap-2">
          <button onclick="printSaleReceipt(${JSON.stringify(t.invoiceNo || t.id)})" class="btn btn-primary btn-sm">${T('txn.print')}</button>
          <button onclick="shareReceiptTxn(${JSON.stringify(t.invoiceNo || t.id)})" class="btn btn-ghost btn-sm">${T('txn.share')}</button>
        </div>
        <button onclick="openTxnDetail(${JSON.stringify(t.invoiceNo || t.id)})" class="btn btn-ghost w-full mt-2">${T('txn.back_detail')}</button>
      </div>
    </div>`;
}

