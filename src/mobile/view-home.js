// ---------- HOME ----------
function alertsStrip() {
  const a = data.alerts || { out: [], low: [], outCount: 0, lowCount: 0 };
  if (!a.outCount && !a.lowCount) return '';
  const names = (a.out || []).slice(0, 3).map(i => esc(i.name)).join(', ') + (a.outCount > 3 ? ` +${a.outCount - 3} more` : '');
  return `<button onclick="showView('inventory')" class="w-full text-left glass-card rounded-2xl p-3 mb-2.5 fade-in" style="border:1px solid rgba(239,68,68,.4)">
    <div class="text-sm font-bold text-red-400">⚠ ${a.outCount} ${T('alerts.out')}${a.lowCount ? ` · ${a.lowCount} ${T('alerts.low')}` : ''}</div>
    ${names ? `<div class="text-[11px] text-gray-400 truncate">${names}</div>` : ''}</button>`;
}
async function renderCashierHome() {
  const v = document.getElementById('view');
  const dev = pinDeviceName();
  v.innerHTML = `
    ${alertsStrip()}
    <div class="glass-card rounded-2xl p-4 mb-2.5 fade-in text-center">
      <div class="text-base font-bold text-gray-100">${T('home.counter')}${dev ? ' · ' + esc(dev) : ''}</div>
      <div class="text-[11px] text-gray-500">${T('home.cashier_sub')}</div>
    </div>
    <div class="grid grid-cols-2 gap-2.5 fade-in">
      <button onclick="showView('sale')" class="stat-card rounded-2xl p-5 text-center card-hover"><div class="text-2xl mb-1">🧾</div><div class="text-sm font-bold text-gray-100">${T('nav.sale')}</div></button>
      <button onclick="showView('pay')" class="stat-card rounded-2xl p-5 text-center card-hover"><div class="text-2xl mb-1">💵</div><div class="text-sm font-bold text-gray-100">${T('nav.pay')}</div></button>
      <button onclick="showView('catalog')" class="stat-card rounded-2xl p-5 text-center card-hover"><div class="text-2xl mb-1">🏷️</div><div class="text-sm font-bold text-gray-100">${T('nav.catalog')}</div></button>
      <button onclick="showView('inventory')" class="stat-card rounded-2xl p-5 text-center card-hover"><div class="text-2xl mb-1">📦</div><div class="text-sm font-bold text-gray-100">${T('home.stock')}</div></button>
    </div>`;
}
async function renderHome() {
  const v = document.getElementById('view');
  v.innerHTML = skeleton(T('common.loading'));
  if (phoneRole() === 'cashier') {
    if (!data.inventory.length) await loadAll();
    return renderCashierHome();
  }
  if (!data.stats) await loadAll();
  const s = data.stats || {};
  const lowStockTop = data.inventory.filter(i => (i.stock || 0) <= (i.lowStock || 5)).sort((a, b) => (a.stock || 0) - (b.stock || 0)).slice(0, 4);
  const recent = (s.recent || []).slice(0, 4);
  v.innerHTML = `
    ${alertsStrip()}
    <div class="grid grid-cols-2 gap-2.5 fade-in">
      <div class="stat-card rounded-2xl p-3.5">
        <div class="flex items-center justify-between mb-2 gap-1">
          <span class="text-[11px] font-semibold uppercase tracking-wider text-gray-500">${T('home.today_sales')}</span>
          <span class="icon-tile bg-green-500/15 text-green-400"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="16.5" y1="9.4" x2="7.5" y2="4.21"/><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg></span>
        </div>
        <div class="text-xl font-bold text-green-400 num leading-tight">${peso(s.todaySales)}</div>
        <div class="text-[11px] text-gray-500 mt-1">${T('home.profit')} <span class="text-orange-400 font-semibold num">${peso(s.todayProfit)}</span></div>
      </div>
      <div class="stat-card rounded-2xl p-3.5">
        <div class="flex items-center justify-between mb-2 gap-1">
          <span class="text-[11px] font-semibold uppercase tracking-wider text-gray-500">${T('home.debts')}</span>
          <span class="icon-tile bg-orange-500/15 text-orange-400"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg></span>
        </div>
        <div class="text-xl font-bold text-orange-400 num leading-tight">${peso(s.totalUtang)}</div>
        <div class="text-[11px] text-gray-500 mt-1">${T('home.collected')} <span class="text-green-400 font-semibold num">${peso(s.todayCollected)}</span></div>
      </div>
      <div class="stat-card rounded-2xl p-3.5">
        <div class="flex items-center justify-between mb-2 gap-1">
          <span class="text-[11px] font-semibold uppercase tracking-wider text-gray-500">${T('home.month_sales')}</span>
          <span class="icon-tile bg-blue-500/15 text-blue-400"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg></span>
        </div>
        <div class="text-xl font-bold text-blue-400 num leading-tight">${peso(s.monthSales)}</div>
        <div class="text-[11px] text-gray-500 mt-1">${T('home.expenses')} <span class="text-red-400 font-semibold num">${peso(s.monthExpenses)}</span></div>
      </div>
      <button onclick="showView('inventory')" class="stat-card rounded-2xl p-3.5 text-left card-hover">
        <div class="flex items-center justify-between mb-2 gap-1">
          <span class="text-[11px] font-semibold uppercase tracking-wider text-gray-500">${T('home.low_stock')}</span>
          <span class="icon-tile bg-amber-500/15 text-amber-400"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg></span>
        </div>
        <div class="text-xl font-bold num leading-tight ${(s.lowStockCount || 0) > 0 ? 'text-amber-400' : 'text-green-400'}">${s.lowStockCount || 0}</div>
        <div class="text-[11px] text-gray-500 mt-1">${T('home.to_restock')}</div>
      </button>
    </div>
    <div class="grid gap-2.5 mt-2.5 md:grid-cols-2 fade-in">
      <section class="glass-card rounded-2xl p-3">
        <div class="flex items-center justify-between mb-1.5 gap-1">
          <h3 class="card-title"><span class="icon-tile bg-amber-500/15 text-amber-400"><svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="16.5" y1="9.4" x2="7.5" y2="4.21"/><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg></span>${T('home.low_stock')}</h3>
          <button onclick="showView('inventory')" class="text-xs font-semibold text-blue-400 hover:text-blue-300">${T('home.view_all')}</button>
        </div>
        ${lowStockTop.length ? lowStockTop.map(i => `
          <div class="row py-2">
            <span class="w-10 h-10 rounded-xl overflow-hidden bg-gray-800 border border-white/10 flex items-center justify-center shrink-0">${itemImage(i) ? '<img src="' + itemImage(i) + '" alt="" class="w-full h-full object-cover" loading="lazy" />' : '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="16.5" y1="9.4" x2="7.5" y2="4.21"/><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>'}</span>
            <div class="flex-1 min-w-0">
              <div class="text-sm font-medium truncate text-gray-200">${esc(i.name)}</div>
              <div class="text-[11px] ${(i.stock || 0) <= 0 ? 'text-red-400 font-semibold' : 'text-amber-400'}">${(i.stock || 0) <= 0 ? T('home.out') : T('home.left', { n: i.stock || 0 })}</div>
            </div>
            <button onclick="openQuick(${i.id})" class="btn btn-primary btn-sm">${T('home.sell')}</button>
          </div>`).join('') : `<p class="text-sm text-gray-500 text-center py-6">${T('home.all_stocked')}</p>`}
      </section>
      <section class="glass-card rounded-2xl p-3">
        <div class="flex items-center justify-between mb-1.5 gap-1">
          <h3 class="card-title"><span class="icon-tile bg-blue-500/15 text-blue-400"><svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg></span>${T('home.recent')}</h3>
          <button onclick="showView('transactions')" class="text-xs font-semibold text-blue-400 hover:text-blue-300">${T('home.view_all')}</button>
        </div>
        ${recent.length ? recent.map(t => `
          <div class="row py-2">
            <div class="flex-1 min-w-0">
              <div class="text-sm font-medium truncate text-gray-200">${esc(t.clientName || 'Walk-in')}</div>
              <div class="text-[11px] text-gray-500">${esc(t.invoiceNo)} · ${fmtDate(t.date)}</div>
            </div>
            <div class="text-sm font-bold text-green-400 num">${peso(t.grandTotal)}</div>
          </div>`).join('') : `<p class="text-sm text-gray-500 text-center py-6">${T('home.no_sales')}</p>`}
      </section>
    </div>
    <section class="glass-card rounded-2xl p-3 mt-2.5 fade-in">
      <h3 class="card-title mb-2"><span class="icon-tile bg-indigo-500/15 text-indigo-400"><svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg></span>${T('home.quick')}</h3>
      <div class="grid grid-cols-2 gap-2">
        <button onclick="showView('expenses')" class="btn btn-ghost btn-lg justify-start"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>${T('nav.expenses')}</button>
        <button onclick="showView('purchase-orders')" class="btn btn-ghost btn-lg justify-start"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="16.5" y1="9.4" x2="7.5" y2="4.21"/><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>${T('nav.purchase_orders')}</button>
        <button onclick="showView('suppliers')" class="btn btn-ghost btn-lg justify-start"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>${T('nav.suppliers')}</button>
        <button onclick="showView('reports')" class="btn btn-ghost btn-lg justify-start"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>${T('nav.reports')}</button>
      </div>
    </section>`;
}

