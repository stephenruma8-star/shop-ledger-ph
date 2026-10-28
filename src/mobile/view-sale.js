// ---------- NEW SALE (cart-based) ----------
// saleClientPreset: client id pre-picked by the caller (e.g. client detail's
// New Sale button). Replaces the dead preselectedId reference.
let saleClientPreset = null;
let saleRateClient = null; // client key whose rate was last bulk-applied to lines
let saleCartClient = ''; // who the current cart items are for ('' = walk-in); switching asks whether to keep them
let editingSaleInvoice = null; // invoiceNo being edited in-place (null = new sale)
const SALE_DRAFTS_KEY = 'slpSaleDrafts';
let saleDrafts = {};
try {
  const savedDrafts = JSON.parse(localStorage.getItem(SALE_DRAFTS_KEY) || '{}');
  if (savedDrafts && typeof savedDrafts === 'object' && !Array.isArray(savedDrafts)) saleDrafts = savedDrafts;
} catch (e) {}
function saleKey(id) { return id === undefined || id === null ? '' : String(id); }
function persistSaleDrafts() {
  try { localStorage.setItem(SALE_DRAFTS_KEY, JSON.stringify(saleDrafts)); } catch (e) {}
}
function saveSaleDraft(id) {
  const key = saleKey(id);
  if (!cart.length) return;
  saleDrafts[key] = { cart: cart.map(line => ({ ...line })) };
  persistSaleDrafts();
}
function restoreSaleDraft(id) {
  const key = saleKey(id);
  const draft = saleDrafts[key];
  cart = draft && Array.isArray(draft.cart) ? draft.cart.map(line => ({ ...line })) : [];
  if (draft) { delete saleDrafts[key]; persistSaleDrafts(); }
  tendered = 0;
  return cart.length;
}
function clearSaleDraft(id) {
  delete saleDrafts[saleKey(id)];
  persistSaleDrafts();
}
function saleDraftKeys() {
  return Object.keys(saleDrafts).filter(key => saleDrafts[key] && Array.isArray(saleDrafts[key].cart) && saleDrafts[key].cart.length);
}
function saleDraftName(key) {
  if (key === '') return T('sale.walkin');
  const c = (data.clients || []).find(x => String(x.id) === String(key));
  return c ? c.name : '#' + key;
}
function renderSale(presetId) {
  if (presetId !== undefined && presetId !== null && presetId !== '') {
    const currentKey = saleKey(saleCartClient);
    const nextKey = saleKey(presetId);
    if (currentKey !== nextKey) {
      const walkInCart = !currentKey && cart.length > 0;
      if (currentKey) saveSaleDraft(currentKey);
      saleClientPreset = presetId;
      saleCartClient = nextKey;
      if (walkInCart) {
        const targetDraft = saleDrafts[nextKey];
        if (targetDraft && Array.isArray(targetDraft.cart) && targetDraft.cart.length) {
          cart = targetDraft.cart.map(line => ({ ...line })).concat(cart);
          delete saleDrafts[nextKey];
          persistSaleDrafts();
        }
        tendered = 0;
      } else {
        restoreSaleDraft(nextKey);
      }
    } else {
      saleClientPreset = presetId;
    }
  }
  const v = document.getElementById('view');
  if (!cart.length) tendered = 0;
  // Preserve cashier-entered header state across re-renders (qty steps, cart
  // edits, pull-refresh and LAN updates all re-render; losing the discount
  // or client pick mid-sale is a data-entry bug, not a refresh).
  let keepDisc = 0, keepSc = false, keepPay = 'Cash', keepTenderCustom = '';
  try {
    if (v && v.innerHTML.indexOf('sale-discount') >= 0) {
      keepDisc = Math.max(0, parseFloat((document.getElementById('sale-discount') || {}).value) || 0);
      keepSc = !!((document.getElementById('sale-sc') || {}).checked);
      const ps = document.getElementById('sale-payment'); if (ps && ps.value) keepPay = ps.value;
      const tc = document.getElementById('tender-custom'); if (tc) keepTenderCustom = tc.value || '';
      const cs = document.getElementById('sale-client');
      if ((presetId === undefined || presetId === null || presetId === '') && cs && cs.value) saleClientPreset = cs.value;
    }
  } catch (e) {}
  const sub = cart.reduce((s, i) => s + i.qty * i.price, 0);
  v.innerHTML = `
    <div class="flex items-center justify-between gap-2 mb-3 fade-in">
      <h2 class="card-title text-base"><span class="icon-tile bg-blue-500/15 text-blue-400"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg></span>${T('nav.sale')}</h2>
      <div class="flex gap-1.5">
        <button onclick="startBarcodeScan()" class="btn btn-ghost btn-sm"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><line x1="7" y1="12" x2="17" y2="12"/></svg>${T('sale.scan')}</button>
        <button onclick="showView('catalog')" class="btn btn-primary btn-sm"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>${T('sale.add_items')}</button>
      </div>
    </div>
    <div class="relative mb-3 fade-in">
      <svg class="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
      <input id="counter-search" type="text" placeholder="${esc(T('sale.search_ph'))}" oninput="counterSearch(this.value)" autocomplete="off" class="inp pl-10" />
      <div id="counter-results" class="grid gap-1.5 mt-1.5"></div>
    </div>
    ${(data.quickItems || []).length ? `<div class="flex gap-1.5 mb-3 fade-in overflow-x-auto" style="scrollbar-width:none">${data.quickItems.slice(0, 12).map((q, qi) => `<button onclick="quickAddItem(${qi})" class="shrink-0 px-3 py-2 rounded-xl text-xs font-semibold" style="background:rgba(59,130,246,.12);border:1px solid rgba(59,130,246,.3);color:#93c5fd">${esc(q.name)} · ${peso(q.price)}</button>`).join('')}${(typeof IS_STANDALONE !== 'undefined' && IS_STANDALONE) ? `<button onclick="managePresets()" class="shrink-0 px-3 py-2 rounded-xl text-xs font-semibold" style="background:rgba(255,255,255,.06);border:1px dashed rgba(255,255,255,.2);color:#94a3b8">⚙️ Presets</button>` : ''}</div>` : ''}
    ${editingSaleInvoice ? `<div class="glass-card rounded-2xl p-3 mb-3 flex items-center justify-between gap-2 fade-in" style="background:rgba(245,158,11,.12);border:1px solid rgba(245,158,11,.4)"><span class="text-xs font-semibold text-amber-300">Editing ${esc(editingSaleInvoice)}</span><button onclick="cancelSaleEdit()" class="btn btn-ghost btn-sm">Cancel</button></div>` : ''}
    ${saleDraftBanner()}
    ${lastFailedSale ? `<button onclick="retrySale()" class="btn w-full mb-3 py-2.5 rounded-xl font-semibold text-sm fade-in" style="background:rgba(245,158,11,.15);border:1px solid rgba(245,158,11,.5);color:#fbbf24"><svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" class="shrink-0"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>${T('sale.retry')}</button>` : ''}
    <div class="glass-card rounded-2xl p-2 mb-3 fade-in">
      ${cart.length ? cart.map((i, idx) => {
        const item = itemById(i.invId);
        const variants = (item && item.variants) || [];
        const rate = i.intRate || 0;
        return `
        <div class="py-2.5 px-1.5" id="mc-row-${idx}">
          <div class="row">
            <span class="w-10 h-10 rounded-xl overflow-hidden bg-gray-800 border border-white/10 flex items-center justify-center shrink-0">${item && itemImage(item) ? '<img src="' + itemImage(item) + '" alt="" class="w-full h-full object-cover" />' : '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="16.5" y1="9.4" x2="7.5" y2="4.21"/><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>'}</span>
            <div class="flex-1 min-w-0">
              <div class="text-sm font-medium truncate text-gray-200">${esc(i.name)}${i.variantName ? ' <span class="text-gray-500">· ' + esc(i.variantName) + '</span>' : ''}</div>
              <div class="text-[11px] text-gray-500">${peso(i.price)} ${T('sale.each')}${i.date ? ' · ' + esc(i.date) : ''}</div>
            </div>
            <div class="flex items-center gap-1 shrink-0">
              <button onclick="cartStep(${idx},-1)" class="w-8 h-8 rounded-lg font-bold text-gray-200" style="background:rgba(30,41,59,.6);border:1px solid rgba(255,255,255,.09)">−</button>
              <span class="w-7 text-center text-sm font-bold text-gray-100 num">${i.qty}</span>
              <button onclick="cartStep(${idx},1)" class="w-8 h-8 rounded-lg font-bold text-gray-200" style="background:rgba(30,41,59,.6);border:1px solid rgba(255,255,255,.09)">+</button>
            </div>
            <div class="text-[13px] font-bold w-[3.6rem] text-right text-gray-100 num shrink-0" id="mc-amt-${idx}">${peso(i.qty * i.price + lineIntCalc(i.qty * i.price, rate, i.date))}</div>
            <button onclick="cartRemove(${idx})" class="text-red-400 hover:text-red-300 p-1.5 shrink-0" title="Remove"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>
          </div>
          <div class="flex gap-1.5 mt-1.5 pl-[3.25rem]">
            <input type="date" value="${escAttr(i.date || phoneToday())}" onchange="cartLineDate(${idx},this.value)" class="w-[6.8rem] text-[11px] px-1.5 py-1.5 rounded-lg bg-white/5 border border-white/10 text-gray-200 outline-none shrink-0" title="Item date — interest counts from here" />
            ${variants.length ? `<select onchange="cartLineVariant(${idx},this.value)" class="flex-1 min-w-0 text-[11px] px-1.5 py-1.5 rounded-lg bg-white/5 border border-white/10 text-gray-200 outline-none">${variants.map(v => '<option value="' + escAttr(v.name) + '"' + ((i.variantName || variants[0].name) === v.name ? ' selected' : '') + '>' + esc(v.name) + '</option>').join('')}</select>` : ''}
            <select id="sale-rate-${idx}" onchange="cartLineRate(${idx},this.value)" class="w-20 text-[11px] px-1.5 py-1.5 rounded-lg bg-white/5 border border-white/10 text-gray-200 outline-none shrink-0" title="Interest">${intRateOptions(rate)}</select>
          </div>
        </div>`;
      }).join('')
      : `<p class="text-center text-gray-500 py-8 px-4 text-sm">${T('sale.empty_a')} <button class="text-blue-400 font-semibold underline" onclick="manualItem()">${T('sale.empty_manual')}</button></p>`}
    </div>
    <div class="glass-card rounded-2xl p-3 space-y-3 fade-in">
      <div class="flex justify-between text-sm"><span class="text-gray-400">${T('sale.subtotal')}</span><span class="text-gray-200 font-semibold num" id="sale-sub">${peso(sub)}</span></div>
      <div class="grid grid-cols-2 gap-2.5">
        <div>
          <label class="text-[11px] font-semibold uppercase tracking-wider text-gray-500 block mb-1.5">${T('sale.client')}</label>
          <select id="sale-client" onchange="saleClientChanged()" class="inp">${clientOptions()}</select>
          <div id="sale-client-bal" class="text-[11px] text-gray-500 mt-1"></div>
        </div>
        <div>
          <label class="text-[11px] font-semibold uppercase tracking-wider text-gray-500 block mb-1.5">${T('sale.payment')}</label>
          <select id="sale-payment" onchange="saleHeaderChanged()" class="inp">${['Cash', 'GCash', 'Maya', 'Bank Transfer', 'Credit (Utang)'].map(p => '<option' + (p === keepPay ? ' selected' : '') + '>' + p + '</option>').join('')}</select>
        </div>
        <div>
          <label class="text-[11px] font-semibold uppercase tracking-wider text-gray-500 block mb-1.5">${T('sale.interest')}</label>
          <select id="sale-interest" onchange="saleRateAll()" class="inp">${intRateOptions(0)}</select>
        </div>
        <div>
          <label class="text-[11px] font-semibold uppercase tracking-wider text-gray-500 block mb-1.5">${T('sale.discount')}</label>
          <input id="sale-discount" type="number" min="0" step="0.01" value="${keepDisc || 0}" oninput="saleTotals()" class="inp" />
        </div>
      </div>
      <label class="flex items-center justify-between gap-3 py-1 cursor-pointer">
        <span class="text-sm text-gray-300">${T('sale.sc')}</span>
        <input type="checkbox" id="sale-sc" onchange="saleTotals()"${keepSc ? ' checked' : ''} class="switch" />
      </label>
      <div class="flex justify-between items-center border-t border-white/10 pt-3">
        <span class="font-bold text-gray-200">${T('sale.total')}</span>
        <span class="font-bold text-lg text-green-400 num" id="sale-total">${peso(sub)}</span>
      </div>
      <div class="border-t border-white/10 pt-3">
        <div class="text-[11px] font-semibold uppercase tracking-wider text-gray-500 mb-1.5">${T('sale.tender_title')}</div>
        <div class="flex flex-wrap gap-1.5 mb-2">
          ${[20, 50, 100, 500, 1000].map(d => `<button onclick="setTender(${d})" class="px-3 py-2 rounded-xl text-sm font-bold text-gray-100" style="background:rgba(30,41,59,.6);border:1px solid rgba(255,255,255,.09)">₱${d}</button>`).join('')}
          <button onclick="setTenderExact()" class="px-3 py-2 rounded-xl text-sm font-bold text-gray-100" style="background:rgba(30,41,59,.6);border:1px solid rgba(255,255,255,.09)">${T('sale.tender_exact')}</button>
          <button onclick="setTender(0)" class="px-3 py-2 rounded-xl text-sm text-gray-400" style="background:transparent;border:1px solid rgba(255,255,255,.09)">${T('sale.tender_clear')}</button>
        </div>
        <input id="tender-custom" type="number" min="0" step="0.01" placeholder="${escAttr(T('sale.tender_custom_ph'))}" value="${escAttr(keepTenderCustom)}" oninput="setTender(parseFloat(this.value) || 0)" class="inp" />
        <div class="flex justify-between text-sm mt-2"><span class="text-gray-400">${T('sale.tendered')}</span><span id="tendered-amt" class="num text-gray-200">—</span></div>
        <div class="flex justify-between text-sm"><span class="text-gray-400">${T('sale.change')}</span><span id="tender-change" class="font-bold num text-gray-400">—</span></div>
      </div>
    </div>
    <div id="sale-save-bar" class="glass-card rounded-2xl px-3 pt-2.5 pb-3 fade-in" style="position:fixed;bottom:calc(4.4rem + env(safe-area-inset-bottom));left:50%;transform:translateX(-50%);width:min(29.5rem,calc(100% - 1.5rem));box-shadow:0 -8px 30px rgba(0,0,0,.5)">
      <div class="flex justify-between items-center mb-2">
        <span class="font-bold text-gray-200">${T('sale.total')}</span>
        <span class="font-bold text-lg text-green-400 num" id="sale-total-bar">${peso(sub)}</span>
      </div>
      <div class="flex gap-2">
        <button onclick="previewSaleDraft()" class="btn btn-ghost" id="sale-preview-btn" style="flex:0 0 auto"><svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="shrink-0"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>${T('sale.preview')}</button>
        <button onclick="submitSale()" class="btn btn-primary btn-lg flex-1" id="sale-btn"><svg xmlns="http://www.w3.org/2000/svg" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>${editingSaleInvoice ? 'Update sale' : T('sale.save')}</button>
      </div>
    </div>
    <div style="height:9rem"></div>`;
  saleTotals();
  applyClientRate();
}
function intRateOptions(sel) {
  // Same range as the desktop app: 0% then 0.5% steps up to 20%.
  const rates = [0];
  for (let i = 1; i <= 40; i++) rates.push(i / 2);
  if (sel > 0 && !rates.includes(sel)) rates.push(sel);
  return rates.sort((a, b) => a - b).map(r => '<option value="' + r + '"' + (r === sel ? ' selected' : '') + '>' + (r === 0 ? T('sale.zero_cash') : r + '%') + '</option>').join('');
}
function cartLineVariant(idx, name) {
  const line = cart[idx];
  if (!line) return;
  line.variantName = name || null;
  if (currentView === 'sale') renderSale();
}
function cartLineRate(idx, val) {
  const line = cart[idx];
  if (!line) return;
  line.intRate = Math.max(0, parseFloat(val) || 0);
  saleTotals();
  paintLineAmount(idx);
}
function paintLineAmount(idx) {
  try {
    const line = cart[idx];
    if (!line) return;
    const q = line.qty || 1, p = line.price || 0, r = line.intRate || 0;
    const el = document.getElementById('mc-amt-' + idx);
    if (el) el.textContent = peso(q * p + lineIntCalc(q * p, r, line.date));
  } catch (e) {}
}
function cartLineDate(idx, val) {
  const line = cart[idx];
  if (!line) return;
  line.date = val || phoneToday();
  saleTotals();
  paintLineAmount(idx);
}
function saleRateAll() {
  const v = parseFloat((document.getElementById('sale-interest') || {}).value) || 0;
  cart.forEach((l, idx) => {
    l.intRate = v;
    const box = document.getElementById('sale-rate-' + idx);
    if (box) {
      const opts = (box.options && typeof box.options.length === 'number') ? [...box.options] : [];
      let opt = opts.find(o => parseFloat(o.value) === v);
      if (!opt && v > 0) {
        opt = document.createElement('option');
        opt.value = String(v);
        opt.textContent = v + '%';
        box.appendChild(opt);
      }
      box.value = String(v);
    }
    paintLineAmount(idx);
  });
  saleTotals();
}
function saleDraftBanner() {
  const keys = saleDraftKeys();
  if (!keys.length) return '';
  const items = keys.reduce((sum, key) => sum + saleDrafts[key].cart.reduce((n, line) => n + (line.qty || 1), 0), 0);
  return `<button onclick="openSaleDrafts()" class="btn btn-ghost w-full mb-3" style="border-style:dashed"><span>${T('sale.drafts_n', { n: items })}</span><span class="chip chip-amber" style="padding:.05rem .45rem;font-size:.65rem">${keys.length}</span></button>`;
}
function openSaleDrafts() {
  const keys = saleDraftKeys();
  if (!keys.length) { closeQuick(); return; }
  document.getElementById('modal-root').innerHTML = `
    <div class="fixed inset-0 bg-black/70 z-[45] flex items-end sm:items-center justify-center fade-in" onclick="if(event.target===this)closeQuick()">
      <div class="w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-4 pb-6 slide-up glass-card" style="max-height:94vh;max-height:94dvh;overflow-y:auto" onclick="event.stopPropagation()">
        <div class="grabber mb-3" style="margin-bottom:.9rem"></div>
        <h3 class="font-bold text-gray-100 text-base mb-3">${T('sale.drafts_title')}</h3>
        <div class="space-y-2 mb-3">
          ${keys.map(key => {
            const lines = saleDrafts[key].cart;
            const n = lines.reduce((sum, line) => sum + (line.qty || 1), 0);
            const total = lines.reduce((sum, line) => sum + (line.qty || 1) * (line.price || 0), 0);
            return `<div class="glass-card rounded-xl p-3">
              <div class="flex items-center gap-2">
                <div class="flex-1 min-w-0">
                  <div class="font-semibold text-sm text-gray-200 truncate">${esc(saleDraftName(key))}</div>
                  <div class="text-[11px] text-gray-500">${T('sale.draft_items', { n })} · ${peso(total)}</div>
                </div>
                <button onclick="resumeSaleDraft(${jsArg(key)})" class="btn btn-primary btn-sm">${T('sale.draft_resume')}</button>
                <button onclick="deleteSaleDraft(${jsArg(key)})" class="text-red-400 p-2" title="${esc(T('sale.draft_delete'))}"><svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>
              </div>
            </div>`;
          }).join('')}
        </div>
        <button onclick="closeQuick()" class="btn btn-ghost w-full">${T('common.close')}</button>
      </div>
    </div>`;
}
function resumeSaleDraft(key) {
  key = saleKey(key);
  const currentKey = saleKey(saleCartClient);
  if (currentKey !== key) saveSaleDraft(currentKey);
  let n;
  const draft = saleDrafts[key];
  if (currentKey === key && cart.length && draft && Array.isArray(draft.cart)) {
    n = draft.cart.reduce((sum, line) => sum + (line.qty || 1), 0);
    cart = draft.cart.map(line => ({ ...line })).concat(cart);
    delete saleDrafts[key];
    persistSaleDrafts();
    tendered = 0;
  } else {
    n = restoreSaleDraft(key);
  }
  saleCartClient = key;
  saleClientPreset = key || null;
  saleRateClient = null;
  closeQuick();
  showView('sale');
  if (n) toast(T('sale.draft_loaded', { n }), 'ok');
}
function deleteSaleDraft(key) {
  clearSaleDraft(key);
  if (saleDraftKeys().length) openSaleDrafts();
  else closeQuick();
  if (currentView === 'sale') renderSale();
}
function clientOptions() {
  const picked = saleClientPreset != null ? saleClientPreset : saleCartClient;
  return '<option value="">' + T('sale.walkin') + '</option>' + data.clients.map(c => '<option value="' + c.id + '"' + (picked != null && String(c.id) === String(picked) ? ' selected' : '') + '>' + esc(c.name) + ' — ' + peso(c.balance) + '</option>').join('');
}
// Manual client switch with items in the cart: let the cashier keep those
// items for the new client or start fresh. Never silently discard work.
function saleClientChanged() {
  const sel = document.getElementById('sale-client');
  const nid = sel && sel.value ? String(sel.value) : '';
  const fromKey = saleKey(saleCartClient);
  const toKey = saleKey(nid);
  if (!cart.length) {
    if (fromKey !== toKey) {
      if (fromKey) saveSaleDraft(fromKey);
      saleCartClient = toKey;
      saleClientPreset = nid || null;
      saleRateClient = null;
      const restored = restoreSaleDraft(toKey);
      if (restored) {
        renderSale();
        toast(T('sale.draft_loaded', { n: restored }), 'ok');
        return;
      }
    } else {
      saleClientPreset = nid || null;
    }
    applyClientRate();
    return;
  }
  if (fromKey === toKey) {
    saleClientPreset = nid || null;
    applyClientRate();
    return;
  }
  const c = (data.clients || []).find(x => String(x.id) === nid);
  const n = cart.reduce((s, i) => s + (i.qty || 1), 0);
  const targetDraft = saleDrafts[toKey];
  const saved = targetDraft && Array.isArray(targetDraft.cart) ? targetDraft.cart.reduce((s, i) => s + (i.qty || 1), 0) : 0;
  const msg = saved
    ? T('sale.switch_msg_saved', { n, name: c ? c.name : T('sale.walkin'), saved })
    : T('sale.switch_msg', { n, name: c ? c.name : T('sale.walkin') });
  document.getElementById('modal-root').innerHTML = `
    <div class="fixed inset-0 bg-black/70 z-[45] flex items-end sm:items-center justify-center fade-in" onclick="if(event.target===this)cancelSwitchClient()">
      <div class="w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-5 pb-6 slide-up glass-card" style="max-height:94vh;max-height:94dvh;overflow-y:auto" onclick="event.stopPropagation()">
        <div class="grabber mb-3" style="margin-bottom:.9rem"></div>
        <h3 class="font-bold text-gray-100 text-base mb-2">${T('sale.switch_title')}</h3>
        <p class="text-sm text-gray-400 mb-4">${esc(msg)}</p>
        <button onclick="keepSwitchClient()" class="btn btn-primary btn-lg mb-2">${T('sale.switch_keep')}</button>
        <button onclick="doSwitchClient()" class="btn btn-ghost btn-lg mb-2" style="color:#fca5a5;border-color:rgba(239,68,68,.35)">${T('sale.switch_clear')}</button>
        <button onclick="cancelSwitchClient()" class="btn btn-ghost btn-lg">${T('sale.switch_cancel')}</button>
      </div>
    </div>`;
}
function switchSaleClient(nid, clearCart) {
  const fromKey = saleKey(saleCartClient);
  const toKey = saleKey(nid);
  if (fromKey !== toKey) {
    saveSaleDraft(fromKey);
    delete saleDrafts[fromKey];
    if (!clearCart) {
      const targetDraft = saleDrafts[toKey];
      if (targetDraft && Array.isArray(targetDraft.cart) && targetDraft.cart.length) {
        cart = targetDraft.cart.map(line => ({ ...line })).concat(cart);
        delete saleDrafts[toKey];
      }
    }
    persistSaleDrafts();
    tendered = 0;
  }
  if (clearCart) cart = [];
  saleCartClient = toKey;
  saleClientPreset = nid || null;
  saleRateClient = null;
  closeQuick();
  renderSale();
}
function doSwitchClient() {
  const sel = document.getElementById('sale-client');
  const nid = sel && sel.value ? String(sel.value) : '';
  switchSaleClient(nid, true);
}
function keepSwitchClient() {
  const sel = document.getElementById('sale-client');
  const nid = sel && sel.value ? String(sel.value) : '';
  switchSaleClient(nid, false);
}
function cancelSwitchClient() {
  const sel = document.getElementById('sale-client');
  if (sel) sel.value = saleCartClient || '';
  closeQuick();
  applyClientRate();
}
// Bulk-applies to lines ONLY when the client (or their rate) actually
// changed — every renderSale must not nuke per-line customizations.
function applyClientRate() {
  try {
    const sel = document.getElementById('sale-client');
    const id = sel && sel.value ? sel.value : null;
    const c = id && (data.clients || []).find(x => String(x.id) === String(id));
    const rate = (c && parseFloat(c.lastRate)) || 0;
    const box = document.getElementById('sale-interest');
    if (!box) return;
    const opts = (box.options && typeof box.options.length === 'number') ? [...box.options] : [];
    let opt = opts.find(o => parseFloat(o.value) === rate);
    if (!opt && rate > 0) {
      opt = document.createElement('option');
      opt.value = String(rate);
      opt.textContent = rate + '%';
      box.appendChild(opt);
    }
    box.value = String(rate);
    const key = String(id || '') + ':' + String(rate);
    if (saleRateClient !== key) {
      saleRateClient = key;
      if (typeof saleRateAll === 'function') saleRateAll();
      else if (typeof saleTotals === 'function') saleTotals();
    } else if (typeof saleTotals === 'function') saleTotals();
  } catch (e) {}
}
function saleTotals() {
  const sub = cart.reduce((s, i) => s + (i.qty || 1) * (i.price || 0), 0);
  const interest = cart.reduce((s, i) => s + lineIntCalc((i.qty || 1) * (i.price || 0), (i.intRate || 0), i.date), 0);
  const sc = (document.getElementById('sale-sc')?.checked) ? sub * 0.2 : 0;
  const disc = Math.max(0, parseFloat(document.getElementById('sale-discount')?.value) || 0) + sc;
  const total = Math.max(0, sub + interest - disc);
  const el = document.getElementById('sale-total'); if (el) el.textContent = peso(total);
  const bar = document.getElementById('sale-total-bar'); if (bar) bar.textContent = peso(total);
  const se = document.getElementById('sale-sub'); if (se) se.textContent = peso(sub);
  lastSaleTotal = total;
  updateTender();
  updateSaleClientPreview();
}
// Live consequence line under the client picker: exactly what saving will do
// (mirrors the server rule: the picked client is always linked; only
// non-cash methods add to the balance).
function saleHeaderChanged() { try { saleTotals(); } catch (e) {} }
function updateSaleClientPreview() {
  try {
    const box = document.getElementById('sale-client-bal');
    if (!box) return;
    const sel = document.getElementById('sale-client');
    const id = sel && sel.value ? sel.value : null;
    if (!id) { box.innerHTML = `<span class="text-gray-600">${esc(T('sale.bal_walkin'))}</span>`; return; }
    const c = (data.clients || []).find(x => String(x.id) === String(id));
    const pay = (document.getElementById('sale-payment') || {}).value || 'Cash';
    const owes = (c && c.balance) || 0;
    const nm = (c && c.name) || '';
    if (pay !== 'Cash') {
      box.innerHTML = `<span class="text-gray-400">${esc(T('sale.bal_owes', { amt: peso(owes) }))}</span> · <span class="text-orange-400 font-semibold">${esc(T('sale.bal_adds', { amt: peso(lastSaleTotal || 0) }))}</span>`;
    } else {
      box.innerHTML = `<span class="text-gray-400">${esc(T('sale.bal_owes', { amt: peso(owes) }))}</span> · <span class="text-gray-500">${esc(T('sale.bal_cash', { name: nm }))}</span>`;
    }
  } catch (e) {}
}
// Tender/change calculator state. Tendered persists across re-renders so
// stepping quantities mid-tender never wipes it; cleared on sale completion.
let tendered = 0;
let lastSaleTotal = 0;
let lastFailedSale = null;
function setTender(v) {
  tendered = Math.max(0, Number(v) || 0);
  const custom = document.getElementById('tender-custom');
  if (custom && document.activeElement !== custom) custom.value = tendered || '';
  updateTender();
}
function setTenderExact() { setTender(lastSaleTotal); }
function updateTender() {
  const tEl = document.getElementById('tendered-amt');
  const cEl = document.getElementById('tender-change');
  if (!tEl || !cEl) return;
  if (!(tendered > 0)) { tEl.textContent = '—'; cEl.textContent = '—'; cEl.className = 'font-bold num text-gray-400'; return; }
  tEl.textContent = peso(tendered);
  const change = tendered - (lastSaleTotal || 0);
  cEl.textContent = peso(change);
  cEl.className = 'font-bold num ' + (change >= 0 ? 'text-green-400' : 'text-red-400');
}
function cartStep(idx, delta) {
  const c = cart[idx]; if (!c) return;
  const stock = (itemById(c.invId)?.stock) || 9999;
  c.qty = Math.min(Math.max(1, c.qty + delta), Math.max(1, stock));
  updateCartUI();
  renderSale();
}
let cartRemoving = false;
function cartRemove(idx) {
  if (cartRemoving) return;
  const row = document.getElementById('mc-row-' + idx);
  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (row && !reduceMotion) {
    cartRemoving = true;
    row.classList.add('row-out');
    setTimeout(() => { cartRemoving = false; cart.splice(idx, 1); updateCartUI(); renderSale(); }, 220);
  } else { cart.splice(idx, 1); updateCartUI(); renderSale(); }
}
function manualItem() {
  document.getElementById('modal-root').innerHTML = `
    <div class="fixed inset-0 bg-black/70 z-[45] flex items-end sm:items-center justify-center fade-in" onclick="if(event.target===this)closeQuick()">
      <div class="w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-4 pb-6 slide-up" style="background:rgba(15,23,42,.97);border:1px solid rgba(255,255,255,.09);border-bottom:none;box-shadow:0 -12px 40px rgba(0,0,0,.5);max-height:94vh;max-height:94dvh;overflow-y:auto" onclick="event.stopPropagation()">
        <div class="grabber mb-3" style="margin-bottom:.9rem"></div>
        <div class="flex items-center justify-between mb-4">
          <div class="flex items-center gap-1.5">
            <span class="icon-tile bg-blue-500/15 text-blue-400"><svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg></span>
            <h3 class="font-bold text-gray-100 text-sm">${T('manual.title')}</h3>
          </div>
          <button onclick="closeQuick()" class="w-9 h-9 rounded-xl btn-ghost flex items-center justify-center text-gray-400"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
        </div>
        <div class="space-y-3">
          <div>
            <label class="text-[11px] font-semibold uppercase tracking-wider text-gray-500 block mb-1.5">${T('manual.name')}</label>
            <input id="m-name" type="text" placeholder="${esc(T('manual.name_ph'))}" class="inp" />
          </div>
          <div>
            <label class="text-[11px] font-semibold uppercase tracking-wider text-gray-500 block mb-1.5">${T('manual.date')}</label>
            <input id="m-date" type="date" value="${escAttr(phoneToday())}" class="inp" />
          </div>
          <div class="grid grid-cols-2 gap-2.5">
            <div>
              <label class="text-[11px] font-semibold uppercase tracking-wider text-gray-500 block mb-1.5">${T('manual.price')}</label>
              <input id="m-price" type="number" min="0" step="0.01" placeholder="0.00" class="inp" />
            </div>
            <div>
              <label class="text-[11px] font-semibold uppercase tracking-wider text-gray-500 block mb-1.5">${T('manual.qty')}</label>
              <input id="m-qty" type="number" min="1" step="1" value="1" class="inp" />
            </div>
          </div>
          <button onclick="addManualItem()" class="btn btn-primary btn-lg"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>${T('manual.add')}</button>
          <p class="text-center text-[11px] text-gray-500">${T('manual.added_count')}: <span id="m-count" class="font-bold text-gray-300 num">0</span> — ${T('manual.multi_hint')}</p>
          <button onclick="closeQuick()" class="btn btn-ghost btn-lg">${T('manual.done')}</button>
        </div>
      </div>
    </div>`;
}
function addManualItem() {
  const nameEl = document.getElementById('m-name');
  const priceEl = document.getElementById('m-price');
  const qtyEl = document.getElementById('m-qty');
  const dateEl = document.getElementById('m-date');
  const name = (nameEl && nameEl.value || '').trim();
  const price = parseFloat(priceEl && priceEl.value);
  const qty = parseInt(qtyEl && qtyEl.value) || 1;
  if (!name) { toast(T('manual.name_req'), 'err'); return; }
  if (isNaN(price) || price < 0) { toast(T('manual.price_req'), 'err'); return; }
  cart.push({ invId: null, name, qty: Math.max(1, qty), price, date: (dateEl && dateEl.value) || phoneToday() });
  // Stay open for the next item: clear the fields, keep qty + date, refocus.
  if (nameEl) nameEl.value = '';
  if (priceEl) priceEl.value = '';
  try { if (nameEl) nameEl.focus(); } catch (e) {}
  const added = cart.filter(i => !i.invId).length;
  const cnt = document.getElementById('m-count');
  if (cnt) cnt.textContent = String(added);
  updateCartUI();
  feelAdd();
  toast(T('sale.added_cart', { name }), 'ok');
  if (currentView === 'sale') renderSale();
}
function cancelSaleEdit() {
  editingSaleInvoice = null;
  cart = [];
  try { saleClientPreset = null; saleRateClient = null; saleCartClient = ''; } catch (e) {}
  updateCartUI();
  showView('transactions');
}
// Load a recorded sale into the sale cart so its items/qty/price/discount/payment
// can be edited in place, then saved with the same interface.
async function editSaleFromDetail(invoiceNo) {
  let t = null;
  try { t = await apiGet('/api/transactions/' + encodeURIComponent(invoiceNo)); }
  catch (e) { toast(T('txn.load_fail', { msg: e.message }), 'err'); return; }
  if (!t) return;
  if (t.status === 'voided' || t.status === 'return') { toast('This sale cannot be edited', 'err'); return; }
  editingSaleInvoice = t.invoiceNo || invoiceNo;
  const cid = t.clientId != null ? String(t.clientId) : '';
  const c = cid ? (data.clients || []).find(x => String(x.id) === String(cid)) : null;
  cart = (t.items || []).map(it => ({
    invId: it.invId, name: it.description || it.name || 'Item',
    qty: parseFloat(it.qty) || 1, price: it.unitCost || it.price || 0,
    intRate: it.intRate || 0, date: it.date || t.date
  }));
  tendered = 0;
  saleClientPreset = cid || null;
  saleCartClient = cid;
  // Pin the client-rate key so renderSale does not overwrite the saved per-line rates.
  saleRateClient = cid + ':' + String((c && parseFloat(c.lastRate)) || 0);
  closeQuick();
  showView('sale');
  try {
    const ps = document.getElementById('sale-payment'); if (ps) ps.value = t.paymentMethod || 'Cash';
    const de = document.getElementById('sale-discount'); if (de) de.value = String(Math.max(0, Math.round(((t.discount || 0) - (t.scDiscount || 0)) * 100) / 100));
    const sx = document.getElementById('sale-sc'); if (sx) sx.checked = (t.scDiscount || 0) > 0;
  } catch (e) {}
  renderSale();
}
async function submitSale() {
  if (!cart.length) return toast(T('sale.need_items'), 'err');
  const clientSel = document.getElementById('sale-client');
  const clientId = clientSel && clientSel.value ? parseInt(clientSel.value) : null;
  if (!takeSubmitLock('sale')) return;
  const rate = parseFloat(document.getElementById('sale-interest')?.value) || 0;
  const sc = (document.getElementById('sale-sc')?.checked) ? true : false;
  const discount = Math.max(0, parseFloat(document.getElementById('sale-discount')?.value) || 0);
  const paymentMethod = document.getElementById('sale-payment')?.value || 'Cash';
  const items = cart.map(i => {
    const it = itemById(i.invId);
    const vs = (it && it.variants) || [];
    return {
      date: i.date || phoneToday(),
      name: String(i.qty), description: i.name, qty: i.qty, unitCost: i.price,
      intRate: i.intRate || 0, invId: i.invId,
      variantName: i.variantName || (vs.length ? vs[0].name : null)
    };
  });
  const disc = discount + (sc ? (items.reduce((s, i) => s + i.qty * i.unitCost, 0) * 0.2) : 0);
  // The picked client is ALWAYS linked (cash sales show in their history
  // with no balance effect); only non-cash methods add to the balance.
  const body = { clientId, items, paymentMethod, discount: disc };
  const editing = editingSaleInvoice;
  try {
    if (editing) {
      await apiPost('/api/sales/' + encodeURIComponent(editing), body, 'PUT');
      editingSaleInvoice = null;
      lastFailedSale = null; tendered = 0;
      clearSaleDraft(clientId);
      try { saleClientPreset = null; saleRateClient = null; saleCartClient = ''; } catch (e) {}
      cart = []; updateCartUI();
      toast('Sale updated', 'ok');
      await refreshAll();
      openTxnDetail(editing);
      return;
    }
    const r = await apiPost('/api/sales', body);
    if (r.queued) { lastFailedSale = null; tendered = 0; clearSaleDraft(clientId); try { saleClientPreset = null; saleRateClient = null; saleCartClient = ''; } catch (e) {} toast(T('sale.queued'), 'ok'); cart = []; updateCartUI(); showView('home'); await refreshAll(); return; }
    lastFailedSale = null; tendered = 0;
    clearSaleDraft(clientId);
    try { saleClientPreset = null; saleRateClient = null; saleCartClient = ''; } catch (e) {}
    saleSuccessSheet(r.invoiceNo);
    announceClientBalance(clientId);
  } catch (e) {
    // Cart is kept intact so nothing is lost; one tap retries the same payload.
    lastFailedSale = { clientId, items, paymentMethod, discount: disc };
    feelErr();
    toast(T('sale.failed_keep'), 'err');
    if (currentView === 'sale') renderSale();
  } finally { releaseSubmitLock('sale'); }
}
async function retrySale() {
  if (!lastFailedSale) return;
  if (!takeSubmitLock('sale')) return;
  const rcid = lastFailedSale.clientId || null;
  toast(T('sale.retrying'), 'info');
  try {
    const r = await apiPost('/api/sales', lastFailedSale);
    if (r.queued) { lastFailedSale = null; tendered = 0; clearSaleDraft(rcid); toast(T('sale.queued'), 'ok'); cart = []; updateCartUI(); showView('home'); await refreshAll(); return; }
    lastFailedSale = null; tendered = 0;
    clearSaleDraft(rcid);
    saleSuccessSheet(r.invoiceNo);
    announceClientBalance(rcid);
  } catch (e) { feelErr(); toast(T('sale.still_failing', { msg: e.message }), 'err'); }
  finally { releaseSubmitLock('sale'); }
}
// After a client sale saves, announce their resulting balance: the visible
// proof of what the sale did (or that a cash sale added nothing).
async function announceClientBalance(clientId) {
  if (!clientId) return;
  try {
    const h = await apiGet('/api/clients/' + encodeURIComponent(clientId) + '/history');
    if (h && h.client) toast((h.client.name || 'Client') + ' now owes ' + peso(h.client.balance || 0), 'info');
  } catch (e) {}
}
// Pre-save receipt preview: the same thermal layout the printer gets, built
// from the current cart — so details can be verified before finalizing.
function previewSaleDraft() {
  if (!cart.length) { toast(T('sale.need_items'), 'err'); return; }
  const sub = cart.reduce((s, i) => s + (i.qty || 1) * (i.price || 0), 0);
  const interest = cart.reduce((s, i) => s + lineIntCalc((i.qty || 1) * (i.price || 0), (i.intRate || 0), i.date), 0);
  const sc = document.getElementById('sale-sc')?.checked ? sub * 0.2 : 0;
  const discInput = Math.max(0, parseFloat(document.getElementById('sale-discount')?.value) || 0);
  const grand = Math.max(0, sub + interest - discInput - sc);
  const sel = document.getElementById('sale-client');
  const cid = sel && sel.value ? sel.value : null;
  const client = cid ? (data.clients || []).find(x => String(x.id) === String(cid)) : null;
  const draft = {
    invoiceNo: 'PREVIEW',
    clientName: client ? client.name : 'Walk-in',
    createdAt: phoneToday(), date: phoneToday(),
    items: cart.map(i => ({ description: i.name, qty: i.qty || 1, unitCost: i.price || 0, intRate: i.intRate || 0, date: i.date })),
    subtotal: sub, totalInterest: interest, discount: discInput + sc, scDiscount: sc, grandTotal: grand,
    paymentMethod: (document.getElementById('sale-payment') || {}).value || 'Cash'
  };
  showReceiptPreview(draft, { draft: true });
}
function saleSuccessSheet(invoiceNo) {
  cart = []; updateCartUI();
  feelSale();
  const v = document.getElementById('view');
  v.innerHTML = `
    <div class="glass-card rounded-2xl p-6 mt-10 text-center fade-in">
      <div class="text-4xl mb-2">✅</div>
      <div class="text-lg font-bold text-gray-100 mb-1">${T('sale.success_title')}</div>
      <div class="text-sm text-gray-400 mb-4">${esc(invoiceNo || '')}</div>
      <button onclick="printSaleReceipt(this.dataset.inv)" data-inv="${escAttr(invoiceNo || '')}" class="btn btn-primary btn-lg mb-2"><svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="shrink-0"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>${T('sale.print')}</button>
      <button onclick="shareReceiptTxn(this.dataset.inv)" data-inv="${escAttr(invoiceNo || '')}" class="btn btn-ghost btn-lg mb-2"><svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="shrink-0"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.6" y1="13.5" x2="15.4" y2="17.5"/><line x1="15.4" y1="6.5" x2="8.6" y2="10.5"/></svg>${T('sale.share')}</button>
      <button onclick="showView('sale')" class="btn btn-ghost btn-lg"><svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" class="shrink-0"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>${T('sale.new')}</button>
    </div>`;
  try { window.scrollTo(0, 0); } catch (e) {}
}
async function printSaleReceipt(invoiceNo) {
  if (!invoiceNo) return;
  toast(T('sale.sending_print'), 'info');
  try {
    // Direct POST, never queued: a print job fired minutes later at the
    // counter would surprise everyone. Offline prints fail loudly instead.
    await apiPostRaw('/api/print-thermal', { transactionId: invoiceNo });
    feelOk();
    toast(T('sale.printed_ok'), 'ok');
  } catch (e) { toast(T('sale.print_failed', { msg: e.message }), 'err'); }
}
// ---------- counter search-add (type to add without leaving the sale) ----------
function counterSearch(q) {
  const box = document.getElementById('counter-results');
  if (!box) return;
  q = (q || '').trim().toLowerCase();
  if (q.length < 2) { box.innerHTML = ''; return; }
  const hits = (data.inventory || []).filter(i => ((i.name || '') + ' ' + (i.sku || '') + ' ' + (i.barcode || '')).toLowerCase().includes(q) && (i.stock || 0) > 0).slice(0, 6);
  box.innerHTML = hits.length ? hits.map(h => `
    <button onclick='counterAdd(${JSON.stringify(h.id)})' class="w-full text-left glass-card rounded-xl px-3 py-2.5 flex items-center gap-2">
      <span class="flex-1 min-w-0"><span class="block text-sm font-medium truncate text-gray-200">${esc(h.name)}</span>
      <span class="block text-[11px] text-gray-500">${peso(h.price)} · ${h.stock} left</span></span>
      <span class="text-blue-400 font-bold text-lg shrink-0">+</span>
    </button>`).join('')
    : `<p class="text-[11px] text-gray-500 text-center py-2">${T('sale.no_match')}</p>`;
}
function counterAdd(id) {
  const item = (data.inventory || []).find(i => i.id === id);
  if (!item) return;
  if ((item.stock || 0) <= 0) { feelErr(); toast(T('sale.oos_item', { name: item.name }), 'err'); return; }
  const line = cart.find(c => c.invId === item.id);
  if (line) line.qty++;
  else cart.push({ invId: item.id, name: item.name, qty: 1, price: item.price || 0 });
  updateCartUI();
  feelAdd();
  const inp = document.getElementById('counter-search');
  if (inp) inp.value = '';
  const box = document.getElementById('counter-results');
  if (box) box.innerHTML = '';
  renderSale();
  // keep focus so the cashier keeps typing the next item
  const again = document.getElementById('counter-search');
  if (again) { try { again.focus(); } catch (e) {} }
}
function quickAddItem(qi) {
  const q = (data.quickItems || [])[qi];
  if (!q) return;
  const item = (data.inventory || []).find(i => i.id === q.invId);
  if (item) {
    if ((item.stock || 0) <= 0) { feelErr(); toast(T('sale.oos_item', { name: item.name }), 'err'); return; }
    const line = cart.find(c => c.invId === item.id);
    if (line) line.qty++;
    else cart.push({ invId: item.id, name: item.name, qty: 1, price: item.price || 0 });
  } else {
    cart.push({ invId: null, name: q.name, qty: 1, price: q.price || 0 });
  }
  updateCartUI();
  feelAdd();
  toast(T('sale.added', { name: q.name }), 'ok');
  if (currentView === 'sale') renderSale();
}
// Standalone-only: manage quick-sale presets (desktop manages them in its
// own Backups screen; the LAN API is read-only). Gated at the call site.
function managePresets() {
  const list = (data.quickItems || []).map(q => `
    <div class="row py-2.5 px-1">
      <div class="flex-1 min-w-0"><div class="text-sm font-medium truncate text-gray-200">${esc(q.name)}</div>
      <div class="text-[11px] text-gray-500 num">${peso(q.price)}</div></div>
      <button onclick="deletePreset(${q.id})" class="text-red-400 text-xs px-2.5 py-1.5 rounded-lg shrink-0 inline-flex items-center gap-1" style="background:rgba(239,68,68,.1)"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>Delete</button>
    </div>`).join('') || `<p class="text-sm text-gray-500 text-center py-4">No presets yet.</p>`;
  const invOpts = (data.inventory || [])
    .filter(i => (i.stock || 0) > 0)
    .slice(0, 200)
    .map(i => `<option value="${i.id}">${esc(i.name)} · ${peso(i.price)}</option>`).join('');
  document.getElementById('modal-root').innerHTML = `
    <div class="fixed inset-0 bg-black/70 z-[45] flex items-end sm:items-center justify-center fade-in" onclick="if(event.target===this)closeQuick()">
      <div class="w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-4 pb-6 slide-up glass-card" style="max-height:94vh;max-height:94dvh;overflow-y:auto" onclick="event.stopPropagation()">
        <div class="grabber mb-3" style="margin-bottom:.9rem"></div>
        <h3 class="font-bold text-gray-100 text-sm mb-3">⚡ Quick-sale presets</h3>
        ${list}
        <div class="border-t border-white/10 mt-3 pt-3 space-y-2">
          <input id="preset-name" class="inp" maxlength="80" placeholder="Preset name" />
          <div class="flex gap-2">
            <input id="preset-price" class="inp" type="number" min="0" step="0.01" placeholder="Price" />
            <button onclick="addPreset()" class="btn btn-primary shrink-0"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" class="shrink-0"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>Add</button>
          </div>
          ${invOpts ? `<select id="preset-inv" class="inp"><option value="">— or pick a catalog item —</option>${invOpts}</select>
          <button onclick="addPresetFromCatalog()" class="btn btn-ghost w-full"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="shrink-0"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>Add catalog item as preset</button>` : ''}
        </div>
        <button onclick="closeQuick()" class="btn btn-ghost w-full mt-3"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" class="shrink-0"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>Done</button>
      </div>
    </div>`;
}
async function addPreset() {
  const name = ((document.getElementById('preset-name') || {}).value || '').trim();
  const price = parseFloat((document.getElementById('preset-price') || {}).value) || 0;
  if (!name) { toast('Preset name required', 'err'); return; }
  try {
    await apiPost('/api/quick-items', { name, price });
    data.quickItems = await apiGet('/api/quick-items');
    managePresets();
    if (currentView === 'sale') renderSale();
  } catch (e) { toast(e.message, 'err'); }
}
async function addPresetFromCatalog() {
  const sel = document.getElementById('preset-inv');
  const id = sel && sel.value ? Number(sel.value) : null;
  const item = id != null && (data.inventory || []).find(i => i.id === id);
  if (!item) return;
  try {
    await apiPost('/api/quick-items', { name: item.name, price: item.price || 0, invId: item.id });
    data.quickItems = await apiGet('/api/quick-items');
    managePresets();
    if (currentView === 'sale') renderSale();
  } catch (e) { toast(e.message, 'err'); }
}
async function deletePreset(id) {
  try {
    await apiPost('/api/quick-items/' + encodeURIComponent(id), {}, 'DELETE');
    data.quickItems = await apiGet('/api/quick-items');
    managePresets();
    if (currentView === 'sale') renderSale();
  } catch (e) { toast(e.message, 'err'); }
}
// ---------- barcode scan-to-cart ----------
// Uses the phone camera + built-in BarcodeDetector (Chrome/Edge). Plain-http
// shop Wi-Fi blocks camera access (browser rule) — then Catalog search stays
// the way in, and the https/Tailscale link unlocks scanning.
let scanStream = null;
async function scanBarcodeNative() {
  // Native scanner (Capacitor app): full-screen camera UI with no https or
  // browser-support requirements, so it works on plain-http shop Wi-Fi.
  const B = nativePlugin('CapacitorBarcodeScanner') || nativePlugin('BarcodeScanner');
  if (!B || typeof B.scanBarcode !== 'function') return null;
  const r = await B.scanBarcode({ hint: 9, scanButton: false, scanText: 'Point at a product barcode' });
  return (r && (r.ScanResult || r.scanResult || '') || '').trim();
}
async function startBarcodeScan() {
  try {
    const native = await scanBarcodeNative();
    if (native) { scanToCart(native); return; }
  } catch (e) { /* fall through to the web flow */ }
  if (!('BarcodeDetector' in window)) { toast(T('scan.need_browser'), 'err'); return; }
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { toast(T('scan.need_https'), 'err'); return; }
  try {
    scanStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
  } catch (e) { toast(T('scan.blocked'), 'err'); return; }
  let ov = document.getElementById('scan-overlay');
  if (!ov) {
    ov = document.createElement('div');
    ov.id = 'scan-overlay';
    ov.style.cssText = 'position:fixed;inset:0;z-index:60;background:#000;display:flex;flex-direction:column;';
    ov.innerHTML = `<video id="scan-video" playsinline muted style="flex:1;width:100%;object-fit:cover;"></video>
      <div style="padding:1rem;display:flex;gap:.5rem;background:#0f172a;align-items:center;">
        <div style="flex:1;color:#94a3b8;font-size:12px;">${T('scan.point')}</div>
        <button onclick="stopBarcodeScan()" class="btn btn-ghost"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" class="shrink-0"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>${T('scan.cancel')}</button>
      </div>`;
    document.body.appendChild(ov);
  } else ov.style.display = 'flex';
  const video = document.getElementById('scan-video');
  if (!video) { stopBarcodeScan(); return; }
  video.srcObject = scanStream;
  try { await video.play(); } catch (e) {}
  let det = null;
  try { det = new BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'qr_code'] }); }
  catch (e) { toast(T('scan.no_formats'), 'err'); stopBarcodeScan(); return; }
  const loop = async () => {
    try {
      const cur = document.getElementById('scan-overlay');
      if (!cur || cur.style.display === 'none') return;
      const codes = await det.detect(video);
      if (codes && codes.length) { scanToCart(String(codes[0].rawValue || '')); return; }
    } catch (e) {}
    setTimeout(loop, 250);
  };
  loop();
}
function stopBarcodeScan() {
  try {
    const ov = document.getElementById('scan-overlay');
    if (ov) ov.style.display = 'none';
    const video = document.getElementById('scan-video');
    if (video) { try { video.pause(); } catch (e) {} video.srcObject = null; }
    if (scanStream) { scanStream.getTracks().forEach(t => { try { t.stop(); } catch (e) {} }); scanStream = null; }
  } catch (e) {}
}
function scanToCart(code) {
  code = (code || '').trim();
  if (!code) return;
  const item = (data.inventory || []).find(i => String(i.barcode || '') === code || String(i.sku || '').toLowerCase() === code.toLowerCase());
  stopBarcodeScan();
  if (!item) { toast(T('sale.no_product', { code }), 'err'); return; }
  if ((item.stock || 0) <= 0) { toast(T('sale.oos_item', { name: item.name }), 'err'); return; }
  const line = cart.find(c => c.invId === item.id);
  if (line) line.qty++;
  else cart.push({ invId: item.id, name: item.name, qty: 1, price: item.price || 0 });
  updateCartUI();
  feelAdd();
  toast(T('sale.added', { name: item.name }), 'ok');
  if (currentView === 'sale') renderSale();
}

