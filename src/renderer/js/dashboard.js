async function viewDashboard(root) {
  await Promise.all([dbLoad('clients'), dbLoad('transactions'), dbLoad('expenses'), dbLoad('payments'), dbLoad('inventory'), dbLoad('settings')]);
  const todayStr = today();
  const todayTx = state.transactions.filter(t => t.date === todayStr);
  const todayExp = state.expenses.filter(e => e.date === todayStr);
  const todayPay = state.payments.filter(p => p.date === todayStr);
  const todaySales = todayTx.reduce((s, t) => s + (t.grandTotal || 0), 0);
  const todayExpTotal = todayExp.reduce((s, e) => s + (e.amount || 0), 0);
  const todayPayTotal = todayPay.reduce((s, p) => s + (p.amount || 0), 0);
  const totalUtang = state.clients.reduce((s, c) => s + (c.balance || 0), 0);
  const lowStock = state.inventory.filter(i => (i.stock || 0) <= (i.minStock || 5));
  const topUtang = [...state.clients].filter(c => (c.balance || 0) > 0).sort((a, b) => (b.balance || 0) - (a.balance || 0));
  const todayProfit = todaySales - todayExpTotal;
  const profitMargin = todaySales > 0 ? ((todayProfit / todaySales) * 100).toFixed(1) : 0;

  const dw = getDashWidgets();
  root.innerHTML = `
    <style>.holidays-wrap{height:124px;overflow:hidden;cursor:pointer}.holidays-scroll{animation:holidayScroll 30s linear infinite}.holidays-scroll:hover{animation-play-state:paused}@keyframes holidayScroll{0%{transform:translateY(0)}100%{transform:translateY(-50%)}}</style>
    <div class="space-y-2 fade-in">
      <div class="flex items-center justify-between">
        <div></div>
        <div class="flex gap-2">
          <button onclick="dailySalesReport()" class="px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs hover:bg-green-700"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="inline-block mr-1 -mt-0.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>Daily Report</button>
          <button onclick="dashCustomize()" class="px-3 py-1.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-lg text-xs hover:bg-gray-200 dark:hover:bg-gray-600"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="inline-block mr-1 -mt-0.5"><circle cx="12" cy="12" r="3"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>Customize</button>
        </div>
      </div>
      ${dw.summaryCards ? `<div class="grid grid-cols-4 gap-2">
        <div class="bg-white dark:bg-gray-800 rounded-lg p-3 shadow-sm border-l-4 border-green-500">
          <p class="text-xs text-gray-500">Today Sales</p>
          <p class="text-lg font-bold text-green-600">${peso(todaySales)}</p>
          <p class="text-xs text-gray-400">${todayTx.length} txns</p>
        </div>
        <div class="bg-white dark:bg-gray-800 rounded-lg p-3 shadow-sm border-l-4 border-red-500">
          <p class="text-xs text-gray-500">Today Expenses</p>
          <p class="text-lg font-bold text-red-600">${peso(todayExpTotal)}</p>
        </div>
        <div class="bg-white dark:bg-gray-800 rounded-lg p-3 shadow-sm border-l-4 border-orange-500">
          <p class="text-xs text-gray-500">Total Utang</p>
          <p class="text-lg font-bold text-orange-600">${peso(totalUtang)}</p>
          <p class="text-xs text-gray-400">${state.clients.filter(c => (c.balance||0) > 0).length} clients</p>
        </div>
        <div class="bg-white dark:bg-gray-800 rounded-lg p-3 shadow-sm border-l-4 border-blue-500">
          <p class="text-xs text-gray-500">Today Collected</p>
          <p class="text-lg font-bold text-blue-600">${peso(todayPayTotal)}</p>
        </div>
      </div>` : ''}
      ${dw.profitBar ? `<div class="bg-gradient-to-r from-blue-600 to-indigo-700 rounded-lg p-3 text-white shadow-sm">
        <div class="flex justify-between items-center">
          <div><p class="text-xs opacity-80">Today's Profit</p><p class="text-xl font-bold">${peso(todayProfit)}</p></div>
          <div class="text-right"><p class="text-xs opacity-80">Margin</p><p class="text-lg font-bold">${profitMargin}%</p></div>
        </div>
        <div class="mt-1 bg-white/20 rounded-full h-1.5"><div class="bg-white rounded-full h-1.5" style="width:${Math.min(profitMargin, 100)}%"></div></div>
      </div>` : ''}
      ${dw.weather ? `<div class="grid grid-cols-3 gap-2">
        <div class="bg-white dark:bg-gray-800 rounded-lg p-3 shadow-sm">
          <div class="flex items-center justify-between mb-1"><h3 class="font-bold text-xs"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="inline-block mr-1 -mt-0.5"><circle cx="12" cy="12" r="10"/><path d="M12 2a7 7 0 0 0 0 14 7 7 0 0 0 0-14z"/><path d="M12 14l6-6"/></svg>Weather</h3><div class="flex gap-1"><button onclick="loadWeather()" class="text-gray-400 hover:text-blue-600" title="Refresh"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg></button></div></div>
          <div id="weather-display"><p class="text-gray-400 text-xs py-2">Loading...</p></div>
        </div>
        <div class="bg-white dark:bg-gray-800 rounded-lg p-3 shadow-sm">
          <div class="flex items-center justify-between mb-1"><h3 class="font-bold text-xs"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="inline-block mr-1 -mt-0.5"><path d="M6 15h12"/><path d="M6 6h12"/><path d="M18 15l-6 6-6-6"/><path d="M18 6l-6-6-6 6"/></svg>PH Holidays</h3></div>
          <div id="holidays-display" class="holidays-wrap" onclick="showPHHolidays()"><div class="holidays-scroll" id="holidays-list"></div></div>
        </div>
        <div class="bg-white dark:bg-gray-800 rounded-lg p-3 shadow-sm">
          <h3 class="font-bold text-xs mb-1"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="inline-block mr-1 -mt-0.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>Next Holiday</h3>
          <div id="next-holiday"><p class="text-gray-400 text-xs py-2">—</p></div>
        </div>
      </div>` : ''}
      ${dw.chart ? `<details open class="bg-white dark:bg-gray-800 rounded-lg shadow-sm" id="chart-section">
        <summary class="p-3 cursor-pointer font-bold text-sm flex items-center gap-2 hover:bg-gray-50 dark:hover:bg-gray-700/50 rounded-lg">📊 7-Day Trend <span id="chart-toggle" class="text-xs font-normal text-gray-400 ml-auto">Hide chart</span></summary>
        <div class="px-3 pb-3"><canvas id="dashChart" height="120"></canvas></div>
      </details>` : ''}
      ${dw.payMethod ? `<div class="bg-white dark:bg-gray-800 rounded-lg shadow-sm">
        <details open>
          <summary class="p-3 cursor-pointer font-bold text-sm flex items-center gap-2 hover:bg-gray-50 dark:hover:bg-gray-700/50 rounded-lg">💳 Payment Methods <span class="text-xs font-normal text-gray-400 ml-auto">Today's breakdown</span></summary>
          <div class="px-3 pb-3"><canvas id="payMethodChart" height="70"></canvas></div>
        </details>
      </div>` : ''}
      <div class="grid grid-cols-2 gap-2">
        ${dw.topUtang ? `<div class="bg-white dark:bg-gray-800 rounded-lg p-3 shadow-sm">
          <h3 class="font-bold text-xs mb-1">Top Utang</h3>
          <div class="max-h-48 overflow-y-auto">${topUtang.length === 0 ? '<p class="text-gray-400 text-xs">No utang</p>' : topUtang.slice(0, 10).map(c => `
            <div class="flex justify-between py-0.5 text-xs border-b dark:border-gray-700 last:border-0">
              <span>${escapeHtml(c.name)}</span><span class="font-semibold text-orange-600">${peso(c.balance)}</span>
            </div>`).join('') + (topUtang.length > 10 ? `<div class="text-center pt-1"><a href="#" onclick="event.preventDefault();navigate('utang')" class="text-blue-500 text-xs hover:underline"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="inline-block mr-0.5 -mt-0.5"><polyline points="9 18 15 12 9 6"/></svg>View all (${topUtang.length})</a></div>` : '')}</div>
        </div>` : ''}
        ${dw.lowStock ? `<div class="bg-white dark:bg-gray-800 rounded-lg p-3 shadow-sm">
          <h3 class="font-bold text-xs mb-1 text-red-600">Low Stock</h3>
          <div class="max-h-48 overflow-y-auto">${lowStock.length === 0 ? '<p class="text-gray-400 text-xs">Stocked</p>' : lowStock.slice(0, 10).map(i => `
            <div class="flex justify-between py-0.5 text-xs border-b dark:border-gray-700 last:border-0">
              <span>${escapeHtml(i.name)}</span><span class="font-semibold text-red-600">${i.stock || 0} / ${i.minStock || 5}</span>
            </div>`).join('') + (lowStock.length > 10 ? `<div class="text-center pt-1"><a href="#" onclick="event.preventDefault();navigate('inventory')" class="text-blue-500 text-xs hover:underline">View all (${lowStock.length})</a></div>` : '')}</div>
        </div>` : ''}
      </div>
      ${dw.aiInsights ? `<div class="bg-white dark:bg-gray-800 rounded-lg shadow-sm">
        <details id="ai-panel" class="group">
          <summary class="p-3 cursor-pointer font-bold text-sm flex items-center gap-2 hover:bg-gray-50 dark:hover:bg-gray-700/50 rounded-lg">🤖 AI Insights <span class="text-xs font-normal text-gray-400 ml-auto" id="ai-status">Ask about your business</span></summary>
          <div class="px-3 pb-3 space-y-2">
            <div id="ai-chat" class="max-h-32 overflow-auto space-y-1 text-xs border dark:border-gray-700 rounded p-2 bg-gray-50 dark:bg-gray-900 min-h-[60px]">
              <div class="text-gray-400 text-xs text-center py-2">Ask about sales, inventory, clients...</div>
            </div>
            <div class="flex gap-2">
              <input id="ai-input" type="text" placeholder="e.g. Top debtors?" class="flex-1 px-2 py-1.5 border dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-xs" onkeydown="if(event.key==='Enter')askAI()" />
              <button onclick="askAI()" class="px-3 py-1.5 bg-blue-600 text-white rounded text-xs font-semibold">Ask</button>
            </div>
          </div>
        </details>
      </div>` : ''}
    </div>`;
  if (dw.chart) drawDashChart();
  if (dw.payMethod) drawPayMethodChart();
  if (dw.weather) { loadWeather(); loadNextHoliday(); loadHolidaysScroll(); }
}

