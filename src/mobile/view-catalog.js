// ---------- CATALOG ----------
function renderCatalog(q) {
  const v = document.getElementById('view');
  const query = (q == null ? '' : q).toLowerCase();
  const items = data.inventory.filter(i => !query || (i.name || '').toLowerCase().includes(query));
  v.innerHTML = `
    <div class="flex items-center gap-2 mb-3 fade-in">
      <div class="relative flex-1">
        <svg class="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input id="cat-search" type="text" placeholder="${esc(T('cat.search_ph'))}" value="${esc(query)}" oninput="searchCatalog(this.value)" class="inp pl-10" />
      </div>
      <span class="chip chip-blue">${items.length} ${items.length === 1 ? T('cat.item') : T('cat.items')}</span>
    </div>
    ${items.length ? `
    <div class="grid grid-cols-2 sm:grid-cols-3 gap-2.5 fade-in">
      ${items.map((i, idx) => {
        const stock = i.stock || 0;
        const badge = stock <= 0
          ? '<span class="absolute top-2 left-2 chip chip-red z-10">OUT</span>'
          : stock <= (i.lowStock || 5)
            ? '<span class="absolute top-2 left-2 chip chip-amber z-10">LOW</span>'
            : '';
        return `
        <button onclick="openQuick(${i.id}, ${idx})" class="glass-card rounded-2xl overflow-hidden text-left card-hover relative w-full">
          ${badge}
          <div class="aspect-[4/3] bg-gray-800/60 flex items-center justify-center overflow-hidden">${itemImage(i) ? '<img src="' + itemImage(i) + '" alt="' + esc(i.name) + '" class="w-full h-full object-cover" loading="lazy" />' : '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#475569" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><line x1="16.5" y1="9.4" x2="7.5" y2="4.21"/><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>'}</div>
          <div class="p-2.5">
            <div class="font-semibold text-[13px] leading-tight truncate text-gray-200">${esc(i.name)}</div>
            <div class="text-green-400 font-bold text-[15px] num mt-0.5">${peso(i.price)}</div>
            <div class="text-[10.5px] mt-0.5 ${stock <= 0 ? 'text-red-400 font-semibold' : stock <= (i.lowStock || 5) ? 'text-amber-400' : 'text-gray-500'}">${stock <= 0 ? T('cat.oos') : T('cat.in_stock', { n: stock })}</div>
          </div>
        </button>`;
      }).join('')}
    </div>` : `<div class="text-center text-gray-500 py-16 fade-in">${query ? T('cat.no_match') : T('cat.empty')}</div>`}`;
}
function searchCatalog(q) { renderCatalog(q); }
function itemById(id) { return data.inventory.find(i => i.id === id); }


