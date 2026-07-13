async function viewUtang(root) {
  await Promise.all([dbLoad('clients'), dbLoad('transactions'), dbLoad('payments')]);
  const debtors = state.clients.filter(c => (c.balance || 0) > 0).sort((a, b) => (b.balance || 0) - (a.balance || 0));
  const totalUtang = debtors.reduce((s, c) => s + (c.balance || 0), 0);
  const maxUtang = debtors.length > 0 ? Math.max(...debtors.map(c => c.balance || 0)) : 0;
  const avgUtang = debtors.length > 0 ? totalUtang / debtors.length : 0;
  root.innerHTML = `
    <div class="space-y-4 fade-in">
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div class="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm border-l-4 stat-card border-orange-500">
          <p class="text-xs text-gray-500 uppercase">Total Utang</p>
          <p class="text-2xl font-bold text-orange-600">${peso(totalUtang)}</p>
          <p class="text-xs text-gray-400">${debtors.length} debtors</p>
        </div>
        <div class="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm border-l-4 stat-card border-red-500">
          <p class="text-xs text-gray-500 uppercase">Highest Balance</p>
          <p class="text-2xl font-bold text-red-600">${peso(maxUtang)}</p>
        </div>
        <div class="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm border-l-4 stat-card border-blue-500">
          <p class="text-xs text-gray-500 uppercase">Average Utang</p>
          <p class="text-2xl font-bold text-blue-600">${peso(avgUtang)}</p>
        </div>
      </div>
      <div class="bg-white dark:bg-gray-800 rounded-xl shadow-sm overflow-hidden glass-card">
        <div class="p-4 border-b dark:border-gray-700 flex justify-between items-center">
          <h3 class="font-bold">Debtors List</h3>
          <div class="flex gap-2">
            <input id="utangSearch" placeholder="Search..." class="px-3 py-1.5 text-sm border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800" oninput="debouncedRenderUtangTable()" />
            <button onclick="bulkSMSOverdue()" class="px-3 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 whitespace-nowrap">Bulk SMS</button>
          </div>
        </div>
        <div id="utangTable" class="overflow-auto"></div>
      </div>
    </div>`;
  renderUtangTable();
}

var debouncedRenderUtangTable = debounce(renderUtangTable, 250);
function renderUtangTable() {
  const q = document.getElementById('utangSearch')?.value || '';
  const debtors = state.clients.filter(c => (c.balance || 0) > 0).sort((a, b) => (b.balance || 0) - (a.balance || 0));
  const filtered = searchData(debtors, q, ['name','phone']);
  const container = document.getElementById('utangTable');
  if (!container) return;
  if (filtered.length === 0) {
    container.innerHTML = '<div class="p-6 text-center text-gray-400">No debtors found</div>'; return;
  }
  const settings = state.settings.find(x => x.key === 'smsApiKey');
  const smsApiKey = settings ? settings.value : '';
  container.innerHTML = `
    <table class="w-full text-sm">
      <thead><tr class="bg-gray-50 dark:bg-gray-700 text-left"><th class="p-3">Name</th><th class="p-3">Phone</th><th class="p-3 text-right">Balance</th><th class="p-3 text-center">Due Date</th><th class="p-3 text-center">Actions</th></tr></thead>
      <tbody>${filtered.map(c => {
        const isOverdue = c.dueDate && c.dueDate < today();
        return `<tr class="border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 ${isOverdue ? 'bg-red-50 dark:bg-red-900/10' : ''}">
        <td class="p-3 font-medium">${escapeHtml(c.name)}</td><td class="p-3 text-gray-500">${escapeHtml(c.phone || '-')}</td>
        <td class="p-3 text-right font-bold text-orange-600">${peso(c.balance)}</td>
        <td class="p-3 text-center">${c.dueDate ? (isOverdue ? '<span class="text-red-600 font-bold">'+escapeHtml(fmtDate(c.dueDate))+' ⚠️</span>' : escapeHtml(fmtDate(c.dueDate))) : '<span class="text-gray-400">—</span>'}</td>
        <td class="p-3 text-center">
          <button onclick="viewClientHistory(${c.id})" class="text-blue-600 hover:text-blue-800 text-xs mr-2">View</button>
          ${c.phone ? `<button onclick="sendSMSReminder(${c.id})" class="text-green-600 hover:text-green-800 text-xs">SMS</button>` : ''}
        </td></tr>`;
      }).join('')}</tbody></table>`;
}