function getDashWidgets() {
  const ls = (() => { try { return JSON.parse(localStorage.getItem('dashWidgets')); } catch(e) { return null; } })();
  const setting = state.settings.find(s => s.key === 'dashWidgetConfig');
  const stored = setting ? (() => { try { return JSON.parse(setting.value); } catch(e) { return null; } })() : null;
  const defaults = { summaryCards: true, profitBar: true, weather: true, chart: true, payMethod: true, topUtang: true, lowStock: true, aiInsights: true };
  if (ls && !stored) {
    const s = state.settings.find(x => x.key === 'dashWidgetConfig');
    if (s) { s.value = JSON.stringify(ls); dbPut('settings', s).catch(() => {}); }
    else { dbAdd('settings', { key: 'dashWidgetConfig', value: JSON.stringify(ls) }).catch(() => {}); }
    localStorage.removeItem('dashWidgets');
    return { ...defaults, ...ls };
  }
  return { ...defaults, ...(stored || {}) };
}

function dashCustomize() {
  const w = getDashWidgets();
  const items = { summaryCards: 'Summary Cards', profitBar: 'Profit Bar', weather: 'Weather & Holidays', chart: '7-Day Chart', payMethod: 'Payment Methods', topUtang: 'Top Utang', lowStock: 'Low Stock', aiInsights: 'AI Insights' };
  modal(`<div class="p-6"><div class="flex justify-between items-center mb-4"><h3 class="text-xl font-bold">Customize Dashboard</h3><button onclick="closeModal()" class="text-gray-400 hover:text-gray-600"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button></div>
    <div class="space-y-2">${Object.entries(items).map(([k,v]) => `<label class="flex items-center gap-3 p-2 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg cursor-pointer"><input type="checkbox" ${w[k]!==false?'checked':''} onchange="dashToggle('${k}',this.checked)" class="w-4 h-4 text-blue-600 rounded" /><span class="text-sm">${v}</span></label>`).join('')}</div>
    <div class="flex gap-2 pt-4"><button onclick="closeModal();viewDashboard(document.getElementById('view'))" class="flex-1 py-2 bg-blue-600 text-white rounded-lg"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="inline-block mr-1 -mt-0.5"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>Apply & Reload</button><button onclick="closeModal()" class="px-4 py-2 bg-gray-200 dark:bg-gray-700 rounded-lg">Close</button></div></div>`);
}

