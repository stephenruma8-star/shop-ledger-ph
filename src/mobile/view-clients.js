// ---------- CLIENTS ----------
async function renderClients() {
  const v = document.getElementById('view');
  v.innerHTML = skeleton(T('common.loading'));
  if (!data.clients.length) await loadClients();
  const total = data.clients.reduce((s, c) => s + (c.balance || 0), 0);
  v.innerHTML = `
    <div class="flex items-center justify-between gap-2 mb-3 fade-in">
      <div class="grid grid-cols-2 gap-2.5 flex-1">
      <div class="stat-card rounded-2xl p-3.5 text-center">
        <div class="text-[11px] font-semibold uppercase tracking-wider text-gray-500 mb-1">${T('cli.total_clients')}</div>
        <div class="text-xl font-bold text-blue-400 num">${data.clients.length}</div>
      </div>
      <div class="stat-card rounded-2xl p-3.5 text-center">
        <div class="text-[11px] font-semibold uppercase tracking-wider text-gray-500 mb-1">${T('cli.total_debts')}</div>
        <div class="text-xl font-bold text-orange-400 num">${peso(total)}</div>
      </div>
      </div>
      <button onclick="renderClientForm(null)" class="btn btn-primary btn-sm shrink-0 self-start"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" class="shrink-0"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>${T('cli.add')}</button>
      <button onclick="showView('debts')" class="btn btn-ghost btn-sm shrink-0 self-start"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="shrink-0"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>${T('view.debts.title')}</button>
      ${(typeof IS_STANDALONE !== 'undefined' && IS_STANDALONE) ? `<button onclick="importClientsCsv()" class="btn btn-ghost btn-sm shrink-0 self-start"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="shrink-0"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>Import</button>` : ''}
      ${phoneRole() === 'cashier' ? '' : `<button onclick="exportClientsCsv()" class="btn btn-ghost btn-sm shrink-0 self-start">📥 CSV</button>`}
    </div>
    <div class="relative mb-3 fade-in">
      <svg class="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
      <input id="search" type="text" placeholder="${esc(T('cli.search_ph'))}" oninput="filterClients(this.value)" class="inp pl-10" />
    </div>
    <div class="grid sm:grid-cols-2 gap-2.5 fade-in" id="client-grid">${clientListHTML(data.clients)}</div>`;
}
function clientListHTML(clients) {
  if (!(clients || []).length) return `<div class="text-center text-gray-500 py-10 fade-in sm:col-span-2"><svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#475569" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="mx-auto mb-2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg><p class="text-sm">No clients found.</p></div>`;
  return clients.map(c => `
    <div class="glass-card rounded-2xl p-3 row card-hover" onclick='openClientDetail(${JSON.stringify(c.id)})' style="cursor:pointer">
      <span class="w-10 h-10 rounded-full bg-blue-600/20 text-blue-300 border border-blue-500/30 font-bold text-sm flex items-center justify-center shrink-0">${esc(((c.name || '?').trim().charAt(0) || '?').toUpperCase())}</span>
      <div class="flex-1 min-w-0">
        <div class="font-semibold text-sm text-gray-200 truncate">${esc(c.name)}</div>
        <div class="text-xs text-gray-500 truncate">${esc(c.phone || '—')}</div>
      </div>
      <div class="text-right shrink-0">
        <div class="font-bold text-sm num ${(c.balance || 0) <= 0 ? 'text-green-400' : 'text-orange-400'}">${peso(c.balance)}</div>
      </div>
      <button onclick="event.stopPropagation();showView('pay', ${JSON.stringify(c.id)})" class="btn btn-success btn-sm"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="shrink-0"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>${T('cli.pay')}</button>
    </div>`).join('');
}
function filterClients(q) {
  q = (q || '').toLowerCase();
  const grid = document.getElementById('client-grid');
  if (grid) grid.innerHTML = clientListHTML(data.clients.filter(c => (c.name || '').toLowerCase().includes(q) || (c.phone || '').includes(q)));
}
function csvCell(v) {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
async function exportClientsCsv() {
  const rows = [['Name', 'Phone', 'Address', 'Balance', 'Loyalty points']];
  for (const c of (data.clients || [])) {
    rows.push([c.name || '', c.phone || '', c.address || '', c.balance || 0, c.loyaltyPoints || 0]);
  }
  await shareText('Clients export', '﻿' + rows.map(r => r.map(csvCell).join(',')).join('\n'));
  return true;
}
// Standalone-only CSV import (same columns as the export + desktop:
// Name, Phone, Address, Balance). Balances allowed — this is migration.
function parseCsvLine(line) {
  const out = [];
  let cur = '', inQ = false;
  for (let i = 0; i < (line || '').length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; }
        else inQ = false;
      } else cur += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ',') { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out.map(s => s.trim());
}
async function importClientsCsv() {
  const inp = document.createElement('input');
  inp.type = 'file';
  inp.accept = '.csv,text/csv';
  inp.onchange = async () => {
    const file = inp.files && inp.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const lines = text.split(/\r?\n/).filter(l => l.trim() !== '');
      if (lines.length < 2) { toast('Empty file', 'err'); return; }
      const hasHeader = /^"?name"?\s*,/i.test(lines[0]);
      const rows = (hasHeader ? lines.slice(1) : lines).map(l => {
        const p = parseCsvLine(l);
        return { name: p[0] || '', phone: p[1] || '', address: p[2] || '', balance: parseFloat(p[3]) || 0 };
      });
      const r = await apiPost('/api/clients/import', { clients: rows });
      feelSale();
      toast('Imported ' + (r.added || 0) + ((r.skipped || 0) ? ' (' + r.skipped + ' skipped)' : ''), 'ok');
      await refreshAll();
    } catch (e) { feelErr(); toast('Import failed: ' + e.message, 'err'); }
  };
  inp.click();
}
let detailClientId = null;
async function openClientDetail(id) {
  detailClientId = id;
  document.getElementById('modal-root').innerHTML = `
    <div class="fixed inset-0 bg-black/70 z-[45] flex items-end sm:items-center justify-center fade-in" onclick="if(event.target===this)closeQuick()">
      <div class="w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-4 pb-6 slide-up glass-card" style="max-height:92dvh;overflow-y:auto" onclick="event.stopPropagation()">
        <div class="grabber mb-3" style="margin-bottom:.9rem"></div>
        <div id="client-detail-body">${skeleton(T('common.loading'))}</div>
      </div>
    </div>`;
  let h = null;
  try { h = await apiGet('/api/clients/' + encodeURIComponent(id) + '/history'); }
  catch (e) { toast(T('cli.load_fail', { msg: e.message }), 'err'); closeQuick(); return; }
  const box = document.getElementById('client-detail-body');
  if (!box || !h || !h.client) return;
  const c = h.client;
  box.innerHTML = `
    <div class="flex items-center gap-3 mb-3">
      <span class="w-12 h-12 rounded-full bg-blue-600/20 text-blue-300 border border-blue-500/30 font-bold text-lg flex items-center justify-center shrink-0">${esc(((c.name || '?').trim().charAt(0) || '?').toUpperCase())}</span>
      <div class="flex-1 min-w-0">
        <div class="font-bold text-gray-100 truncate">${esc(c.name)}</div>
        <div class="text-[11px] text-gray-500 truncate">${esc(c.phone || '')}${c.address ? ' · ' + esc(c.address) : ''}</div>
        <div class="text-[11px] ${c.isSC || c.isPWD ? 'text-amber-400 font-semibold' : 'text-gray-500'}">${[c.isSC ? 'SC' : '', c.isPWD ? 'PWD' : ''].filter(Boolean).join(' + ') || ''}</div>
      </div>
      <div class="text-right shrink-0">
        <div class="font-bold num ${(c.balance || 0) <= 0 ? 'text-green-400' : 'text-orange-400'}">${peso(c.balance)}</div>
        <div class="text-[11px] text-amber-400">★ ${c.loyaltyPoints || 0}</div>
      </div>
    </div>
    <div class="grid grid-cols-3 gap-2 mb-3">
      <button onclick="renderClientForm(${JSON.stringify(c.id)})" class="btn btn-ghost btn-sm"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="shrink-0"><path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z"/></svg>${T('cli.edit')}</button>
      <button onclick="shareClientStatement()" class="btn btn-ghost btn-sm">📤 ${T('cli.statement')}</button>
      <button id="redeem-btn" onclick="redeemClientPoints(${JSON.stringify(c.id)})" class="btn btn-sm" style="background:rgba(245,158,11,.15);border:1px solid rgba(245,158,11,.5);color:#fbbf24"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="shrink-0"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>${T('cli.redeem')}</button>
    </div>
    ${(typeof IS_STANDALONE !== 'undefined' && IS_STANDALONE) ? `<button id="client-del-btn" onclick="deleteClient(${JSON.stringify(c.id)})" class="btn btn-sm w-full mb-3" style="background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.35);color:#f87171">🗑 Delete client</button>` : ''}
    <h4 class="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5">${T('cli.history_sales')}</h4>
    <div class="space-y-1.5 mb-3">
      ${(h.sales || []).slice(0, 20).map(t => `
        <div class="flex justify-between text-sm gap-2">
          <span class="text-gray-200 truncate">${esc(t.invoiceNo || '')} <span class="text-gray-500">· ${fmtDate(t.date)}</span></span>
          <span class="num shrink-0 ${Number(t.grandTotal) < 0 ? 'text-red-400' : ''}">${peso(t.grandTotal)}</span>
        </div>`).join('') || `<p class="text-[11px] text-gray-500">${T('cli.no_history')}</p>`}
    </div>
    <h4 class="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5">${T('cli.history_pay')}</h4>
    <div class="space-y-1.5">
      ${(h.payments || []).slice(0, 20).map(p => `
        <div class="flex justify-between items-center text-sm gap-2">
          <span class="text-gray-200">${fmtDate(p.date)} <span class="text-gray-500">· ${esc(p.type || '')}${p.referenceNo ? ' · #' + esc(p.referenceNo) : ''}</span></span>
          <span class="flex items-center gap-1.5">
            <span class="text-green-400 num shrink-0">-${peso(p.amount)}</span>
            ${phoneRole() === 'cashier' ? '' : `<button onclick="renderPaymentEdit(${JSON.stringify(p.id)}, ${p.amount || 0}, ${JSON.stringify(p.referenceNo || '')})" class="text-[11px] text-blue-400 px-1.5">✏️</button><button onclick="deletePayment(${JSON.stringify(p.id)})" class="text-[11px] text-red-400 px-1.5">✕</button>`}
          </span>
        </div>`).join('') || `<p class="text-[11px] text-gray-500">${T('cli.no_history')}</p>`}
    </div>`;
}
function renderClientForm(id) {
  const c = id ? (data.clients || []).find(x => String(x.id) === String(id)) : null;
  document.getElementById('modal-root').innerHTML = `
    <div class="fixed inset-0 bg-black/70 z-[45] flex items-end sm:items-center justify-center fade-in" onclick="if(event.target===this)closeQuick()">
      <div class="w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-4 pb-6 slide-up glass-card" style="max-height:92dvh;overflow-y:auto" onclick="event.stopPropagation()">
        <div class="grabber mb-3" style="margin-bottom:.9rem"></div>
        <h3 class="font-bold text-gray-100 text-sm mb-3 flex items-center gap-2"><span class="icon-tile bg-blue-500/15 text-blue-400"><svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg></span>${id ? T('cli.edit_title') : T('cli.add_title')}</h3>
        <div class="space-y-3">
          <div>
            <label class="text-[11px] font-semibold uppercase tracking-wider text-gray-500 block mb-1.5">${T('cli.name')}</label>
            <input id="cf-name" type="text" maxlength="80" value="${esc(c?.name || '')}" class="inp" />
          </div>
          <div class="grid grid-cols-2 gap-2.5">
            <div>
              <label class="text-[11px] font-semibold uppercase tracking-wider text-gray-500 block mb-1.5">${T('cli.phone')}</label>
              <input id="cf-phone" type="tel" maxlength="20" value="${esc(c?.phone || '')}" class="inp" />
            </div>
            <div>
              <label class="text-[11px] font-semibold uppercase tracking-wider text-gray-500 block mb-1.5">${T('cli.due')}</label>
              <input id="cf-due" type="date" value="${esc(c?.dueDate || '')}" class="inp" />
            </div>
          </div>
          <div>
            <label class="text-[11px] font-semibold uppercase tracking-wider text-gray-500 block mb-1.5">${T('cli.address')}</label>
            <input id="cf-address" type="text" maxlength="200" value="${esc(c?.address || '')}" class="inp" />
          </div>
          <div class="grid grid-cols-2 gap-2.5">
            <label class="flex items-center gap-2 py-1 cursor-pointer">
              <input type="checkbox" id="cf-sc" ${(c && c.isSC) ? 'checked' : ''} class="switch" />
              <span class="text-sm text-gray-300">SC</span>
            </label>
            <label class="flex items-center gap-2 py-1 cursor-pointer">
              <input type="checkbox" id="cf-pwd" ${(c && c.isPWD) ? 'checked' : ''} class="switch" />
              <span class="text-sm text-gray-300">PWD</span>
            </label>
          </div>
          <button onclick="submitClientForm(${id ? JSON.stringify(id) : 'null'})" class="btn btn-primary btn-lg"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" class="shrink-0"><polyline points="20 6 9 17 4 12"/></svg>${T('cli.save')}</button>
        </div>
      </div>
    </div>`;
}
async function submitClientForm(id) {
  const name = ((document.getElementById('cf-name') || {}).value || '').trim();
  if (!name) { toast(T('cli.need_name'), 'err'); return; }
  if (!takeSubmitLock('client')) return;
  const body = {
    name,
    phone: ((document.getElementById('cf-phone') || {}).value || '').trim(),
    address: ((document.getElementById('cf-address') || {}).value || '').trim(),
    dueDate: (document.getElementById('cf-due') || {}).value || ''
  };
  const scEl = document.getElementById('cf-sc');
  const pwdEl = document.getElementById('cf-pwd');
  body.isSC = !!(scEl && scEl.checked);
  body.isPWD = !!(pwdEl && pwdEl.checked);
  try {
    if (id) await apiPost('/api/clients/' + encodeURIComponent(id), body, 'PUT');
    else await apiPost('/api/clients', body);
    closeQuick();
    toast(id ? T('cli.updated') : T('cli.added'), 'ok');
    await refreshAll();
    if (id) openClientDetail(id);
  } catch (e) { toast(T('cli.failed', { msg: e.message }), 'err'); }
  finally { releaseSubmitLock('client'); }
}
let redeemArmedFor = null;
async function redeemClientPoints(id) {
  const btn = document.getElementById('redeem-btn');
  if (redeemArmedFor !== id) {
    redeemArmedFor = id;
    if (btn) { btn.textContent = T('cli.redeem_confirm'); }
    setTimeout(() => {
      if (redeemArmedFor === id) {
        redeemArmedFor = null;
        const b = document.getElementById('redeem-btn');
        if (b) b.textContent = T('cli.redeem');
      }
    }, 5000);
    return;
  }
  redeemArmedFor = null;
  if (!takeSubmitLock('redeem')) return;
  try {
    const r = await apiPost('/api/clients/' + encodeURIComponent(id) + '/redeem', {});
    closeQuick();
    feelSale();
    toast(T('cli.redeemed', { pts: r.points, amt: peso(r.discount) }), 'ok');
    await refreshAll();
  } catch (e) { feelErr(); toast(T('cli.failed', { msg: e.message }), 'err'); }
  finally { releaseSubmitLock('redeem'); }
}
// Standalone-only: delete a client with no balance and no history.
let clientDeleteArmed = null;
async function deleteClient(id) {
  if (clientDeleteArmed !== id) {
    clientDeleteArmed = id;
    const btn = document.getElementById('client-del-btn');
    if (btn) btn.textContent = 'Tap again to delete this client';
    setTimeout(() => { if (clientDeleteArmed === id) { clientDeleteArmed = null; const b = document.getElementById('client-del-btn'); if (b) b.textContent = '🗑 Delete client'; } }, 5000);
    return;
  }
  clientDeleteArmed = null;
  if (!takeSubmitLock('clientdel')) return;
  try {
    await apiPost('/api/clients/' + encodeURIComponent(id), {}, 'DELETE');
    closeQuick();
    feelOk();
    toast('Client deleted', 'ok');
    await refreshAll();
  } catch (e) { feelErr(); toast(e.message, 'err'); }
  finally { releaseSubmitLock('clientdel'); }
}
async function shareClientStatement() {
  if (!detailClientId) return;
  let h = null;
  try { h = await apiGet('/api/clients/' + encodeURIComponent(detailClientId) + '/history'); }
  catch (e) { toast(T('cli.load_fail', { msg: e.message }), 'err'); return; }
  await shareText((h.client.name || '') + ' — statement', buildStatementText(h.client, h.sales || [], h.payments || []));
}
function renderPaymentEdit(id, amount, referenceNo) {
  document.getElementById('modal-root').innerHTML = `
    <div class="fixed inset-0 bg-black/70 z-[45] flex items-end sm:items-center justify-center fade-in" onclick="if(event.target===this)closeQuick()">
      <div class="w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-4 pb-6 slide-up glass-card" onclick="event.stopPropagation()">
        <div class="grabber mb-3" style="margin-bottom:.9rem"></div>
        <h3 class="font-bold text-gray-100 text-sm mb-3 flex items-center gap-2"><span class="icon-tile bg-green-500/15 text-green-400"><svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg></span>${T('pay.edit_title')}</h3>
        <input id="pe-amount" type="number" min="0" step="0.01" value="${amount || ''}" class="inp mb-3" />
        <input id="pe-ref" type="text" maxlength="40" value="${esc(referenceNo || '')}" placeholder="Reference # (optional)" autocomplete="off" class="inp mb-3" />
        <button onclick="submitPaymentEdit(${JSON.stringify(id)})" class="btn btn-primary btn-lg"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" class="shrink-0"><polyline points="20 6 9 17 4 12"/></svg>${T('pay.save_edit')}</button>
      </div>
    </div>`;
}
async function submitPaymentEdit(id) {
  const amount = parseFloat((document.getElementById('pe-amount') || {}).value);
  if (!amount || amount <= 0) { toast(T('exp.need_amount'), 'err'); return; }
  const referenceNo = ((document.getElementById('pe-ref') || {}).value || '').trim().slice(0, 40);
  if (!takeSubmitLock('payedit')) return;
  try {
    await apiPost('/api/payments/' + encodeURIComponent(id), { amount, referenceNo }, 'PUT');
    closeQuick();
    toast(T('pay.updated'), 'ok');
    await refreshAll();
    if (detailClientId) openClientDetail(detailClientId);
  } catch (e) { toast(T('pay.failed', { msg: e.message }), 'err'); }
  finally { releaseSubmitLock('payedit'); }
}
let payDelArmed = null;
async function deletePayment(id) {
  if (payDelArmed !== id) {
    payDelArmed = id;
    toast(T('pay.void_confirm'), 'info');
    setTimeout(() => { if (payDelArmed === id) payDelArmed = null; }, 5000);
    return;
  }
  payDelArmed = null;
  if (!takeSubmitLock('paydel')) return;
  try {
    await apiPost('/api/payments/' + encodeURIComponent(id), {}, 'DELETE');
    toast(T('pay.deleted'), 'ok');
    await refreshAll();
    if (detailClientId) openClientDetail(detailClientId);
  } catch (e) { toast(T('pay.failed', { msg: e.message }), 'err'); }
  finally { releaseSubmitLock('paydel'); }
}

