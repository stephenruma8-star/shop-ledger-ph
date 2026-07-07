async function viewUtang(root) {
  state.clients = await dbAll('clients');
  state.transactions = await dbAll('transactions');
  state.payments = await dbAll('payments');
  const debtors = state.clients.filter(c => (c.balance || 0) > 0).sort((a, b) => (b.balance || 0) - (a.balance || 0));
  const totalUtang = debtors.reduce((s, c) => s + (c.balance || 0), 0);
  const maxUtang = debtors.length > 0 ? Math.max(...debtors.map(c => c.balance || 0)) : 0;
  const avgUtang = debtors.length > 0 ? totalUtang / debtors.length : 0;
  root.innerHTML = `
    <div class="space-y-4 fade-in">
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div class="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm border-l-4 border-orange-500">
          <p class="text-xs text-gray-500 uppercase">Total Utang</p>
          <p class="text-2xl font-bold text-orange-600">${peso(totalUtang)}</p>
          <p class="text-xs text-gray-400">${debtors.length} debtors</p>
        </div>
        <div class="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm border-l-4 border-red-500">
          <p class="text-xs text-gray-500 uppercase">Highest Balance</p>
          <p class="text-2xl font-bold text-red-600">${peso(maxUtang)}</p>
        </div>
        <div class="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm border-l-4 border-blue-500">
          <p class="text-xs text-gray-500 uppercase">Average Utang</p>
          <p class="text-2xl font-bold text-blue-600">${peso(avgUtang)}</p>
        </div>
      </div>
      <div class="bg-white dark:bg-gray-800 rounded-xl shadow-sm overflow-hidden">
        <div class="p-4 border-b dark:border-gray-700 flex justify-between items-center">
          <h3 class="font-bold">Debtors List</h3>
          <div class="flex gap-2">
            <input id="utangSearch" placeholder="Search..." class="px-3 py-1.5 text-sm border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800" oninput="renderUtangTable()" />
          </div>
        </div>
        <div id="utangTable" class="overflow-auto"></div>
      </div>
    </div>`;
  renderUtangTable();
}

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
      <thead><tr class="bg-gray-50 dark:bg-gray-700 text-left"><th class="p-3">Name</th><th class="p-3">Phone</th><th class="p-3 text-right">Balance</th><th class="p-3 text-center">Actions</th></tr></thead>
      <tbody>${filtered.map(c => `<tr class="border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50">
        <td class="p-3 font-medium">${c.name}</td><td class="p-3 text-gray-500">${c.phone || '-'}</td>
        <td class="p-3 text-right font-bold text-orange-600">${peso(c.balance)}</td>
        <td class="p-3 text-center">
          <button onclick="viewClientHistory(${c.id})" class="text-blue-600 hover:text-blue-800 text-xs mr-2">View</button>
          ${c.phone ? `<button onclick="sendSMSReminder(${c.id})" class="text-green-600 hover:text-green-800 text-xs">SMS</button>` : ''}
        </td></tr>`).join('')}</tbody></table>`;
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
        <p class="text-sm">To: <strong>${c.name}</strong> (${c.phone})</p>
        <p class="text-sm">Balance: <strong class="text-orange-600">${peso(c.balance)}</strong></p>
        <textarea id="smsMessage" rows="4" class="w-full px-3 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm">Hi ${c.name}, this is a friendly reminder that your balance of ${peso(c.balance)} is due. Please settle at your earliest convenience. Thank you!</textarea>
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
