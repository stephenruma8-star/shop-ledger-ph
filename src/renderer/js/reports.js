import { logAudit } from './auth.js'
import { dbAll, dbClear, dbPut } from './database.js'
import { closeModal, confirmModal, dbLoad, escapeHtml, filterByYear, modal, paginate, renderPagination, toast } from './helpers.js'
import { calculateInventoryValue } from './inventory.js'
import { escHtml, excelTableCss, openPrintWindow } from './printLayout.js'
import { loadAll, render } from './router.js'
import { fmtDate, now, peso, state, today, VAT_RATE } from './state.js'

let _restoreResolve = null;

function cogsOf(txList, invCost) {
  let cogs = 0;
  for (const t of txList) {
    for (const it of (t.items || [])) {
      if (it.invId == null) continue;
      const m = String(it.name || it.qty || '1').match(/^-?[\d.]+/);
      const qty = m ? parseFloat(m[0]) : 1;
      cogs += qty * (invCost.get(it.invId) || 0);
    }
  }
  return cogs;
}

export async function viewReports(root) {
  await Promise.all([dbLoad('transactions'), dbLoad('payments'), dbLoad('expenses'), dbLoad('inventory')]);
  const rTx = filterByYear(state.transactions, 'date').filter(t => t.status !== 'voided' && t.status !== 'interest');
  const rEx = filterByYear(state.expenses, 'date');
  const rPay = filterByYear(state.payments, 'date');
  const invCost = new Map((state.inventory || []).map(i => [i.id, i.costPrice || 0]));
  const totalRevenue = rTx.reduce((s, t) => s + (t.grandTotal || 0), 0);
  const totalRefunds = rTx.filter(t => t.status === 'return').reduce((s, t) => s + Math.abs(t.grandTotal || 0), 0);
  const totalCOGS = cogsOf(rTx, invCost);
  const totalExpenses = rEx.reduce((s, e) => s + (e.amount || 0), 0);
  const netProfit = totalRevenue - totalCOGS - totalExpenses;
  const profitMargin = totalRevenue > 0 ? ((netProfit / totalRevenue) * 100).toFixed(1) : 0;
  const repDefaultMonth = today().slice(0, 7);
  root.innerHTML = `
    <div class="space-y-4 fade-in">
      <div class="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm glass-card flex flex-wrap items-end gap-3">
        <div>
          <h3 class="font-bold text-lg">Monthly Report</h3>
          <p class="text-xs text-gray-500">Pick any month — sales, payments, expenses, debts and top movers in one report.</p>
        </div>
        <div class="ml-auto flex items-end gap-2">
          <div><label class="text-xs text-gray-500 block">Month</label><input id="rep-month" type="month" value="${repDefaultMonth}" class="px-3 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800" /></div>
          <button onclick="generateMonthlyReport()" class="px-4 py-2 bg-green-700 text-white rounded-lg hover:bg-green-800 font-semibold"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="inline-block mr-1 -mt-0.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>Generate Report</button>
        </div>
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <div class="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm border-l-4 stat-card border-green-500">
          <p class="text-xs text-gray-500 uppercase">Total Revenue</p>
          <p class="text-2xl font-bold text-green-600">${peso(totalRevenue)}</p>
        </div>
        <div class="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm border-l-4 stat-card border-fuchsia-500">
          <p class="text-xs text-gray-500 uppercase">Refunds</p>
          <p class="text-2xl font-bold text-fuchsia-600">${peso(totalRefunds)}</p>
        </div>
        <div class="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm border-l-4 stat-card border-amber-500">
          <p class="text-xs text-gray-500 uppercase">Cost of Goods</p>
          <p class="text-2xl font-bold text-amber-600">${peso(totalCOGS)}</p>
        </div>
        <div class="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm border-l-4 stat-card border-red-500">
          <p class="text-xs text-gray-500 uppercase">Total Expenses</p>
          <p class="text-2xl font-bold text-red-600">${peso(totalExpenses)}</p>
        </div>
        <div class="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm border-l-4 stat-card ${netProfit >= 0 ? 'border-blue-500' : 'border-red-500'}">
          <p class="text-xs text-gray-500 uppercase">Net Profit</p>
          <p class="text-2xl font-bold ${netProfit >= 0 ? 'text-blue-600' : 'text-red-600'}">${peso(netProfit)} <span class="text-sm">(${profitMargin}%)</span></p>
        </div>
      </div>
      <div class="flex gap-2 flex-wrap">
        <button onclick="showMonthlyOverview()" class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="inline-block mr-1 -mt-0.5"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>Monthly Overview</button>
        <button onclick="exportExcel()" class="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="inline-block mr-1 -mt-0.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>Export Excel</button>
        <button onclick="exportPDF()" class="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="inline-block mr-1 -mt-0.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>Export PDF</button>
        <button onclick="exportAccountingCSV()" class="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="inline-block mr-1 -mt-0.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>Export CSV</button>
        <button onclick="dailySalesReport()" class="px-4 py-2 bg-green-700 text-white rounded-lg hover:bg-green-800"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="inline-block mr-1 -mt-0.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>Daily Report</button>
        <button onclick="showSalesByClient()" class="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="inline-block mr-1 -mt-0.5"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>Sales by Client</button>
        <button onclick="showARAging()" class="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="inline-block mr-1 -mt-0.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>AR Aging</button>
        <button onclick="backupJSON()" class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="inline-block mr-1 -mt-0.5"><path d="M21.5 17.5a5 5 0 0 0-4.7-7.5 7 7 0 0 0-13.1 2.5A5 5 0 0 0 6 21h12a4 4 0 0 0 3.5-3.5z"/></svg>Backup JSON</button>
        <button onclick="showInventoryValuation()" class="px-4 py-2 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="inline-block mr-1 -mt-0.5"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>Inventory Valuation</button>
        <button onclick="encryptedBackupFlow()" class="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="inline-block mr-1 -mt-0.5"><path d="M21.5 17.5a5 5 0 0 0-4.7-7.5 7 7 0 0 0-13.1 2.5A5 5 0 0 0 6 21h12a4 4 0 0 0 3.5-3.5z"/></svg>Encrypted Backup</button>
        <button onclick="fileBackupFlow()" class="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="inline-block mr-1 -mt-0.5"><path d="M21.5 17.5a5 5 0 0 0-4.7-7.5 7 7 0 0 0-13.1 2.5A5 5 0 0 0 6 21h12a4 4 0 0 0 3.5-3.5z"/></svg>File Backup</button>
        <button onclick="emailBackupFlow()" class="px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="inline-block mr-1 -mt-0.5"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>Email Backup</button>
        <button onclick="showRestoreModal()" class="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="inline-block mr-1 -mt-0.5"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>Restore</button>
        <button onclick="signalLanUpdate()" class="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="inline-block mr-1 -mt-0.5"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>Signal Update on LAN</button>
        <button onclick="viewAuditLog()" class="px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-800"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="inline-block mr-1 -mt-0.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>Audit Log</button>
        <button onclick="showBIRFormSelector()" class="px-4 py-2 bg-red-700 text-white rounded-lg hover:bg-red-800"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="inline-block mr-1 -mt-0.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>BIR Tax Forms</button>
      </div>
    </div>`;
}

export function showMonthlyOverview() {
  if (typeof Chart === 'undefined') {
    toast('Chart library loading, try again in a moment', 'warning');
    return;
  }
  if (window.__app.chartInstances.report) window.__app.chartInstances.report.destroy();
  const labels = [];
  const revData = [];
  const expData = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    const monthKey = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
    labels.push(d.toLocaleDateString('en-PH', { month: 'short', year: 'numeric' }));
    const monthRev = state.transactions.filter(t => (t.date || '').startsWith(monthKey) && t.status !== 'voided' && t.status !== 'interest');
    const monthExp = state.expenses.filter(e => (e.date || '').startsWith(monthKey));
    revData.push(monthRev.reduce((s, t) => s + (t.grandTotal || 0), 0));
    expData.push(monthExp.reduce((s, e) => s + (e.amount || 0), 0));
  }
  modal(`
    <div class="p-4">
      <div class="flex justify-between items-center mb-3">
        <h3 class="text-lg font-bold flex items-center gap-2"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="shrink-0"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>Monthly Overview <span class="text-xs font-normal text-gray-500">(last 6 months)</span></h3>
        <button onclick="closeModal()" class="text-gray-400 hover:text-gray-600"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
      </div>
      <div style="position:relative;height:calc(85vh - 140px);width:100%">
        <canvas id="modalChart" style="width:100%;height:100%"></canvas>
      </div>
    </div>`);
  requestAnimationFrame(() => {
    const ctx = document.getElementById('modalChart');
    if (!ctx) return;
    window.__app.chartInstances.report = new Chart(ctx, {
      type: 'bar',
      data: { labels, datasets: [
        { label: 'Revenue', data: revData, backgroundColor: '#10b981', borderRadius: 4 },
        { label: 'Expenses', data: expData, backgroundColor: '#ef4444', borderRadius: 4 }
      ]},
      options: { responsive: true, maintainAspectRatio: false,
        scales: { y: { beginAtZero: true, ticks: { callback: v => '₱' + v.toLocaleString(), font: { size: 11 } } },
          x: { ticks: { font: { size: 11 } } } },
        plugins: { legend: { labels: { boxWidth: 12, padding: 10, font: { size: 12 } } } }
      }
    });
  });
}

export const SECRET_SETTING_KEYS = ['cloudBackupPassword', 'smsApiKey', 'aiApiKey', 'smtpConfig'];

// Masks secret setting values before they leave the machine in JSON backups,
// email backups or LAN dumps. smtpConfig keeps its shape (just the password
// scrubbed) so consumers that parse it still work on masked copies.
export function redactSettings(settings) {
  return (settings || []).map(s => {
    if (!SECRET_SETTING_KEYS.includes(s.key)) return s;
    if (s.key === 'smtpConfig') {
      try {
        const parsed = JSON.parse(s.value || '{}');
        const masked = { ...parsed, pass: '********' };
        return { ...s, value: JSON.stringify(masked) };
      } catch (e) { return { ...s, value: '********' }; }
    }
    return { ...s, value: '********' };
  });
}

export async function getAllData() {
  const users = (await dbAll('users')).map(u => { const { password, ...rest } = u; return rest; });
  return {
    clients: await dbAll('clients'), transactions: await dbAll('transactions'),
    payments: await dbAll('payments'), inventory: await dbAll('inventory'),
    quickItems: await dbAll('quickItems'), expenses: await dbAll('expenses'),
    suppliers: await dbAll('suppliers'), purchaseOrders: await dbAll('purchaseOrders'),
    supplierPayments: await dbAll('supplierPayments'),
    balanceSnapshots: await dbAll('balanceSnapshots'),
    notifications: await dbAll('notifications'),
    auditLogs: await dbAll('auditLogs'), users,
    settings: redactSettings(await dbAll('settings')), exportedAt: now()
  };
}

