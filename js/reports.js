async function viewReports(root) {
  state.transactions = await dbAll('transactions');
  state.payments = await dbAll('payments');
  state.expenses = await dbAll('expenses');
  const totalRevenue = state.transactions.reduce((s, t) => s + (t.grandTotal || 0), 0);
  const totalExpenses = state.expenses.reduce((s, e) => s + (e.amount || 0), 0);
  const netProfit = totalRevenue - totalExpenses;
  const profitMargin = totalRevenue > 0 ? ((netProfit / totalRevenue) * 100).toFixed(1) : 0;
  root.innerHTML = `
    <div class="space-y-4 fade-in">
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div class="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm border-l-4 border-green-500">
          <p class="text-xs text-gray-500 uppercase">Total Revenue</p>
          <p class="text-2xl font-bold text-green-600">${peso(totalRevenue)}</p>
        </div>
        <div class="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm border-l-4 border-red-500">
          <p class="text-xs text-gray-500 uppercase">Total Expenses</p>
          <p class="text-2xl font-bold text-red-600">${peso(totalExpenses)}</p>
        </div>
        <div class="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm border-l-4 ${netProfit >= 0 ? 'border-blue-500' : 'border-red-500'}">
          <p class="text-xs text-gray-500 uppercase">Net Profit</p>
          <p class="text-2xl font-bold ${netProfit >= 0 ? 'text-blue-600' : 'text-red-600'}">${peso(netProfit)} <span class="text-sm">(${profitMargin}%)</span></p>
        </div>
      </div>
      <div class="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm">
        <h3 class="font-bold mb-3">Monthly Overview <span class="text-sm font-normal text-gray-500">(last 6 months)</span></h3>
        <canvas id="reportChart" height="200"></canvas>
      </div>
      <div class="flex gap-2 flex-wrap">
        <button onclick="exportExcel()" class="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700">Export Excel</button>
        <button onclick="exportPDF()" class="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700">Export PDF</button>
        <button onclick="backupJSON()" class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">Backup JSON</button>
        <button onclick="encryptedBackupFlow()" class="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700">Encrypted Backup</button>
        <button onclick="fileBackupFlow()" class="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700">File Backup</button>
        <button onclick="emailBackupFlow()" class="px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700">Email Backup</button>
      </div>
    </div>`;
  drawReportChart();
}

function drawReportChart() {
  if (chartInstances.report) chartInstances.report.destroy();
  const labels = [];
  const revData = [];
  const expData = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    const monthKey = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
    labels.push(d.toLocaleDateString('en-PH', { month: 'short', year: 'numeric' }));
    const monthRev = state.transactions.filter(t => (t.date || '').startsWith(monthKey));
    const monthExp = state.expenses.filter(e => (e.date || '').startsWith(monthKey));
    revData.push(monthRev.reduce((s, t) => s + (t.grandTotal || 0), 0));
    expData.push(monthExp.reduce((s, e) => s + (e.amount || 0), 0));
  }
  const ctx = document.getElementById('reportChart');
  if (!ctx) return;
  chartInstances.report = new Chart(ctx, {
    type: 'bar',
    data: { labels, datasets: [
      { label: 'Revenue', data: revData, backgroundColor: '#10b981', borderRadius: 4 },
      { label: 'Expenses', data: expData, backgroundColor: '#ef4444', borderRadius: 4 }
    ]},
    options: { responsive: true, maintainAspectRatio: false,
      scales: { y: { beginAtZero: true, ticks: { callback: v => '₱' + v.toLocaleString() } } }
    }
  });
}

async function getAllData() {
  return {
    clients: await dbAll('clients'), transactions: await dbAll('transactions'),
    payments: await dbAll('payments'), inventory: await dbAll('inventory'),
    quickItems: await dbAll('quickItems'), expenses: await dbAll('expenses'),
    suppliers: await dbAll('suppliers'), purchaseOrders: await dbAll('purchaseOrders'),
    loyaltyPoints: await dbAll('loyaltyPoints'), notifications: await dbAll('notifications'),
    auditLogs: await dbAll('auditLogs'), users: await dbAll('users'),
    settings: await dbAll('settings'), exportedAt: now()
  };
}

