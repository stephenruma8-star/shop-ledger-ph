// ---------- NEW SALE (cart-based) ----------
function renderSale() {
  const v = document.getElementById('view');
  if (!cart.length) tendered = 0;
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
    ${lastFailedSale ? `<button onclick="retrySale()" class="btn w-full mb-3 py-2.5 rounded-xl font-semibold text-sm fade-in" style="background:rgba(245,158,11,.15);border:1px solid rgba(245,158,11,.5);color:#fbbf24"><svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" class="shrink-0"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>${T('sale.retry')}</button>` : ''}
    <div class="glass-card rounded-2xl p-2 mb-3 fade-in">
      ${cart.length ? cart.map((i, idx) => `
        <div class="row py-2.5 px-1.5" id="mc-row-${idx}">
          <span class="w-10 h-10 rounded-xl overflow-hidden bg-gray-800 border border-white/10 flex items-center justify-center shrink-0">${itemById(i.invId) && itemImage(itemById(i.invId)) ? '<img src="' + itemImage(itemById(i.invId)) + '" alt="" class="w-full h-full object-cover" />' : '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="16.5" y1="9.4" x2="7.5" y2="4.21"/><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>'}</span>
          <div class="flex-1 min-w-0">
            <div class="text-sm font-medium truncate text-gray-200">${esc(i.name)}</div>
            <div class="text-[11px] text-gray-500">${peso(i.price)} ${T('sale.each')}</div>
          </div>
          <div class="flex items-center gap-1 shrink-0">
            <button onclick="cartStep(${idx},-1)" class="w-8 h-8 rounded-lg font-bold text-gray-200" style="background:rgba(30,41,59,.6);border:1px solid rgba(255,255,255,.09)">−</button>
            <span class="w-7 text-center text-sm font-bold text-gray-100 num">${i.qty}</span>
            <button onclick="cartStep(${idx},1)" class="w-8 h-8 rounded-lg font-bold text-gray-200" style="background:rgba(30,41,59,.6);border:1px solid rgba(255,255,255,.09)">+</button>
          </div>
          <div class="text-sm font-bold w-16 text-right text-gray-100 num shrink-0">${peso(i.qty * i.price)}</div>
          <button onclick="cartRemove(${idx})" class="text-red-400 hover:text-red-300 p-1.5 shrink-0" title="Remove"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>
        </div>`).join('')
      : `<p class="text-center text-gray-500 py-8 px-4 text-sm">${T('sale.empty_a')} <button class="text-blue-400 font-semibold underline" onclick="manualItem()">${T('sale.empty_manual')}</button></p>`}
    </div>
    <div class="glass-card rounded-2xl p-3 space-y-3 fade-in">
      <div class="flex justify-between text-sm"><span class="text-gray-400">${T('sale.subtotal')}</span><span class="text-gray-200 font-semibold num" id="sale-sub">${peso(sub)}</span></div>
      <div class="grid grid-cols-2 gap-2.5">
        <div>
          <label class="text-[11px] font-semibold uppercase tracking-wider text-gray-500 block mb-1.5">${T('sale.client')}</label>
          <select id="sale-client" onchange="applyClientRate()" class="inp">${clientOptions()}</select>
        </div>
        <div>
          <label class="text-[11px] font-semibold uppercase tracking-wider text-gray-500 block mb-1.5">${T('sale.payment')}</label>
          <select id="sale-payment" class="inp"><option>Cash</option><option>GCash</option><option>Maya</option><option>Bank Transfer</option></select>
        </div>
        <div>
          <label class="text-[11px] font-semibold uppercase tracking-wider text-gray-500 block mb-1.5">${T('sale.interest')}</label>
          <select id="sale-interest" onchange="saleTotals()" class="inp">${[0,5,10,15,20,25,30,40,50].map(r => '<option value="' + r + '"' + (r === 0 ? ' selected' : '') + '>' + (r === 0 ? T('sale.zero_cash') : r + '%') + '</option>').join('')}</select>
        </div>
        <div>
          <label class="text-[11px] font-semibold uppercase tracking-wider text-gray-500 block mb-1.5">${T('sale.discount')}</label>
          <input id="sale-discount" type="number" min="0" step="0.01" value="0" oninput="saleTotals()" class="inp" />
        </div>
      </div>
      <label class="flex items-center justify-between gap-3 py-1 cursor-pointer">
        <span class="text-sm text-gray-300">${T('sale.sc')}</span>
        <input type="checkbox" id="sale-sc" onchange="saleTotals()" class="switch" />
      </label>
      <label class="flex items-center justify-between gap-3 py-1 cursor-pointer">
        <span class="text-sm text-gray-300">${T('sale.charge')}</span>
        <input type="checkbox" id="sale-charge" class="switch" />
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
        <input id="tender-custom" type="number" min="0" step="0.01" placeholder="${esc(T('sale.tender_custom_ph'))}" oninput="setTender(parseFloat(this.value) || 0)" class="inp" />
        <div class="flex justify-between text-sm mt-2"><span class="text-gray-400">${T('sale.tendered')}</span><span id="tendered-amt" class="num text-gray-200">—</span></div>
        <div class="flex justify-between text-sm"><span class="text-gray-400">${T('sale.change')}</span><span id="tender-change" class="font-bold num text-gray-400">—</span></div>
      </div>
      <button onclick="submitSale()" class="btn btn-primary btn-lg" id="sale-btn"><svg xmlns="http://www.w3.org/2000/svg" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>${T('sale.save')}</button>
    </div>`;
  saleTotals();
}
function clientOptions() {
  return '<option value="">' + T('sale.walkin') + '</option>' + data.clients.map(c => '<option value="' + c.id + '">' + esc(c.name) + ' — ' + peso(c.balance) + '</option>').join('');
}
// Preset the interest picker from the client's most recent rated sale
// (mirrors the desktop rate memory; the cashier can still change it).
function applyClientRate() {
  try {
    const sel = document.getElementById('sale-client');
    const id = sel && sel.value ? sel.value : null;
    const c = id && (data.clients || []).find(x => String(x.id) === String(id));
    const rate = (c && parseFloat(c.lastRate)) || 0;
    const box = document.getElementById('sale-interest');
    if (!box) return;
    let opt = [...box.options].find(o => parseFloat(o.value) === rate);
    if (!opt && rate > 0) {
      opt = document.createElement('option');
      opt.value = String(rate);
      opt.textContent = rate + '%';
      box.appendChild(opt);
    }
    box.value = String(rate);
    if (typeof saleTotals === 'function') saleTotals();
  } catch (e) {}
}
function saleTotals() {
  const sub = cart.reduce((s, i) => s + i.qty * i.price, 0);
  const rate = parseFloat(document.getElementById('sale-interest')?.value) || 0;
  const interest = sub * (rate / 100);
  const sc = (document.getElementById('sale-sc')?.checked) ? sub * 0.2 : 0;
  const disc = Math.max(0, parseFloat(document.getElementById('sale-discount')?.value) || 0) + sc;
  const total = Math.max(0, sub + interest - disc);
  const el = document.getElementById('sale-total'); if (el) el.textContent = peso(total);
  const se = document.getElementById('sale-sub'); if (se) se.textContent = peso(sub);
  lastSaleTotal = total;
  updateTender();
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
      <div class="w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-4 pb-6 slide-up" style="background:rgba(15,23,42,.97);border:1px solid rgba(255,255,255,.09);border-bottom:none;box-shadow:0 -12px 40px rgba(0,0,0,.5);max-height:92dvh;overflow-y:auto" onclick="event.stopPropagation()">
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
        </div>
      </div>
    </div>`;
}
function addManualItem() {
  const name = (document.getElementById('m-name').value || '').trim();
  const price = parseFloat(document.getElementById('m-price').value);
  const qty = parseInt(document.getElementById('m-qty').value) || 1;
  if (!name) { toast(T('manual.name_req'), 'err'); return; }
  if (isNaN(price) || price < 0) { toast(T('manual.price_req'), 'err'); return; }
  cart.push({ invId: null, name, qty: Math.max(1, qty), price });
  closeQuick();
  updateCartUI();
  feelAdd();
  toast(T('sale.added_cart', { name }), 'ok');
  if (currentView === 'sale') renderSale();
}
async function submitSale() {
  if (!cart.length) return toast(T('sale.need_items'), 'err');
  if (!takeSubmitLock('sale')) return;
  const clientSel = document.getElementById('sale-client');
  const clientId = clientSel && clientSel.value ? parseInt(clientSel.value) : null;
  const charge = document.getElementById('sale-charge')?.checked;
  if (charge && !clientId) return toast(T('sale.need_client'), 'err');
  const rate = parseFloat(document.getElementById('sale-interest')?.value) || 0;
  const sc = (document.getElementById('sale-sc')?.checked) ? true : false;
  const discount = Math.max(0, parseFloat(document.getElementById('sale-discount')?.value) || 0);
  const paymentMethod = document.getElementById('sale-payment')?.value || 'Cash';
  const items = cart.map(i => ({ name: String(i.qty), description: i.name, qty: i.qty, unitCost: i.price, intRate: rate, invId: i.invId }));
  const disc = discount + (sc ? (items.reduce((s, i) => s + i.qty * i.unitCost, 0) * 0.2) : 0);
  const body = { clientId: charge ? clientId : null, items, paymentMethod, discount: disc };
  try {
    const r = await apiPost('/api/sales', body);
    if (r.queued) { lastFailedSale = null; tendered = 0; toast(T('sale.queued'), 'ok'); cart = []; updateCartUI(); showView('home'); await refreshAll(); return; }
    lastFailedSale = null; tendered = 0;
    saleSuccessSheet(r.invoiceNo);
  } catch (e) {
    // Cart is kept intact so nothing is lost; one tap retries the same payload.
    lastFailedSale = { clientId: charge ? clientId : null, items, paymentMethod, discount: disc };
    feelErr();
    toast(T('sale.failed_keep'), 'err');
    if (currentView === 'sale') renderSale();
  } finally { releaseSubmitLock('sale'); }
}
async function retrySale() {
  if (!lastFailedSale) return;
  if (!takeSubmitLock('sale')) return;
  toast(T('sale.retrying'), 'info');
  try {
    const r = await apiPost('/api/sales', lastFailedSale);
    if (r.queued) { lastFailedSale = null; tendered = 0; toast(T('sale.queued'), 'ok'); cart = []; updateCartUI(); showView('home'); await refreshAll(); return; }
    lastFailedSale = null; tendered = 0;
    saleSuccessSheet(r.invoiceNo);
  } catch (e) { feelErr(); toast(T('sale.still_failing', { msg: e.message }), 'err'); }
  finally { releaseSubmitLock('sale'); }
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
      <button onclick="printSaleReceipt('${esc(invoiceNo || '')}')" class="btn btn-primary btn-lg mb-2"><svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="shrink-0"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>${T('sale.print')}</button>
      <button onclick="shareReceiptTxn('${esc(invoiceNo || '')}')" class="btn btn-ghost btn-lg mb-2"><svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="shrink-0"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.6" y1="13.5" x2="15.4" y2="17.5"/><line x1="15.4" y1="6.5" x2="8.6" y2="10.5"/></svg>${T('sale.share')}</button>
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
      <div class="w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-4 pb-6 slide-up glass-card" style="max-height:92dvh;overflow-y:auto" onclick="event.stopPropagation()">
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

