import { dbAdd, dbAll, dbDel, dbGet, dbPut } from './database.js'
import { closeModal, confirmModal, dbLoad, debounce, escapeHtml, filterByYear, modal, paginate, renderPagination, searchData, toast } from './helpers.js'
import { fmtDate, now, peso, round2, state, today } from './state.js'

export async function viewPayments(root) {
  await dbLoad('payments');
  await dbLoad('clients');
  root.innerHTML = `
    <div class="space-y-4 fade-in">
      <div class="flex gap-2 flex-wrap items-center">
        <input id="paySearch" placeholder="Search payments..." class="flex-1 min-w-[200px] px-4 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800" oninput="debouncedRenderPayTable()" />
        <input id="payDateFrom" type="date" class="px-3 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm" onchange="debouncedRenderPayTable()" />
        <span class="text-gray-400 text-sm">—</span>
        <input id="payDateTo" type="date" class="px-3 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm" onchange="debouncedRenderPayTable()" />
        <button onclick="openPaymentModal()" title="F3 / Ctrl+Shift+P" class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="inline-block mr-1 -mt-0.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>Record Payment</button>
      </div>
      <div class="bg-white dark:bg-gray-800 rounded-xl shadow-sm overflow-hidden glass-card">
        <div class="overflow-auto table-scroll" id="payTable"></div>
      </div>
    </div>`;
  renderPayTable();
}

export function renderPayTable() {
  const q = document.getElementById('paySearch')?.value || '';
  const df = document.getElementById('payDateFrom')?.value || '';
  const dt = document.getElementById('payDateTo')?.value || '';
  let filtered = filterByYear(searchData(state.payments, q, ['clientName','type','notes']), 'date');
  if (df) filtered = filtered.filter(p => (p.date || '').replace(/-/g,'') >= df.replace(/-/g,''));
  if (dt) filtered = filtered.filter(p => (p.date || '').replace(/-/g,'') <= dt.replace(/-/g,''));
  const sorted = [...filtered].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const total = sorted.reduce((s, p) => s + (p.amount || 0), 0);
  const { items, page, totalPages } = paginate(sorted, 'pay');
  const container = document.getElementById('payTable');
  if (!container) return;
  if (sorted.length === 0) { container.innerHTML = '<div class="empty-state"><svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg><p class="font-medium text-gray-500">No payments recorded</p><p class="text-sm mt-1">Payments will appear here once recorded</p></div>'; return; }
  container.innerHTML = `<div class="p-3 bg-gray-50 dark:bg-gray-700 text-sm font-medium flex justify-between"><span>Total Payments: ${sorted.length} entries</span><span class="text-green-600 font-bold">${peso(total)}</span></div>
    <table class="w-full text-sm"><thead><tr class="bg-gray-50 dark:bg-gray-700 text-left"><th class="p-3">Date</th><th class="p-3">Client</th><th class="p-3">Type</th><th class="p-3 text-right">Amount</th><th class="p-3">Notes</th><th class="p-3 text-center">Actions</th></tr></thead>
    <tbody>${items.map(p => `<tr class="border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50">
      <td class="p-3 text-gray-500">${fmtDate(p.date)}</td><td class="p-3 font-medium">${escapeHtml(p.clientName || 'N/A')}</td>
      <td class="p-3"><span class="px-2 py-0.5 rounded-full text-xs ${p.type === 'Full' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}">${escapeHtml(p.type || 'Partial')}</span></td>
      <td class="p-3 text-right font-bold text-green-600">${peso(p.amount)}</td><td class="p-3 text-gray-500 text-xs">${escapeHtml(p.notes || '')}</td>
      <td class="p-3 text-center"><button onclick="openPaymentModal(${p.id})" class="text-blue-600 hover:text-blue-800 text-xs mr-2"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="inline-block mr-1 -mt-0.5"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>Edit</button><button onclick="deletePay(${p.id})" class="text-red-600 hover:text-red-800 text-xs"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="inline-block mr-1 -mt-0.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>Del</button></td>
    </tr>`).join('')}</tbody></table>${renderPagination('pay', page, totalPages)}`;
  if (typeof staggerRows === 'function') staggerRows(container.querySelector('tbody'));
}
export let debouncedRenderPayTable = debounce(renderPayTable, 250);