export async function exportExcel() {
  try {
    await Promise.all([dbLoad('clients'), dbLoad('transactions'), dbLoad('payments'), dbLoad('expenses'), dbLoad('inventory'), dbLoad('suppliers'), dbLoad('purchaseOrders')]);
    function esc(s) { return (''+s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }

    function td(v, opts) {
      const align = opts && opts.align ? ` text-align:${opts.align}` : '';
      const fmt = opts && opts.fmt ? opts.fmt : '';
      const cls = opts && opts.cls ? ` class="${opts.cls}"` : '';
      return `<td${cls} style="padding:4px 8px;border:1px solid #BFBFBF;vertical-align:top;font-family:Calibri,'Segoe UI',Arial,sans-serif;font-size:11pt;color:#000${align}">${fmt}${esc(v)}</td>`;
    }

    function th(label, align) {
      const a = align && align !== 'left' ? ` text-align:${align}` : ' text-align:center';
      return `<th style="padding:5px 8px;border:1px solid #BFBFBF;background:#217346;color:#fff;font-weight:700;font-family:Calibri,'Segoe UI',Arial,sans-serif;font-size:11pt;white-space:nowrap${a}">${esc(label)}</th>`;
    }

    const settingsMap = {};
    state.settings.forEach(s => settingsMap[s.key] = s.value);
    const shopName = settingsMap['shopName'] || 'Shop Ledger PH';
    const shopAddr = settingsMap['shopAddress'] || '';

    function section(title, headers, rows) {
      let h = headers.map(h => th(h.label, h.align)).join('');
      let r = rows.map((row, i) => {
        const bg = i % 2 === 0 ? '#ffffff' : '#E2EFDA';
        return `<tr style="background:${bg}">${row.map(c => td(c.v, c.opts)).join('')}</tr>`;
      }).join('');
      return `<tr style="background:#D9D9D9"><td colspan="${headers.length}" style="padding:8px;border:1px solid #BFBFBF;font-family:Calibri,'Segoe UI',Arial,sans-serif;font-size:12pt;font-weight:700;color:#217346">${esc(title)}</td></tr>
<tr style="background:#217346">${h}</tr>${r}`;
    }

    function pesoVal(n) { return Number(n||0).toFixed(2); }

    let html = `<table style="width:100%;border-collapse:collapse;font-family:Calibri,'Segoe UI',Arial,sans-serif;font-size:11pt;color:#000;background:#fff">`;

    // Shop header row
    html += `<tr><td colspan="20" style="padding:14px 10px;border:1px solid #BFBFBF;background:#217346;color:#fff;font-family:Calibri,'Segoe UI',Arial,sans-serif;font-size:18px;font-weight:700;text-align:center">${esc(shopName)} ${shopAddr ? '&mdash; '+esc(shopAddr) : ''}</td></tr>`;

    // Summary row
    const expTx = filterByYear(state.transactions, 'date').filter(t => t.status !== 'voided' && t.status !== 'interest');
    const expEx = filterByYear(state.expenses, 'date');
    const expPay = filterByYear(state.payments, 'date');
    const totalRevenue = expTx.reduce((s, t) => s + (t.grandTotal || 0), 0);
    const totalRefunds = expTx.filter(t => t.status === 'return').reduce((s, t) => s + Math.abs(t.grandTotal || 0), 0);
    const invCost = new Map((state.inventory || []).map(i => [i.id, i.costPrice || 0]));
    const totalCOGS = cogsOf(expTx, invCost);
    const totalExpenses = expEx.reduce((s, e) => s + (e.amount || 0), 0);
    const netProfit = totalRevenue - totalCOGS - totalExpenses;
    const totalUtang = state.clients.reduce((s, c) => s + (c.balance || 0), 0);
    const totalPayments = expPay.reduce((s, p) => s + (p.amount || 0), 0);
    const sumColor = netProfit >= 0 ? '#059669' : '#dc2626';
    html += `<tr><td colspan="20" style="padding:8px 10px;border:1px solid #BFBFBF;background:#fff;font-family:Calibri,'Segoe UI',Arial,sans-serif;font-size:11pt;color:#000">
      <span style="margin-right:24px"><strong>Revenue:</strong> ₱${pesoVal(totalRevenue)}</span>
      <span style="margin-right:24px"><strong style="color:#c026d3">Refunds:</strong> <span style="color:#c026d3">-₱${pesoVal(totalRefunds)}</span></span>
      <span style="margin-right:24px"><strong>COGS:</strong> ₱${pesoVal(totalCOGS)}</span>
      <span style="margin-right:24px"><strong>Expenses:</strong> ₱${pesoVal(totalExpenses)}</span>
      <span style="margin-right:24px"><strong style="color:${sumColor}">Net Profit:</strong> <span style="color:${sumColor}">₱${pesoVal(netProfit)}</span></span>
      <span style="margin-right:24px"><strong>Debts:</strong> ₱${pesoVal(totalUtang)}</span>
      <span><strong>Payments:</strong> ₱${pesoVal(totalPayments)}</span>
    </td></tr>`;

    const clients = state.clients.filter(c => c.name).map(c => ({
      cells: [
        { v: c.name, opts: { align: 'left' } },
        { v: c.phone||'', opts: {} },
        { v: c.address||'', opts: {} },
        { v: pesoVal(c.balance), opts: { align: 'right', fmt: '₱' } },
        { v: c.dueDate ? fmtDate(c.dueDate) : '', opts: { align: 'center' } }
      ]
    }));
    html += section('Clients', 
      [{label:'Name'},{label:'Phone'},{label:'Address'},{label:'Balance',align:'right'},{label:'Due Date',align:'center'}],
      clients.map(r => r.cells));

    const txns = expTx.filter(t => t.invoiceNo).sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt)).map(t => ({
      cells: [
        { v: t.invoiceNo, opts: {} },
        { v: t.date ? fmtDate(t.date) : '', opts: { align: 'center' } },
        { v: t.clientName||'Walk-in', opts: {} },
        { v: (t.items||[]).map(i => `${i.description||''} x${i.name||'1'}`).join('; '), opts: { align: 'left' } },
        { v: pesoVal(t.grandTotal), opts: { align: 'right', fmt: '₱' } },
        { v: t.paymentMethod||'', opts: { align: 'center' } },
        { v: t.status||'', opts: { align: 'center', cls: t.status==='paid'?'status-paid':t.status==='voided'?'status-void':'' } }
      ]
    }));
    html += section('Transactions',
      [{label:'Invoice'},{label:'Date',align:'center'},{label:'Client'},{label:'Items'},{label:'Total',align:'right'},{label:'Payment',align:'center'},{label:'Status',align:'center'}],
      txns.map(r => r.cells));

    const pays = expPay.filter(p => p.clientName).sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt)).map(p => ({
      cells: [
        { v: p.date ? fmtDate(p.date) : '', opts: { align: 'center' } },
        { v: p.clientName, opts: {} },
        { v: pesoVal(p.amount), opts: { align: 'right', fmt: '₱' } },
        { v: p.type||'', opts: { align: 'center' } },
        { v: p.notes||'', opts: {} }
      ]
    }));
    html += section('Payments',
      [{label:'Date',align:'center'},{label:'Client'},{label:'Amount',align:'right'},{label:'Type',align:'center'},{label:'Notes'}],
      pays.map(r => r.cells));

    const exps = expEx.filter(e => e.description).sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt)).map(e => ({
      cells: [
        { v: e.date ? fmtDate(e.date) : '', opts: { align: 'center' } },
        { v: e.category||'', opts: {} },
        { v: e.description, opts: {} },
        { v: pesoVal(e.amount), opts: { align: 'right', fmt: '₱' } },
        { v: e.payee||'', opts: {} }
      ]
    }));
    html += section('Expenses',
      [{label:'Date',align:'center'},{label:'Category'},{label:'Description'},{label:'Amount',align:'right'},{label:'Payee'}],
      exps.map(r => r.cells));

    const inv = state.inventory.filter(i => i.name).map(i => ({
      cells: [
        { v: i.name, opts: {} },
        { v: i.sku||'', opts: {} },
        { v: i.category||'', opts: {} },
        { v: pesoVal(i.sellPrice), opts: { align: 'right', fmt: '₱' } },
        { v: i.stock||0, opts: { align: 'right' } },
        { v: i.minStock||5, opts: { align: 'right' } }
      ]
    }));
    html += section('Inventory',
      [{label:'Name'},{label:'SKU'},{label:'Category'},{label:'Sell Price',align:'right'},{label:'Stock',align:'right'},{label:'Min Stock',align:'right'}],
      inv.map(r => r.cells));

    const supps = state.suppliers.filter(s => s.name).map(s => ({
      cells: [
        { v: s.name, opts: {} },
        { v: s.contact||'', opts: {} },
        { v: s.email||'', opts: {} },
        { v: s.category||'', opts: {} },
        { v: s.address||'', opts: {} }
      ]
    }));
    html += section('Suppliers',
      [{label:'Name'},{label:'Contact'},{label:'Email'},{label:'Category'},{label:'Address'}],
      supps.map(r => r.cells));

    const pos = state.purchaseOrders.filter(po => po.poNo).sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt)).map(po => ({
      cells: [
        { v: po.poNo, opts: {} },
        { v: po.supplierName||'', opts: {} },
        { v: po.date ? fmtDate(po.date) : '', opts: { align: 'center' } },
        { v: (po.items||[]).map(i => `${i.name||''} x${i.qty||0}`).join('; '), opts: { align: 'left' } },
        { v: pesoVal(po.total), opts: { align: 'right', fmt: '₱' } },
        { v: po.status||'', opts: { align: 'center' } }
      ]
    }));
    html += section('Purchase Orders',
      [{label:'PO No'},{label:'Supplier'},{label:'Date',align:'center'},{label:'Items'},{label:'Total',align:'right'},{label:'Status',align:'center'}],
      pos.map(r => r.cells));

    html += `<tr><td colspan="20" style="padding:10px;border:1px solid #BFBFBF;background:#fff;text-align:center;font-family:Calibri,'Segoe UI',Arial,sans-serif;font-size:10pt;color:#595959">Generated ${fmtDateTime(now())} &mdash; Shop Ledger PH</td></tr></table>`;

    const blob = new Blob([
      '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">',
      '<head><meta charset="UTF-8"><style>td,th{mso-number-format:"\\@"}.status-paid{color:#059669;font-weight:700}.status-void{color:#dc2626;font-weight:700}</style>',
      '<!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet>',
      '<x:Name>Report</x:Name><x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions>',
      '</x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]-->',
      '</head><body>', html, '</body></html>'
    ], { type: 'application/vnd.ms-excel' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `ShopLedgerPH_Report_${today()}.xls`; a.click();
    URL.revokeObjectURL(url);
    toast('Excel exported');
  } catch (e) { toast('Export error: ' + e.message, 'error'); }
}

