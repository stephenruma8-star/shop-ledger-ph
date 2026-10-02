// ---------- QUICK SALE ----------
function openQuick(id, idx) {
  const item = itemById(id);
  if (!item) { toast(T('quick.not_found'), 'err'); return; }
  const stock = item.stock || 0;
  if (stock <= 0) { toast(T('home.out'), 'err'); return; }
  const existing = cart.find(c => c.invId === id);
  qStepQty = existing ? existing.qty : 1;
  document.getElementById('modal-root').innerHTML = `
    <div class="fixed inset-0 bg-black/70 z-[45] flex items-end sm:items-center justify-center fade-in" onclick="if(event.target===this)closeQuick()">
      <div class="w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-4 pb-6 slide-up" style="background:rgba(15,23,42,.97);border:1px solid rgba(255,255,255,.09);border-bottom:none;box-shadow:0 -12px 40px rgba(0,0,0,.5);max-height:92dvh;overflow-y:auto" onclick="event.stopPropagation()">
        <div class="grabber mb-3" style="margin-bottom:.9rem"></div>
        <div class="flex items-center justify-between mb-4">
          <div class="flex items-center gap-1.5">
            <span class="icon-tile bg-blue-500/15 text-blue-400"><svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg></span>
            <h3 class="font-bold text-gray-100 text-sm">${T('quick.title')}</h3>
          </div>
          <button onclick="closeQuick()" class="w-9 h-9 rounded-xl btn-ghost flex items-center justify-center text-gray-400"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
        </div>
        <div class="flex gap-3 items-center">
          <div class="w-16 h-16 rounded-xl overflow-hidden bg-gray-800 flex items-center justify-center shrink-0 border border-white/10">${itemImage(item) ? '<img src="' + itemImage(item) + '" alt="" class="w-full h-full object-cover" />' : '<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#475569" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><line x1="16.5" y1="9.4" x2="7.5" y2="4.21"/><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>'}</div>
          <div class="flex-1 min-w-0">
            <div class="font-bold text-gray-100 truncate">${esc(item.name)}</div>
            <div class="text-green-400 font-bold text-lg num">${peso(item.price)}</div>
            <div class="text-[11px] ${stock <= (item.lowStock || 5) ? 'text-amber-400' : 'text-gray-500'}">${T('cat.in_stock', { n: stock })}</div>
          </div>
        </div>
        <div class="flex items-center justify-between mt-5">
          <div class="flex items-center gap-1">
            <button onclick="quickStep(-1, ${id})" class="w-11 h-11 rounded-xl text-xl font-bold text-gray-100" style="background:rgba(30,41,59,.6);border:1px solid rgba(255,255,255,.09)">−</button>
            <span id="q-qty" class="w-10 text-center text-xl font-bold text-gray-100 num">${qStepQty}</span>
            <button onclick="quickStep(1, ${id})" class="w-11 h-11 rounded-xl text-xl font-bold text-gray-100" style="background:rgba(30,41,59,.6);border:1px solid rgba(255,255,255,.09)">+</button>
          </div>
          <div class="text-right">
            <div class="text-[11px] text-gray-500">${T('quick.subtotal')}</div>
            <div class="text-xl font-bold text-green-400 num" id="q-sub">${peso(item.price * qStepQty)}</div>
          </div>
        </div>
        <div class="grid grid-cols-2 gap-2 mt-5">
          <button onclick="quickAdd(${id})" class="btn btn-primary btn-lg"><svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>${T('quick.add')}</button>
          <button onclick="quickSell(${id})" class="btn btn-success btn-lg"><svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>${T('quick.sell_now')}</button>
        </div>
      </div>
    </div>`;
}
function quickStep(delta, id) {
  const item = itemById(id);
  if (!item) return;
  const max = item.stock || 0;
  qStepQty = Math.max(1, Math.min((qStepQty || 1) + delta, Math.max(1, max)));
  const q = document.getElementById('q-qty'); if (q) q.textContent = qStepQty;
  const s = document.getElementById('q-sub'); if (s) s.textContent = peso(item.price * qStepQty);
}
function closeQuick() { document.getElementById('modal-root').innerHTML = ''; qStepQty = 1; }
function quickAdd(id) {
  const item = itemById(id);
  if (!item) return;
  const qty = Math.max(1, Math.min(qStepQty || 1, item.stock || 1));
  const existing = cart.find(c => c.invId === id);
  if (existing) existing.qty = Math.min(existing.qty + qty, item.stock || existing.qty);
  else cart.push({ invId: id, name: item.name, qty, price: item.price });
  closeQuick();
  updateCartUI();
  toast(T('quick.added_cart', { name: item.name, qty: existing ? existing.qty : qty }), 'ok');
}
async function quickSell(id) {
  const item = itemById(id);
  if (!item) return;
  const stock = item.stock || 0;
  if (stock <= 0) return toast(T('home.out'), 'err');
  const qty = Math.max(1, Math.min(qStepQty || 1, stock));
  if (!takeSubmitLock('quick')) return;
  try {
    const r = await apiPost('/api/sales', {
      clientId: null, items: [{ name: String(qty), description: item.name, qty, unitCost: item.price, intRate: 0, invId: id }],
      paymentMethod: 'Cash', discount: 0
    });
    closeQuick();
    if (r.queued) toast(T('sale.queued'), 'ok');
    else { feelSale(); toast(T('sale.saved_ok', { inv: r.invoiceNo }), 'ok'); }
    await refreshAll();
  } catch (e) { feelErr(); toast(T('sale.fail_generic', { msg: e.message }), 'err'); }
  finally { releaseSubmitLock('quick'); }
}

