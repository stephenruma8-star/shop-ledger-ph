async function viewUtang(root) {
  await Promise.all([dbLoad('clients'), dbLoad('transactions'), dbLoad('payments')]);
  await applyDailyInterest();
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
            <button onclick="printBlankDebtForm()" class="px-3 py-1.5 text-sm bg-gray-600 text-white rounded-lg hover:bg-gray-700 whitespace-nowrap">🖨 Blank Form</button>
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

function printBlankDebtForm() {
  modal(`
    <div class="p-6 text-center">
      <h3 class="text-lg font-bold mb-4">Select Paper Orientation</h3>
      <div class="flex gap-3 justify-center">
        <button onclick="closeModal();openDebtForm('portrait')" class="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold">📄 Portrait</button>
        <button onclick="closeModal();openDebtForm('landscape')" class="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold">📄 Landscape</button>
      </div>
    </div>`);
}

function openDebtForm(orientation) {
  const shopName = (state.settings.find(x => x.key === 'shopName') || {}).value || 'Shop Ledger PH';
  const shopAddr = (state.settings.find(x => x.key === 'shopAddress') || {}).value || '';
  const shopContact = (state.settings.find(x => x.key === 'shopContact') || {}).value || '';
  const rate = (state.settings.find(x => x.key === 'dailyInterestRate') || {}).value || '0';
  const todayStr = today();
  const rows = Array.from({length: 25}, (_, i) => `
    <tr>
      <td class="num">${i + 1}</td>
      <td class="date"><input type="text" class="ci" placeholder="" /></td>
      <td class="desc"><input type="text" class="ci" placeholder="" /></td>
      <td class="amt"><input type="text" class="ci" placeholder="" /></td>
      <td class="pay"><input type="text" class="ci" placeholder="" /></td>
      <td class="int"><input type="text" class="ci" placeholder="" /></td>
      <td class="bal"><input type="text" class="ci" placeholder="" /></td>
      <td class="rem"><input type="text" class="ci" placeholder="" /></td>
      <td class="sig"><input type="text" class="ci" placeholder="" /></td>
    </tr>`).join('');
  const isLandscape = orientation === 'landscape';
  const pageSize = isLandscape ? 'landscape' : 'portrait';
  const w = window.open('', '_blank', 'width=850,height=700');
  w.document.write(`
<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Blank Debt Record Form</title>
<style>
  @page { size: ${pageSize}; margin: ${isLandscape ? '10mm 12mm' : '15mm 10mm'} }
  * { box-sizing: border-box; margin: 0; padding: 0 }
  body { font-family: 'Segoe UI', Arial, sans-serif; font-size: ${isLandscape ? '12px' : '11px'}; color: #000; padding: 10px }
  .header { text-align: center; margin-bottom: 12px; border-bottom: 2px solid #000; padding-bottom: 8px }
  .header h1 { font-size: 18px; margin-bottom: 2px }
  .header p { font-size: 11px; color: #333 }
  .title-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px }
  .title-row h2 { font-size: 14px }
  table { width: 100%; border-collapse: collapse }
  th { background: #eee; border: 1px solid #000; padding: 5px 3px; font-size: 10px; text-align: center; font-weight: 600 }
  td { border: 1px solid #000; padding: 0; height: ${isLandscape ? '26px' : '22px'} }
  td.num { width: 22px; text-align: center; font-size: 10px; color: #666; padding: 4px 3px }
  td.date { width: ${isLandscape ? '75px' : '65px'} }
  td.desc { width: ${isLandscape ? '160px' : '130px'} }
  td.amt, td.pay, td.int, td.bal { width: ${isLandscape ? '60px' : '50px'}; text-align: right }
  td.rem { width: ${isLandscape ? '100px' : '80px'} }
  td.sig { width: ${isLandscape ? '85px' : '70px'} }
  .client-row { margin-bottom: 6px; font-size: 12px }
  .client-row .ci-client { width: 250px; border-bottom: 1px solid #999; padding: 2px 4px; font-size: 12px }
  .rate-label { font-size: 11px; color: #555 }
  .ci { width: 100%; border: none; background: transparent; font: inherit; color: inherit; padding: 4px 3px; margin: 0; outline: none; box-sizing: border-box; text-align: inherit }
  .ci:focus { background: #e8f4ff; box-shadow: inset 0 0 0 1px #3b82f6 }
  @media print { .ci { border: none; background: transparent; padding: 4px 3px } .ci:focus { box-shadow: none } }
  .footer { margin-top: 10px; font-size: 10px; display: flex; justify-content: space-between }
  .footer .total { font-weight: 600 }
  .print-btn { display: block; margin: 10px auto; padding: 8px 24px; font-size: 14px; cursor: pointer }
  @media print { .print-btn { display: none } body { padding: 0 } }
</style></head><body>
  <div class="header">
    <h1>${escapeHtml(shopName)}</h1>
    <p>${escapeHtml(shopAddr)}${shopContact ? ' | Tel: ' + escapeHtml(shopContact) : ''}</p>
  </div>
  <div class="title-row">
    <h2>Debt Record Form</h2>
    <span>Date: _______________</span>
  </div>
  <div class="client-row" style="display:flex;gap:20px;align-items:center">
    <span>Client Name: <input type="text" class="ci ci-client" placeholder="" /></span>
    <span class="rate-label">Daily Interest Rate: ${escapeHtml(rate)}%</span>
  </div>
  <table>
    <thead><tr>
      <th>#</th><th>Date</th><th>Item/Description</th>
      <th>Amount (₱)</th><th>Payment (₱)</th><th>Interest (%)</th><th>Balance (₱)</th><th>Remarks</th><th>Signature</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="footer">
    <span>Prepared by: _________________</span>
    <span class="total">Total Amount: ₱_________</span>
    <span>Date: ${todayStr}</span>
  </div>
  <button class="print-btn" onclick="window.print()">🖨 Print Form</button>
</body></html>`);
  w.document.close();
}