export async function exportXlsx() {
  try {
    await Promise.all([dbLoad('clients'), dbLoad('transactions'), dbLoad('payments'), dbLoad('expenses'), dbLoad('inventory'), dbLoad('suppliers'), dbLoad('purchaseOrders')]);
    const X = window.XLSX;
    if (!X || !X.utils || typeof X.writeFile !== 'function') { toast('Excel engine not loaded, using legacy export', 'warning'); return exportExcel(); }
    const xTx = filterByYear(state.transactions, 'date').filter(t => t.status !== 'voided' && t.status !== 'interest');
    const xEx = filterByYear(state.expenses, 'date');
    const xPay = filterByYear(state.payments, 'date');
    const invCost = new Map((state.inventory || []).map(i => [i.id, i.costPrice || 0]));
    const totalRevenue = xTx.reduce((s, t) => s + (t.grandTotal || 0), 0);
    const totalRefunds = xTx.filter(t => t.status === 'return').reduce((s, t) => s + Math.abs(t.grandTotal || 0), 0);
    const totalCOGS = cogsOf(xTx, invCost);
    const totalExpenses = xEx.reduce((s, e) => s + (e.amount || 0), 0);
    const netProfit = totalRevenue - totalCOGS - totalExpenses;
    const totalUtang = (state.clients || []).reduce((s, c) => s + (c.balance || 0), 0);
    const totalPayments = xPay.reduce((s, p) => s + (p.amount || 0), 0);
    const settingsMap = {};
    state.settings.forEach(s => settingsMap[s.key] = s.value);
    const shopName = settingsMap['shopName'] || 'Shop Ledger PH';

    const wb = X.utils.book_new();
    const genStamp = new Date().toLocaleString();
    X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet([
      [`${shopName} — Summary`], [`Generated ${genStamp}`],
      ['Revenue', totalRevenue], ['Refunds', -totalRefunds],
      ['Cost of Goods', totalCOGS], ['Expenses', totalExpenses],
      ['Net Profit', netProfit], ['Outstanding Debts', totalUtang], ['Payments Collected', totalPayments]
    ]), 'Summary');
    {
      const ws = wb.Sheets && wb.Sheets['Summary'];
      if (ws && xlsxCanStyle(X)) {
        ws['A1'].s = { font: { name: 'Calibri', sz: 14, bold: true, color: { rgb: XL_GREEN } }, alignment: { horizontal: 'center' } };
        ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 1 } }];
        ws['A2'].s = { font: { name: 'Calibri', sz: 10, italic: true, color: { rgb: '595959' } }, alignment: { horizontal: 'center' } };
        ws['!merges'].push({ s: { r: 1, c: 0 }, e: { r: 1, c: 1 } });
        for (let r = 2; r <= 8; r++) {
          const label = X.utils.encode_cell({ r, c: 0 });
          const val = X.utils.encode_cell({ r, c: 1 });
          if (ws[label]) ws[label].s = { font: { name: 'Calibri', sz: 11, bold: true }, border: xlThinBorder() };
          if (ws[val]) { ws[val].s = { font: { name: 'Calibri', sz: 11 }, alignment: { horizontal: 'right' }, border: xlThinBorder() }; ws[val].z = '#,##0.00'; }
        }
        ws['!cols'] = [{ wch: 22 }, { wch: 20 }];
      }
    }

    const sheet = (title, headers, rows, numCols = [], centerCols = []) => {
      const ws = X.utils.aoa_to_sheet([[title], headers, ...rows]);
      styleXlsxTable(X, ws, { title, titleRow: 0, headerRow: 1, nDataRows: rows.length, nCols: headers.length, numCols, centerCols });
      ws['!cols'] = xlsxColWidths(headers, rows, title);
      return ws;
    };
    X.utils.book_append_sheet(wb, sheet(`${shopName} — Transactions`, ['Invoice', 'Date', 'Client', 'Items', 'Total', 'Payment', 'Status'],
      xTx.filter(t => t.invoiceNo).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).map(t => [
        t.invoiceNo, t.date ? fmtDate(t.date) : '', t.clientName || 'Walk-in',
        (t.items || []).map(i => `${i.description || ''} x${i.name || '1'}`).join('; '),
        t.grandTotal, t.paymentMethod || '', t.status || ''
      ]), [4], [1, 5, 6]), 'Transactions');
    X.utils.book_append_sheet(wb, sheet(`${shopName} — Clients`, ['Name', 'Phone', 'Address', 'Balance', 'Due Date'],
      (state.clients || []).filter(c => c.name).map(c => [c.name, c.phone || '', c.address || '', c.balance || 0, c.dueDate ? fmtDate(c.dueDate) : '']), [3], [4]), 'Clients');
    X.utils.book_append_sheet(wb, sheet(`${shopName} — Payments`, ['Date', 'Client', 'Amount', 'Type', 'Notes'],
      xPay.filter(p => p.clientName).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).map(p => [p.date ? fmtDate(p.date) : '', p.clientName, p.amount, p.type || '', p.notes || '']), [2], [0, 3]), 'Payments');
    X.utils.book_append_sheet(wb, sheet(`${shopName} — Expenses`, ['Date', 'Category', 'Description', 'Amount', 'Payee'],
      xEx.filter(e => e.description).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).map(e => [e.date ? fmtDate(e.date) : '', e.category || '', e.description, e.amount, e.payee || '']), [3], [0]), 'Expenses');
    X.utils.book_append_sheet(wb, sheet(`${shopName} — Inventory`, ['Name', 'SKU', 'Category', 'Sell Price', 'Stock', 'Min Stock'],
      (state.inventory || []).filter(i => i.name).map(i => [i.name, i.sku || '', i.category || '', i.sellPrice, i.stock || 0, i.minStock || 5]), [3, 4, 5], []), 'Inventory');
    X.utils.book_append_sheet(wb, sheet(`${shopName} — Suppliers`, ['Name', 'Contact', 'Email', 'Category', 'Address'],
      (state.suppliers || []).filter(s => s.name).map(s => [s.name, s.contact || '', s.email || '', s.category || '', s.address || ''])), 'Suppliers');
    X.utils.book_append_sheet(wb, sheet(`${shopName} — Purchase Orders`, ['PO No', 'Supplier', 'Date', 'Items', 'Total', 'Status'],
      (state.purchaseOrders || []).filter(po => po.poNo).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).map(po => [po.poNo, po.supplierName || '', po.date ? fmtDate(po.date) : '', (po.items || []).map(i => `${i.name || ''} x${i.qty || 0}`).join('; '), po.total, po.status || '']), [4], [2, 5]), 'Purchase Orders');
    X.writeFile(wb, `ShopLedgerPH_Report_${today()}.xlsx`);
    toast('Excel (.xlsx) exported');
  } catch (e) { toast('Export error: ' + e.message, 'error'); }
}