async function dashToggle(key, val) {
  const w = getDashWidgets();
  w[key] = val;
  const existing = state.settings.find(s => s.key === 'dashWidgetConfig');
  if (existing) { existing.value = JSON.stringify(w); await dbPut('settings', existing); }
  else { await dbAdd('settings', { key: 'dashWidgetConfig', value: JSON.stringify(w) }); }
  state.settings = await dbAll('settings');
}

async function dailySalesReport() {
  const todayStr = today();
  const todayTx = state.transactions.filter(t => t.date === todayStr);
  const todayExp = state.expenses.filter(e => e.date === todayStr);
  const todayPay = state.payments.filter(p => p.date === todayStr);
  const sales = todayTx.reduce((s, t) => s + (t.grandTotal || 0), 0);
  const expenses = todayExp.reduce((s, e) => s + (e.amount || 0), 0);
  const collections = todayPay.reduce((s, p) => s + (p.amount || 0), 0);
  const cashSales = todayTx.filter(t => t.paymentMethod === 'Cash').reduce((s, t) => s + (t.grandTotal || 0), 0);
  const creditSales = todayTx.filter(t => t.paymentMethod !== 'Cash').reduce((s, t) => s + (t.grandTotal || 0), 0);
  const txnCount = todayTx.length;
  const expCount = todayExp.length;
  const payCount = todayPay.length;
  const settingsMap = {};
  state.settings.forEach(s => settingsMap[s.key] = s.value);
  const shopName = settingsMap['shopName'] || 'Shop Ledger PH';
  const shopAddr = settingsMap['shopAddress'] || '';
  modal(`<div class="p-6"><div class="flex justify-between items-center mb-4"><h3 class="text-xl font-bold">Daily Sales Report</h3><button onclick="closeModal()" class="text-gray-400 hover:text-gray-600"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button></div>
    <p class="text-sm text-gray-500 mb-3">${shopName} — ${fmtDate(todayStr)}</p>
    <div class="space-y-2 mb-4">
      <div><label class="text-xs text-gray-500 block">Opening Cash</label><input id="drs-opening" type="number" step="0.01" value="0" class="w-full px-3 py-2 border dark:border-gray-700 rounded bg-white dark:bg-gray-800" /></div>
      <div class="grid grid-cols-2 gap-2 text-sm"><div class="p-2 bg-gray-50 dark:bg-gray-700 rounded flex justify-between"><span>Cash Sales</span><span class="font-semibold">${peso(cashSales)}</span></div><div class="p-2 bg-gray-50 dark:bg-gray-700 rounded flex justify-between"><span>Credit/Other</span><span class="font-semibold">${peso(creditSales)}</span></div><div class="p-2 bg-gray-50 dark:bg-gray-700 rounded flex justify-between"><span>Total Sales</span><span class="font-semibold text-blue-600">${peso(sales)}</span></div><div class="p-2 bg-gray-50 dark:bg-gray-700 rounded flex justify-between"><span>Expenses</span><span class="font-semibold text-red-600">-${peso(expenses)}</span></div><div class="p-2 bg-gray-50 dark:bg-gray-700 rounded flex justify-between"><span>Collections</span><span class="font-semibold text-green-600">${peso(collections)}</span></div><div class="p-2 bg-blue-50 dark:bg-blue-900/20 rounded flex justify-between font-bold"><span>Net Cash Flow</span><span class="${(sales+collections-expenses)>=0?'text-green-600':'text-red-600'}">${peso(sales+collections-expenses)}</span></div></div>
      <div class="text-xs text-gray-400">${txnCount} transactions · ${expCount} expenses · ${payCount} payments</div>
    </div>
    <div class="flex gap-2"><button onclick="printDailyReport(parseFloat(document.getElementById('drs-opening').value)||0)" class="flex-1 py-2 bg-blue-600 text-white rounded-lg"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="inline-block mr-1 -mt-0.5"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>Print Report</button><button onclick="closeModal()" class="px-4 py-2 bg-gray-200 dark:bg-gray-700 rounded-lg">Cancel</button></div></div>`);
}

