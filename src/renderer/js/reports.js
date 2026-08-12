import { logAudit } from './auth.js'
import { dbAll, dbClear, dbPut } from './database.js'
import { closeModal, confirmModal, dbLoad, escapeHtml, filterByYear, modal, paginate, renderPagination, toast } from './helpers.js'
import { escHtml, openPrintWindow } from './printLayout.js'
import { loadAll, render } from './router.js'
import { fmtDate, now, peso, state, today } from './state.js'

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
  const rTx = filterByYear(state.transactions, 'date').filter(t => t.status !== 'voided');
  const rEx = filterByYear(state.expenses, 'date');
  const rPay = filterByYear(state.payments, 'date');
  const invCost = new Map((state.inventory || []).map(i => [i.id, i.costPrice || 0]));
  const totalRevenue = rTx.reduce((s, t) => s + (t.grandTotal || 0), 0);
  const totalCOGS = cogsOf(rTx, invCost);
  const totalExpenses = rEx.reduce((s, e) => s + (e.amount || 0), 0);
  const netProfit = totalRevenue - totalCOGS - totalExpenses;
  const profitMargin = totalRevenue > 0 ? ((netProfit / totalRevenue) * 100).toFixed(1) : 0;
  root.innerHTML = `
    <div class="space-y-4 fade-in">
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div class="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm border-l-4 stat-card border-green-500">
          <p class="text-xs text-gray-500 uppercase">Total Revenue</p>
          <p class="text-2xl font-bold text-green-600">${peso(totalRevenue)}</p>
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
        <button onclick="dailySalesReport()" class="px-4 py-2 bg-green-700 text-white rounded-lg hover:bg-green-800"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="inline-block mr-1 -mt-0.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>Daily Report</button>
        <button onclick="backupJSON()" class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="inline-block mr-1 -mt-0.5"><path d="M21.5 17.5a5 5 0 0 0-4.7-7.5 7 7 0 0 0-13.1 2.5A5 5 0 0 0 6 21h12a4 4 0 0 0 3.5-3.5z"/></svg>Backup JSON</button>
        <button onclick="encryptedBackupFlow()" class="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="inline-block mr-1 -mt-0.5"><path d="M21.5 17.5a5 5 0 0 0-4.7-7.5 7 7 0 0 0-13.1 2.5A5 5 0 0 0 6 21h12a4 4 0 0 0 3.5-3.5z"/></svg>Encrypted Backup</button>
        <button onclick="fileBackupFlow()" class="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="inline-block mr-1 -mt-0.5"><path d="M21.5 17.5a5 5 0 0 0-4.7-7.5 7 7 0 0 0-13.1 2.5A5 5 0 0 0 6 21h12a4 4 0 0 0 3.5-3.5z"/></svg>File Backup</button>
        <button onclick="emailBackupFlow()" class="px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="inline-block mr-1 -mt-0.5"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>Email Backup</button>
        <button onclick="showRestoreModal()" class="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="inline-block mr-1 -mt-0.5"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>Restore</button>
        <button onclick="signalLanUpdate()" class="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="inline-block mr-1 -mt-0.5"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>Signal Update on LAN</button>
        <button onclick="viewAuditLog()" class="px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-800"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="inline-block mr-1 -mt-0.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>Audit Log</button>
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
    const monthRev = state.transactions.filter(t => (t.date || '').startsWith(monthKey) && t.status !== 'voided');
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

export async function getAllData() {
  const users = (await dbAll('users')).map(u => { const { password, ...rest } = u; return rest; });
  return {
    clients: await dbAll('clients'), transactions: await dbAll('transactions'),
    payments: await dbAll('payments'), inventory: await dbAll('inventory'),
    quickItems: await dbAll('quickItems'), expenses: await dbAll('expenses'),
    suppliers: await dbAll('suppliers'), purchaseOrders: await dbAll('purchaseOrders'),
    notifications: await dbAll('notifications'),
    auditLogs: await dbAll('auditLogs'), users,
    settings: await dbAll('settings'), exportedAt: now()
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
    const expTx = filterByYear(state.transactions, 'date').filter(t => t.status !== 'voided');
    const expEx = filterByYear(state.expenses, 'date');
    const expPay = filterByYear(state.payments, 'date');
    const totalRevenue = expTx.reduce((s, t) => s + (t.grandTotal || 0), 0);
    const invCost = new Map((state.inventory || []).map(i => [i.id, i.costPrice || 0]));
    const totalCOGS = cogsOf(expTx, invCost);
    const totalExpenses = expEx.reduce((s, e) => s + (e.amount || 0), 0);
    const netProfit = totalRevenue - totalCOGS - totalExpenses;
    const totalUtang = state.clients.reduce((s, c) => s + (c.balance || 0), 0);
    const totalPayments = expPay.reduce((s, p) => s + (p.amount || 0), 0);
    const sumColor = netProfit >= 0 ? '#059669' : '#dc2626';
    html += `<tr><td colspan="20" style="padding:8px 10px;border:1px solid #cbd5e1;background:#f8fafc">
      <span style="margin-right:24px"><strong>Revenue:</strong> ₱${pesoVal(totalRevenue)}</span>
      <span style="margin-right:24px"><strong>COGS:</strong> ₱${pesoVal(totalCOGS)}</span>
      <span style="margin-right:24px"><strong>Expenses:</strong> ₱${pesoVal(totalExpenses)}</span>
      <span style="margin-right:24px"><strong style="color:${sumColor}">Net Profit:</strong> <span style="color:${sumColor}">₱${pesoVal(netProfit)}</span></span>
      <span style="margin-right:24px"><strong>Utang:</strong> ₱${pesoVal(totalUtang)}</span>
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