async function sendSMSReminder(clientId) {
  const c = await dbGet('clients', clientId);
  if (!c || !c.phone) { toast('Client has no phone number', 'error'); return; }
  const smsSetting = state.settings.find(x => x.key === 'smsApiKey');
  if (!smsSetting || !smsSetting.value) { toast('SMS API key not configured in Settings', 'warning'); return; }
  modal(`
    <div class="p-6">
      <div class="flex justify-between items-center mb-4"><h3 class="text-xl font-bold">Send SMS Reminder</h3><button onclick="closeModal()" class="text-gray-400 text-2xl">&times;</button></div>
      <div class="space-y-3">
        <p class="text-sm">To: <strong>${escapeHtml(c.name)}</strong> (${escapeHtml(c.phone)})</p>
        <p class="text-sm">Balance: <strong class="text-orange-600">${peso(c.balance)}</strong></p>
        <textarea id="smsMessage" rows="4" class="w-full px-3 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm">Hi ${escapeHtml(c.name)}, this is a friendly reminder that your balance of ${peso(c.balance)} is due. Please settle at your earliest convenience. Thank you!</textarea>
        <button onclick="doSendSMS(${clientId})" class="w-full py-2 bg-green-600 text-white rounded-lg hover:bg-green-700">Send SMS</button>
      </div>
    </div>`);
}

async function doSendSMS(clientId) {
  const c = await dbGet('clients', clientId);
  const msg = document.getElementById('smsMessage').value.trim();
  if (!msg) { toast('Please enter a message', 'error'); return; }
  const smsSetting = state.settings.find(x => x.key === 'smsApiKey');
  try {
    if (window.electronAPI) {
      const result = await window.electronAPI.sendSMS({ apiKey: smsSetting.value, number: c.phone, message: msg });
      if (result.success) { toast('SMS sent!'); closeModal(); await logAudit('sms', `SMS sent to ${c.name}`); }
      else toast('SMS failed: ' + (result.error || 'Unknown'), 'error');
    } else {
      toast('SMS only available in desktop app', 'warning');
    }
  } catch (e) { toast('SMS error: ' + e.message, 'error'); }
}

async function bulkSMSOverdue() {
  const smsSetting = state.settings.find(x => x.key === 'smsApiKey');
  if (!smsSetting || !smsSetting.value) { toast('SMS API key not configured in Settings', 'warning'); return; }
  const overdue = state.clients.filter(c => (c.balance || 0) > 0 && c.dueDate && c.dueDate < today() && c.phone);
  if (overdue.length === 0) { toast('No overdue clients with phone numbers', 'info'); return; }
  const shopName = (state.settings.find(x => x.key === 'shopName') || {}).value || 'Shop';
  const msg = `Hi, this is a reminder from ${shopName}. Your balance is overdue. Please settle at your earliest convenience. Thank you!`;
  modal(`
    <div class="p-6">
      <div class="flex justify-between items-center mb-4"><h3 class="text-xl font-bold">Bulk SMS Reminder</h3><button onclick="closeModal()" class="text-gray-400 text-2xl">&times;</button></div>
      <p class="text-sm mb-3">Send reminder to <strong>${overdue.length}</strong> overdue client(s):</p>
      <div class="max-h-40 overflow-auto text-xs space-y-1 mb-3 border dark:border-gray-700 rounded p-2">
        ${overdue.map(c => `<div class="flex justify-between"><span>${escapeHtml(c.name)}</span><span class="text-gray-500">${escapeHtml(c.phone)}</span></div>`).join('')}
      </div>
      <textarea id="bulkSmsMsg" rows="3" class="w-full px-3 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm mb-3">${escapeHtml(msg)}</textarea>
      <button onclick="doBulkSMS()" class="w-full py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-semibold">Send to ${overdue.length} client(s)</button>
    </div>`);
}

async function doBulkSMS() {
  const msg = document.getElementById('bulkSmsMsg').value.trim();
  if (!msg) { toast('Enter a message', 'error'); return; }
  const smsSetting = state.settings.find(x => x.key === 'smsApiKey');
  const overdue = state.clients.filter(c => (c.balance || 0) > 0 && c.dueDate && c.dueDate < today() && c.phone);
  let sent = 0, failed = 0;
  for (const c of overdue) {
    try {
      if (window.electronAPI) {
        const r = await window.electronAPI.sendSMS({ apiKey: smsSetting.value, number: c.phone, message: msg });
        if (r.success) sent++; else failed++;
      }
    } catch (e) { failed++; }
  }
  closeModal();
  if (sent > 0) { toast(`SMS sent to ${sent} client(s)`); await logAudit('bulk-sms', `Bulk SMS sent to ${sent} clients`); }
  if (failed > 0) toast(`${failed} failed`, 'warning');
}