function printDailyReport(openingCash) {
  const todayStr = today();
  const todayTx = state.transactions.filter(t => t.date === todayStr);
  const todayExp = state.expenses.filter(e => e.date === todayStr);
  const todayPay = state.payments.filter(p => p.date === todayStr);
  const sales = todayTx.reduce((s, t) => s + (t.grandTotal || 0), 0);
  const expenses = todayExp.reduce((s, e) => s + (e.amount || 0), 0);
  const collections = todayPay.reduce((s, p) => s + (p.amount || 0), 0);
  const cashSales = todayTx.filter(t => t.paymentMethod === 'Cash').reduce((s, t) => s + (t.grandTotal || 0), 0);
  const creditSales = todayTx.filter(t => t.paymentMethod !== 'Cash').reduce((s, t) => s + (t.grandTotal || 0), 0);
  const settingsMap = {};
  state.settings.forEach(s => settingsMap[s.key] = s.value);
  const shopName = settingsMap['shopName'] || 'Shop Ledger PH';
  const shopAddr = settingsMap['shopAddress'] || '';
  const cashFlow = sales + collections - expenses;
  const closingCash = openingCash + cashSales - expenses + collections;
  const stripe1 = settingsMap['printStripeColor1'] || '#f8fafc';
  const stripe2 = settingsMap['printStripeColor2'] || '#ffffff';
  function a(n) { return (Number(n)||0).toFixed(2); }
  let html = `<div style="max-width:500px;margin:0 auto">`;
  html += `<h2 style="text-align:center;margin:0 0 2px">${escHtml(shopName)}</h2>`;
  if (shopAddr) html += `<p style="text-align:center;margin:0 0 4px;color:#475569;font-size:11px">${escHtml(shopAddr)}</p>`;
  html += `<h3 style="text-align:center;margin:0 0 12px;font-size:16px">Daily Sales Report — ${escHtml(fmtDate(todayStr))}</h3>`;
  html += `<table style="width:100%;border-collapse:collapse;font-size:12px">`;
  html += `<tr><td style="padding:4px 6px;border-bottom:1px solid #ddd">Opening Cash</td><td style="padding:4px 6px;border-bottom:1px solid #ddd;text-align:right;font-weight:600">₱${a(openingCash)}</td></tr>`;
  html += `<tr><td style="padding:4px 6px;border-bottom:1px solid #ddd">Cash Sales (${todayTx.filter(t=>t.paymentMethod==='Cash').length} txns)</td><td style="padding:4px 6px;border-bottom:1px solid #ddd;text-align:right;color:#2563eb">₱${a(cashSales)}</td></tr>`;
  html += `<tr><td style="padding:4px 6px;border-bottom:1px solid #ddd">Credit / Other Sales</td><td style="padding:4px 6px;border-bottom:1px solid #ddd;text-align:right;color:#2563eb">₱${a(creditSales)}</td></tr>`;
  html += `<tr style="background:#f0f9ff"><td style="padding:4px 6px;border-bottom:2px solid #333;font-weight:700">Total Sales</td><td style="padding:4px 6px;border-bottom:2px solid #333;text-align:right;font-weight:700;color:#2563eb">₱${a(sales)}</td></tr>`;
  html += `<tr><td style="padding:4px 6px;border-bottom:1px solid #ddd">Expenses (${todayExp.length} items)</td><td style="padding:4px 6px;border-bottom:1px solid #ddd;text-align:right;color:#dc2626">-₱${a(expenses)}</td></tr>`;
  html += `<tr><td style="padding:4px 6px;border-bottom:1px solid #ddd">Collections / Payments (${todayPay.length} payments)</td><td style="padding:4px 6px;border-bottom:1px solid #ddd;text-align:right;color:#059669">₱${a(collections)}</td></tr>`;
  html += `<tr style="background:#f0f9ff"><td style="padding:4px 6px;border-bottom:2px solid #333;font-weight:700">Net Cash Flow (Sales + Collections - Expenses)</td><td style="padding:4px 6px;border-bottom:2px solid #333;text-align:right;font-weight:700;${cashFlow>=0?'color:#059669':'color:#dc2626'}">₱${a(cashFlow)}</td></tr>`;
  html += `<tr style="background:#fef3c7"><td style="padding:4px 6px;font-weight:700">Closing Cash (Opening + Cash Sales - Expenses + Collections)</td><td style="padding:4px 6px;text-align:right;font-weight:700">₱${a(closingCash)}</td></tr>`;
  html += `</table>`;
  if (todayTx.length > 0) {
    html += `<h4 style="margin:12px 0 4px;font-size:12px">Today's Transactions</h4>`;
    html += `<table style="width:100%;border-collapse:collapse;font-size:11px"><thead><tr style="background:#1e293b;color:white"><th style="padding:3px 5px;text-align:left">Invoice</th><th style="padding:3px 5px;text-align:left">Client</th><th style="padding:3px 5px;text-align:right">Amount</th><th style="padding:3px 5px;text-align:center">Method</th></tr></thead><tbody>`;
    todayTx.forEach((t, i) => { const bg = i % 2 === 0 ? `background:${stripe1}` : `background:${stripe2}`; html += `<tr style="border-bottom:1px solid #eee;${bg}"><td style="padding:3px 5px">${escHtml(t.invoiceNo||'—')}</td><td style="padding:3px 5px">${escHtml(t.clientName||'Walk-in')}</td><td style="padding:3px 5px;text-align:right">₱${a(t.grandTotal)}</td><td style="padding:3px 5px;text-align:center">${escHtml(t.paymentMethod||'')}</td></tr>`; });
    html += `</tbody></table>`;
  }
  if (todayExp.length > 0) {
    html += `<h4 style="margin:12px 0 4px;font-size:12px">Today's Expenses</h4>`;
    html += `<table style="width:100%;border-collapse:collapse;font-size:11px"><thead><tr style="background:#1e293b;color:white"><th style="padding:3px 5px;text-align:left">Description</th><th style="padding:3px 5px;text-align:right">Amount</th></tr></thead><tbody>`;
    todayExp.forEach((e, i) => { const bg = i % 2 === 0 ? `background:${stripe1}` : `background:${stripe2}`; html += `<tr style="border-bottom:1px solid #eee;${bg}"><td style="padding:3px 5px">${escHtml(e.description||e.name||'')}</td><td style="padding:3px 5px;text-align:right;color:#dc2626">-₱${a(e.amount)}</td></tr>`; });
    html += `</tbody></table>`;
  }
  html += `<p style="text-align:center;font-size:10px;color:#94a3b8;margin-top:12px">Generated ${fmtDateTime(new Date().toISOString())}</p>`;
  html += `</div>`;
  openPrintWindow('Daily Sales Report — ' + todayStr, 800, 700, html);
}