function csvEscape(v) {
  const s = String(v == null ? '' : v);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

function csvDownload(filename, headers, rows) {
  const csv = [headers.map(csvEscape).join(','), ...rows.map(r => r.map(csvEscape).join(','))].join('\r\n');
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// Shared "Microsoft Excel table" design for every .xlsx download: Calibri, green
// banded header, gray gridlines, light-green banded rows, fitted columns, filter.
// Mirrors the .excel-table print CSS so screen, print, PDF and Excel all match.
const XL_GREEN = '217346';
const XL_GRID = 'BFBFBF';
const XL_BAND = 'E2EFDA';
function xlThinBorder() {
  const s = { style: 'thin', color: { rgb: XL_GRID } };
  return { top: s, bottom: s, left: s, right: s };
}
function xlFont(bold) {
  return { name: 'Calibri', sz: 11, bold: !!bold, color: { rgb: '000000' } };
}
// True only when the loaded XLSX engine supports the styling APIs (encode_cell,
// encode_range). Partial shims (e.g. the smoke-test stub) get plain sheets instead
// of a crash — styling is enhancement, never a hard requirement.
function xlsxCanStyle(X) {
  return !!(X && X.utils && typeof X.utils.encode_cell === 'function' && typeof X.utils.encode_range === 'function');
}
// opts: { title, titleRow=0, headerRow, nDataRows, nCols, numCols=[], centerCols=[],
//         totalRow=null (data-row index to emphasize), headerBg }
function styleXlsxTable(X, ws, opts) {
  if (!xlsxCanStyle(X) || !ws) return;
  const { title, titleRow = 0, headerRow, nDataRows, nCols, numCols = [], centerCols = [], totalRow = null, headerBg = XL_GREEN } = opts;
  const border = xlThinBorder();
  if (title) {
    const addr = X.utils.encode_cell({ r: titleRow, c: 0 });
    if (!ws[addr]) ws[addr] = { t: 's', v: '' };
    ws[addr].s = { font: { name: 'Calibri', sz: 14, bold: true, color: { rgb: XL_GREEN } }, alignment: { horizontal: 'center', vertical: 'center' } };
    ws['!merges'] = [...(ws['!merges'] || []), { s: { r: titleRow, c: 0 }, e: { r: titleRow, c: nCols - 1 } }];
    ws['!rows'] = ws['!rows'] || [];
    ws['!rows'][titleRow] = { hpt: 24 };
  }
  for (let c = 0; c < nCols; c++) {
    const addr = X.utils.encode_cell({ r: headerRow, c });
    if (!ws[addr]) ws[addr] = { t: 's', v: '' };
    ws[addr].s = {
      font: { name: 'Calibri', sz: 11, bold: true, color: { rgb: 'FFFFFF' } },
      fill: { patternType: 'solid', fgColor: { rgb: headerBg } },
      alignment: { horizontal: 'center', vertical: 'center' },
      border
    };
  }
  for (let r = 0; r < nDataRows; r++) {
    const rowIdx = headerRow + 1 + r;
    const isTotal = totalRow != null && r === totalRow;
    for (let c = 0; c < nCols; c++) {
      const addr = X.utils.encode_cell({ r: rowIdx, c });
      if (!ws[addr]) ws[addr] = { t: 's', v: '' };
      const s = { font: xlFont(isTotal), border: isTotal
        ? { top: { style: 'medium', color: { rgb: XL_GREEN } }, bottom: border.bottom, left: border.left, right: border.right }
        : border };
      if (!isTotal && r % 2 === 1) s.fill = { patternType: 'solid', fgColor: { rgb: XL_BAND } };
      if (numCols.includes(c)) { s.alignment = { horizontal: 'right' }; ws[addr].z = '#,##0.00'; }
      else if (centerCols.includes(c)) s.alignment = { horizontal: 'center' };
      ws[addr].s = s;
    }
  }
  const lastRow = headerRow + Math.max(nDataRows, 1);
  ws['!autofilter'] = { ref: X.utils.encode_range({ s: { r: headerRow, c: 0 }, e: { r: lastRow, c: nCols - 1 } }) };
}

function xlsxColWidths(headers, rows, title) {
  return headers.map((h, i) => {
    const contentLen = rows.length ? Math.max(...rows.map(r => String(r[i] ?? '').length)) : 0;
    const titleShare = title ? Math.ceil(title.length / headers.length) : 0;
    return { wch: Math.min(Math.max(String(h).length, contentLen, titleShare) + 2, 45) };
  });
}

export function exportFormattedXlsx(filename, headers, rows, options = {}) {
  const X = window.XLSX;
  if (!X || !X.utils || typeof X.writeFile !== 'function') { toast('Excel library not loaded', 'error'); return; }
  const title = options.title || '';
  const headerRow = title ? 1 : 0;
  const ws = X.utils.aoa_to_sheet(title ? [[title], headers, ...rows] : [headers, ...rows]);
  styleXlsxTable(X, ws, {
    title, titleRow: 0, headerRow,
    nDataRows: rows.length, nCols: headers.length,
    numCols: options.numCols || [], centerCols: options.centerCols || [],
    totalRow: options.totalRow != null ? options.totalRow : null,
    headerBg: (options.headerStyle && options.headerStyle.bg) || XL_GREEN
  });
  ws['!cols'] = xlsxColWidths(headers, rows, title);
  const wb = X.utils.book_new();
  X.utils.book_append_sheet(wb, ws, options.sheetName || 'Sheet1');
  X.writeFile(wb, filename);
  if (options.toast !== false) toast('Excel (.xlsx) exported', 'success');
}

export async function exportAccountingCSV() {
  try {
    await Promise.all([dbLoad('transactions'), dbLoad('payments'), dbLoad('expenses'), dbLoad('inventory')]);
    const txs = filterByYear(state.transactions, 'date').filter(t => t.status !== 'voided' && t.status !== 'interest');
    const pays = filterByYear(state.payments, 'date');
    const exps = filterByYear(state.expenses, 'date');
    const settingsMap = {};
    state.settings.forEach(s => settingsMap[s.key] = s.value);
    const shopName = settingsMap['shopName'] || 'ShopLedgerPH';

    const txRows = txs.filter(t => t.invoiceNo).sort((a, b) => new Date(a.date) - new Date(b.date)).map(t => [
      t.date || '', 'Invoice', t.invoiceNo, t.clientName || 'Walk-in',
      '', (t.grandTotal || 0).toFixed(2), '', t.paymentMethod || 'Cash', t.notes || ''
    ]);
    csvDownload(`${shopName}_Transactions_${today()}.csv`,
      ['Date', 'Type', 'Reference', 'Payee/Client', 'Account', 'Amount', 'Category', 'Payment Method', 'Memo'],
      txRows);

    const payRows = pays.sort((a, b) => new Date(a.date) - new Date(b.date)).map(p => [
      p.date || '', 'Payment', '', p.clientName || '',
      'Accounts Receivable', (p.amount || 0).toFixed(2), '', p.type || '', p.notes || ''
    ]);
    csvDownload(`${shopName}_Payments_${today()}.csv`,
      ['Date', 'Type', 'Reference', 'Payee/Client', 'Account', 'Amount', 'Category', 'Payment Type', 'Memo'],
      payRows);

    const expRows = exps.sort((a, b) => new Date(a.date) - new Date(b.date)).map(e => [
      e.date || '', 'Expense', '', e.payee || '',
      e.category || 'General', (e.amount || 0).toFixed(2), e.category || '', '', e.description || ''
    ]);
    csvDownload(`${shopName}_Expenses_${today()}.csv`,
      ['Date', 'Type', 'Reference', 'Payee/Client', 'Account', 'Amount', 'Category', 'Payment Method', 'Memo'],
      expRows);

    toast('Accounting CSVs exported (3 files)');
  } catch (e) { toast('Export error: ' + e.message, 'error'); }
}

export async function exportPDF() {
  await Promise.all([dbLoad('clients'), dbLoad('transactions'), dbLoad('payments'), dbLoad('expenses'), dbLoad('inventory'), dbLoad('suppliers'), dbLoad('purchaseOrders')]);
  const pdfTx = filterByYear(state.transactions, 'date').filter(t => t.status !== 'voided' && t.status !== 'interest');
  const pdfEx = filterByYear(state.expenses, 'date');
  const pdfPay = filterByYear(state.payments, 'date');
  const totalRevenue = pdfTx.reduce((s, t) => s + (t.grandTotal || 0), 0);
  const totalRefunds = pdfTx.filter(t => t.status === 'return').reduce((s, t) => s + Math.abs(t.grandTotal || 0), 0);
  const invCost = new Map((state.inventory || []).map(i => [i.id, i.costPrice || 0]));
  const totalCOGS = cogsOf(pdfTx, invCost);
  const totalExpenses = pdfEx.reduce((s, e) => s + (e.amount || 0), 0);
  const netProfit = totalRevenue - totalCOGS - totalExpenses;
  const totalUtang = state.clients.reduce((s, c) => s + (c.balance || 0), 0);
  const totalPayments = pdfPay.reduce((s, p) => s + (p.amount || 0), 0);

  function fmt(n) { return '₱'+Number(n||0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }

  let html = `<div class="print-summary">
    <div class="card green"><span class="lbl">Revenue</span><span class="val">${fmt(totalRevenue)}</span></div>
    <div class="card orange"><span class="lbl">Cost of Goods</span><span class="val">${fmt(totalCOGS)}</span></div>
    <div class="card orange"><span class="lbl">Refunds</span><span class="val">${fmt(totalRefunds)}</span></div>
    <div class="card red"><span class="lbl">Expenses</span><span class="val">${fmt(totalExpenses)}</span></div>
    <div class="card ${netProfit>=0?'blue':'red'}"><span class="lbl">Net Profit</span><span class="val">${fmt(netProfit)}</span></div>
    <div class="card orange"><span class="lbl">Outstanding Debts</span><span class="val">${fmt(totalUtang)}</span></div>
    <div class="card blue"><span class="lbl">Payments Collected</span><span class="val">${fmt(totalPayments)}</span></div>
  </div>`;

  function tbl(title, headers, rows) {
    if (!rows || rows.length === 0) return `<table class="print-table"><caption>${escHtml(title)} <span style="font-weight:400;color:#94a3b8">(0)</span></caption></table>`;
    const h = headers.map(h => `<th${h.align?' class="'+h.align+'"':''}>${escHtml(h.label)}</th>`).join('');
    const r = rows.map((row, i) => `<tr>${row.map((c,ci) => `<td${headers[ci]&&headers[ci].align?' class="'+headers[ci].align+'"':''}>${c}</td>`).join('')}</tr>`).join('');
    return `<table class="print-table"><caption>${escHtml(title)} <span style="font-weight:400;color:#94a3b8">(${rows.length})</span></caption><thead><tr>${h}</tr></thead><tbody>${r}</tbody></table>`;
  }

  function sec(h, first) { return (first ? '' : '<div style="page-break-before:always;margin-top:0"></div>') + h; }

  html += sec(tbl('Clients', [{label:'Name'},{label:'Phone'},{label:'Address'},{label:'Balance',align:'num'},{label:'Due Date',align:'ctr'}],
    state.clients.map(c => [escHtml(c.name), escHtml(c.phone||''), escHtml(c.address||''), fmt(c.balance), c.dueDate ? fmtDate(c.dueDate) : ''])), true);

  const pdfTxns = pdfTx.sort((a,b) => new Date(b.createdAt)-new Date(a.createdAt));
  html += sec(tbl('Transactions', [{label:'Invoice'},{label:'Date',align:'ctr'},{label:'Client'},{label:'Total',align:'num'},{label:'Payment',align:'ctr'},{label:'Status',align:'ctr'}],
    pdfTxns.map(t => [escHtml(t.invoiceNo||''), escHtml(fmtDate(t.date)), escHtml(t.clientName||'Walk-in'), fmt(t.grandTotal), escHtml(t.paymentMethod||''), escHtml(t.status||'')])));

  html += sec(tbl('Payments', [{label:'Date',align:'ctr'},{label:'Client'},{label:'Amount',align:'num'},{label:'Type',align:'ctr'},{label:'Notes'}],
    pdfPay.sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt)).map(p => [escHtml(fmtDate(p.date)), escHtml(p.clientName||''), fmt(p.amount), escHtml(p.type||''), escHtml(p.notes||'')])));

  html += sec(tbl('Expenses', [{label:'Date',align:'ctr'},{label:'Category'},{label:'Description'},{label:'Amount',align:'num'},{label:'Payee'}],
    pdfEx.sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt)).map(e => [escHtml(fmtDate(e.date)), escHtml(e.category||''), escHtml(e.description||''), fmt(e.amount), escHtml(e.payee||'')])));

  html += sec(tbl('Inventory', [{label:'Name'},{label:'SKU'},{label:'Category'},{label:'Price',align:'num'},{label:'Stock',align:'num'},{label:'Min',align:'num'}],
    state.inventory.map(i => [escHtml(i.name||''), escHtml(i.sku||''), escHtml(i.category||''), fmt(i.sellPrice), i.stock||0, i.minStock||5])));

  html += sec(tbl('Suppliers', [{label:'Name'},{label:'Contact'},{label:'Email'},{label:'Category'},{label:'Address'}],
    state.suppliers.map(s => [escHtml(s.name||''), escHtml(s.contact||''), escHtml(s.email||''), escHtml(s.category||''), escHtml(s.address||'')])));

  html += sec(tbl('Purchase Orders', [{label:'PO No'},{label:'Supplier'},{label:'Date',align:'ctr'},{label:'Total',align:'num'},{label:'Status',align:'ctr'}],
    state.purchaseOrders.sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt)).map(po => [escHtml(po.poNo||''), escHtml(po.supplierName||''), escHtml(fmtDate(po.date)), fmt(po.total), escHtml(po.status||'')])));

  openPrintWindow('Business Report', 1100, 800, html);
}

