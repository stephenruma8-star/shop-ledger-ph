// ---------- REPORTS ----------
async function renderReports() {
  const v = document.getElementById('view');
  if (!data.reports) { v.innerHTML = skeleton(T('common.loading')); await loadAll(); }
  const r = data.reports || { today: {}, month: {}, topItems: [], week: [] };
  const weekMax = Math.max(1, ...(r.week || []).map(d => Math.max(d.sales, d.expenses)));
  const repMonth = r.monthStr || monthKey(new Date());
  v.innerHTML = `
    <h2 class="card-title text-base mb-3 fade-in"><span class="icon-tile bg-blue-500/15 text-blue-400"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg></span>Reports</h2>
    <div class="glass-card rounded-2xl p-3 mb-3 fade-in flex items-center gap-2">
      <span class="text-xs text-gray-400 shrink-0">${T('rep.month')}</span>
      <input id="rep-month" type="month" value="${esc(repMonth)}" max="${esc(monthKey(new Date()))}" onchange="loadReportMonth()" class="inp flex-1" style="height:2.4rem" />
      ${phoneRole() === 'cashier' ? '' : `<button onclick="exportMonthCsv()" class="btn btn-ghost btn-sm shrink-0">📥 ${T('rep.export')}</button>`}
    </div>
    <div class="grid grid-cols-2 gap-2.5 mb-3 fade-in">
      <div class="stat-card rounded-2xl p-3.5">
        <div class="text-[11px] font-semibold uppercase tracking-wider text-gray-500 mb-1">${T('home.today_sales')}</div>
        <div class="text-xl font-bold text-green-400 num">${peso(r.today.sales)}</div>
        <div class="text-[11px] text-gray-500 mt-1">${T('home.expenses')} <span class="text-red-400 font-semibold num">${peso(r.today.expenses)}</span></div>
      </div>
      <div class="stat-card rounded-2xl p-3.5">
        <div class="text-[11px] font-semibold uppercase tracking-wider text-gray-500 mb-1">${T('rep.today_profit')}</div>
        <div class="text-xl font-bold num ${(r.today.profit || 0) >= 0 ? 'text-blue-400' : 'text-red-400'}">${peso(r.today.profit)}</div>
        <div class="text-[11px] text-gray-500 mt-1">${T('home.collected')} <span class="text-green-400 font-semibold num">${peso(r.today.collected)}</span>
      </div>
      <div class="stat-card rounded-2xl p-3.5">
        <div class="text-[11px] font-semibold uppercase tracking-wider text-gray-500 mb-1">${T('home.month_sales')}</div>
        <div class="text-xl font-bold text-green-400 num">${peso(r.month.sales)}</div>
        <div class="text-[11px] text-gray-500 mt-1">${T('home.expenses')} <span class="text-red-400 font-semibold num">${peso(r.month.expenses)}</span>
      </div>
      <div class="stat-card rounded-2xl p-3.5">
        <div class="text-[11px] font-semibold uppercase tracking-wider text-gray-500 mb-1">${T('rep.month_profit')}</div>
        <div class="text-xl font-bold num ${(r.month.profit || 0) >= 0 ? 'text-blue-400' : 'text-red-400'}">${peso(r.month.profit)}</div>
        <div class="text-[11px] text-gray-500 mt-1">${T('home.collected')} <span class="text-green-400 font-semibold num">${peso(r.month.collected)}</span>
      </div>
    </div>
    <section class="glass-card rounded-2xl p-3 mb-3 fade-in">
      <h3 class="card-title mb-2"><span class="icon-tile bg-amber-500/15 text-amber-400"><svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg></span>${T('rep.week')}</h3>
      <div class="flex items-end gap-2" style="height:6rem">
        ${(r.week || []).map(d => {
          const h = Math.max(4, Math.round((Math.max(d.sales, d.expenses) / weekMax) * 4.5));
          return `
          <div class="flex-1 flex flex-col items-center justify-end gap-1">
            <div class="w-full rounded-t-lg bg-blue-500/70" style="height:${h}rem" title="Sales ${peso(d.sales)}"></div>
            <div class="text-[9px] text-gray-500">${fmtDate(d.date).replace(', ', '')}</div>
          </div>`;
        }).join('')}
      </div>
      <div class="flex gap-3 mt-2 text-[10px] text-gray-500"><span class="flex items-center gap-1"><span class="w-2 h-2 rounded-sm bg-blue-500/70 inline-block"></span>${T('nav.transactions')}</span></div>
    </section>
    <section class="glass-card rounded-2xl p-3 fade-in">
      <h3 class="card-title mb-2"><span class="icon-tile bg-green-500/15 text-green-400"><svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="16.5" y1="9.4" x2="7.5" y2="4.21"/><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg></span>${T('rep.top')}</h3>
      ${(r.topItems || []).length ? (r.topItems || []).map((t, i) => `
        <div class="row py-2">
          <span class="w-6 h-6 rounded-full text-[11px] font-bold flex items-center justify-center ${i === 0 ? 'bg-amber-500/20 text-amber-400' : 'bg-white/10 text-gray-400'} shrink-0">${i + 1}</span>
          <div class="flex-1 min-w-0">
            <div class="text-sm font-medium truncate text-gray-200">${esc(t.name)}</div>
            <div class="text-[11px] text-gray-500">${T('rep.sold', { qty: t.qty })}</div>
          </div>
          <div class="text-sm font-bold text-green-400 num">${peso(t.amount)}</div>
        </div>`).join('') : `<p class="text-sm text-gray-500 text-center py-6">${T('home.no_sales')}</p>`}
    </section>
    ${arAgingHTML()}
    ${salesByClientHTML()}`;
}
// Debt aging buckets + per-client sales, computed on-device from cached data.
function arAgingHTML() {
  const today = new Date().toISOString().split('T')[0];
  const buckets = [
    { key: 'rep.ar_current', total: 0 },
    { key: 'rep.ar_30', total: 0 },
    { key: 'rep.ar_60', total: 0 },
    { key: 'rep.ar_over', total: 0 }
  ];
  for (const c of (data.clients || [])) {
    const bal = c.balance || 0;
    if (bal <= 0) continue;
    let idx = 0;
    if (c.dueDate && c.dueDate < today) {
      const days = Math.floor((new Date(today + 'T00:00:00') - new Date((c.dueDate || '') + 'T00:00:00')) / 86400000);
      idx = days <= 30 ? 1 : days <= 60 ? 2 : 3;
    }
    buckets[idx].total += bal;
  }
  if (!buckets.some(b => b.total > 0)) return '';
  return `
    <section class="glass-card rounded-2xl p-3 mb-3 fade-in">
      <h3 class="card-title mb-2">${T('rep.ar_title')}</h3>
      ${buckets.map(b => `
      <div class="flex justify-between text-sm py-1">
        <span class="text-gray-400">${T(b.key)}</span>
        <span class="num font-semibold ${b.total > 0 ? 'text-orange-400' : 'text-gray-500'}">${peso(b.total)}</span>
      </div>`).join('')}
    </section>`;
}
function salesByClientHTML() {
  const byClient = {};
  for (const t of (data.transactions || [])) {
    if (t.status === 'voided') continue;
    const nm = t.clientName || 'Walk-in';
    byClient[nm] = byClient[nm] || { name: nm, total: 0, count: 0 };
    byClient[nm].total += t.grandTotal || 0;
    byClient[nm].count++;
  }
  const rows = Object.values(byClient).sort((a, b) => b.total - a.total).slice(0, 8);
  if (!rows.length) return '';
  return `
    <section class="glass-card rounded-2xl p-3 fade-in">
      <h3 class="card-title mb-2">${T('rep.sbc')}</h3>
      ${rows.map(r => `
      <div class="flex justify-between text-sm py-1 gap-2">
        <span class="text-gray-200 truncate">${esc(r.name)} <span class="text-gray-500">· ${r.count}</span></span>
        <span class="num font-semibold shrink-0 ${r.total < 0 ? 'text-red-400' : 'text-green-400'}">${peso(r.total)}</span>
      </div>`).join('')}
    </section>`;
}
function monthKey(d) {  try {
    const dt = d instanceof Date ? d : new Date(d);
    if (isNaN(dt)) return '';
    return dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0');
  } catch (e) { return ''; }
}
async function loadReportMonth() {
  const inp = document.getElementById('rep-month');
  const m = ((inp && inp.value) || '').trim();
  if (!/^\d{4}-\d{2}$/.test(m)) return;
  try {
    const r = await apiGet('/api/reports?month=' + m);
    if (r) { data.reports = r; renderReports(); }
  } catch (e) { toast(T('rep.load_fail', { m, msg: e.message }), 'err'); }
}
function exportMonthCsv() {
  const inp = document.getElementById('rep-month');
  const m = ((inp && inp.value) || '').trim() || monthKey(new Date());
  if (!/^\d{4}-\d{2}$/.test(m)) return;
  // Standalone: build the CSV on-device and share it (no server download).
  if (typeof IS_STANDALONE !== 'undefined' && IS_STANDALONE) {
    exportMonthCsvLocal(m);
    return;
  }
  const tok = getToken();
  if (!tok) { renderPairScreen(); return; }
  // The CSV downloads through the system browser (auth travels in the URL,
  // same as the QR links) and opens straight into Excel/Sheets.
  const url = API + '/api/reports/export.csv?month=' + m + '&token=' + encodeURIComponent(tok);
  toast(T('rep.opening'), 'info');
  try {
    const B = nativePlugin('Browser');
    if (B && typeof B.open === 'function') { B.open({ url }).catch(() => {}); return; }
  } catch (e) {}
  try { window.open(url, '_blank'); } catch (e) { toast(T('upd.open_fail'), 'err'); }
}
async function exportMonthCsvLocal(m) {
  try {
    const r = await apiGet('/api/reports/export.csv?month=' + m);
    if (!r || !r.csv) throw new Error('empty report');
    await shareText('ShopLedger-' + m + '.csv', r.csv);
  } catch (e) { toast(T('rep.load_fail', { m, msg: e.message }), 'err'); }
}
async function shareMonthReport() {
  const r = data.reports;
  if (!r || !r.month) return;
  const s = data.settings || {};
  const L = [];
  L.push((s.shopName || 'Shop Ledger PH') + ' — ' + (r.monthStr || ''));
  L.push('Sales: ' + peso(r.month.sales) + ' | Expenses: ' + peso(r.month.expenses) + ' | Profit: ' + peso(r.month.profit) + ' | Collected: ' + peso(r.month.collected));
  (r.topItems || []).slice(0, 5).forEach((t, i) => L.push(`${i + 1}. ${t.name} — ${t.qty} sold (${peso(t.amount)})`));
  await shareText('Monthly report ' + (r.monthStr || ''), L.join('\n'));
}