async function askAI() {
  const input = document.getElementById('ai-input');
  const chat = document.getElementById('ai-chat');
  const q = input.value.trim();
  if (!q) return;
  const settingsMap = {};
  state.settings.forEach(s => settingsMap[s.key] = s.value);
  const apiKey = settingsMap['aiApiKey'] || '';
  const provider = settingsMap['aiModel'] || 'ollama';
  if (!apiKey && provider !== 'ollama') { toast('Set your AI API key in Settings first, or switch to Ollama', 'warning'); document.getElementById('ai-panel').open = true; return; }
  input.value = '';
  chat.innerHTML += `<div class="flex justify-end"><div class="bg-blue-600 text-white px-3 py-2 rounded-2xl rounded-br-sm max-w-[80%]">${escapeHtml(q)}</div></div>`;
  chat.innerHTML += `<div class="flex justify-start" id="ai-loading"><div class="bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 px-3 py-2 rounded-2xl rounded-bl-sm max-w-[80%] text-xs italic">Thinking...</div></div>`;
  chat.scrollTop = chat.scrollHeight;
  document.getElementById('ai-status').textContent = 'Thinking...';
  try {
    const topClients = [...state.clients].filter(c => (c.balance||0) > 0).sort((a,b) => (b.balance||0)-(a.balance||0)).slice(0, 20);
    const recentTx = [...state.transactions].sort((a,b) => new Date(b.createdAt)-new Date(a.createdAt)).slice(0, 30);
    const lowStock = state.inventory.filter(i => (i.stock||0) <= (i.minStock||5));
    const todaySales = state.transactions.filter(t => t.date === today()).reduce((s,t) => s+(t.grandTotal||0), 0);
    const totalUtang = state.clients.reduce((s,c) => s+(c.balance||0), 0);
    let baseUrl, model, headers;
    if (provider === 'ollama') {
      baseUrl = 'http://localhost:11434/v1';
      model = 'llama3.2';
      headers = { 'Content-Type': 'application/json' };
    } else {
      baseUrl = 'https://api.openai.com/v1';
      model = provider;
      headers = { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey };
    }
    const context = `Ikaw ay isang business analyst para sa isang Philippine sari-sari store / maliit na tindahan na gumagamit ng "Shop Ledger PH". Sumagot nang maikli sa Tagalog o Taglish. Gumamit ng ₱ para sa pera.

Shop Data Snapshot:
- Total clients: ${state.clients.length}
- Total transactions: ${state.transactions.length}
- Total sales (all time): ₱${state.transactions.reduce((s,t) => s+(t.grandTotal||0), 0).toFixed(2)}
- Total expenses: ₱${state.expenses.reduce((s,e) => s+(e.amount||0), 0).toFixed(2)}
- Today's sales: ₱${todaySales.toFixed(2)}
- Total utang (outstanding balance): ₱${totalUtang.toFixed(2)}
- Total payments collected: ₱${state.payments.reduce((s,p) => s+(p.amount||0), 0).toFixed(2)}
- Inventory items: ${state.inventory.length}
- Low stock items: ${lowStock.map(i => i.name + '(' + (i.stock||0) + '/' + (i.minStock||5) + ')').join(', ') || 'None'}

Top debtors: ${topClients.map(c => c.name + '(₱' + (c.balance||0).toFixed(2) + ')').join(', ') || 'None'}

Recent transactions: ${recentTx.map(t => t.invoiceNo + ' ₱' + (t.grandTotal||0).toFixed(2) + ' ' + (t.paymentMethod||'')).join(' | ') || 'None'}

User question: ${q}`;
    const res = await fetch(baseUrl + '/chat/completions', {
      method: 'POST', headers,
      body: JSON.stringify({ model, messages: [{ role: 'user', content: context }], temperature: 0.3, stream: false })
    });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(res.status === 404 ? 'Model not found. Run: ollama pull llama3.2' : (errText || res.statusText));
    }
    const data = await res.json();
    const answer = data.choices?.[0]?.message?.content || 'No response';
    document.getElementById('ai-loading').outerHTML = `<div class="flex justify-start"><div class="bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 px-3 py-2 rounded-2xl rounded-bl-sm max-w-[80%]">${escapeHtml(answer)}</div></div>`;
    document.getElementById('ai-status').textContent = 'Answered';
  } catch (err) {
    document.getElementById('ai-loading').outerHTML = `<div class="flex justify-start"><div class="bg-red-100 dark:bg-red-900/30 text-red-600 px-3 py-2 rounded-2xl rounded-bl-sm max-w-[80%]">Error: ${escapeHtml(err.message)}</div></div>`;
    document.getElementById('ai-status').textContent = 'Error';
  }
  chat.scrollTop = chat.scrollHeight;
}

