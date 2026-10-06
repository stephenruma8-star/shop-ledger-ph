// ---------- SUPPLIERS ----------
async function renderSuppliers() {
  const v = document.getElementById('view');
  if (!data.suppliers.length) { v.innerHTML = skeleton(T('common.loading')); await loadAll(); }
  const totalOwed = data.suppliers.reduce((s, x) => s + (x.owed || 0), 0);
  v.innerHTML = `
    <div class="flex items-center justify-between gap-2 mb-3 fade-in">
      <h2 class="card-title text-base"><span class="icon-tile bg-indigo-500/15 text-indigo-400"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg></span>${T('view.suppliers.title')}</h2>
      <div class="flex gap-1.5 items-center">
        <span class="chip ${totalOwed > 0 ? 'chip-amber' : 'chip-green'}">${peso(totalOwed)} ${T('po.owed_suffix')}</span>
        ${phoneRole() === 'cashier' ? '' : `<button onclick="renderSupplierForm()" class="btn btn-primary btn-sm shrink-0"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" class="shrink-0"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>${T('sup.add')}</button>`}
      </div>
    </div>
    <div class="relative mb-3 fade-in">
      <svg class="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
      <input id="sup-search" type="text" placeholder="${esc(T('sup.search_ph'))}" oninput="filterSuppliers(this.value)" class="inp pl-10" />
    </div>
    <div class="grid gap-2.5 fade-in" id="sup-grid">${supplierListHTML(data.suppliers)}</div>`;
}
function supplierListHTML(items) {
  if (!(items || []).length) return `<div class="text-center text-gray-500 py-10 fade-in"><svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#475569" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="mx-auto mb-2"><rect x="1" y="3" width="15" height="13" rx="1"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg><p class="text-sm">No suppliers found.</p></div>`;
  return items.map(s => `
    <div class="glass-card rounded-2xl p-3 card-hover">
      <div class="flex items-center gap-3">
        <span class="w-10 h-10 rounded-full bg-indigo-600/20 text-indigo-300 border border-indigo-500/30 font-bold text-sm flex items-center justify-center shrink-0">${esc(((s.name || '?').trim().charAt(0) || '?').toUpperCase())}</span>
        <div class="flex-1 min-w-0">
          <div class="font-semibold text-sm text-gray-200 truncate">${esc(s.name)}</div>
          <div class="text-[11px] text-gray-500 truncate">${esc(s.contact || s.email || '—')}</div>
        </div>
        <div class="text-right shrink-0">
        <div class="font-bold text-sm num ${(s.owed || 0) > 0 ? 'text-orange-400' : 'text-green-400'}">${peso(s.owed)}</div>
        <div class="text-[10px] text-gray-500">${T('po.owed_suffix')}</div>
        </div>
      </div>
      <div class="flex gap-1.5 mt-2">
        <span class="chip chip-blue">${T('sup.bought', { amt: peso(s.purchased) })}</span>
        <span class="chip chip-green">${T('sup.paid', { amt: peso(s.paid) })}</span>
      </div>
    </div>`).join('');
}
function filterSuppliers(q) {
  q = (q || '').toLowerCase();
  const g = document.getElementById('sup-grid');
  if (g) g.innerHTML = supplierListHTML(data.suppliers.filter(s => ((s.name || '') + ' ' + (s.contact || '') + ' ' + (s.email || '')).toLowerCase().includes(q)));
}
function renderSupplierForm() {
  document.getElementById('modal-root').innerHTML = `
    <div class="fixed inset-0 bg-black/70 z-[45] flex items-end sm:items-center justify-center fade-in" onclick="if(event.target===this)closeQuick()">
      <div class="w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-4 pb-6 slide-up glass-card" style="max-height:92dvh;overflow-y:auto" onclick="event.stopPropagation()">
        <div class="grabber mb-3" style="margin-bottom:.9rem"></div>
        <h3 class="font-bold text-gray-100 text-sm mb-3 flex items-center gap-2"><span class="icon-tile bg-indigo-500/15 text-indigo-400"><svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg></span>${T('sup.add')}</h3>
        <div class="space-y-3">
          <div>
            <label class="text-[11px] font-semibold uppercase tracking-wider text-gray-500 block mb-1.5">${T('sup.name')}</label>
            <input id="sp-name" type="text" maxlength="80" class="inp" />
          </div>
          <div class="grid grid-cols-2 gap-2.5">
            <div>
              <label class="text-[11px] font-semibold uppercase tracking-wider text-gray-500 block mb-1.5">${T('sup.contact')}</label>
              <input id="sp-contact" type="text" maxlength="40" class="inp" />
            </div>
            <div>
              <label class="text-[11px] font-semibold uppercase tracking-wider text-gray-500 block mb-1.5">${T('sup.email')}</label>
              <input id="sp-email" type="text" maxlength="80" class="inp" />
            </div>
          </div>
          <div>
            <label class="text-[11px] font-semibold uppercase tracking-wider text-gray-500 block mb-1.5">${T('sup.address')}</label>
            <input id="sp-address" type="text" maxlength="200" class="inp" />
          </div>
          <button onclick="submitSupplierForm()" class="btn btn-primary btn-lg"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" class="shrink-0"><polyline points="20 6 9 17 4 12"/></svg>${T('sup.save')}</button>
        </div>
      </div>
    </div>`;
}
async function submitSupplierForm() {
  const name = ((document.getElementById('sp-name') || {}).value || '').trim();
  if (!name) { toast(T('sup.need_name'), 'err'); return; }
  if (!takeSubmitLock('supplier')) return;
  try {
    await apiPost('/api/suppliers', {
      name,
      contact: ((document.getElementById('sp-contact') || {}).value || '').trim(),
      email: ((document.getElementById('sp-email') || {}).value || '').trim(),
      address: ((document.getElementById('sp-address') || {}).value || '').trim()
    });
    closeQuick();
    toast(T('sup.added'), 'ok');
    await refreshAll();
  } catch (e) { toast(T('sup.failed', { msg: e.message }), 'err'); }
  finally { releaseSubmitLock('supplier'); }
}
async function renderSupplierPay(id) {
  const s = (data.suppliers || []).find(x => String(x.id) === String(id));
  supplierPayId = id;
  let hist = null;
  try { hist = await apiGet('/api/suppliers/' + encodeURIComponent(id) + '/payments'); } catch (e) {}
  document.getElementById('modal-root').innerHTML = `
    <div class="fixed inset-0 bg-black/70 z-[45] flex items-end sm:items-center justify-center fade-in" onclick="if(event.target===this)closeQuick()">
      <div class="w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-4 pb-6 slide-up glass-card" style="max-height:92dvh;overflow-y:auto" onclick="event.stopPropagation()">
        <div class="grabber mb-3" style="margin-bottom:.9rem"></div>
        <h3 class="font-bold text-gray-100 text-sm mb-1 flex items-center gap-2"><span class="icon-tile bg-indigo-500/15 text-indigo-400"><svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg></span>${esc(T('sup.pay_title', { name: (s && s.name) || '' }))}</h3>
        <p class="text-[11px] text-gray-500 mb-3">${T('sup.owed', { amt: peso((hist && hist.owed) ?? (s && s.owed) ?? 0) })}</p>
        <div class="space-y-3">
          <div class="grid grid-cols-2 gap-2.5">
            <div>
              <label class="text-[11px] font-semibold uppercase tracking-wider text-gray-500 block mb-1.5">${T('sup.amount')}</label>
              <input id="sp-amount" type="number" min="0" step="0.01" placeholder="0.00" class="inp" />
            </div>
            <div>
              <label class="text-[11px] font-semibold uppercase tracking-wider text-gray-500 block mb-1.5">${T('sup.method')}</label>
              <select id="sp-method" class="inp"><option>Cash</option><option>GCash</option><option>Maya</option><option>Bank Transfer</option></select>
            </div>
          </div>
          <button onclick="submitSupplierPay()" class="btn btn-primary btn-lg"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" class="shrink-0"><polyline points="20 6 9 17 4 12"/></svg>${T('sup.record')}</button>
          ${(hist && hist.payments && hist.payments.length) ? `
          <div>
            <h4 class="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5">${T('sup.history')}</h4>
            <div class="space-y-1.5">
              ${hist.payments.slice(0, 5).map(p => `
              <div class="flex justify-between text-sm gap-2">
                <span class="text-gray-200">${fmtDate(p.date)}${p.paymentMethod ? ' <span class="text-gray-500">· ' + esc(p.paymentMethod) + '</span>' : ''}</span>
                <span class="text-green-400 num shrink-0">-${peso(p.amount)}</span>
              </div>`).join('')}
            </div>
          </div>` : (hist ? `<p class="text-[11px] text-gray-500">${T('sup.no_history')}</p>` : '')}
        </div>
      </div>
    </div>`;
}
let supplierPayId = null;
async function submitSupplierPay() {
  const amount = parseFloat((document.getElementById('sp-amount') || {}).value);
  const method = (document.getElementById('sp-method') || {}).value || 'Cash';
  if (!supplierPayId) return;
  if (!amount || amount <= 0) { toast(T('sup.need_amount'), 'err'); return; }
  if (!takeSubmitLock('suppay')) return;
  try {
    await apiPost('/api/supplier-payments', { supplierId: supplierPayId, amount, paymentMethod: method });
    closeQuick();
    supplierPayId = null;
    feelSale();
    toast(T('sup.recorded'), 'ok');
    await refreshAll();
  } catch (e) { feelErr(); toast(T('sup.pay_failed', { msg: e.message }), 'err'); }
  finally { releaseSubmitLock('suppay'); }
}