export function openPaymentModal(id) {
  const isEdit = !!id;
  const p = isEdit ? state.payments.find(x => x.id === id) : null;
  const clients = state.clients.filter(c => (c.balance || 0) > 0 || (isEdit && c.id === p.clientId));
  modal(`
    <div class="p-6">
      <div class="flex justify-between items-center mb-4"><h3 class="text-xl font-bold">${isEdit ? 'Edit' : 'Record'} Payment</h3><button onclick="closeModal()" class="text-gray-400 hover:text-gray-600"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button></div>
      <div class="space-y-3">
        <div><label class="text-xs text-gray-500 block">Client *</label><select id="pf-client" class="w-full px-3 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800">${clients.map(c => `<option value="${c.id}" ${isEdit && p.clientId === c.id ? 'selected' : ''}>${escapeHtml(c.name)} (${peso(c.balance)})</option>`).join('')}</select></div>
        <div class="grid grid-cols-2 gap-3">
          <div><label class="text-xs text-gray-500 block">Date</label><input id="pf-date" type="date" value="${isEdit ? (p.date||today()) : today()}" class="w-full px-3 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800" /></div>
          <div><label class="text-xs text-gray-500 block">Amount *</label><input id="pf-amount" type="number" step="0.01" value="${isEdit ? (p.amount||'') : ''}" class="w-full px-3 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800" /></div>
        </div>
        <div class="flex gap-2">
          <button onclick="quickAmount(100)" class="flex-1 py-2 bg-gray-100 dark:bg-gray-700 rounded-lg text-sm hover:bg-gray-200">100</button>
          <button onclick="quickAmount(500)" class="flex-1 py-2 bg-gray-100 dark:bg-gray-700 rounded-lg text-sm hover:bg-gray-200">500</button>
          <button onclick="quickAmount(1000)" class="flex-1 py-2 bg-gray-100 dark:bg-gray-700 rounded-lg text-sm hover:bg-gray-200">1000</button>
          <button onclick="quickAmount()" class="flex-1 py-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg text-sm hover:bg-blue-200">Full</button>
        </div>
        <div><label class="text-xs text-gray-500 block">Type</label><select id="pf-type" class="w-full px-3 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800"><option ${isEdit && p.type === 'Partial' ? 'selected' : ''}>Partial</option><option ${isEdit && p.type === 'Full' ? 'selected' : ''}>Full</option></select></div>
        <div><label class="text-xs text-gray-500 block">Notes</label><textarea id="pf-notes" rows="2" class="w-full px-3 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm">${isEdit ? escapeHtml(p.notes||'') : ''}</textarea></div>
        <div class="flex gap-2 pt-2">
          <button onclick="savePayment(${isEdit ? id : 'null'})" class="flex-1 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="inline-block mr-1 -mt-0.5"><polyline points="20 6 9 17 4 12"/></svg>${isEdit ? 'Update' : 'Save'}</button>
          <button onclick="closeModal()" class="px-4 py-2 bg-gray-200 dark:bg-gray-700 rounded-lg"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="inline-block mr-1 -mt-0.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>Cancel</button>
        </div>
      </div>
    </div>`);
}

export function quickAmount(amt) {
  const sel = document.getElementById('pf-client');
  const clientId = parseInt(sel.value);
  if (!clientId) { toast('Select a client first', 'warning'); return; }
  const c = state.clients.find(x => x.id === clientId);
  if (!c) return;
  const input = document.getElementById('pf-amount');
  if (!input) return;
  if (amt === undefined) input.value = (c.balance || 0).toFixed(2);
  else input.value = amt.toFixed(2);
}

export async function savePayment(id) {
  const clEl = document.getElementById('pf-client');
  const amtEl = document.getElementById('pf-amount');
  const dtEl = document.getElementById('pf-date');
  const tpEl = document.getElementById('pf-type');
  const ntEl = document.getElementById('pf-notes');
  if (!clEl || !amtEl || !dtEl || !tpEl || !ntEl) { toast('Form not ready', 'error'); return; }
  const clientId = parseInt(clEl.value);
  const amount = round2(parseFloat(amtEl.value));
  if (requireFields([
    { el: clEl, test: () => !!clientId, msg: 'Please select a client' },
    { el: amtEl, test: () => amount > 0, msg: 'Valid amount required' }
  ])) return;
  const c = await dbGet('clients', clientId);
  if (!c) { toast('Client not found', 'error'); return; }
  const date = dtEl.value || today();
  const type = tpEl.value;
  const notes = ntEl.value.trim();
  if (id) {
    const oldPay = await dbGet('payments', id);
    if (oldPay.clientId !== clientId) {
      const oldClient = await dbGet('clients', oldPay.clientId);
      if (oldClient) { oldClient.balance = (oldClient.balance || 0) + (oldPay.amount || 0); await dbPut('clients', oldClient); }
      c.balance = Math.max(0, (c.balance || 0) - amount);
    } else if (oldPay.amount !== amount) {
      c.balance = Math.max(0, (c.balance || 0) + (oldPay.amount || 0) - amount);
    }
    await dbPut('clients', c);
    const pay = { id, clientId, clientName: c.name, amount, date, type, notes, updatedAt: now() };
    if (oldPay) pay.createdAt = oldPay.createdAt;
    await dbPut('payments', pay);
    toast('Payment updated');
  } else {
    c.balance = Math.max(0, (c.balance || 0) - amount);
    await dbPut('clients', c);
    const pay = { clientId, clientName: c.name, amount, date, type, notes, createdAt: now() };
    await dbAdd('payments', pay);
    toast('Payment recorded ✓');
  }
  closeModal();
  state.payments = await dbAll('payments');
  state.clients = await dbAll('clients');
  if (window.electronAPI) window.electronAPI.signalLanUpdate();
  renderPayTable();
}

export async function deletePay(id) {
  if (!await confirmModal('Delete this payment?')) return;
  const pay = await dbGet('payments', id);
  if (!pay) { toast('Payment not found', 'error'); return; }
  const c = await dbGet('clients', pay.clientId);
  if (c) { c.balance = (c.balance || 0) + (pay.amount || 0); await dbPut('clients', c); }
  await dbDel('payments', id);
  state.payments = await dbAll('payments');
  state.clients = await dbAll('clients');
  renderPayTable();
  toast('Payment deleted');
}


// expose top-level bindings as globals (inline onclick handlers and legacy code paths rely on them)
Object.defineProperties(window, {
  viewPayments: { get: () => viewPayments, configurable: true },
  renderPayTable: { get: () => renderPayTable, configurable: true },
  debouncedRenderPayTable: { get: () => debouncedRenderPayTable, configurable: true },
  openPaymentModal: { get: () => openPaymentModal, configurable: true },
  quickAmount: { get: () => quickAmount, configurable: true },
  savePayment: { get: () => savePayment, configurable: true },
  deletePay: { get: () => deletePay, configurable: true }
});