async function loadWeather() {
  const el = document.getElementById('weather-display');
  if (!el) return;
  let cache;
  try { cache = JSON.parse(localStorage.getItem('weatherCache')); } catch (_) {}
  if (cache) {
    const ago = Math.round((Date.now() - cache.ts) / 60000);
    el.innerHTML = `<div class="flex items-center gap-2"><div class="text-2xl">${getWeatherEmoji(cache.ic)}</div><div><p class="text-lg font-bold leading-tight">${cache.temp}°C</p><p class="text-xs text-gray-500">${cache.desc}</p><p class="text-xs text-gray-400">💧${cache.hum}% 🌬${cache.wind}</p><p class="text-xs text-gray-400">${escapeHtml(cache.city)}${ago > 30 ? ` <span class="text-amber-500">⏳${ago}m ago</span>` : ''}</p></div></div>`;
    if (ago < 5) return;
    el.innerHTML += '<p class="text-xs text-gray-400 mt-1"><span class="pulse-soft">↻ refreshing...</span></p>';
  } else {
    el.innerHTML = '<p class="text-gray-400 text-xs py-2"><span class="pulse-soft">📍 Loading weather...</span></p>';
  }
  try {
    const settingsMap = {};
    state.settings.forEach(s => settingsMap[s.key] = s.value);
    let loc = settingsMap['weatherLocation'] || '';
    if (navigator.geolocation && !loc) {
      try {
        const pos = await new Promise((res, rej) => navigator.geolocation.getCurrentPosition(res, rej, { timeout: 7000, enableHighAccuracy: false }));
        loc = `${pos.coords.latitude},${pos.coords.longitude}`;
      } catch (geoErr) {
        loc = 'Manila';
      }
    } else if (!loc) {
      loc = 'Manila';
    }
    const res = await fetch(`https://wttr.in/${encodeURIComponent(loc)}?format=j1`);
    if (!res.ok) throw new Error('Weather fetch failed');
    const data = await res.json();
    const c = data.current_condition[0];
    const temp = c.temp_C;
    const desc = c.weatherDesc[0].value;
    const hum = c.humidity;
    const wind = `${c.wind_Kmph} km/h ${c.windDir}`;
    const iconCode = c.weatherCode;
    const area = data.nearest_area?.[0];
    const city = area ? [area.areaName?.[0]?.value, area.region?.[0]?.value].filter(Boolean).join(', ') : loc;
    if (loc.indexOf(',') > 0 && loc.indexOf('.') > 0) {
      const existing = state.settings.find(s => s.key === 'weatherLocation');
      if (!existing || !existing.value) {
        const sItem = existing || { key: 'weatherLocation' };
        sItem.value = city;
        if (existing) await dbPut('settings', sItem); else await dbAdd('settings', sItem);
        state.settings = await dbAll('settings');
      }
    }
    try { localStorage.setItem('weatherCache', JSON.stringify({ temp, desc, hum, wind, ic: iconCode, city, ts: Date.now() })); } catch (_) {}
    el.innerHTML = `<div class="flex items-center gap-2"><div class="text-2xl">${getWeatherEmoji(iconCode)}</div><div><p class="text-lg font-bold leading-tight">${temp}°C</p><p class="text-xs text-gray-500">${desc}</p><p class="text-xs text-gray-400">💧${hum}% 🌬${wind}</p><p class="text-xs text-gray-400">${escapeHtml(city)}</p></div></div>`;
  } catch (e) {
    if (cache) {
      el.innerHTML = el.innerHTML.replace('<p class="text-xs text-gray-400 mt-1"><span class="pulse-soft">↻ refreshing...</span></p>', '');
    } else {
      el.innerHTML = `<p class="text-xs text-gray-400 py-1">🌤 Weather unavailable — check internet or set location in Settings</p>`;
    }
  }
}

function getWeatherEmoji(code) {
  const codeNum = parseInt(code);
  if (codeNum === 113) return '☀️';
  if (codeNum >= 116 && codeNum <= 119) return '⛅';
  if (codeNum >= 122 && codeNum <= 143) return '☁️';
  if (codeNum >= 176 && codeNum <= 200) return '🌧️';
  if (codeNum >= 227 && codeNum <= 230) return '🌨️';
  if (codeNum >= 248 && codeNum <= 260) return '🌫️';
  if (codeNum >= 263 && codeNum <= 389) return '⛈️';
  return '🌤️';
}

const PH_HOLIDAYS_FALLBACK = {
  '01-01': { localName: 'New Year\'s Day' },
  '02-25': { localName: 'EDSA People Power Revolution' },
  '04-09': { localName: 'Day of Valor' },
  '05-01': { localName: 'Labor Day' },
  '06-12': { localName: 'Independence Day' },
  '08-21': { localName: 'Ninoy Aquino Day' },
  '08-28': { localName: 'National Heroes Day' },
  '11-01': { localName: 'All Saints\' Day' },
  '11-02': { localName: 'All Souls\' Day' },
  '11-30': { localName: 'Bonifacio Day' },
  '12-08': { localName: 'Feast of the Immaculate Conception' },
  '12-24': { localName: 'Christmas Eve' },
  '12-25': { localName: 'Christmas Day' },
  '12-30': { localName: 'Rizal Day' },
  '12-31': { localName: 'New Year\'s Eve' }
};

