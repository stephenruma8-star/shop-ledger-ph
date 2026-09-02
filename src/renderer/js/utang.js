import { logAudit } from './auth.js'
import { dbGet } from './database.js'
import { applyDailyInterest, closeModal, dbLoad, debounce, escapeHtml, modal, searchData, toast } from './helpers.js'
import { openPrintWindow } from './printLayout.js'
import { fmtDate, peso, state, today } from './state.js'

export async function viewUtang(root) {
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
          <p class="text-xs text-gray-500 uppercase">Total Debts</p>
          <p class="text-2xl font-bold text-orange-600">${peso(totalUtang)}</p>
          <p class="text-xs text-gray-400">${debtors.length} debtors</p>
        </div>
        <div class="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm border-l-4 stat-card border-red-500">
          <p class="text-xs text-gray-500 uppercase">Highest Balance</p>
          <p class="text-2xl font-bold text-red-600">${peso(maxUtang)}</p>
        </div>
        <div class="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm border-l-4 stat-card border-blue-500">
          <p class="text-xs text-gray-500 uppercase">Average Debt</p>
          <p class="text-2xl font-bold text-blue-600">${peso(avgUtang)}</p>
        </div>
      </div>
      <div class="bg-white dark:bg-gray-800 rounded-xl shadow-sm overflow-hidden glass-card">
        <div class="p-4 border-b dark:border-gray-700 flex justify-between items-center">
          <h3 class="font-bold">Debtors List</h3>
          <div class="flex gap-2">
            <input id="utangSearch" placeholder="Search..." class="px-3 py-1.5 text-sm border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800" oninput="debouncedRenderUtangTable()" />
            <button onclick="bulkSMSOverdue()" class="px-3 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 whitespace-nowrap"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="inline-block mr-1 -mt-0.5"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>Bulk SMS</button>
            <button onclick="printBlankDebtForm()" class="px-3 py-1.5 text-sm bg-gray-600 text-white rounded-lg hover:bg-gray-700 whitespace-nowrap flex items-center gap-1.5"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="shrink-0"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>Blank Form</button>
          </div>
        </div>
        <div id="utangTable" class="overflow-auto table-scroll"></div>
      </div>
    </div>`;
  renderUtangTable();
}

export let debouncedRenderUtangTable = debounce(renderUtangTable, 250);
export function renderUtangTable() {
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
          <button onclick="viewClientHistory(${c.id})" class="text-blue-600 hover:text-blue-800 text-xs mr-2"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="inline-block mr-1 -mt-0.5"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>View</button>
          ${c.phone ? `<button onclick="sendSMSReminder(${c.id})" class="text-green-600 hover:text-green-800 text-xs"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="inline-block mr-1 -mt-0.5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>SMS</button>` : ''}
        </td></tr>`;
      }).join('')}</tbody></table>`;
}

export async function sendSMSReminder(clientId) {
  const c = await dbGet('clients', clientId);
  if (!c || !c.phone) { toast('Client has no phone number', 'error'); return; }
  const smsSetting = state.settings.find(x => x.key === 'smsApiKey');
  if (!smsSetting || !smsSetting.value) { toast('SMS API key not configured in Settings', 'warning'); return; }
  modal(`
    <div class="p-6">
      <div class="flex justify-between items-center mb-4"><h3 class="text-xl font-bold">Send SMS Reminder</h3><button onclick="closeModal()" class="text-gray-400 hover:text-gray-600"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button></div>
      <div class="space-y-3">
        <p class="text-sm">To: <strong>${escapeHtml(c.name)}</strong> (${escapeHtml(c.phone)})</p>
        <p class="text-sm">Balance: <strong class="text-orange-600">${peso(c.balance)}</strong></p>
        <textarea id="smsMessage" rows="4" class="w-full px-3 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm">Hi ${escapeHtml(c.name)}, this is a friendly reminder that your balance of ${peso(c.balance)} is due. Please settle at your earliest convenience. Thank you!</textarea>
        <button onclick="doSendSMS(${clientId})" class="w-full py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="inline-block mr-1 -mt-0.5"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>Send SMS</button>
      </div>
    </div>`);
}

