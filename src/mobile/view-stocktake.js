// ---------- STOCKTAKE (shelf counting) ----------
// Walk the shelves, count what is really there, save once. Only touched
// items are updated; every change is audit-logged with this phone's name.
let stocktakeTouched = {};
async function renderStocktake() {
  const v = document.getElementById('view');
  if (!data.inventory.length) { v.innerHTML = skeleton(T('common.loading')); await loadAll(); }
  stocktakeTouched = {};
  v.innerHTML = `
    <div class="flex items-center justify-between gap-2 mb-3 fade-in">
      <h2 class="card-title text-base"><span class="icon-tile bg-teal-500/15 text-teal-400"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg></span>${T('view.stocktake.title')}</h2>
      <span class="chip chip-blue" id="st-progress">${T('st.counted', { n: 0 })}</span>
    </div>
    <div class="relative mb-3 fade-in">
      <svg class="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
      <input id="st-search" type="text" placeholder="${esc(T('st.search_ph'))}" oninput="filterStocktake(this.value)" autocomplete="off" class="inp pl-10" />
    </div>
    <div class="grid gap-2.5 fade-in" id="st-grid">${stocktakeListHTML(data.inventory)}</div>
    <button onclick="submitStocktake()" class="btn btn-primary btn-lg mt-3">${T('st.save')}</button>
    <p class="text-[11px] text-gray-500 text-center mt-2">${T('st.note')}</p>`;
}
function stocktakeCounted(item) {
  if (Object.prototype.hasOwnProperty.call(stocktakeTouched, item.id)) return stocktakeTouched[item.id];
  return item.stock || 0;
}
function stocktakeListHTML(items) {
  return items.map(i => {
    const sys = i.stock || 0;
    const counted = stocktakeCounted(i);
    const diff = counted - sys;
    return `
    <div class="glass-card rounded-2xl p-3 row">
      <span class="w-10 h-10 rounded-xl overflow-hidden bg-gray-800 border border-white/10 flex items-center justify-center shrink-0">${itemImage(i) ? '<img src="' + itemImage(i) + '" alt="" class="w-full h-full object-cover" loading="lazy" />' : '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#475569" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><line x1="16.5" y1="9.4" x2="7.5" y2="4.21"/><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>'}</span>
      <div class="flex-1 min-w-0">
        <div class="text-sm font-medium truncate text-gray-200">${esc(i.name)}</div>
        <div class="text-[11px] text-gray-500">system: <span class="font-semibold text-gray-300">${sys}</span></div>
      </div>
      <button onclick="photoForItem(${JSON.stringify(i.id)})" title="${esc(T('photo.take'))}" class="btn btn-ghost btn-sm px-2 shrink-0">📷</button>
      <div class="flex items-center gap-1 shrink-0">
        <button onclick='stocktakeStep(${JSON.stringify(i.id)},-1)' class="w-8 h-8 rounded-lg font-bold text-gray-200" style="background:rgba(30,41,59,.6);border:1px solid rgba(255,255,255,.09)">−</button>
        <span id="st-c-${esc(String(i.id))}" class="w-9 text-center text-sm font-bold text-gray-100 num">${counted}</span>
        <button onclick='stocktakeStep(${JSON.stringify(i.id)},1)' class="w-8 h-8 rounded-lg font-bold text-gray-200" style="background:rgba(30,41,59,.6);border:1px solid rgba(255,255,255,.09)">+</button>
      </div>
      <span id="st-d-${esc(String(i.id))}" class="text-[11px] font-bold num w-12 text-right ${diff === 0 ? 'text-gray-500' : diff > 0 ? 'text-green-400' : 'text-red-400'}">${diff === 0 ? '—' : (diff > 0 ? '+' : '') + diff}</span>
    </div>`;
  }).join('');
}
function stocktakePaint(id) {
  try {
    const item = (data.inventory || []).find(i => i.id === id);
    if (!item) return;
    const sys = item.stock || 0;
    const counted = stocktakeCounted(item);
    const diff = counted - sys;
    const c = document.getElementById('st-c-' + id);
    if (c) c.textContent = counted;
    const d = document.getElementById('st-d-' + id);
    if (d) {
      d.textContent = diff === 0 ? '—' : (diff > 0 ? '+' : '') + diff;
      d.className = 'text-[11px] font-bold num w-12 text-right ' + (diff === 0 ? 'text-gray-500' : diff > 0 ? 'text-green-400' : 'text-red-400');
    }
    const p = document.getElementById('st-progress');
    if (p) { const n = Object.keys(stocktakeTouched).length; p.textContent = T('st.counted', { n }); }
  } catch (e) {}
}
function stocktakeStep(id, d) {
  const item = (data.inventory || []).find(i => i.id === id);
  if (!item) return;
  stocktakeTouched[id] = Math.max(0, stocktakeCounted(item) + d);
  feelAdd();
  stocktakePaint(id);
}
function stocktakeInput(id, val) {
  const item = (data.inventory || []).find(i => i.id === id);
  if (!item) return;
  const n = parseInt(val, 10);
  if (isNaN(n) || n < 0) return;
  stocktakeTouched[id] = Math.min(999999, n);
  stocktakePaint(id);
}
function filterStocktake(q) {
  q = (q || '').toLowerCase();
  const g = document.getElementById('st-grid');
  if (g) g.innerHTML = stocktakeListHTML((data.inventory || []).filter(i => ((i.name || '') + ' ' + (i.sku || '') + ' ' + (i.barcode || '')).toLowerCase().includes(q)));
}
async function submitStocktake() {
  const changes = Object.keys(stocktakeTouched).map(k => {
    const item = (data.inventory || []).find(i => String(i.id) === String(k));
    if (!item) return null;
    const counted = stocktakeTouched[k];
    if (counted === (item.stock || 0)) return null;
    return { id: item.id, name: item.name, stock: counted };
  }).filter(Boolean);
  if (!changes.length) { toast(T('st.no_diff'), 'info'); return; }
  let okCount = 0;
  const errors = [];
  for (const c of changes) {
    try {
      await apiPost('/api/inventory/adjust', { id: c.id, stock: c.stock });
      okCount++;
    } catch (e) { errors.push(c.name + ': ' + e.message); }
  }
  stocktakeTouched = {};
  if (okCount) feelSale();
  else feelErr();
  toast(okCount ? (okCount === 1 ? T('st.saved_one') : T('st.saved_many', { n: okCount })) : T('st.none'), okCount ? 'ok' : 'err');
  if (errors.length) toast(errors.slice(0, 2).join('; ') + (errors.length > 2 ? ` (+${errors.length - 2} ${T('st.more')})` : ''), 'err');
  await refreshAll();
  if (currentView === 'stocktake') renderStocktake();
}