function _getHolidayYears() {
  const y = new Date().getFullYear();
  const years = [y];
  if (new Date().getMonth() >= 9) years.push(y + 1);
  return years;
}

async function _fetchHolidayCache(year) {
  const cached = state.settings.find(s => s.key === 'holidays_' + year);
  if (cached) return JSON.parse(cached.value);
  return null;
}

async function _saveHolidayCache(year, holidays) {
  const existing = state.settings.find(s => s.key === 'holidays_' + year);
  const payload = { key: 'holidays_' + year, value: JSON.stringify(holidays) };
  if (existing) { existing.value = payload.value; await dbPut('settings', existing); }
  else await dbAdd('settings', payload);
  state.settings = await dbAll('settings');
}

function _fillFallbackHolidays(year, holidays) {
  const existingDates = new Set(holidays.map(h => h.date));
  for (const [mmdd, info] of Object.entries(PH_HOLIDAYS_FALLBACK)) {
    const date = year + '-' + mmdd;
    if (!existingDates.has(date)) {
      holidays.push({ date, localName: info.localName, name: info.localName, global: true });
    }
  }
  return holidays;
}

async function _loadHolidays(year) {
  let holidays = await _fetchHolidayCache(year);
  if (holidays) return holidays;
  try {
    const res = await fetch('https://date.nager.at/api/v3/publicholidays/' + year + '/PH');
    if (res.ok) {
      holidays = await res.json();
      holidays = _fillFallbackHolidays(year, holidays);
      _saveHolidayCache(year, holidays);
      return holidays;
    }
  } catch (e) { /* offline */ }
  const offlineHolidays = [];
  for (const [mmdd, info] of Object.entries(PH_HOLIDAYS_FALLBACK)) {
    offlineHolidays.push({ date: year + '-' + mmdd, localName: info.localName, name: info.localName, global: true });
  }
  return offlineHolidays;
}

async function loadHolidaysScroll() {
  const el = document.getElementById('holidays-list');
  if (!el) return;
  try {
    const years = _getHolidayYears();
    let allHolidays = [];
    for (const y of years) { allHolidays = allHolidays.concat(await _loadHolidays(y)); }
    const todayStr = new Date().toISOString().split('T')[0];
    const upcoming = allHolidays.filter(h => h.date >= todayStr).sort((a, b) => a.date.localeCompare(b.date));
    if (upcoming.length === 0) { el.innerHTML = '<div class="text-xs text-gray-400 text-center py-6">No upcoming holidays</div>'; return; }
    const fmt = h => {
      const d = new Date(h.date + 'T00:00:00');
      const lbl = d.toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric' });
      const isToday = h.date === todayStr;
      return `<div class="flex items-center justify-between px-2 py-1.5 text-xs ${isToday ? 'font-bold text-yellow-600' : ''}"><span>${escapeHtml(h.localName)}</span><span class="text-gray-400">${lbl}</span></div>`;
    };
    el.innerHTML = upcoming.map(fmt).join('') + upcoming.map(fmt).join('');
  } catch (e) {
    el.innerHTML = '<div class="text-xs text-red-500 text-center py-6">Failed to load</div>';
  }
}

async function loadNextHoliday() {
  const el = document.getElementById('next-holiday');
  if (!el) return;
  try {
    const years = _getHolidayYears();
    let allHolidays = [];
    for (const y of years) {
      const h = await _loadHolidays(y);
      allHolidays = allHolidays.concat(h);
    }
    const todayStr = new Date().toISOString().split('T')[0];
    const upcoming = allHolidays.filter(h => h.date >= todayStr).sort((a, b) => a.date.localeCompare(b.date));
    if (upcoming.length === 0) {
      el.innerHTML = '<p class="text-gray-400 text-xs">No upcoming</p>';
      return;
    }
    const next = upcoming[0];
    const d = new Date(next.date + 'T00:00:00');
    const daysUntil = Math.ceil((d - new Date()) / (1000 * 60 * 60 * 24));
    const dayLabel = d.toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric' });
    el.innerHTML = `<p class="text-sm font-semibold">${escapeHtml(next.localName)}</p><p class="text-xs text-gray-500">${dayLabel}</p><p class="text-xs font-bold ${daysUntil <= 3 ? 'text-red-600' : 'text-blue-600'}">${daysUntil === 0 ? 'Today!' : daysUntil === 1 ? 'Tomorrow!' : daysUntil + ' days away'}</p>`;
  } catch (e) {
    el.innerHTML = `<p class="text-xs text-red-500 py-1">${escapeHtml(e.message)}</p>`;
    el.innerHTML += '<p class="text-xs text-gray-400 pt-1">Tap button to retry</p>';
  }
}

