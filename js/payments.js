async function viewPayments(root) {
  await dbLoad('payments');
  await dbLoad('clients');
  root.innerHTML = `
    <div class="space-y-4 fade-in">
      <div class="flex gap-2 flex-wrap items-center">
        <input id="paySearch" placeholder="Search payments..." class="flex-1 min-w-[200px] px-4 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800" oninput="debouncedRenderPayTable()" />
        <button onclick="openPaymentModal()" class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">+ Record Payment</button>
      </div>
      <div class="bg-white dark:bg-gray-800 rounded-xl shadow-sm overflow-hidden glass-card">
        <div class="overflow-auto" id="payTable"></div>
      </div>
    </div>`;
  renderPayTable();
}

function renderPayTable() {
  const q = document.getElementById('paySearch')?.value || '';
  const filtered = searchData(state.payments, q, ['clientName','type','notes']);
  const sorted = [...filtered].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const total = sorted.reduce((s, p) => s + (p.amount || 0), 0);
  const container = document.getElementById('payTable');
  if (!container) return;
  if (sorted.length === 0) { container.innerHTML = '<div class="p-6 text-center text-gray-400">No payments recorded</div>'; return; }
  container.innerHTML = `<div class="p-3 bg-gray-50 dark:bg-gray-700 text-sm font-medium flex justify-between"><span>Total Payments: ${sorted.length} entries</span><span class="text-green-600 font-bold">${peso(total)}</span></div>
    <table class="w-full text-sm"><thead><tr class="bg-gray-50 dark:bg-gray-700 text-left"><th class="p-3">Date</th><th class="p-3">Client</th><th class="p-3">Type</th><th class="p-3 text-right">Amount</th><th class="p-3">Notes</th><th class="p-3 text-center">Actions</th></tr></thead>
    <tbody>${sorted.slice(0, 100).map(p => `<tr class="border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50">
      <td class="p-3 text-gray-500">${fmtDate(p.date)}</td><td class="p-3 font-medium">${escapeHtml(p.clientName || 'N/A')}</td>
      <td class="p-3"><span class="px-2 py-0.5 rounded-full text-xs ${p.type === 'Full' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}">${escapeHtml(p.type || 'Partial')}</span></td>
      <td class="p-3 text-right font-bold text-green-600">${peso(p.amount)}</td><td class="p-3 text-gray-500 text-xs">${escapeHtml(p.notes || '')}</td>
      <td class="p-3 text-center"><button onclick="openPaymentModal(${p.id})" class="text-blue-600 hover:text-blue-800 text-xs mr-2">Edit</button><button onclick="deletePay(${p.id})" class="text-red-600 hover:text-red-800 text-xs">Del</button></td>
    </tr>`).join('')}</tbody></table>`;
}
var debouncedRenderPayTable = debounce(renderPayTable, 250);

function openPaymentModal(id) {
  const isEdit = !!id;
  const p = isEdit ? state.payments.find(x => x.id === id) : null;
  const clients = state.clients.filter(c => (c.balance || 0) > 0 || (isEdit && c.id === p.clientId));
  modal(`
    <div class="p-6">
      <div class="flex justify-between items-center mb-4"><h3 class="text-xl font-bold">${isEdit ? 'Edit' : 'Record'} Payment</h3><button onclick="closeModal()" class="text-gray-400 text-2xl">&times;</button></div>
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
          <button onclick="savePayment(${isEdit ? id : 'null'})" class="flex-1 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">${isEdit ? 'Update' : 'Save'}</button>
          <button onclick="closeModal()" class="px-4 py-2 bg-gray-200 dark:bg-gray-700 rounded-lg">Cancel</button>
        </div>
      </div>
    </div>`);
}

function quickAmount(amt) {
  const sel = document.getElementById('pf-client');
  const clientId = parseInt(sel.value);
  if (!clientId) { toast('Select a client first', 'warning'); return; }
  const c = state.clients.find(x => x.id === clientId);
  if (!c) return;
  const input = document.getElementById('pf-amount');
  if (amt === undefined) input.value = (c.balance || 0).toFixed(2);
  else input.value = amt.toFixed(2);
}

async function savePayment(id) {
  const clientId = parseInt(document.getElementById('pf-client').value);
  if (!clientId) { toast('Select a client', 'error'); return; }
  const amount = parseFloat(document.getElementById('pf-amount').value);
  if (!amount || amount <= 0) { toast('Valid amount required', 'error'); return; }
  const c = await dbGet('clients', clientId);
  if (!c) { toast('Client not found', 'error'); return; }
  const date = document.getElementById('pf-date').value || today();
  const type = document.getElementById('pf-type').value;
  const notes = document.getElementById('pf-notes').value.trim();
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
    toast('Payment recorded', 'success');
  }
  closeModal();
  state.payments = await dbAll('payments');
  state.clients = await dbAll('clients');
  renderPayTable();
}

async function deletePay(id) {
  if (!await confirmModal('Delete this payment?')) return;
  const pay = await dbGet('payments', id);
  if (pay) {
    const c = await dbGet('clients', pay.clientId);
    if (c) { c.balance = (c.balance || 0) + (pay.amount || 0); await dbPut('clients', c); }
  }
  await dbDel('payments', id);
  state.payments = await dbAll('payments');
  state.clients = await dbAll('clients');
  renderPayTable();
  toast('Payment deleted');
}