export async function exportPDF() {
  await Promise.all([dbLoad('clients'), dbLoad('transactions'), dbLoad('payments'), dbLoad('expenses'), dbLoad('inventory'), dbLoad('suppliers'), dbLoad('purchaseOrders')]);
  const pdfTx = filterByYear(state.transactions, 'date').filter(t => t.status !== 'voided');
  const pdfEx = filterByYear(state.expenses, 'date');
  const pdfPay = filterByYear(state.payments, 'date');
  const totalRevenue = pdfTx.reduce((s, t) => s + (t.grandTotal || 0), 0);
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
    <div class="card red"><span class="lbl">Expenses</span><span class="val">${fmt(totalExpenses)}</span></div>
    <div class="card ${netProfit>=0?'blue':'red'}"><span class="lbl">Net Profit</span><span class="val">${fmt(netProfit)}</span></div>
    <div class="card orange"><span class="lbl">Outstanding Utang</span><span class="val">${fmt(totalUtang)}</span></div>
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
    const stores = ['clients','transactions','payments','inventory','quickItems','settings','users','expenses','suppliers','purchaseOrders','notifications','auditLogs'];
    await Promise.all(stores.map(s => dbClear(s)));
    for (const store of stores) {
      const items = data[store];
      if (items && Array.isArray(items)) {
        for (const item of items) await dbPut(store, item);
      }
    }
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
    const stores = ['clients','transactions','payments','inventory','quickItems','settings','users','expenses','suppliers','purchaseOrders','notifications','auditLogs'];
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


// expose top-level bindings as globals (inline onclick handlers and legacy code paths rely on them)
Object.defineProperties(window, {
  viewReports: { get: () => viewReports, configurable: true },
  showMonthlyOverview: { get: () => showMonthlyOverview, configurable: true },
  getAllData: { get: () => getAllData, configurable: true },
  exportExcel: { get: () => exportExcel, configurable: true },
  exportPDF: { get: () => exportPDF, configurable: true },
  backupJSON: { get: () => backupJSON, configurable: true },
  encryptedBackupFlow: { get: () => encryptedBackupFlow, configurable: true },
  doEncryptedBackup: { get: () => doEncryptedBackup, configurable: true },
  fileBackupFlow: { get: () => fileBackupFlow, configurable: true },
  emailBackupFlow: { get: () => emailBackupFlow, configurable: true },
  showRestoreModal: { get: () => showRestoreModal, configurable: true },
  restoreJSONFlow: { get: () => restoreJSONFlow, configurable: true },
  restoreEncryptedFlow: { get: () => restoreEncryptedFlow, configurable: true },
  signalLanUpdate: { get: () => signalLanUpdate, configurable: true },
  viewAuditLog: { get: () => viewAuditLog, configurable: true }
});