async function showPHHolidays(year) {
  if (!year) year = new Date().getFullYear();
  const existing = document.getElementById('holiday-modal');
  if (existing) existing.remove();
  const backdrop = document.createElement('div');
  backdrop.id = 'holiday-modal';
  backdrop.className = 'fixed inset-0 z-50 flex items-center justify-center bg-black/50';
  backdrop.innerHTML = `<div class="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-lg max-h-[80vh] flex flex-col mx-2">
    <div class="flex items-center justify-between p-3 border-b dark:border-gray-700">
      <div class="flex items-center gap-2">
        <button onclick="this.closest('#holiday-modal').remove();showPHHolidays(${year - 1})" class="p-1 text-gray-400 hover:text-gray-600" title="Previous year"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg></button>
        <h3 class="font-bold text-sm">🇵🇭 Philippine Holidays ${year}</h3>
        <button onclick="this.closest('#holiday-modal').remove();showPHHolidays(${year + 1})" class="p-1 text-gray-400 hover:text-gray-600" title="Next year"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg></button>
      </div>
      <button onclick="this.closest('#holiday-modal').remove()" class="text-gray-400 hover:text-red-600"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
    </div>
    <div class="p-3 overflow-auto space-y-1" id="holiday-list"><p class="text-gray-400 text-xs text-center py-4">Loading...</p></div>
    <div class="p-3 border-t dark:border-gray-700 text-center"><button onclick="this.closest('#holiday-modal').remove()" class="px-4 py-1.5 bg-gray-200 dark:bg-gray-700 rounded-lg text-xs font-semibold">Close</button></div>
  </div>`;
  document.body.appendChild(backdrop);
  try {
    let holidays = await _loadHolidays(year);
    holidays.sort((a, b) => a.date.localeCompare(b.date));
    const todayStr = new Date().toISOString().split('T')[0];
    const list = document.getElementById('holiday-list');
    list.innerHTML = holidays.map(h => {
      const d = new Date(h.date + 'T00:00:00');
      const dayName = d.toLocaleDateString('en-PH', { weekday: 'long' });
      const isUpcoming = h.date >= todayStr;
      const isToday = h.date === todayStr;
      const isPastYear = year < new Date().getFullYear();
      return `<div class="flex items-center justify-between py-1.5 px-2 rounded ${isToday ? 'bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-300 dark:border-yellow-700' : 'hover:bg-gray-50 dark:hover:bg-gray-700/50'}">
        <div><p class="text-sm font-medium">${escapeHtml(h.localName)}</p><p class="text-xs text-gray-400">${dayName} — ${d.toLocaleDateString('en-PH', { month: 'long', day: 'numeric' })}</p></div>
        <span class="text-xs px-2 py-0.5 rounded-full ${isToday ? 'bg-yellow-200 dark:bg-yellow-800 text-yellow-800 dark:text-yellow-200 font-bold' : isUpcoming && !isPastYear ? 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300' : 'bg-gray-100 dark:bg-gray-700 text-gray-500'}">${isToday ? 'Today' : isUpcoming && !isPastYear ? 'Upcoming' : year >= new Date().getFullYear() ? '' : 'Passed'}</span>
      </div>`;
    }).join('');
  } catch (e) {
    document.getElementById('holiday-list').innerHTML = `<p class="text-xs text-red-500 text-center py-4">${escapeHtml(e.message)}</p>`;
  }
}

function drawDashChart() {
  if (typeof Chart === 'undefined') { setTimeout(drawDashChart, 200); return; }
  if (window.__app.chartInstances.dash) window.__app.chartInstances.dash.destroy();
  const labels = [];
  const sales = [], expenses = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const key = d.toISOString().split('T')[0];
    labels.push(d.toLocaleDateString('en-PH', { weekday: 'short' }));
    const dayTx = state.transactions.filter(t => t.date === key);
    const dayExp = state.expenses.filter(e => e.date === key);
    sales.push(dayTx.reduce((s, t) => s + (t.grandTotal || 0), 0));
    expenses.push(dayExp.reduce((s, e) => s + (e.amount || 0), 0));
  }
  const ctx = document.getElementById('dashChart');
  if (!ctx) return;
  window.__app.chartInstances.dash = new Chart(ctx, {
    type: 'bar',
    data: { labels, datasets: [
      { label: 'Sales', data: sales, backgroundColor: '#3b82f6', borderRadius: 3 },
      { label: 'Expenses', data: expenses, backgroundColor: '#ef4444', borderRadius: 3 }
    ]},
    options: { responsive: true, maintainAspectRatio: true,
      scales: { y: { beginAtZero: true, ticks: { callback: v => '₱' + v.toLocaleString() } } },
      plugins: { legend: { display: false } }
    }
  });
}

function drawPayMethodChart() {
  if (typeof Chart === 'undefined') { setTimeout(drawPayMethodChart, 200); return; }
  if (window.__app.chartInstances.payMethod) window.__app.chartInstances.payMethod.destroy();
  const todayStr = today();
  const todayTx = state.transactions.filter(t => t.date === todayStr);
  const methods = ['Cash', 'GCash', 'Maya', 'Bank Transfer'];
  const colors = ['#10b981', '#3b82f6', '#8b5cf6', '#f59e0b'];
  const data = methods.map(m => todayTx.filter(t => (t.paymentMethod||'Cash') === m).reduce((s, t) => s + (t.grandTotal || 0), 0));
  const ctx = document.getElementById('payMethodChart');
  if (!ctx) return;
  if (data.every(v => v === 0)) { ctx.parentElement.innerHTML = '<p class="text-xs text-gray-400 text-center py-4">No sales today</p>'; return; }
  window.__app.chartInstances.payMethod = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: methods.filter((_, i) => data[i] > 0),
      datasets: [{ data: data.filter(v => v > 0), backgroundColor: colors.filter((_, i) => data[i] > 0), borderRadius: 3, borderSkipped: false }]
    },
    options: {
      responsive: true, maintainAspectRatio: true,
      indexAxis: 'y',
      scales: {
        x: { beginAtZero: true, ticks: { callback: v => '₱' + Number(v).toFixed(0), font: { size: 9 } }, grid: { display: false } },
        y: { ticks: { font: { size: 9 } }, grid: { display: false } }
      },
      plugins: { legend: { display: false } }
    }
  });
}
