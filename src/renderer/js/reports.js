import { logAudit } from './auth.js'
import { dbAll, dbClear, dbPut } from './database.js'
import { closeModal, confirmModal, dbLoad, escapeHtml, filterByYear, modal, paginate, renderPagination, toast } from './helpers.js'
import { calculateInventoryValue } from './inventory.js'
import { escHtml, openPrintWindow } from './printLayout.js'
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
  root.innerHTML = `
    <div class="space-y-4 fade-in">
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
      return `<td${cls} style="padding:5px 8px;border:1px solid #cbd5e1;vertical-align:top${align}">${fmt}${esc(v)}</td>`;
    }

    function th(label, align) {
      const a = align ? ` text-align:${align}` : '';
      return `<th style="padding:7px 8px;border:1px solid #1e40af;background:#2563eb;color:#fff;font-weight:700;font-size:11px;white-space:nowrap${a}">${esc(label)}</th>`;
    }

    const settingsMap = {};
    state.settings.forEach(s => settingsMap[s.key] = s.value);
    const shopName = settingsMap['shopName'] || 'Shop Ledger PH';
    const shopAddr = settingsMap['shopAddress'] || '';

    function section(title, headers, rows) {
      let h = headers.map(h => th(h.label, h.align)).join('');
      let r = rows.map((row, i) => {
        const bg = i % 2 === 0 ? '#ffffff' : '#f8fafc';
        return `<tr style="background:${bg}">${row.map(c => td(c.v, c.opts)).join('')}</tr>`;
      }).join('');
      return `<tr style="background:#f1f5f9"><td colspan="${headers.length}" style="padding:10px 8px 6px;border:1px solid #cbd5e1;font-size:13px;font-weight:700;color:#1e293b">${esc(title)}</td></tr>
<tr style="background:#2563eb">${h}</tr>${r}`;
    }

    function pesoVal(n) { return Number(n||0).toFixed(2); }

    let html = `<table style="width:100%;border-collapse:collapse;font-family:'Segoe UI',Arial,sans-serif;font-size:11px;color:#1e293b">`;

    // Shop header row
    html += `<tr><td colspan="20" style="padding:14px 10px;border:1px solid #cbd5e1;background:#0f172a;color:#fff;font-size:18px;font-weight:700;text-align:center">${esc(shopName)} ${shopAddr ? '&mdash; '+esc(shopAddr) : ''}</td></tr>`;

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
    html += `<tr><td colspan="20" style="padding:8px 10px;border:1px solid #cbd5e1;background:#f8fafc">
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

    html += `<tr><td colspan="20" style="padding:10px;border:1px solid #cbd5e1;background:#f8fafc;text-align:center;font-size:10px;color:#94a3b8">Generated ${fmtDateTime(now())} &mdash; Shop Ledger PH</td></tr></table>`;

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
    X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet([
      [shopName], ['Generated', new Date().toLocaleString()], [],
      ['Revenue', totalRevenue], ['Refunds', -totalRefunds],
      ['Cost of Goods', totalCOGS], ['Expenses', totalExpenses],
      ['Net Profit', netProfit], ['Outstanding Debts', totalUtang], ['Payments Collected', totalPayments]
    ]), 'Summary');

    const sheet = (headers, rows) => X.utils.aoa_to_sheet([[shopName, ...headers], ...rows]);
    X.utils.book_append_sheet(wb, sheet(['Invoice', 'Date', 'Client', 'Items', 'Total', 'Payment', 'Status'],
      xTx.filter(t => t.invoiceNo).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).map(t => [
        t.invoiceNo, t.date ? fmtDate(t.date) : '', t.clientName || 'Walk-in',
        (t.items || []).map(i => `${i.description || ''} x${i.name || '1'}`).join('; '),
        t.grandTotal, t.paymentMethod || '', t.status || ''
      ])), 'Transactions');
    X.utils.book_append_sheet(wb, sheet(['Name', 'Phone', 'Address', 'Balance', 'Due Date'],
      (state.clients || []).filter(c => c.name).map(c => [c.name, c.phone || '', c.address || '', c.balance || 0, c.dueDate ? fmtDate(c.dueDate) : ''])), 'Clients');
    X.utils.book_append_sheet(wb, sheet(['Date', 'Client', 'Amount', 'Type', 'Notes'],
      xPay.filter(p => p.clientName).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).map(p => [p.date ? fmtDate(p.date) : '', p.clientName, p.amount, p.type || '', p.notes || ''])), 'Payments');
    X.utils.book_append_sheet(wb, sheet(['Date', 'Category', 'Description', 'Amount', 'Payee'],
      xEx.filter(e => e.description).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).map(e => [e.date ? fmtDate(e.date) : '', e.category || '', e.description, e.amount, e.payee || ''])), 'Expenses');
    X.utils.book_append_sheet(wb, sheet(['Name', 'SKU', 'Category', 'Sell Price', 'Stock', 'Min Stock'],
      (state.inventory || []).filter(i => i.name).map(i => [i.name, i.sku || '', i.category || '', i.sellPrice, i.stock || 0, i.minStock || 5])), 'Inventory');
    X.utils.book_append_sheet(wb, sheet(['Name', 'Contact', 'Email', 'Category', 'Address'],
      (state.suppliers || []).filter(s => s.name).map(s => [s.name, s.contact || '', s.email || '', s.category || '', s.address || ''])), 'Suppliers');
    X.utils.book_append_sheet(wb, sheet(['PO No', 'Supplier', 'Date', 'Items', 'Total', 'Status'],
      (state.purchaseOrders || []).filter(po => po.poNo).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).map(po => [po.poNo, po.supplierName || '', po.date ? fmtDate(po.date) : '', (po.items || []).map(i => `${i.name || ''} x${i.qty || 0}`).join('; '), po.total, po.status || ''])), 'Purchase Orders');
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
    const stores = ['clients','transactions','payments','inventory','quickItems','settings','users','expenses','suppliers','purchaseOrders','supplierPayments','notifications','auditLogs'];
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
  const { items, page, totalPages } = paginate(sorted, 'log');

  function render() {
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
    
    const vatOutput = Math.round(taxableSales / (1 + vatRate) * vatRate * 100) / 100;
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
  showInventoryValuation: { get: () => showInventoryValuation, configurable: true }
});