export async function doSendSMS(clientId) {
  const c = await dbGet('clients', clientId);
  const smEl = document.getElementById('smsMessage');
  if (!smEl) { toast('Form not ready', 'error'); return; }
  const msg = smEl.value.trim();
  if (requireFields([{ el: smEl, msg: 'Please enter a message' }])) return;
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

export async function bulkSMSOverdue() {
  const smsSetting = state.settings.find(x => x.key === 'smsApiKey');
  if (!smsSetting || !smsSetting.value) { toast('SMS API key not configured in Settings', 'warning'); return; }
  const overdue = state.clients.filter(c => (c.balance || 0) > 0 && c.dueDate && c.dueDate < today() && c.phone);
  if (overdue.length === 0) { toast('No overdue clients with phone numbers', 'info'); return; }
  const shopName = (state.settings.find(x => x.key === 'shopName') || {}).value || 'Shop';
  const msg = `Hi, this is a reminder from ${shopName}. Your balance is overdue. Please settle at your earliest convenience. Thank you!`;
  modal(`
    <div class="p-6">
      <div class="flex justify-between items-center mb-4"><h3 class="text-xl font-bold">Bulk SMS Reminder</h3><button onclick="closeModal()" class="text-gray-400 hover:text-gray-600"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button></div>
      <p class="text-sm mb-3">Send reminder to <strong>${overdue.length}</strong> overdue client(s):</p>
      <div class="max-h-40 overflow-auto text-xs space-y-1 mb-3 border dark:border-gray-700 rounded p-2">
        ${overdue.map(c => `<div class="flex justify-between"><span>${escapeHtml(c.name)}</span><span class="text-gray-500">${escapeHtml(c.phone)}</span></div>`).join('')}
      </div>
      <textarea id="bulkSmsMsg" rows="3" class="w-full px-3 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm mb-3">${escapeHtml(msg)}</textarea>
      <button onclick="doBulkSMS()" class="w-full py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-semibold"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="inline-block mr-1 -mt-0.5"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>Send to ${overdue.length} client(s)</button>
    </div>`);
}

export async function doBulkSMS() {
  const bmEl = document.getElementById('bulkSmsMsg');
  if (!bmEl) { toast('Form not ready', 'error'); return; }
  const msg = bmEl.value.trim();
  if (requireFields([{ el: bmEl, msg: 'Please enter a message' }])) return;
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

export const debtColumns = [
  { key: 'date', label: 'Date', align: 'left', inputAlign: '' },
  { key: 'item', label: 'Item/Description', align: 'left', inputAlign: '' },
  { key: 'qty', label: 'Qty/Name', align: 'ctr', inputAlign: 'center', cls: 'qty' },
  { key: 'amount', label: 'Amount', align: 'num', inputAlign: 'right' },
  { key: 'payment', label: 'Payment', align: 'num', inputAlign: 'right' },
  { key: 'interest', label: 'Interest', align: 'num', inputAlign: 'right' },
  { key: 'balance', label: 'Balance', align: 'num', inputAlign: 'right' },
  { key: 'remarks', label: 'Remarks', align: 'left', inputAlign: '' },
  { key: 'signature', label: 'Signature', align: 'left', inputAlign: '' }
];

export function getDebtCols() {
  try { return JSON.parse(localStorage.getItem('debtFormCols')) || debtColumns.map(c => c.key); }
  catch { return debtColumns.map(c => c.key); }
}

export function printBlankDebtForm() {
  const saved = getDebtCols();
  const rc = parseInt(localStorage.getItem('debtRowCount')) || 10;
  modal(`
    <div class="p-6">
      <div class="flex justify-between items-center mb-4"><h3 class="text-lg font-bold">Debt Form Setup</h3><button onclick="closeModal()" class="text-gray-400 hover:text-gray-600"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button></div>
      <div class="mb-4">
        <p class="text-xs text-gray-500 mb-2">Toggle columns to show:</p>
        <div class="grid grid-cols-2 gap-1">${debtColumns.map(c => `<label class="flex items-center gap-2 text-sm p-1 hover:bg-gray-50 dark:hover:bg-gray-700 rounded cursor-pointer"><input type="checkbox" data-key="${c.key}" ${saved.includes(c.key)?'checked':''} onchange="debtColsChanged()" class="w-3.5 h-3.5 text-blue-600" /><span>${c.label}</span></label>`).join('')}</div>
      </div>
      <div class="flex items-center gap-3 mb-4">
        <span class="text-sm text-gray-600 dark:text-gray-300">Rows:</span>
        <button onclick="let e=document.getElementById('drc');let v=parseInt(e.value)||1;if(v>1){e.value=v-1;debtRowChanged()}" class="w-8 h-8 flex items-center justify-center bg-gray-200 dark:bg-gray-700 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 font-bold text-lg">−</button>
        <input id="drc" type="number" min="1" max="99" value="${rc}" onchange="debtRowChanged()" class="w-16 text-center px-2 py-1 border dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-sm" />
        <button onclick="let e=document.getElementById('drc');let v=parseInt(e.value)||1;if(v<99){e.value=v+1;debtRowChanged()}" class="w-8 h-8 flex items-center justify-center bg-gray-200 dark:bg-gray-700 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 font-bold text-lg">+</button>
      </div>
      <div class="flex gap-3 justify-center">
        <button onclick="closeModal();doDebtForm('portrait')" class="flex-1 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="inline-block mr-1 -mt-0.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>Portrait</button>
        <button onclick="closeModal();doDebtForm('landscape')" class="flex-1 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="inline-block mr-1 -mt-0.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>Landscape</button>
      </div>
    </div>`);
}

export function debtRowChanged() {
  const drEl = document.getElementById('drc');
  if (!drEl) return;
  const v = parseInt(drEl.value) || 10;
  localStorage.setItem('debtRowCount', String(Math.max(1, Math.min(99, v))));
}

export function debtColsChanged() {
  const keys = [...document.querySelectorAll('#modal-root input[data-key]:checked')].map(cb => cb.dataset.key);
  localStorage.setItem('debtFormCols', JSON.stringify(keys));
}

export function doDebtForm(orientation) {
  const todayStr = today();
  const isLandscape = orientation === 'landscape';
  const cols = debtColumns.filter(c => getDebtCols().includes(c.key));
  const sm = {}; state.settings.forEach(s => sm[s.key] = s.value);
  const ds1 = sm['printStripeColor1'] || '#f8fafc';
  const ds2 = sm['printStripeColor2'] || '#ffffff';
  const rowCount = parseInt(localStorage.getItem('debtRowCount')) || 10;
  const maxPerPage = 40;
  const colHeaders = `<tr><th class="n">#</th>${cols.map(c => `<th${c.cls ? ' class="'+c.cls+'"' : ''}${c.align ? ' style="text-align:'+c.align+'"' : ''}>${c.label}</th>`).join('')}</tr>`;
  function pageRows(start, end) {
    return Array.from({length: end - start}, (_, i) => `
    <tr>
      <td class="n">${start + i + 1}</td>
      ${cols.map(c => `<td${c.cls ? ' class="'+c.cls+'"' : ''}><input type="text" class="ci"${c.inputAlign ? ' style="text-align:'+c.inputAlign+'"' : ''} /></td>`).join('')}
    </tr>`).join('');
  }
  let tablesHtml = '';
  for (let s = 0; s < rowCount; s += maxPerPage) {
    const end = Math.min(s + maxPerPage, rowCount);
    if (s > 0) tablesHtml += `<div style="page-break-before:always;margin-top:0;height:0"></div>`;
    tablesHtml += `<table class="debt-table"><thead>${colHeaders}</thead><tbody>${pageRows(s, end)}</tbody></table>`;
  }

  const content = `
<div style="margin-bottom:8px;display:flex;justify-content:space-between;align-items:center">
  <h2 style="font-size:14px;font-weight:700;color:#0f172a">Debt Record Form</h2>
  <span style="font-size:11px;color:#475569">Date: _______________</span>
</div>
<div style="margin-bottom:8px;font-size:12px">
  Client Name: <input type="text" class="ci" style="width:250px;border-bottom:1px solid #94a3b8;padding:2px 4px;font-size:12px" />
</div>
${tablesHtml}
<div style="margin-top:8px;font-size:10px;display:flex;justify-content:space-between;color:#475569">
  <span>Prepared by: _________________</span>
  <span style="font-weight:600">Total Amount: ₱_________</span>
  <span>Date: ${escapeHtml(todayStr)}</span>
</div>`;

  const extraCss = isLandscape ? `
.print-preview{max-width:none;padding:20px 24px}
.debt-table{width:100%;border-collapse:collapse;font-size:9px}
.debt-table th{background:#1e293b;color:#fff;border:1px solid #0f172a;padding:4px 3px;text-align:center;font-weight:600;font-size:8px}
.debt-table tbody tr:nth-child(even) td{background:${ds1}}
.debt-table tbody tr:nth-child(odd) td{background:${ds2}}
.debt-table td{border:1px solid #0f172a;padding:0;height:22px}
.debt-table td.n{width:20px;text-align:center;font-size:9px;color:#64748b;padding:3px}
.debt-table th.n{width:20px}
.debt-table th.qty{width:50px}
.debt-table td.qty{text-align:center}
.debt-table th.num{width:55px;text-align:right}
.ci{width:100%;border:none;background:transparent;font:inherit;color:inherit;padding:3px 4px;margin:0;outline:none;box-sizing:border-box}
.ci:focus{background:#eff6ff;box-shadow:inset 0 0 0 1px #3b82f6}@media print{.ci{background:transparent;padding:3px 4px}.ci:focus{box-shadow:none}}
@page{size:landscape;margin:10mm 12mm}
` : `
.debt-table tbody tr:nth-child(even) td{background:${ds1}}
.debt-table tbody tr:nth-child(odd) td{background:${ds2}}
.debt-table{width:100%;border-collapse:collapse;font-size:9px}
.debt-table th{background:#1e293b;color:#fff;border:1px solid #0f172a;padding:4px 3px;text-align:center;font-weight:600;font-size:8px}
.debt-table td{border:1px solid #0f172a;padding:0;height:20px}
.debt-table td.n{width:18px;text-align:center;font-size:9px;color:#64748b;padding:3px}
.debt-table th.n{width:18px}
.debt-table th.qty{width:40px}
.debt-table td.qty{text-align:center}
.debt-table th.num{width:48px;text-align:right}
.ci{width:100%;border:none;background:transparent;font:inherit;color:inherit;padding:3px 4px;margin:0;outline:none;box-sizing:border-box}
.ci:focus{background:#eff6ff;box-shadow:inset 0 0 0 1px #3b82f6}@media print{.ci{background:transparent;padding:3px 4px}.ci:focus{box-shadow:none}}
@page{size:portrait;margin:12mm 10mm}
`;
  openPrintWindow('Blank Debt Record Form', 850, 700, content, { size: orientation, extraCss });
}


// expose top-level bindings as globals (inline onclick handlers and legacy code paths rely on them)
Object.defineProperties(window, {
  viewUtang: { get: () => viewUtang, configurable: true },
  debouncedRenderUtangTable: { get: () => debouncedRenderUtangTable, configurable: true },
  renderUtangTable: { get: () => renderUtangTable, configurable: true },
  sendSMSReminder: { get: () => sendSMSReminder, configurable: true },
  doSendSMS: { get: () => doSendSMS, configurable: true },
  bulkSMSOverdue: { get: () => bulkSMSOverdue, configurable: true },
  doBulkSMS: { get: () => doBulkSMS, configurable: true },
  debtColumns: { get: () => debtColumns, configurable: true },
  getDebtCols: { get: () => getDebtCols, configurable: true },
  printBlankDebtForm: { get: () => printBlankDebtForm, configurable: true },
  debtRowChanged: { get: () => debtRowChanged, configurable: true },
  debtColsChanged: { get: () => debtColsChanged, configurable: true },
  doDebtForm: { get: () => doDebtForm, configurable: true }
});