export async function backupJSON() {
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

export async function encryptedBackupFlow() {
  if (!window.electronAPI) { toast('Encrypted backup only available in desktop app', 'warning'); return; }
  modal(`
    <div class="p-6">
      <div class="flex justify-between items-center mb-4"><h3 class="text-xl font-bold flex items-center gap-2"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="shrink-0"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>Encrypted Backup</h3><button onclick="closeModal()" class="text-gray-400 hover:text-gray-600"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button></div>
      <div class="space-y-3">
        <p class="text-sm text-gray-500">Create an encrypted backup file with a password.</p>
        <input id="eb-password" type="password" placeholder="Enter password" class="w-full px-3 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800" />
        <input id="eb-confirm" type="password" placeholder="Confirm password" class="w-full px-3 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800" />
        <button onclick="doEncryptedBackup()" class="w-full py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="inline-block mr-1 -mt-0.5"><polyline points="20 6 9 17 4 12"/></svg>Create Encrypted Backup</button>
      </div>
    </div>`);
}

export async function doEncryptedBackup() {
  if (!window.electronAPI) { toast('Encrypted backup only available in desktop app', 'warning'); return; }
  const pw = document.getElementById('eb-password')?.value;
  const confirm = document.getElementById('eb-confirm')?.value;
  if (!pw || pw !== confirm) { toast('Passwords do not match', 'error'); return; }
  const data = await getAllData();
  try {
    const result = await window.electronAPI.saveEncryptedBackup(data, pw, `backup-encrypted-${today()}.enc`);
    if (result.success) { toast('Encrypted backup saved'); closeModal(); }
    else toast('Error: ' + (result.error || 'Unknown'), 'error');
  } catch (e) { toast('Error: ' + e.message, 'error'); }
}

export async function fileBackupFlow() {
  if (!window.electronAPI) { toast('File backup only available in desktop app', 'warning'); return; }
  const data = await getAllData();
  try {
    const result = await window.electronAPI.saveBackupFile(data, `backup-${today()}.json`);
    if (result.success) toast('File backup saved');
    else toast('Error: ' + (result.error || 'Unknown'), 'error');
  } catch (e) { toast('Error: ' + e.message, 'error'); }
}

export async function emailBackupFlow() {
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

export function showRestoreModal() {
  modal(`
    <div class="p-6">
      <div class="flex justify-between items-center mb-4"><h3 class="text-xl font-bold">Restore Backup</h3><button onclick="closeModal()" class="text-gray-400 hover:text-gray-600"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button></div>
      <p class="text-sm text-gray-500 mb-4">This will <strong>overwrite all current data</strong>. Export a backup first if needed.</p>
      <div class="space-y-3">
        <button onclick="closeModal();restoreJSONFlow()" class="w-full py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="inline-block mr-1 -mt-0.5"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>Restore from JSON Backup</button>
        <button onclick="closeModal();restoreEncryptedFlow()" class="w-full py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 font-semibold"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="inline-block mr-1 -mt-0.5"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>Restore from Encrypted Backup</button>
      </div>
    </div>`);
}

export async function restoreJSONFlow() {
  if (!window.electronAPI) { toast('Restore only available in desktop app', 'warning'); return; }
  if (!await confirmModal('This will replace ALL data. Continue?')) return;
  const result = await window.electronAPI.loadBackupFile();
  if (!result.success) return;
  const data = result.data;
  if (!data || typeof data !== 'object') { toast('Invalid backup file', 'error'); return; }
  try {
    const r = await window.electronAPI.importJsonDump(data);
    if (!r || !r.success) { toast('Restore failed: ' + ((r && r.error) || 'unknown'), 'error'); return; }
    toast('Data restored successfully', 'success');
    await loadAll();
    await logAudit('backup', 'Data restored from JSON backup');
  } catch (e) { toast('Restore error: ' + e.message, 'error'); }
}

export async function restoreEncryptedFlow() {
  if (!window.electronAPI) { toast('Restore only available in desktop app', 'warning'); return; }
  if (!await confirmModal('This will replace ALL data. Continue?')) return;
  if (_restoreResolve) { toast('Restore already in progress', 'warning'); return; }
  const pw = await new Promise(resolve => {
    _restoreResolve = resolve;
    modal(`
      <div class="p-6">
        <div class="flex justify-between items-center mb-4"><h3 class="text-xl font-bold">Decrypt Backup</h3><button onclick="closeModal()" class="text-gray-400 hover:text-gray-600"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button></div>
        <p class="text-sm text-gray-500 mb-3">Enter the encryption password, then select the .enc file.</p>
        <input id="rb-password" type="password" placeholder="Encryption password" class="w-full px-3 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 mb-3" />
        <button onclick="document.getElementById('rb-password').value ? window._restorePwSubmit() : null" class="w-full py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="inline-block mr-1 -mt-0.5"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>Select File & Decrypt</button>
      </div>`);
    window._restorePwSubmit = () => {
      const pw = document.getElementById('rb-password').value;
      closeModal();
      if (_restoreResolve) _restoreResolve(pw);
    };
  });
  _restoreResolve = null;
  delete window._restorePwSubmit;
  if (!pw) { toast('Password required', 'error'); return; }
  const fileResult = await window.electronAPI.loadEncryptedBackup();
  if (!fileResult.success) return;
  try {
    const decryptResult = await window.electronAPI.decryptBackupData(fileResult.data, pw);
    if (!decryptResult.success) { toast('Decryption failed: ' + (decryptResult.error || 'Wrong password?'), 'error'); return; }
    const data = decryptResult.data;
    const stores = ['clients','transactions','payments','inventory','quickItems','settings','users','expenses','suppliers','purchaseOrders','supplierPayments','notifications','auditLogs','balanceSnapshots'];
    await Promise.all(stores.map(s => dbClear(s)));
    for (const store of stores) {
      const items = data[store];
      if (items && Array.isArray(items)) {
        for (const item of items) await dbPut(store, item);
      }
    }
    toast('Data restored successfully', 'success');
    await loadAll();
    await logAudit('backup', 'Data restored from encrypted backup');
  } catch (e) { toast('Restore error: ' + e.message, 'error'); }
}

export async function signalLanUpdate() {
  if (!window.electronAPI) { toast('LAN signaling only available in desktop app', 'warning'); return; }
  if (!await confirmModal('Send update signal to all computers on the LAN?')) return;
  window.electronAPI.signalLanUpdate();
  toast('Update signal sent to LAN', 'success');
}

export function showInventoryValuation() {
  const settingsMap = {};
  state.settings.forEach(s => settingsMap[s.key] = s.value);
  const method = settingsMap['inventoryValuationMethod'] || 'fifo';
  const invCost = new Map((state.inventory || []).map(i => [i.id, i.costPrice || 0]));
  const result = calculateInventoryValue(method);
  if (!result || !result.breakdown) { toast('Inventory valuation unavailable', 'error'); return; }
  const rows = result.breakdown.filter(i => i.qty > 0).sort((a, b) => b.totalValue - a.totalValue);
  function fmt(n) { return '₱' + Number(n || 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
  const rowsHtml = rows.map(i => `<tr class="border-b dark:border-gray-700"><td class="p-2">${escHtml(i.name)}</td><td class="p-2 text-right">${i.qty}</td><td class="p-2 text-right">${fmt(i.unitCost)}</td><td class="p-2 text-right font-semibold">${fmt(i.totalValue)}</td></tr>`).join('');
  modal(`<div class="p-4 flex flex-col" style="min-height:60vh">
    <div class="flex justify-between items-center mb-3 shrink-0">
      <div><h3 class="text-xl font-bold">Inventory Valuation</h3><p class="text-xs text-gray-500">Method: ${escHtml(result.method)}</p></div>
      <button onclick="closeModal()" class="text-gray-400 hover:text-gray-600"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
    </div>
    <div class="mb-3 shrink-0 bg-cyan-50 dark:bg-cyan-900/20 rounded-lg p-3 flex items-center justify-between"><span class="text-sm font-semibold">Total Inventory Value</span><span class="text-xl font-bold text-cyan-600">${fmt(result.total)}</span></div>
    <div class="flex-1 overflow-auto min-h-0">
      <table class="w-full text-sm"><thead><tr class="bg-gray-50 dark:bg-gray-700 text-xs uppercase tracking-wide sticky top-0"><th class="p-2 text-left">Item</th><th class="p-2 text-right">Qty</th><th class="p-2 text-right">Unit Cost</th><th class="p-2 text-right">Total Value</th></tr></thead>
      <tbody>${rowsHtml || '<tr><td class="p-4 text-center text-gray-400" colspan="4">No items in inventory</td></tr>'}</tbody></table>
    </div>
  </div>`);
}

export function viewAuditLog() {
  const q = document.getElementById('al-search')?.value?.toLowerCase() || '';
  const filtered = (state.auditLogs || []).filter(e =>
    !q || e.action?.toLowerCase().includes(q) || (e.details || '').toLowerCase().includes(q) || (e.user || '').toLowerCase().includes(q)
  );
  const sorted = [...filtered].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));

  function render() {
    const { items, page, totalPages } = paginate(sorted, 'log');
    const rows = items.map(e => {
      const actionColors = { sale: 'text-green-600', 'sale-edit': 'text-blue-600', expense: 'text-red-500', payment: 'text-green-500', inventory: 'text-amber-600', 'interest': 'text-purple-600', backup: 'text-gray-500', 'user-login': 'text-cyan-600', 'user-logout': 'text-gray-400' };
      const color = Object.entries(actionColors).find(([k]) => e.action?.startsWith(k))?.[1] || 'text-gray-600';
      return `<tr class="border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50"><td class="p-2 whitespace-nowrap text-xs text-gray-500">${escHtml(e.date || '')}</td><td class="p-2 whitespace-nowrap text-xs text-gray-500">${e.createdAt ? escHtml(e.createdAt.replace('T',' ').slice(0,16)) : ''}</td><td class="p-2 text-xs"><span class="font-semibold ${color}">${escHtml(e.action || '')}</span></td><td class="p-2 text-xs text-gray-600 max-w-[300px] overflow-hidden text-ellipsis whitespace-nowrap" title="${escapeHtml(e.details||'')}">${escHtml(e.details || '')}</td><td class="p-2 text-xs text-gray-500">${escHtml(e.user || '')}</td></tr>`;
    }).join('');

    modal(`<div class="p-4 flex flex-col" style="min-height:70vh">
      <div class="flex justify-between items-center mb-3 shrink-0">
        <h3 class="text-xl font-bold">Audit Log (${sorted.length})</h3>
        <button onclick="closeModal()" class="text-gray-400 hover:text-gray-600"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
      </div>
      <div class="mb-2 shrink-0"><input id="al-search" type="text" placeholder="Search action, details, user..." value="${escHtml(q)}" oninput="viewAuditLog()" class="w-full px-3 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm" /></div>
      <div class="flex-1 overflow-auto min-h-0">
        <table class="w-full text-sm"><thead><tr class="bg-gray-50 dark:bg-gray-700 text-xs uppercase tracking-wide sticky top-0"><th class="p-2 text-left">Date</th><th class="p-2 text-left">Time</th><th class="p-2 text-left">Action</th><th class="p-2 text-left">Details</th><th class="p-2 text-left">User</th></tr></thead>
        <tbody>${rows || '<tr><td class="p-4 text-center text-gray-400" colspan="5">No audit log entries</td></tr>'}</tbody></table>
      </div>
      ${renderPagination('log', page, totalPages)}
    </div>`);
  }
  render();
}

export function showBIRFormSelector() {
  const now = new Date();
  const currentMonth = String(now.getMonth() + 1).padStart(2, '0');
  const currentYear = now.getFullYear();
  const currentQuarter = Math.ceil((now.getMonth() + 1) / 3);
  
  modal(`
    <div class="p-6">
      <div class="flex justify-between items-center mb-4">
        <h3 class="text-xl font-bold flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="shrink-0"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
          BIR Tax Forms
        </h3>
        <button onclick="closeModal()" class="text-gray-400 hover:text-gray-600">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <div class="space-y-4">
        <div class="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
          <h4 class="font-semibold text-blue-800 dark:text-blue-200 mb-2">BIR Form 2550M (Monthly VAT Return)</h4>
          <p class="text-sm text-blue-600 dark:text-blue-300 mb-3">For VAT-registered businesses. Export monthly VAT summary.</p>
          <div class="flex gap-2 items-end">
            <div>
              <label class="text-xs text-gray-500 block mb-1">Month</label>
              <select id="bir-month" class="px-3 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm">
                ${['01','02','03','04','05','06','07','08','09','10','11','12'].map(m => 
                  `<option value="${m}" ${m === currentMonth ? 'selected' : ''}>${new Date(2000, parseInt(m)-1).toLocaleString('en-PH', {month:'long'})}</option>`
                ).join('')}
              </select>
            </div>
            <div>
              <label class="text-xs text-gray-500 block mb-1">Year</label>
              <input id="bir-year" type="number" value="${currentYear}" class="px-3 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm w-24" />
            </div>
            <button onclick="exportBIR2550M()" class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="inline-block mr-1 -mt-0.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Export CSV
            </button>
          </div>
        </div>
        
        <div class="bg-green-50 dark:bg-green-900/20 p-4 rounded-lg">
          <h4 class="font-semibold text-green-800 dark:text-green-200 mb-2">BIR Form 2551Q (Quarterly Percentage Tax Return)</h4>
          <p class="text-sm text-green-600 dark:text-green-300 mb-3">For non-VAT registered businesses (3% percentage tax).</p>
          <div class="flex gap-2 items-end">
            <div>
              <label class="text-xs text-gray-500 block mb-1">Quarter</label>
              <select id="bir-quarter" class="px-3 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm">
                <option value="1" ${currentQuarter === 1 ? 'selected' : ''}>Q1 (Jan-Mar)</option>
                <option value="2" ${currentQuarter === 2 ? 'selected' : ''}>Q2 (Apr-Jun)</option>
                <option value="3" ${currentQuarter === 3 ? 'selected' : ''}>Q3 (Jul-Sep)</option>
                <option value="4" ${currentQuarter === 4 ? 'selected' : ''}>Q4 (Oct-Dec)</option>
              </select>
            </div>
            <div>
              <label class="text-xs text-gray-500 block mb-1">Year</label>
              <input id="bir-qyear" type="number" value="${currentYear}" class="px-3 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm w-24" />
            </div>
            <button onclick="exportBIR2551Q()" class="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-semibold">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="inline-block mr-1 -mt-0.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Export CSV
            </button>
          </div>
        </div>
      </div>
    </div>
  `);
}

export async function exportBIR2550M() {
  try {
    await dbLoad('transactions');
    const month = document.getElementById('bir-month')?.value || String(new Date().getMonth() + 1).padStart(2, '0');
    const year = document.getElementById('bir-year')?.value || new Date().getFullYear();
    const monthKey = `${year}-${month}`;
    
    const vatRate = parseFloat(state.settings.find(s => s.key === 'vatRate')?.value) || VAT_RATE;
    const settingsMap = {};
    state.settings.forEach(s => settingsMap[s.key] = s.value);
    const businessTin = settingsMap['businessTin'] || '';
    const vatRegNo = settingsMap['vatRegNo'] || '';
    
    const txs = filterByYear(state.transactions, 'date').filter(t => 
      t.status !== 'voided' && t.status !== 'interest' && t.status !== 'return' &&
      (t.date || '').startsWith(monthKey)
    );
    
    let taxableSales = 0;
    let zeroRatedSales = 0;
    let exemptSales = 0;
    
    for (const t of txs) {
      const grandTotal = t.grandTotal || 0;
      if (t.vatAmount > 0) {
        taxableSales += grandTotal;
      } else if (t.vatExclusive === 0 && t.vatAmount === 0) {
        exemptSales += grandTotal;
      } else {
        zeroRatedSales += grandTotal;
      }
    }
    
    const netTaxable = taxableSales / (1 + vatRate);
    const vatOutput = Math.round((taxableSales - netTaxable) * 100) / 100;
    const totalSales = taxableSales + zeroRatedSales + exemptSales;
    
    const headers = [
      'TIN',
      'VAT Reg No',
      'Return Period',
      'Taxable Sales (Net of VAT)',
      'VAT Output (12%)',
      'Zero-Rated Sales',
      'Exempt Sales',
      'Total Sales',
      'Number of Transactions'
    ];
    
    const rows = [
      [
        businessTin,
        vatRegNo,
        `${year}-${month}`,
        taxableSales.toFixed(2),
        vatOutput.toFixed(2),
        zeroRatedSales.toFixed(2),
        exemptSales.toFixed(2),
        totalSales.toFixed(2),
        txs.length
      ]
    ];
    
    csvDownload(`BIR_2550M_${year}_${month}.csv`, headers, rows);
    toast('BIR Form 2550M exported', 'success');
  } catch (e) { toast('Export error: ' + e.message, 'error'); }
}

export function exportLandscapePdf(filename, title, headers, rows) {
  if (typeof XLSX === 'undefined') { toast('PDF library not loaded', 'error'); return; }

  let html = `<!DOCTYPE html><html><head><style>
    @page { size: landscape; margin: 1cm; }
    body { font-family: Calibri, 'Segoe UI', Arial, sans-serif; color: #000; background: #fff; }
    ${excelTableCss()}
    .footer { margin-top: 16px; font-size: 9pt; color: #595959; text-align: right; }
  </style></head><body>
    <div class="excel-sheet-head">
      <div class="excel-sheet-title">${escapeHtml(title)}</div>
      <div class="excel-sheet-sub">Generated: ${new Date().toLocaleDateString()}</div>
    </div>
    <table class="excel-table">
      <thead><tr>${headers.map(h => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead>
      <tbody>${rows.map(row => `<tr>${row.map(cell => `<td>${escapeHtml(String(cell ?? ''))}</td>`).join('')}</tr>`).join('')}</tbody>
    </table>
    <div class="footer">Shop Ledger PH</div>
  </body></html>`;

  if (window.electronAPI) {
    window.electronAPI.printStatement(html);
  }
}

export async function exportBIR2551Q() {
  try {
    await dbLoad('transactions');
    const quarter = parseInt(document.getElementById('bir-quarter')?.value || '1');
    const year = document.getElementById('bir-qyear')?.value || new Date().getFullYear();
    
    const quarterMonths = {
      1: ['01', '02', '03'],
      2: ['04', '05', '06'],
      3: ['07', '08', '09'],
      4: ['10', '11', '12']
    };
    const months = quarterMonths[quarter] || [];
    
    const settingsMap = {};
    state.settings.forEach(s => settingsMap[s.key] = s.value);
    const businessTin = settingsMap['businessTin'] || '';
    
    const txs = filterByYear(state.transactions, 'date').filter(t => 
      t.status !== 'voided' && t.status !== 'interest' && t.status !== 'return' &&
      months.some(m => (t.date || '').startsWith(`${year}-${m}`))
    );
    
    let grossSales = 0;
    for (const t of txs) {
      grossSales += t.grandTotal || 0;
    }
    
    const percentageTax = Math.round(grossSales * 0.03 * 100) / 100;
    
    const headers = [
      'TIN',
      'Return Period',
      'Quarter',
      'Gross Sales',
      'Percentage Tax (3%)',
      'Number of Transactions'
    ];
    
    const rows = [
      [
        businessTin,
        `${year}-Q${quarter}`,
        `Q${quarter} ${year}`,
        grossSales.toFixed(2),
        percentageTax.toFixed(2),
        txs.length
      ]
    ];
    
    csvDownload(`BIR_2551Q_${year}_Q${quarter}.csv`, headers, rows);
    toast('BIR Form 2551Q exported', 'success');
  } catch (e) { toast('Export error: ' + e.message, 'error'); }
}


export function showSalesByClient() {
  const activeTx = state.transactions.filter(t => t.status !== 'voided' && t.status !== 'interest' && t.status !== 'return');
  const clientMap = {};
  activeTx.forEach(t => {
    const cid = t.clientId || 'walkin';
    const cname = t.clientName || 'Walk-in';
    if (!clientMap[cid]) clientMap[cid] = { name: cname, count: 0, total: 0 };
    clientMap[cid].count++;
    clientMap[cid].total += t.grandTotal || 0;
  });
  const rows = Object.values(clientMap).sort((a, b) => b.total - a.total);
  if (rows.length === 0) { toast('No sales data', 'info'); return; }
  const totalAll = rows.reduce((s, r) => s + r.total, 0);
  modal(`<div class="p-4 flex flex-col" style="min-height:60vh">
    <div class="flex justify-between items-center mb-3 shrink-0">
      <h3 class="text-xl font-bold">Sales by Client (${rows.length})</h3>
      <button onclick="closeModal()" class="text-gray-400 hover:text-gray-600"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
    </div>
    <div class="flex-1 overflow-auto min-h-0">
      <table class="w-full text-sm"><thead><tr class="bg-gray-50 dark:bg-gray-700 text-xs uppercase tracking-wide sticky top-0"><th class="p-2 text-left">Client</th><th class="p-2 text-center">Sales</th><th class="p-2 text-right">Total Amount</th><th class="p-2 text-right">Avg Order</th></tr></thead>
        <tbody>${rows.map(r => `<tr class="border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50"><td class="p-2 font-medium">${escHtml(r.name)}</td><td class="p-2 text-center">${r.count}</td><td class="p-2 text-right font-semibold">${peso(r.total)}</td><td class="p-2 text-right text-gray-500">${peso(r.total / r.count)}</td></tr>`).join('')}
        </tbody>
        <tfoot><tr class="bg-gray-50 dark:bg-gray-700 font-bold"><td class="p-2">Total</td><td class="p-2 text-center">${rows.reduce((s, r) => s + r.count, 0)}</td><td class="p-2 text-right">${peso(totalAll)}</td><td class="p-2 text-right text-gray-500">${peso(rows.length > 0 ? totalAll / rows.reduce((s, r) => s + r.count, 0) : 0)}</td></tr></tfoot>
      </table>
    </div>
  </div>`);
}

export function showARAging() {
  const todayMs = new Date(today()).getTime();
  const clientsWithDebt = state.clients.filter(c => (c.balance || 0) > 0);
  if (clientsWithDebt.length === 0) { toast('No outstanding AR balances', 'info'); return; }
  const buckets = { current: { label: 'Current (0-30 days)', total: 0, clients: [] }, '31-60': { label: '31-60 days', total: 0, clients: [] }, '61-90': { label: '61-90 days', total: 0, clients: [] }, '90+': { label: '90+ days', total: 0, clients: [] } };
  clientsWithDebt.forEach(c => {
    const dueMs = c.dueDate ? new Date(c.dueDate).getTime() : todayMs;
    const daysOver = Math.max(0, Math.floor((todayMs - dueMs) / 86400000));
    let bucket;
    if (daysOver <= 0) bucket = 'current';
    else if (daysOver <= 30) bucket = 'current';
    else if (daysOver <= 60) bucket = '31-60';
    else if (daysOver <= 90) bucket = '61-90';
    else bucket = '90+';
    buckets[bucket].total += c.balance || 0;
    buckets[bucket].clients.push({ name: c.name, balance: c.balance || 0, dueDate: c.dueDate || '', daysOver });
  });
  Object.values(buckets).forEach(b => b.clients.sort((a, b) => b.balance - a.balance));
  const totalDebt = clientsWithDebt.reduce((s, c) => s + (c.balance || 0), 0);
  modal(`<div class="p-4 flex flex-col" style="min-height:60vh">
    <div class="flex justify-between items-center mb-3 shrink-0">
      <h3 class="text-xl font-bold">AR Aging Report</h3>
      <button onclick="closeModal()" class="text-gray-400 hover:text-gray-600"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
    </div>
    <div class="grid grid-cols-4 gap-2 mb-3 shrink-0">
      <div class="bg-gray-50 dark:bg-gray-700 p-2 rounded-lg text-center"><p class="text-xs text-gray-500">Current</p><p class="text-lg font-bold text-green-600">${peso(buckets.current.total)}</p></div>
      <div class="bg-gray-50 dark:bg-gray-700 p-2 rounded-lg text-center"><p class="text-xs text-gray-500">31-60 days</p><p class="text-lg font-bold text-yellow-600">${peso(buckets['31-60'].total)}</p></div>
      <div class="bg-gray-50 dark:bg-gray-700 p-2 rounded-lg text-center"><p class="text-xs text-gray-500">61-90 days</p><p class="text-lg font-bold text-orange-600">${peso(buckets['61-90'].total)}</p></div>
      <div class="bg-gray-50 dark:bg-gray-700 p-2 rounded-lg text-center"><p class="text-xs text-gray-500">90+ days</p><p class="text-lg font-bold text-red-600">${peso(buckets['90+'].total)}</p></div>
    </div>
    <div class="flex-1 overflow-auto min-h-0">
      ${Object.values(buckets).filter(b => b.clients.length > 0).map(b => `
        <div class="mb-3">
          <h4 class="font-semibold text-sm mb-1">${escHtml(b.label)} — ${peso(b.total)}</h4>
          <table class="w-full text-sm"><thead><tr class="bg-gray-50 dark:bg-gray-700 text-xs uppercase"><th class="p-1 text-left">Client</th><th class="p-1 text-right">Balance</th><th class="p-1 text-center">Due Date</th><th class="p-1 text-right">Days Overdue</th></tr></thead>
            <tbody>${b.clients.map(c => `<tr class="border-b dark:border-gray-700"><td class="p-1">${escHtml(c.name)}</td><td class="p-1 text-right font-semibold">${peso(c.balance)}</td><td class="p-1 text-center text-gray-500">${c.dueDate || '-'}</td><td class="p-1 text-right">${c.daysOver > 0 ? c.daysOver + 'd' : '-'}</td></tr>`).join('')}</tbody>
          </table>
        </div>
      `).join('')}
    </div>
    <div class="shrink-0 border-t dark:border-gray-700 pt-2 mt-2 flex justify-between font-bold text-sm"><span>Total Outstanding AR</span><span class="text-red-600">${peso(totalDebt)}</span></div>
  </div>`);
}


// --- Monthly report: pick any month, get the whole system in one report --------
export function monthlyReportData(monthKey) {
  const [y, m] = monthKey.split('-').map(Number);
  const label = new Date(y, m - 1, 1).toLocaleDateString('en-PH', { month: 'long', year: 'numeric' });
  const txs = (state.transactions || []).filter(t => (t.date || '').startsWith(monthKey) && t.status !== 'voided' && t.status !== 'interest');
  const sales = txs.filter(t => t.status !== 'return');
  const returns = txs.filter(t => t.status === 'return');
  const pays = (state.payments || []).filter(p => (p.date || '').startsWith(monthKey));
  const exps = (state.expenses || []).filter(e => (e.date || '').startsWith(monthKey));
  const invCost = new Map((state.inventory || []).map(i => [i.id, i.costPrice || 0]));
  const revenue = sales.reduce((s, t) => s + (t.grandTotal || 0), 0);
  const refunds = returns.reduce((s, t) => s + Math.abs(t.grandTotal || 0), 0);
  const cogs = cogsOf(sales, invCost);
  const expTotal = exps.reduce((s, e) => s + (e.amount || 0), 0);
  const payTotal = pays.reduce((s, p) => s + (p.amount || 0), 0);
  const profit = revenue - cogs - expTotal;
  const creditSales = sales.filter(t => (t.paymentMethod || 'Cash') !== 'Cash').reduce((s, t) => s + (t.grandTotal || 0), 0);
  const itemAgg = {};
  sales.forEach(t => (t.items || []).forEach(it => {
    const name = it.description || it.name || 'Item';
    const mq = String(it.name || it.qty || '1').match(/^-?[\d.]+/);
    const qty = mq ? parseFloat(mq[0]) : 1;
    const amt = it.amount || (it.unitCost || 0) * qty;
    if (!itemAgg[name]) itemAgg[name] = { name, qty: 0, amount: 0 };
    itemAgg[name].qty += qty;
    itemAgg[name].amount += amt;
  }));
  const topItems = Object.values(itemAgg).sort((a, b) => b.amount - a.amount).slice(0, 10);
  const cliAgg = {};
  sales.forEach(t => {
    const name = t.clientName || 'Walk-in';
    if (!cliAgg[name]) cliAgg[name] = { name, spent: 0, txns: 0 };
    cliAgg[name].spent += t.grandTotal || 0;
    cliAgg[name].txns += 1;
  });
  const topClients = Object.values(cliAgg).sort((a, b) => b.spent - a.spent).slice(0, 10);
  // Balances are live state, so debtors are always "as of today", never month-end.
  const debtors = (state.clients || []).filter(c => (c.balance || 0) > 0)
    .sort((a, b) => (b.balance || 0) - (a.balance || 0))
    .map(c => ({ name: c.name, phone: c.phone || '', balance: c.balance || 0, dueDate: c.dueDate || '' }));
  const debtTotal = debtors.reduce((s, c) => s + c.balance, 0);
  // Collections vs month-opening snapshot: per-client opening, paid-in-month, current.
  const openingSnap = (state.balanceSnapshots || []).find(s => s.month === monthKey) || null;
  const openingMap = {};
  (openingSnap?.balances || []).forEach(b => { openingMap[b.id] = b.balance || 0; });
  const paidMap = {};
  pays.forEach(p => { if (p.clientId != null) paidMap[p.clientId] = (paidMap[p.clientId] || 0) + (p.amount || 0); });
  const collections = [];
  const seenColl = new Set();
  const pushColl = (id, name) => {
    const key = (id != null ? 'i:' + id : 'n:' + name);
    if (seenColl.has(key)) return null;
    seenColl.add(key);
    const row = { id, name, opening: 0, paid: 0, current: 0 };
    collections.push(row);
    return row;
  };
  (state.clients || []).forEach(c => {
    const row = pushColl(c.id, c.name);
    if (row) { row.opening = openingMap[c.id] || 0; row.current = c.balance || 0; }
  });
  Object.entries(paidMap).forEach(([id, amt]) => {
    const cid = Number(id);
    let row = collections.find(r => r.id === cid);
    if (!row) {
      const c = (state.clients || []).find(x => x.id === cid);
      row = pushColl(cid, c ? c.name : 'Unknown');
      if (row) row.current = c ? (c.balance || 0) : 0;
    }
    if (row) row.paid = amt;
  });
  pays.forEach(p => {
    if (p.clientId != null) return;
    const nm = p.clientName || 'Walk-in';
    // Name-only payments resolve to the matching client record first so the
    // client never appears twice; only truly unknown names get their own row.
    const known = (state.clients || []).find(c => (c.name || '') === nm);
    if (known) {
      let row = collections.find(r => r.id === known.id);
      if (!row) {
        row = pushColl(known.id, known.name);
        if (row) row.current = known.balance || 0;
      }
      if (row) row.paid += p.amount || 0;
      return;
    }
    let row = collections.find(r => r.id == null && r.name === nm);
    if (!row) row = pushColl(null, nm);
    if (row) row.paid += p.amount || 0;
  });
  const collShown = collections
    .filter(r => r.opening > 0 || r.paid > 0 || r.current > 0)
    .sort((a, b) => b.current - a.current);
  const openingTotal = collShown.reduce((s, r) => s + r.opening, 0);
  const paidTotal = collShown.reduce((s, r) => s + r.paid, 0);
  return { monthKey, label, sales, returns, pays, exps, revenue, refunds, cogs, expTotal, payTotal, profit, creditSales, topItems, topClients, debtors, debtTotal, openingSnap, openingTotal, collections: collShown, paidTotal };
}

export function monthlyReportHtml(d) {
  // Print-safe stat cards (plain CSS, no Tailwind dependency) so the modal and
  // the print window render identically.
  const stat = (label, val, color) => `
    <div class="stat" style="border-left-color:${color}">
      <span class="lbl">${label}</span>
      <span class="val" style="color:${color}">${peso(val)}</span>
    </div>`;
  let html = `<div class="excel-sheet-head"><div class="excel-sheet-title">Monthly Report — ${escHtml(d.label)}</div>
    <div class="excel-sheet-sub">Generated ${fmtDateTime(now())}</div></div>`;
  html += `<div class="excel-stats">`;
  html += stat('Revenue', d.revenue, '#059669') + stat('Refunds', d.refunds, '#c026d3') + stat('Cost of Goods', d.cogs, '#d97706');
  html += stat('Expenses', d.expTotal, '#dc2626') + stat('Net Profit', d.profit, d.profit >= 0 ? '#2563eb' : '#dc2626') + stat('Collected', d.payTotal, '#0d9488');
  html += `</div>`;

  html += `<table class="excel-table"><caption>Sales (${d.sales.length})</caption><thead><tr><th>Invoice</th><th>Date</th><th>Client</th><th class="ctr">Items</th><th class="num">Total</th><th>Payment</th><th class="ctr">Status</th></tr></thead><tbody>`;
  html += d.sales.length ? d.sales.map(t => `<tr><td>${escHtml(t.invoiceNo || '')}</td><td>${escHtml(t.date ? fmtDate(t.date) : '')}</td><td>${escHtml(t.clientName || 'Walk-in')}</td><td class="ctr">${(t.items || []).length}</td><td class="num">${peso(t.grandTotal)}</td><td>${escHtml(t.paymentMethod || '')}</td><td class="ctr">${escHtml(t.status || '')}</td></tr>`).join('') : `<tr><td colspan="7">No sales recorded in ${escHtml(d.label)}</td></tr>`;
  html += `</tbody></table>`;

  if (d.returns.length) {
    html += `<table class="excel-table"><caption>Returns &amp; Refunds (${d.returns.length})</caption><thead><tr><th>Invoice</th><th>Date</th><th>Client</th><th class="num">Amount</th></tr></thead><tbody>`;
    html += d.returns.map(t => `<tr><td>${escHtml(t.invoiceNo || '')}</td><td>${escHtml(t.date ? fmtDate(t.date) : '')}</td><td>${escHtml(t.clientName || 'Walk-in')}</td><td class="num">-${peso(Math.abs(t.grandTotal || 0))}</td></tr>`).join('');
    html += `</tbody></table>`;
  }

  html += `<table class="excel-table"><caption>Payments Collected (${d.pays.length}) — ${peso(d.payTotal)}</caption><thead><tr><th>Date</th><th>Client</th><th class="num">Amount</th><th>Type</th></tr></thead><tbody>`;
  html += d.pays.length ? d.pays.map(p => `<tr><td>${escHtml(p.date ? fmtDate(p.date) : '')}</td><td>${escHtml(p.clientName || '')}</td><td class="num" style="color:#059669;font-weight:600">${peso(p.amount)}</td><td>${escHtml(p.type || '')}</td></tr>`).join('') : `<tr><td colspan="4">No payments recorded in ${escHtml(d.label)}</td></tr>`;
  html += `</tbody></table>`;

  html += `<table class="excel-table"><caption>Expenses (${d.exps.length}) — ${peso(d.expTotal)}</caption><thead><tr><th>Date</th><th>Category</th><th>Description</th><th class="num">Amount</th></tr></thead><tbody>`;
  html += d.exps.length ? d.exps.map(e => `<tr><td>${escHtml(e.date ? fmtDate(e.date) : '')}</td><td>${escHtml(e.category || '')}</td><td>${escHtml(e.description || '')}</td><td class="num">${peso(e.amount)}</td></tr>`).join('') : `<tr><td colspan="4">No expenses recorded in ${escHtml(d.label)}</td></tr>`;
  html += `</tbody></table>`;

  html += `<table class="excel-table"><caption>Top Items</caption><thead><tr><th>Item</th><th class="num">Qty</th><th class="num">Amount</th></tr></thead><tbody>`;
  html += d.topItems.length ? d.topItems.map(i => `<tr><td>${escHtml(i.name)}</td><td class="num">${i.qty}</td><td class="num">${peso(i.amount)}</td></tr>`).join('') : `<tr><td colspan="3">No item sales in ${escHtml(d.label)}</td></tr>`;
  html += `</tbody></table>`;

  html += `<table class="excel-table"><caption>Top Clients</caption><thead><tr><th>Client</th><th class="num">Spent</th><th class="ctr">Sales</th></tr></thead><tbody>`;
  html += d.topClients.length ? d.topClients.map(c => `<tr><td>${escHtml(c.name)}</td><td class="num">${peso(c.spent)}</td><td class="ctr">${c.txns}</td></tr>`).join('') : `<tr><td colspan="3">No client sales in ${escHtml(d.label)}</td></tr>`;
  html += `</tbody></table>`;

  if (d.openingSnap) {
    html += `<table class="excel-table"><caption>Receivables — opening vs collected vs current (opening taken ${escHtml(fmtDate(d.openingSnap.takenAt))})</caption><thead><tr><th>Client</th><th class="num">Opening</th><th class="num">Paid (${escHtml(d.label)})</th><th class="num">Current</th></tr></thead><tbody>`;
    html += d.collections.length ? d.collections.map(c => `<tr><td>${escHtml(c.name)}</td><td class="num">${peso(c.opening)}</td><td class="num" style="color:#059669;font-weight:600">${peso(c.paid)}</td><td class="num" style="color:#dc2626;font-weight:600">${peso(c.current)}</td></tr>`).join('') : `<tr><td colspan="4">No receivables movement</td></tr>`;
    html += `<tr class="excel-total"><td>Total</td><td class="num">${peso(d.openingTotal)}</td><td class="num">${peso(d.paidTotal)}</td><td class="num">${peso(d.debtTotal)}</td></tr>`;
    html += `</tbody></table>`;
  } else {
    html += `<table class="excel-table"><caption>Receivables — as of today (${peso(d.debtTotal)})</caption><thead><tr><th>Client</th><th>Phone</th><th class="num">Balance</th><th class="ctr">Due Date</th></tr></thead><tbody>`;
    html += d.debtors.length ? d.debtors.map(c => `<tr><td>${escHtml(c.name)}</td><td>${escHtml(c.phone)}</td><td class="num" style="color:#dc2626;font-weight:600">${peso(c.balance)}</td><td class="ctr">${escHtml(c.dueDate)}</td></tr>`).join('') : `<tr><td colspan="4">No outstanding balances</td></tr>`;
    html += `</tbody></table>`;
    html += `<p class="text-xs text-gray-400 mt-2">No opening snapshot exists for ${escHtml(d.label)} yet — snapshots start automatically from this version onward.</p>`;
  }

  html += `<p class="text-xs text-gray-400 mt-2">Credit sales in ${escHtml(d.label)}: ${peso(d.creditSales)}. Balances above are live figures as of today, not month-end snapshots.</p>`;
  return html;
}

function monthlyReportMonthKey() {
  const v = document.getElementById('rep-month')?.value || today().slice(0, 7);
  return /^\d{4}-\d{2}$/.test(v) ? v : today().slice(0, 7);
}

async function monthlyReportLoad() {
  await Promise.all([dbLoad('transactions'), dbLoad('payments'), dbLoad('expenses'), dbLoad('inventory'), dbLoad('clients')]);
}

export async function generateMonthlyReport() {
  const monthKey = monthlyReportMonthKey();
  await monthlyReportLoad();
  const d = monthlyReportData(monthKey);
  modal(`<div class="p-4">
    <div class="flex justify-between items-center mb-3">
      <h3 class="text-xl font-bold">Monthly Report — ${escHtml(d.label)}</h3>
      <button onclick="closeModal()" class="text-gray-400 hover:text-gray-600"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
    </div>
    <div class="flex gap-2 mb-4">
      <button onclick="printMonthlyReport()" class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="inline-block mr-1 -mt-0.5"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2 2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2-2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>Print</button>
      <button onclick="exportMonthlyReportXlsx()" class="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-semibold"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="inline-block mr-1 -mt-0.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>Excel</button>
    </div>
    ${monthlyReportHtml(d)}
  </div>`);
}

export async function printMonthlyReport() {
  const monthKey = monthlyReportMonthKey();
  await monthlyReportLoad();
  const d = monthlyReportData(monthKey);
  openPrintWindow(`Monthly Report — ${d.label}`, 1100, 800, monthlyReportHtml(d));
}

export async function exportMonthlyReportXlsx() {
  const X = window.XLSX;
  if (!X || !X.utils || typeof X.writeFile !== 'function') { toast('Excel library not loaded', 'error'); return; }
  const monthKey = monthlyReportMonthKey();
  await monthlyReportLoad();
  const d = monthlyReportData(monthKey);
  const wb = X.utils.book_new();
  const sumPairs = [['Revenue', d.revenue], ['Refunds', -d.refunds], ['Cost of Goods', d.cogs], ['Expenses', d.expTotal], ['Net Profit', d.profit], ['Payments Collected', d.payTotal], ['Credit Sales', d.creditSales]];
  const wsS = X.utils.aoa_to_sheet([[`${d.label} — Summary`], ...sumPairs]);
  if (wsS && xlsxCanStyle(X)) {
    wsS['A1'].s = { font: { name: 'Calibri', sz: 14, bold: true, color: { rgb: XL_GREEN } }, alignment: { horizontal: 'center' } };
    wsS['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 1 } }];
    sumPairs.forEach((_, i) => {
      const r = i + 1;
      const label = X.utils.encode_cell({ r, c: 0 });
      const val = X.utils.encode_cell({ r, c: 1 });
      if (wsS[label]) wsS[label].s = { font: { name: 'Calibri', sz: 11, bold: true }, border: xlThinBorder() };
      if (wsS[val]) { wsS[val].s = { font: { name: 'Calibri', sz: 11 }, alignment: { horizontal: 'right' }, border: xlThinBorder() }; wsS[val].z = '#,##0.00'; }
    });
    wsS['!cols'] = [{ wch: 22 }, { wch: 20 }];
  }
  X.utils.book_append_sheet(wb, wsS, 'Summary');
  const sheet = (title, headers, rows, numCols = [], centerCols = [], totalRow = null) => {
    const ws = X.utils.aoa_to_sheet([[title], headers, ...rows]);
    styleXlsxTable(X, ws, { title, titleRow: 0, headerRow: 1, nDataRows: rows.length, nCols: headers.length, numCols, centerCols, totalRow });
    ws['!cols'] = xlsxColWidths(headers, rows, title);
    return ws;
  };
  X.utils.book_append_sheet(wb, sheet(`${d.label} — Sales`, ['Invoice', 'Date', 'Client', 'Items', 'Total', 'Payment', 'Status'],
    d.sales.map(t => [t.invoiceNo || '', t.date ? fmtDate(t.date) : '', t.clientName || 'Walk-in', (t.items || []).length, t.grandTotal || 0, t.paymentMethod || '', t.status || '']), [4], [1, 5, 6]), 'Sales');
  X.utils.book_append_sheet(wb, sheet(`${d.label} — Payments`, ['Date', 'Client', 'Amount', 'Type'],
    d.pays.map(p => [p.date ? fmtDate(p.date) : '', p.clientName || '', p.amount || 0, p.type || '']), [2], [0, 3]), 'Payments');
  X.utils.book_append_sheet(wb, sheet(`${d.label} — Expenses`, ['Date', 'Category', 'Description', 'Amount'],
    d.exps.map(e => [e.date ? fmtDate(e.date) : '', e.category || '', e.description || '', e.amount || 0]), [3], [0]), 'Expenses');
  X.utils.book_append_sheet(wb, sheet(`${d.label} — Top Items`, ['Item', 'Qty', 'Amount'],
    d.topItems.map(i => [i.name, i.qty, i.amount]), [1, 2], []), 'Top Items');
  X.utils.book_append_sheet(wb, sheet(`${d.label} — Top Clients`, ['Client', 'Spent', 'Sales'],
    d.topClients.map(c => [c.name, c.spent, c.txns]), [1, 2], []), 'Top Clients');
  const recRows = d.collections.map(c => [c.name, c.opening, c.paid, c.current]);
  recRows.push(['TOTAL', d.openingTotal, d.paidTotal, d.debtTotal]);
  X.utils.book_append_sheet(wb, sheet(`${d.label} — Receivables`, ['Client', 'Opening', 'Paid', 'Current'],
    recRows, [1, 2, 3], [], recRows.length - 1), 'Receivables');
  X.writeFile(wb, `Monthly_Report_${monthKey}.xlsx`);
  toast('Monthly Excel report exported', 'success');
}

// expose top-level bindings as globals (inline onclick handlers and legacy code paths rely on them)
Object.defineProperties(window, {
  viewReports: { get: () => viewReports, configurable: true },
  showMonthlyOverview: { get: () => showMonthlyOverview, configurable: true },
  getAllData: { get: () => getAllData, configurable: true },
  redactSettings: { get: () => redactSettings, configurable: true },
  exportExcel: { get: () => exportExcel, configurable: true },
  exportXlsx: { get: () => exportXlsx, configurable: true },
  exportPDF: { get: () => exportPDF, configurable: true },
  exportAccountingCSV: { get: () => exportAccountingCSV, configurable: true },
  backupJSON: { get: () => backupJSON, configurable: true },
  encryptedBackupFlow: { get: () => encryptedBackupFlow, configurable: true },
  doEncryptedBackup: { get: () => doEncryptedBackup, configurable: true },
  fileBackupFlow: { get: () => fileBackupFlow, configurable: true },
  emailBackupFlow: { get: () => emailBackupFlow, configurable: true },
  showRestoreModal: { get: () => showRestoreModal, configurable: true },
  restoreJSONFlow: { get: () => restoreJSONFlow, configurable: true },
  restoreEncryptedFlow: { get: () => restoreEncryptedFlow, configurable: true },
  signalLanUpdate: { get: () => signalLanUpdate, configurable: true },
  viewAuditLog: { get: () => viewAuditLog, configurable: true },
  showSalesByClient: { get: () => showSalesByClient, configurable: true },
  showARAging: { get: () => showARAging, configurable: true },
  showBIRFormSelector: { get: () => showBIRFormSelector, configurable: true },
  exportBIR2550M: { get: () => exportBIR2550M, configurable: true },
  exportBIR2551Q: { get: () => exportBIR2551Q, configurable: true },
  showInventoryValuation: { get: () => showInventoryValuation, configurable: true },
  exportFormattedXlsx: { get: () => exportFormattedXlsx, configurable: true },
  exportLandscapePdf: { get: () => exportLandscapePdf, configurable: true },
  monthlyReportData: { get: () => monthlyReportData, configurable: true },
  monthlyReportHtml: { get: () => monthlyReportHtml, configurable: true },
  generateMonthlyReport: { get: () => generateMonthlyReport, configurable: true },
  printMonthlyReport: { get: () => printMonthlyReport, configurable: true },
  exportMonthlyReportXlsx: { get: () => exportMonthlyReportXlsx, configurable: true }
});