function exportExcel() {
  try {
    const wb = XLSX.utils.book_new();
    const sheets = {
      Transactions: state.transactions, Payments: state.payments,
      Expenses: state.expenses, Clients: state.clients,
      Inventory: state.inventory, Suppliers: state.suppliers,
      PurchaseOrders: state.purchaseOrders
    };
    Object.entries(sheets).forEach(([name, data]) => {
      const ws = XLSX.utils.json_to_sheet(data);
      XLSX.utils.book_append_sheet(wb, ws, name);
    });
    XLSX.writeFile(wb, `ShopLedgerPH_Report_${today()}.xlsx`);
    toast('Excel exported');
  } catch (e) { toast('Export error: ' + e.message, 'error'); }
}

function exportPDF() {
  toast('PDF export: Print to PDF using browser print (Ctrl+P)', 'info');
  window.print();
}

async function backupJSON() {
  try {
    const data = await getAllData();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `backup-${today()}.json`; a.click();
    URL.revokeObjectURL(url);
    toast('Backup downloaded');
  } catch (e) { toast('Backup error: ' + e.message, 'error'); }
}

async function encryptedBackupFlow() {
  if (!window.electronAPI) { toast('Encrypted backup only available in desktop app', 'warning'); return; }
  modal(`
    <div class="p-6">
      <div class="flex justify-between items-center mb-4"><h3 class="text-xl font-bold">🔐 Encrypted Backup</h3><button onclick="closeModal()" class="text-gray-400 text-2xl">&times;</button></div>
      <div class="space-y-3">
        <p class="text-sm text-gray-500">Create an encrypted backup file with a password.</p>
        <input id="eb-password" type="password" placeholder="Enter password" class="w-full px-3 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800" />
        <input id="eb-confirm" type="password" placeholder="Confirm password" class="w-full px-3 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800" />
        <button onclick="doEncryptedBackup()" class="w-full py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700">Create Encrypted Backup</button>
      </div>
    </div>`);
}

async function doEncryptedBackup() {
  const pw = document.getElementById('eb-password').value;
  const confirm = document.getElementById('eb-confirm').value;
  if (!pw || pw !== confirm) { toast('Passwords do not match', 'error'); return; }
  const data = await getAllData();
  try {
    const result = await window.electronAPI.saveEncryptedBackup(data, pw, `backup-encrypted-${today()}.enc`);
    if (result.success) { toast('Encrypted backup saved'); closeModal(); }
    else toast('Error: ' + (result.error || 'Unknown'), 'error');
  } catch (e) { toast('Error: ' + e.message, 'error'); }
}

async function fileBackupFlow() {
  if (!window.electronAPI) { toast('File backup only available in desktop app', 'warning'); return; }
  const data = await getAllData();
  try {
    const result = await window.electronAPI.saveBackupFile(data, `backup-${today()}.json`);
    if (result.success) toast('File backup saved');
    else toast('Error: ' + (result.error || 'Unknown'), 'error');
  } catch (e) { toast('Error: ' + e.message, 'error'); }
}

async function emailBackupFlow() {
  if (!window.electronAPI) { toast('Email backup only in desktop app', 'warning'); return; }
  const smtpSetting = state.settings.find(x => x.key === 'smtpConfig');
  const emailTo = state.settings.find(x => x.key === 'backupEmail');
  if (!smtpSetting || !smtpSetting.value || !emailTo || !emailTo.value) {
    toast('Configure SMTP and backup email in Settings first', 'warning'); return;
  }
  try {
    const data = await getAllData();
    const smtp = JSON.parse(smtpSetting.value);
    const result = await window.electronAPI.sendEmailBackup({
      smtp, to: emailTo.value, data,
      filename: `backup-${today()}.json`
    });
    if (result.success) { toast('Backup emailed successfully', 'success'); await logAudit('backup', 'Email backup sent'); }
    else toast('Error: ' + (result.error || 'Unknown'), 'error');
  } catch (e) { toast('Error: ' + e.message, 'error'); }
}
