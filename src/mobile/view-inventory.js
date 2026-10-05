// ---------- INVENTORY ----------
async function renderInventory() {
  const v = document.getElementById('view');
  if (!data.inventory.length) { v.innerHTML = skeleton(T('common.loading')); await loadAll(); }
  const low = data.inventory.filter(i => (i.stock || 0) <= (i.lowStock || 5)).length;
  v.innerHTML = `
    <div class="flex items-center justify-between gap-2 mb-3 fade-in">
      <h2 class="card-title text-base"><span class="icon-tile bg-blue-500/15 text-blue-400"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="16.5" y1="9.4" x2="7.5" y2="4.21"/><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg></span>${T('view.inventory.title')} <span class="text-sm text-gray-500 font-normal">(${T('inv.count', { n: data.inventory.length })})</span></h2>
      <button onclick="renderItemForm(null)" class="btn btn-primary btn-sm shrink-0">+ ${T('inv.add')}</button>
    </div>
    <div class="mb-3 fade-in"><span class="chip ${low > 0 ? 'chip-amber' : 'chip-green'}">${low > 0 ? T('inv.low_n', { n: low }) : T('inv.all_ok')}</span></div>
    <div id="inv-valuation" class="mb-3"></div>
      <button onclick="showView('stocktake')" class="btn btn-ghost w-full mb-3">${T('st.start')}</button>
    <div class="relative mb-3 fade-in">
      <svg class="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
      <input id="inv-search" type="text" placeholder="${esc(T('cat.search_ph'))}" oninput="filterInventory(this.value)" class="inp pl-10" />
    </div>
    <div class="grid gap-2.5 fade-in" id="inv-grid">${invListHTML(data.inventory)}</div>`;
  loadValuation();
}
function invListHTML(items) {
  const soon = Date.now() + 30 * 86400000;
  return items.map(i => {
    const stock = i.stock || 0;
    const exp = i.expiryDate ? new Date(i.expiryDate + 'T00:00:00').getTime() : null;
    const expSoon = exp && !isNaN(exp) && exp < soon;
    return `
    <div class="glass-card rounded-2xl p-3 row card-hover">
      <span class="w-12 h-12 rounded-xl overflow-hidden bg-gray-800 border border-white/10 flex items-center justify-center shrink-0">${itemImage(i) ? '<img src="' + itemImage(i) + '" alt="" class="w-full h-full object-cover" loading="lazy" />' : '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#475569" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><line x1="16.5" y1="9.4" x2="7.5" y2="4.21"/><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>'}</span>
      <div class="flex-1 min-w-0">
        <div class="font-semibold text-sm text-gray-200 truncate">${esc(i.name)}</div>
        <div class="text-[11px] text-gray-500">${peso(i.price)} ${T('sale.each')}${expSoon ? ' · <span class="text-amber-400 font-semibold">⏳ ' + esc(i.expiryDate) + '</span>' : ''}</div>
        <div class="text-xs font-bold mt-0.5 ${stock <= 0 ? 'text-red-400' : stock <= (i.lowStock || 5) ? 'text-amber-400' : 'text-green-400'}">${stock <= 0 ? T('inv.oos') : T('inv.left', { n: stock })}</div>
      </div>
      <button onclick="openQuick(${i.id})" class="btn btn-sm ${stock <= 0 ? 'btn-ghost text-gray-500 cursor-not-allowed' : 'btn-primary'}">${T('home.sell')}</button>
      <button onclick="photoForItem(${JSON.stringify(i.id)})" title="${esc(T('photo.take'))}" class="btn btn-ghost btn-sm px-2">📷</button>
      <button onclick="renderItemForm(${JSON.stringify(i.id)})" title="${esc(T('inv.edit'))}" class="btn btn-ghost btn-sm px-2">✏️</button>
    </div>`;
  }).join('');
}
function filterInventory(q) {
  q = (q || '').toLowerCase();
  const g = document.getElementById('inv-grid');
  if (g) g.innerHTML = invListHTML(data.inventory.filter(i => (i.name || '').toLowerCase().includes(q)));
  loadValuation();
}
async function loadValuation() {
  const box = document.getElementById('inv-valuation');
  if (!box) return;
  if (phoneRole() === 'cashier') { box.innerHTML = ''; return; }
  try {
    const v = await apiGet('/api/inventory/valuation');
    if (!v) return;
    box.innerHTML = `
    <div class="grid grid-cols-3 gap-2 fade-in">
      <div class="stat-card rounded-2xl p-2.5 text-center">
        <div class="text-[11px] text-gray-500">${T('inv.val_cost')}</div>
        <div class="text-sm font-bold text-blue-400 num">${peso(v.costValue)}</div>
      </div>
      <div class="stat-card rounded-2xl p-2.5 text-center">
        <div class="text-[11px] text-gray-500">${T('inv.val_retail')}</div>
        <div class="text-sm font-bold text-green-400 num">${peso(v.retailValue)}</div>
      </div>
      <div class="stat-card rounded-2xl p-2.5 text-center">
        <div class="text-[11px] text-gray-500">${T('inv.stock')}</div>
        <div class="text-sm font-bold text-gray-200 num">${T('inv.val_units', { n: v.units || 0 })}</div>
      </div>
    </div>`;
  } catch (e) {}
}
function renderItemForm(id) {
  const it = id ? (data.inventory || []).find(i => String(i.id) === String(id)) : null;
  const vs = (it && it.variants) || [];
  document.getElementById('modal-root').innerHTML = `
    <div class="fixed inset-0 bg-black/70 z-[45] flex items-end sm:items-center justify-center fade-in" onclick="if(event.target===this)closeQuick()">
      <div class="w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-4 pb-6 slide-up glass-card" style="max-height:92dvh;overflow-y:auto" onclick="event.stopPropagation()">
        <div class="grabber mb-3" style="margin-bottom:.9rem"></div>
        <h3 class="font-bold text-gray-100 text-sm mb-3">${id ? T('inv.edit') : T('inv.add')}</h3>
        <div class="space-y-3">
          <div>
            <label class="text-[11px] font-semibold uppercase tracking-wider text-gray-500 block mb-1.5">${T('inv.name')}</label>
            <input id="if-name" type="text" maxlength="80" value="${esc(it?.name || '')}" class="inp" />
          </div>
          <div class="grid grid-cols-2 gap-2.5">
            <div>
              <label class="text-[11px] font-semibold uppercase tracking-wider text-gray-500 block mb-1.5">${T('inv.sku')}</label>
              <input id="if-sku" type="text" maxlength="40" value="${esc(it?.sku || '')}" class="inp" />
            </div>
            <div>
              <label class="text-[11px] font-semibold uppercase tracking-wider text-gray-500 block mb-1.5">${T('inv.barcode')}</label>
              <input id="if-barcode" type="text" maxlength="40" value="${esc(it?.barcode || '')}" class="inp" />
            </div>
            <div>
              <label class="text-[11px] font-semibold uppercase tracking-wider text-gray-500 block mb-1.5">${T('inv.sell')}</label>
              <input id="if-sell" type="number" min="0" step="0.01" value="${it?.sellPrice ?? it?.price ?? ''}" class="inp" />
            </div>
            <div>
              <label class="text-[11px] font-semibold uppercase tracking-wider text-gray-500 block mb-1.5">${T('inv.cost')}</label>
              <input id="if-cost" type="number" min="0" step="0.01" value="${it?.costPrice ?? ''}" class="inp" />
            </div>
            <div>
              <label class="text-[11px] font-semibold uppercase tracking-wider text-gray-500 block mb-1.5">${T('inv.stock')}</label>
              <input id="if-stock" type="number" min="0" step="1" value="${it?.stock ?? ''}" class="inp" />
            </div>
            <div>
              <label class="text-[11px] font-semibold uppercase tracking-wider text-gray-500 block mb-1.5">${T('inv.min')}</label>
              <input id="if-min" type="number" min="0" step="1" value="${it?.lowStock ?? it?.minStock ?? 5}" class="inp" />
            </div>
            <div>
              <label class="text-[11px] font-semibold uppercase tracking-wider text-gray-500 block mb-1.5">${T('inv.category')}</label>
              <input id="if-category" type="text" maxlength="40" value="${esc(it?.category || '')}" class="inp" />
            </div>
            <div>
              <label class="text-[11px] font-semibold uppercase tracking-wider text-gray-500 block mb-1.5">${T('inv.unit')}</label>
              <input id="if-unit" type="text" maxlength="12" value="${esc(it?.unit || 'pcs')}" class="inp" />
            </div>
          </div>
          <div>
            <label class="text-[11px] font-semibold uppercase tracking-wider text-gray-500 block mb-1.5">${T('inv.expiry')}</label>
            <input id="if-expiry" type="date" value="${esc(it?.expiryDate || '')}" class="inp" />
          </div>
          <div>
            <label class="text-[11px] font-semibold uppercase tracking-wider text-gray-500 block mb-1.5">${T('inv.variants')}</label>
            <div id="if-vars" class="space-y-2">
              ${(vs.length ? vs : [{ name: '', stock: '' }]).slice(0, 5).map(vv => `
              <div class="flex gap-2">
                <input type="text" maxlength="40" value="${esc(vv.name || '')}" placeholder="Size" class="inp flex-1 iv-name" />
                <input type="number" min="0" value="${vv.stock ?? ''}" placeholder="0" class="inp w-20 iv-stock" />
              </div>`).join('')}
            </div>
          </div>
          <button onclick="submitItemForm(${id ? JSON.stringify(id) : 'null'})" class="btn btn-primary btn-lg">${T('inv.save')}</button>
          ${(typeof IS_STANDALONE !== 'undefined' && IS_STANDALONE && id) ? `<button id="item-del-btn" onclick="deleteItemForm(${JSON.stringify(id)})" class="btn btn-sm w-full" style="background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.35);color:#f87171">🗑 Delete item</button>` : ''}
        </div>
      </div>
    </div>`;
}
async function submitItemForm(id) {
  const val = (x) => ((document.getElementById(x) || {}).value || '');
  const name = val('if-name').trim();
  if (!name) { toast(T('inv.need_name'), 'err'); return; }
  if (!takeSubmitLock('item')) return;
  const variants = [...document.querySelectorAll('#if-vars .iv-name')].map((el, i) => ({
    name: (el.value || '').trim(),
    stock: Math.max(0, parseInt((document.querySelectorAll('#if-vars .iv-stock')[i] || {}).value) || 0)
  })).filter(v => v.name).slice(0, 5);
  const body = {
    name, sku: val('if-sku').trim(), barcode: val('if-barcode').trim(),
    category: val('if-category').trim(),
    sellPrice: parseFloat(val('if-sell')) || 0, costPrice: parseFloat(val('if-cost')) || 0,
    stock: parseInt(val('if-stock')) || 0,
    minStock: parseInt(val('if-min')) || 5, lowStock: parseInt(val('if-min')) || 5,
    unit: val('if-unit').trim() || 'pcs', variants, expiryDate: val('if-expiry')
  };
  try {
    if (id) await apiPost('/api/inventory/' + encodeURIComponent(id), body, 'PUT');
    else await apiPost('/api/inventory', body);
    closeQuick();
    toast(id ? T('inv.updated') : T('inv.added'), 'ok');
    await refreshAll();
  } catch (e) { toast(T('inv.failed', { msg: e.message }), 'err'); }
  finally { releaseSubmitLock('item'); }
}
// Standalone-only: delete an item with no sales history.
let itemDeleteArmed = null;
async function deleteItemForm(id) {
  if (itemDeleteArmed !== id) {
    itemDeleteArmed = id;
    const btn = document.getElementById('item-del-btn');
    if (btn) btn.textContent = 'Tap again to delete this item';
    setTimeout(() => { if (itemDeleteArmed === id) { itemDeleteArmed = null; const b = document.getElementById('item-del-btn'); if (b) b.textContent = '🗑 Delete item'; } }, 5000);
    return;
  }
  itemDeleteArmed = null;
  if (!takeSubmitLock('itemdel')) return;
  try {
    await apiPost('/api/inventory/' + encodeURIComponent(id), {}, 'DELETE');
    closeQuick();
    feelOk();
    toast('Item deleted', 'ok');
    await refreshAll();
  } catch (e) { feelErr(); toast(e.message, 'err'); }
  finally { releaseSubmitLock('itemdel'); }
}
// ---------- product photos ----------
// Phone camera → downscaled JPEG → catalog thumbnail. Works on plain http
// (file picker, not getUserMedia) and degrades without canvas support.
function photoForItem(id) {
  let inp = null;
  try {
    inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = 'image/*';
    try { inp.setAttribute('capture', 'environment'); } catch (e) {}
  } catch (e) { toast(T('photo.badtype'), 'err'); return; }
  inp.onchange = () => {
    try {
      const f = inp.files && inp.files[0];
      if (!f) return;
      const rd = new FileReader();
      rd.onload = () => downscalePhoto(String((rd.result) || ''), id);
      rd.onerror = () => toast(T('photo.failed', { msg: 'read error' }), 'err');
      rd.readAsDataURL(f);
    } catch (e) { toast(T('photo.failed', { msg: e.message }), 'err'); }
  };
  try { inp.click(); } catch (e) {}
}
function loadPhotoBitmap(dataUrl) {
  return new Promise((resolve, reject) => {
    try {
      if (typeof createImageBitmap === 'function' && typeof fetch === 'function') {
        fetch(dataUrl).then(r => r.blob()).then(b => createImageBitmap(b)).then(resolve, reject);
        return;
      }
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('decode'));
      img.src = dataUrl;
    } catch (e) { reject(e); }
  });
}
async function downscalePhoto(dataUrl, id) {
  const m = /^data:(image\/(png|jpe?g|webp|gif));base64,/.exec(dataUrl || '');
  if (!m) { feelErr(); toast(T('photo.badtype'), 'err'); return; }
  let out = dataUrl;
  const bmp = await loadPhotoBitmap(dataUrl).catch(() => null);
  if (bmp && bmp.width && bmp.height) {
    try {
      const scale = Math.min(1, 800 / Math.max(bmp.width, bmp.height));
      const cv = document.createElement('canvas');
      cv.width = Math.max(1, Math.round(bmp.width * scale));
      cv.height = Math.max(1, Math.round(bmp.height * scale));
      cv.getContext('2d').drawImage(bmp, 0, 0, cv.width, cv.height);
      out = cv.toDataURL('image/jpeg', 0.72);
    } catch (e) { /* keep the original bytes */ }
  }
  if (out.length > 650000) { feelErr(); toast(T('photo.toobig'), 'err'); return; }
  try {
    const r = await apiPost('/api/inventory/' + encodeURIComponent(id) + '/photo', { image: out });
    if (r && r.queued) { toast(T('photo.queued'), 'info'); return; }
    feelOk();
    toast(T('photo.saved'), 'ok');
    await refreshAll();
  } catch (e) { feelErr(); toast(T('photo.failed', { msg: e.message }), 'err'); }
}

