// ---------- PURCHASE ORDERS ----------
async function renderPOs() {
  const v = document.getElementById('view');
  if (!data.purchaseOrders.length) { v.innerHTML = skeleton(T('common.loading')); await loadAll(); }
  v.innerHTML = `
    <div class="flex items-center justify-between gap-2 mb-3 fade-in">
      <h2 class="card-title text-base"><span class="icon-tile bg-teal-500/15 text-teal-400"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="16.5" y1="9.4" x2="7.5" y2="4.21"/><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg></span>${T('view.purchase-orders.title')}</h2>
      <button onclick="newPO()" class="btn btn-primary btn-sm"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>${T('po.new')}</button>
    </div>
    <div class="grid gap-2.5 fade-in">
      ${data.purchaseOrders.map(po => `
        <div class="glass-card rounded-2xl p-3 card-hover">
          <div class="flex items-center justify-between gap-2">
            <div class="font-bold text-sm text-gray-200">${esc(po.poNo || 'PO-')}</div>
            <span class="chip chip-amber">${esc(po.status || 'Pending')}</span>
          </div>
          <div class="text-[11px] text-gray-500 mt-0.5">${esc(po.supplierName || T('po.unknown_supplier'))} · ${fmtDate(po.date)}</div>
          <div class="text-[11px] text-gray-500 mt-0.5">${po.items.length} ${po.items.length === 1 ? T('cat.item') : T('cat.items')}</div>
          <div class="flex items-center justify-between mt-1.5">
            <div class="text-sm font-bold text-teal-400 num">${peso(po.total)}</div>
            <div class="flex gap-1.5">
            ${(typeof IS_STANDALONE !== 'undefined' && IS_STANDALONE) && po.status !== 'Received' ? `<button onclick="editPO(${JSON.stringify(po.id)})" class="btn btn-ghost btn-sm" style="font-size:.75rem">✏️</button><button onclick="deletePO(${JSON.stringify(po.id)})" id="po-del-${po.id}" class="btn btn-sm" style="background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.35);color:#f87171;font-size:.75rem">🗑</button>` : ''}
            ${phoneRole() !== 'cashier' && po.status !== 'Received' ? `<button onclick="receivePO(${JSON.stringify(po.id)})" class="btn btn-ghost btn-sm">${T('po.receive')}</button>` : ''}
            </div>
          </div>
        </div>`).join('') || `<div class="text-center text-gray-500 py-16 fade-in">${T('po.empty')}</div>`}
    </div>`;
}
let poReceiveArmed = null;
async function receivePO(id) {
  if (poReceiveArmed !== id) {
    poReceiveArmed = id;
    toast(T('po.receive_confirm'), 'info');
    setTimeout(() => { if (poReceiveArmed === id) poReceiveArmed = null; }, 5000);
    return;
  }
  poReceiveArmed = null;
  if (!takeSubmitLock('porecv')) return;
  try {
    await apiPost('/api/purchase-orders/' + encodeURIComponent(id) + '/receive', {});
    feelSale();
    toast(T('po.received'), 'ok');
    await refreshAll();
  } catch (e) { feelErr(); toast(T('po.receive_failed', { msg: e.message }), 'err'); }
  finally { releaseSubmitLock('porecv'); }
}
// Standalone-only: cancel a pending purchase order (received ones stay).
let poDeleteArmed = null;
async function deletePO(id) {
  if (poDeleteArmed !== id) {
    poDeleteArmed = id;
    const btn = document.getElementById('po-del-' + id);
    if (btn) btn.textContent = 'Sure?';
    setTimeout(() => { if (poDeleteArmed === id) { poDeleteArmed = null; if (typeof renderPOs === 'function') renderPOs(); } }, 5000);
    return;
  }
  poDeleteArmed = null;
  if (!takeSubmitLock('podel')) return;
  try {
    await apiPost('/api/purchase-orders/' + encodeURIComponent(id), {}, 'DELETE');
    feelOk();
    toast('Order cancelled', 'ok');
    await refreshAll();
  } catch (e) { feelErr(); toast(e.message, 'err'); }
  finally { releaseSubmitLock('podel'); }
}
function addPO() {
  if (editingPoId == null) poItems = [];
  document.getElementById('modal-root').innerHTML = `
    <div class="fixed inset-0 bg-black/70 z-[45] flex items-end sm:items-center justify-center fade-in" onclick="if(event.target===this)closeQuick()">
      <div class="w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-4 pb-6 slide-up" style="background:rgba(15,23,42,.97);border:1px solid rgba(255,255,255,.09);border-bottom:none;box-shadow:0 -12px 40px rgba(0,0,0,.5);max-height:92dvh;overflow-y:auto" onclick="event.stopPropagation()">
        <div class="grabber mb-3" style="margin-bottom:.9rem"></div>
        <div class="flex items-center justify-between mb-4">
          <div class="flex items-center gap-1.5">
            <span class="icon-tile bg-teal-500/15 text-teal-400"><svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="16.5" y1="9.4" x2="7.5" y2="4.21"/><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg></span>
            <h3 class="font-bold text-gray-100 text-sm">${T('po.sheet')}</h3>
          </div>
          <button onclick="closeQuick()" class="w-9 h-9 rounded-xl btn-ghost flex items-center justify-center text-gray-400"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
        </div>
        <div class="space-y-3">
          <div>
            <label class="text-[11px] font-semibold uppercase tracking-wider text-gray-500 block mb-1.5">${T('po.supplier')}</label>
            <select id="po-supplier" class="inp"><option value="">${T('po.select_supplier')}</option>${data.suppliers.map(s => '<option value="' + s.id + '">' + esc(s.name) + '</option>').join('')}</select>
          </div>
          <div>
            <label class="text-[11px] font-semibold uppercase tracking-wider text-gray-500 block mb-1.5">${T('po.item')}</label>
            <div class="flex gap-2">
              <select id="po-item" class="inp flex-1"><option value="">${T('po.select_item')}</option>${data.inventory.map(i => '<option value="' + i.id + '" data-name="' + esc(i.name) + '" data-price="' + (parseFloat(i.price) || 0) + '">' + esc(i.name) + ' — ' + peso(i.price) + '</option>').join('')}</select>
              <input id="po-qty" type="number" min="1" value="1" class="inp w-16 text-center" />
              <input id="po-price" type="number" min="0" step="0.01" placeholder="Price" class="inp w-24" />
            </div>
          </div>
          <button onclick="poAddItem()" class="btn btn-ghost btn-sm w-full"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>${T('po.add_to_po')}</button>
          <div id="po-cart" class="glass rounded-2xl p-2 text-sm space-y-1"><p class="text-gray-500 text-xs px-1">${T('po.no_items')}</p></div>
          <div class="flex justify-between font-bold text-gray-100">${T('po.total')} <span class="text-teal-400 num" id="po-total-mobile">${peso(0)}</span></div>
          <button onclick="submitPO()" id="po-submit-btn" class="btn btn-success btn-lg"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>${T('po.create')}</button>
        </div>
      </div>
    </div>`;
  poRenderCart();
}
function poAddItem() {
  const sel = document.getElementById('po-item');
  const opt = sel && sel.selectedIndex >= 0 ? sel.options[sel.selectedIndex] : null;
  if (!opt || !opt.value) return toast(T('po.select_item_err'), 'err');
  const invId = parseInt(opt.value);
  const name = opt.dataset.name || 'Item';
  const price = parseFloat(document.getElementById('po-price').value) || (parseFloat(opt.dataset.price) || 0);
  const qty = Math.max(1, parseInt(document.getElementById('po-qty').value) || 1);
  const existing = poItems.find(i => i.invId === invId);
  if (existing) { existing.qty += qty; existing.price = price; }
  else poItems.push({ invId, name, price, qty });
  poRenderCart();
  toast(T('po.added', { name, qty }), 'ok');
}
function poRenderCart() {
  const el = document.getElementById('po-cart');
  const t = document.getElementById('po-total-mobile');
  if (!el) return;
  if (!poItems.length) { el.innerHTML = `<p class="text-gray-500 text-xs px-1">${T('po.no_items')}</p>`; if (t) t.textContent = peso(0); return; }
  const total = poItems.reduce((s, i) => s + i.price * i.qty, 0);
  if (t) t.textContent = peso(total);
  el.innerHTML = poItems.map((i, idx) => `
    <div class="flex justify-between items-center py-1 border-b border-white/5 last:border-0 px-1">
      <span class="truncate">${esc(i.name)} <span class="text-gray-500">x${i.qty} @ ${peso(i.price)}</span></span>
      <span class="flex items-center gap-2"><span class="font-medium num">${peso(i.price * i.qty)}</span><button onclick="poRemoveItem(${idx})" class="text-red-400 p-1"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button></span>
    </div>`).join('');
}
function poRemoveItem(idx) { poItems.splice(idx, 1); poRenderCart(); }
async function submitPO() {
  if (!poItems.length) return toast(T('sale.need_items'), 'err');
  const supplierId = parseInt(document.getElementById('po-supplier').value) || null;
  if (!supplierId) return toast(T('po.need_supplier'), 'err');
  if (!takeSubmitLock('po')) return;
  try {
    if (editingPoId) {
      await apiPost('/api/purchase-orders/' + encodeURIComponent(editingPoId), { supplierId, items: poItems.map(i => ({ invId: i.invId, name: i.name, price: i.price, qty: i.qty })) }, 'PUT');
      closeQuick();
      poItems = []; editingPoId = null;
      toast('Order updated', 'ok');
    } else {
      const r = await apiPost('/api/purchase-orders', { supplierId, items: poItems.map(i => ({ invId: i.invId, name: i.name, price: i.price, qty: i.qty })), date: new Date().toISOString().split('T')[0] });
      closeQuick();
      poItems = [];
      if (r.queued) toast(T('po.queued'), 'ok');
      else toast(T('po.created', { po: r.poNo || '' }), 'ok');
    }
    await refreshAll();
  } catch (e) { toast(T('po.failed', { msg: e.message }), 'err'); }
  finally { releaseSubmitLock('po'); }
}
// Standalone-only: fix a pending order's lines (desktop LAN API is read-only
// for orders, so the button is gated at the call site).
let editingPoId = null;
function newPO() {
  editingPoId = null;
  poItems = [];
  addPO();
}
function editPO(id) {
  const po = (data.purchaseOrders || []).find(p => String(p.id) === String(id));
  if (!po || po.status === 'Received') return;
  editingPoId = po.id;
  poItems = (po.items || []).map(i => ({ invId: i.invId || null, name: i.name || 'Item', price: i.price || 0, qty: i.qty || 1 }));
  addPO();
  poRenderCart();
  setTimeout(() => {
    try {
      const sel = document.getElementById('po-supplier');
      if (sel && po.supplierId) sel.value = String(po.supplierId);
      const btn = document.getElementById('po-submit-btn');
      if (btn && btn.lastChild) btn.lastChild.textContent = 'Save changes';
    } catch (e) {}
  }, 30);
}

