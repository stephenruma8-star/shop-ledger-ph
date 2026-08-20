import { logAudit } from './auth.js'
import { renderClientGrid } from './clients.js'
import { dbAdd, dbAll, dbDel, dbGet, dbPut } from './database.js'
import { calcInterest, closeModal, confirmModal, dbLoad, debounce, escapeHtml, filterByYear, itemThumbHtml, modal, paginate, renderPagination, searchData, toast, updateLowStockBadge } from './helpers.js'
import { openPrintWindow } from './printLayout.js'
import { fmtDate, fmtDateTime, now, peso, state, today } from './state.js'

export function getQty(name) { const m = String(name||'1').match(/^-?[\d.]+/); return m ? parseFloat(m[0]) : 1; }
export async function adjustStock(invId, item, delta) {
  if (!invId) return;
  const inv = await dbGet('inventory', invId);
  if (!inv) return;
  const qt = getQty(item.name || item.qty || '1');
  inv.stock = (inv.stock || 0) + (delta * qt);
  if (item.variantName && inv.variants) {
    const v = inv.variants.find(x => x.name === item.variantName);
    if (v) v.stock = (v.stock || 0) + (delta * qt);
  }
  await dbPut('inventory', inv);
}
export function lineSub(item) { return getQty(item.name) * (item.unitCost || 0); }
export function lineInt(item) {
  const sub = lineSub(item);
  if ((item.intRate || 0) === 0 || sub === 0) return 0;
  const itemDate = item.date || today();
  const days = Math.max(1, Math.floor((new Date(today()) - new Date(itemDate)) / 86400000));
  return calcInterest(sub, item.intRate, days);
}
export function lineAmt(item) { return lineSub(item) + lineInt(item); }

export function wasBalanceAdded(t) {
  if (!t || !t.clientId) return false;
  if (t.balanceAdded !== undefined) return !!t.balanceAdded;
  return t.paymentMethod !== 'Cash';
}

export let txCart = [];
export let txEditingId = null;

export function updateCartRowAmt(i) {
  const el = document.getElementById('cart-amt-' + i);
  if (el) el.textContent = peso(lineAmt(txCart[i]));
}

export let debouncedRenderTxTable = debounce(renderTxTable, 250);

export async function viewTransactions(root) {
  await Promise.all([
    dbLoad('transactions'),
    dbLoad('clients'),
    dbLoad('quickItems'),
    dbLoad('inventory')
  ]);
  root.innerHTML = `
    <div class="space-y-4 fade-in">
      <div class="flex gap-2 flex-wrap items-center">
        <input id="txSearch" placeholder="Search transactions..." class="flex-1 min-w-[200px] px-4 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800" oninput="debouncedRenderTxTable()" />
        <input id="txDateFrom" type="date" class="w-36 px-3 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm" onchange="renderTxTable()" />
        <input id="txDateTo" type="date" class="w-36 px-3 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm" onchange="renderTxTable()" />
        <button onclick="document.getElementById('txDateFrom').value='';document.getElementById('txDateTo').value='';renderTxTable()" class="px-3 py-2 text-sm border dark:border-gray-700 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="inline-block mr-1 -mt-0.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>Clear</button>
        <button onclick="openTransactionModal()" title="F2 / Ctrl+T" class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="inline-block mr-1 -mt-0.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>New Sale</button>
      </div>
      <div class="bg-white dark:bg-gray-800 rounded-xl shadow-sm overflow-hidden glass-card">
        <div class="overflow-auto" id="txTable"></div>
      </div>
    </div>`;
  renderTxTable();
}

export function renderTxTable() {
  const q = document.getElementById('txSearch')?.value || '';
  const dFrom = document.getElementById('txDateFrom')?.value || '';
  const dTo = document.getElementById('txDateTo')?.value || '';
  let filtered = filterByYear(searchData(state.transactions, q, ['invoiceNo','clientName','paymentMethod']), 'date');
  if (dFrom) filtered = filtered.filter(t => (t.date || '') >= dFrom);
  if (dTo) filtered = filtered.filter(t => (t.date || '') <= dTo);
  const sorted = [...filtered].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const { items, page, totalPages } = paginate(sorted, 'tx');
  const container = document.getElementById('txTable');
  if (!container) return;
  if (sorted.length === 0) { container.innerHTML = '<div class="p-6 text-center text-gray-400">No transactions yet</div>'; return; }
  container.innerHTML = `<table class="w-full text-sm"><thead><tr class="bg-gray-50 dark:bg-gray-700 text-left"><th class="p-3 w-10"><input type="checkbox" onchange="document.querySelectorAll('.tx-check').forEach(c=>c.checked=this.checked);toggleTxBulkBar()" /></th><th class="p-3">Invoice</th><th class="p-3">Date</th><th class="p-3">Client</th><th class="p-3">Items</th><th class="p-3 text-right">Total</th><th class="p-3">Method</th><th class="p-3">Status</th><th class="p-3 text-center">Actions</th></tr></thead>
    <tbody>${items.map(t => {
      const isVoided = t.status === 'voided';
      const isReturn = t.status === 'return';
      const isInterest = t.status === 'interest';
  const statusBadge = isVoided ? '<span class="px-2 py-0.5 rounded-full text-xs bg-red-100 text-red-700 dark:bg-red-900/30 font-semibold">VOIDED</span>' : isReturn ? '<span class="px-2 py-0.5 rounded-full text-xs bg-purple-100 text-purple-700 dark:bg-purple-900/30 font-semibold">RETURN</span>' : isInterest ? '<span class="px-2 py-0.5 rounded-full text-xs bg-amber-100 text-amber-700 dark:bg-amber-900/30 font-semibold">INTEREST</span>' : t.status === 'pending' ? '<span class="px-2 py-0.5 rounded-full text-xs bg-amber-100 text-amber-700 dark:bg-amber-900/30">Pending</span>' : '<span class="px-2 py-0.5 rounded-full text-xs bg-green-100 text-green-700 dark:bg-green-900/30">Paid</span>';
      const rowClass = isVoided ? 'border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer opacity-60' : isReturn ? 'border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer bg-purple-50 dark:bg-purple-900/10' : 'border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer';
      return `<tr class="${rowClass}" onclick="viewTransactionDetail(${t.id})">
      <td class="p-3 w-10"><input type="checkbox" value="${t.id}" class="tx-check" onchange="toggleTxBulkBar()" onclick="event.stopPropagation()" /></td>
      <td class="p-3 font-medium${isVoided ? ' line-through' : ''}">${t.invoiceNo || 'N/A'}</td><td class="p-3 text-gray-500">${fmtDate(t.date)}</td>
      <td class="p-3">${escapeHtml(t.clientName || 'Walk-in')}</td><td class="p-3">${(t.items||[]).length}</td>
      <td class="p-3 text-right font-bold">${peso(t.grandTotal)}</td>
      <td class="p-3"><span class="px-2 py-0.5 rounded-full text-xs ${t.paymentMethod === 'Cash' ? 'bg-green-100 text-green-700 dark:bg-green-900/30' : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30'}">${escapeHtml(t.paymentMethod || 'Cash')}</span></td>
      <td class="p-3">${statusBadge}</td>
      <td class="p-3 text-center"><button onclick="event.stopPropagation();printReceipt(${t.id})" class="text-blue-600 hover:text-blue-800 text-xs underline">Print</button></td>
    </tr>`;
    }).join('')}</tbody></table>
    <div id="tx-bulk-bar" class="hidden sticky bottom-0 bg-blue-50 dark:bg-blue-900/20 border-t border-blue-200 dark:border-blue-800 px-3 py-2 flex items-center gap-2 text-sm">
      <span id="tx-bulk-count" class="font-semibold">0 selected</span>
      <button onclick="bulkDeleteTx()" class="ml-auto px-3 py-1 bg-red-600 text-white rounded text-xs hover:bg-red-700"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="inline-block mr-1 -mt-0.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>Delete Selected</button>
    </div>${renderPagination('tx', page, totalPages)}`;
}

export function openTransactionModal() {
  txCart = [];
  txEditingId = null;
  renderTransactionModal(null);
}

export function renderTransactionModal(editTxn) {
  const isEdit = !!editTxn;
  if (!isEdit) { txCart = []; txEditingId = null; _lastTmTotal = null; }
  const clients = state.clients;
  const inv = state.inventory.filter(i => (i.stock || 0) > 0);
  const qItems = state.quickItems;
  const selClient = isEdit && editTxn.clientId ? editTxn.clientId : '';
  const selPay = isEdit ? editTxn.paymentMethod || 'Cash' : 'Cash';
  const selDisc = isEdit ? (editTxn.discount || 0) - (editTxn.scDiscount || 0) : 0;
  const selSC = isEdit && (editTxn.scDiscount || 0) > 0;
  modal(`
    <div class="p-6">
      <div class="flex justify-between items-center mb-4"><h3 class="text-xl font-bold">${isEdit ? 'Edit Sale' : 'New Sale'}</h3><button onclick="closeModal()" class="text-gray-400 hover:text-gray-600"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button></div>
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div class="space-y-3">
          <div class="grid grid-cols-2 gap-2">
            <div><label class="text-xs text-gray-500 block">Client</label><select id="tm-client" class="w-full px-3 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm"><option value="">Walk-in</option>${clients.map(c => `<option value="${c.id}" ${c.id === selClient ? 'selected' : ''}>${escapeHtml(c.name)}</option>`).join('')}</select></div>
            <div><label class="text-xs text-gray-500 block">Payment</label><select id="tm-payment" class="w-full px-3 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm"><option ${selPay==='Cash'?'selected':''}>Cash</option><option ${selPay==='GCash'?'selected':''}>GCash</option><option ${selPay==='Maya'?'selected':''}>Maya</option><option ${selPay==='Bank Transfer'?'selected':''}>Bank Transfer</option></select></div>
          </div>
          <div class="grid grid-cols-2 gap-2">
            <div><label class="text-xs text-gray-500 block">Discount (₱)</label><input id="tm-discount" type="number" value="${selDisc}" min="0" step="0.01" class="w-full px-3 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm" oninput="updateTMTotals()" /></div>
            <div></div>
          </div>
          <div class="flex gap-2">
            <label class="flex items-center gap-1 text-sm"><input type="checkbox" id="tm-sc" onchange="toggleSC()" ${selSC ? 'checked' : ''} /> SC/PWD 20% Discount</label>
          </div>
          <div class="flex gap-2 flex-wrap">
            <select id="tm-item-select" class="flex-1 min-w-[140px] px-3 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm"><option value="">Inventory item...</option>${inv.map(i => `<option value="${i.id}" data-name="${escapeHtml(i.name)}" data-price="${i.sellPrice||i.price||0}">${escapeHtml(i.name)} - ${peso(i.sellPrice||i.price||0)}</option>`).join('')}</select>
            <input id="tm-qty" type="number" value="1" min="1" class="w-14 px-2 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm text-center" />
            <button onclick="addToCart()" class="px-3 py-2 bg-blue-600 text-white rounded-lg text-sm whitespace-nowrap"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="inline-block mr-1 -mt-0.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>Add Item</button>
          </div>
          ${qItems.length > 0 ? `<div><label class="text-xs text-gray-500 block">Quick Items (click to add row)</label><div class="flex flex-wrap gap-1">${qItems.map(q => {
            const qInv = state.inventory.find(i => i.name === q.name);
            const qStock = qInv ? (qInv.stock || 0) : null;
            const qBadge = qStock === null ? '' : qStock <= 0 ? `<span class="text-red-500 font-bold"> (OUT)</span>` : qStock <= (qInv.minStock || 5) ? `<span class="text-amber-600 font-bold"> (${qStock})</span>` : `<span class="text-green-600 font-bold"> (${qStock})</span>`;
            return `<button data-qiname="${escapeHtml(q.name)}" data-qiprice="${q.price}" onclick="quickAddToCart(this.dataset.qiname, parseFloat(this.dataset.qiprice))" class="px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded text-xs hover:bg-gray-200 dark:hover:bg-gray-600 flex items-center gap-1.5">${qInv && qInv.image ? `<img src="${qInv.image}" alt="" class="w-5 h-5 object-cover rounded" />` : ''}${escapeHtml(q.name)} ${peso(q.price)}${qBadge}</button>`;
          }).join('')}</div></div>` : ''}
        </div>
        <div>
          <div class="flex justify-between items-center mb-2"><h4 class="font-semibold text-sm">Items</h4><button onclick="txCart.push({date:today(),description:'',name:'1',unitCost:0,intRate:0,invId:null});renderTMCart();updateTMTotals()" class="px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs hover:bg-green-700"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="inline-block mr-1 -mt-0.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>Add Blank Row</button></div>
          <div id="tm-cart" class="max-h-72 overflow-auto border dark:border-gray-700 rounded-lg mb-2"></div>
          <div id="tm-totals" class="space-y-1 text-sm"></div>
          <button onclick="saveTransaction()" class="w-full mt-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-semibold"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="inline-block mr-1 -mt-0.5"><polyline points="20 6 9 17 4 12"/></svg>${isEdit ? 'Update Sale' : 'Complete Sale'}</button>
          ${isEdit ? `<p class="text-xs text-gray-400 mt-1 text-center">Editing ${editTxn.invoiceNo} — old data will be replaced</p>` : ''}
        </div>
      </div>
    </div>`);
  renderTMCart();
  updateTMTotals();
}

export function addToCart() {
  const sel = document.getElementById('tm-item-select');
  const qtyEl = document.getElementById('tm-qty');
  if (!sel || !qtyEl) { toast('Form not ready', 'warning'); return; }
  const opt = sel.options[sel.selectedIndex];
  if (!opt || !opt.value) { toast('Select an item', 'warning'); return; }
  const id = parseInt(opt.value);
  const name = opt.dataset.name;
  const price = parseFloat(opt.dataset.price);
  const qty = parseInt(qtyEl.value) || 1;
  const invItem = state.inventory.find(i => i.id === id);
  if (invItem && (invItem.stock || 0) < qty) { toast('Not enough stock', 'error'); return; }
  txCart.push({ date: today(), description: name, name: String(qty), unitCost: price, intRate: 0, invId: id });
  renderTMCart();
  updateTMTotals();
}

export function quickAddToCart(name, price) {
  const qInv = state.inventory.find(i => i.name === name);
  if (qInv && (qInv.stock || 0) <= 0) { toast('Not enough stock for ' + name, 'error'); return; }
  txCart.push({ date: today(), description: name, name: '1', unitCost: price, intRate: 0, invId: qInv ? qInv.id : null });
  renderTMCart();
  updateTMTotals();
}

export function renderTMCart() {
  const el = document.getElementById('tm-cart');
  if (!el) return;
  if (txCart.length === 0) { el.innerHTML = '<p class="text-gray-400 text-xs p-2">No items added yet</p>'; return; }
  el.innerHTML = `<table class="w-full text-xs"><thead><tr class="bg-gray-50 dark:bg-gray-700 sticky top-0"><th class="p-1 text-left">Date</th><th class="p-1 text-left">Description</th><th class="p-1 text-center">Qty/Name</th><th class="p-1 text-center">Variant</th><th class="p-1 text-right">Unit Cost</th><th class="p-1 text-right">Int. Rate</th><th class="p-1 text-right">Amount</th><th class="p-1"></th></tr></thead><tbody>${txCart.map((item, i) => {
    const invItem = item.invId ? state.inventory.find(x => x.id === item.invId) : (item.description ? state.inventory.find(x => x.name === item.description) : null);
    if (!item.variantName && invItem && invItem.variants && invItem.variants.length) item.variantName = invItem.variants[0].name;
    const variants = invItem?.variants || [];
    const varOpts = variants.length ? `<select onchange="txCart[${i}].variantName=this.value" class="w-16 px-1 py-1 border dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-xs text-center">${variants.map((v,vi) => `<option value="${escapeHtml(v.name)}" ${item.variantName===v.name||vi===0?'selected':''}>${escapeHtml(v.name)}</option>`).join('')}</select>` : `<span class="text-gray-400 text-xs">${escapeHtml(item.variantName||'—')}</span>`;
    return `<tr class="border-b dark:border-gray-700">
      <td class="p-1 whitespace-nowrap text-center"><input type="date" value="${item.date || ''}" class="w-32 px-1 py-1 border dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-xs" onchange="txCart[${i}].date=this.value;updateCartRowAmt(${i});updateTMTotals()" /></td>
      <td class="p-1">${invItem ? itemThumbHtml(invItem, 'w-6 h-6 inline-block align-middle mr-1') : ''}<input type="text" id="tx-desc-${i}" value="${escapeHtml(item.description)}" placeholder="Item..." oninput="txCart[${i}].description=this.value;showItemSuggestions(this,'tx',${i})" class="w-full px-1 py-1 border dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-xs" /></td>
      <td class="p-1 text-center"><input type="text" id="tx-qty-${i}" value="${escapeHtml(item.name)}" placeholder="Qty" oninput="txCart[${i}].name=this.value;updateCartRowAmt(${i});updateTMTotals()" class="w-14 px-1 py-1 border dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-xs text-center" /></td>
      <td class="p-1 text-center">${varOpts}</td>
      <td class="p-1 text-right"><input type="number" id="tx-cost-${i}" value="${item.unitCost}" min="0" step="0.01" oninput="txCart[${i}].unitCost=Math.max(0,parseFloat(this.value)||0);updateCartRowAmt(${i});updateTMTotals()" class="w-16 px-1 py-1 border dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-xs text-right" /></td>
      <td class="p-1 text-right"><select onchange="txCart[${i}].intRate=Math.max(0,parseFloat(this.value)||0);updateCartRowAmt(${i});updateTMTotals()" class="w-14 px-1 py-1 border dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-xs text-right">${intRateOptions(item.intRate)}</select></td>
      <td class="p-1 text-right font-medium whitespace-nowrap" id="cart-amt-${i}">${peso(lineAmt(item))}</td>
      <td class="p-1"><button onclick="removeCartItem(${i})" class="text-red-500"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button></td>
    </tr>`;
  }).join('')}</tbody></table>`;
}

let _tmRemoving = false;
export function removeCartItem(i) {
  if (_tmRemoving) return;
  const el = document.getElementById('tm-cart');
  const row = el && el.querySelectorAll('tbody tr')[i];
  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (row && !reduceMotion) {
    _tmRemoving = true;
    row.classList.add('row-out');
    setTimeout(() => { _tmRemoving = false; txCart.splice(i, 1); renderTMCart(); updateTMTotals(); }, 220);
  } else { txCart.splice(i, 1); renderTMCart(); updateTMTotals(); }
}

let _lastTmTotal = null;
export function flashTotal(el, total) {
  if (!el || (_lastTmTotal !== null && _lastTmTotal === total)) return false;
  _lastTmTotal = total;
  el.classList.remove('total-flash'); void el.offsetWidth; el.classList.add('total-flash');
  return true;
}

function popEl(el) {
  if (!el) return;
  el.classList.remove('badge-pop'); void el.offsetWidth; el.classList.add('badge-pop');
}

export function updateTMTotals() {
  const el = document.getElementById('tm-totals');
  if (!el) return;
  const subtotal = txCart.reduce((s, i) => s + lineSub(i), 0);
  const totalInterest = txCart.reduce((s, i) => s + lineInt(i), 0);
  const scCheck = document.getElementById('tm-sc');
  const scDiscount = scCheck && scCheck.checked ? subtotal * 0.2 : 0;
  const discount = parseFloat(document.getElementById('tm-discount')?.value || 0) + scDiscount;
  const grandTotal = Math.max(0, subtotal + totalInterest - discount);
  el.innerHTML = `
    <div class="flex justify-between"><span>Subtotal (goods)</span><span>${peso(subtotal)}</span></div>
    ${totalInterest > 0 ? `<div class="flex justify-between text-amber-600"><span>Total Interest</span><span>${peso(totalInterest)}</span></div>` : ''}
    ${scDiscount > 0 ? `<div class="flex justify-between text-green-600"><span>SC/PWD 20%</span><span>-${peso(scDiscount)}</span></div>` : ''}
    ${discount > 0 ? `<div class="flex justify-between text-orange-600"><span>Discount</span><span>-${peso(discount)}</span></div>` : ''}
    <div class="flex justify-between font-bold text-lg border-t dark:border-gray-700 pt-1"><span>Total</span><span id="tm-grand-total" class="text-green-600">${peso(grandTotal)}</span></div>`;
  if (flashTotal(el, grandTotal)) popEl(document.getElementById('tm-grand-total'));
}

export function toggleSC() { updateTMTotals(); }

export async function saveTransaction() {
  if (window.__app._savingTx) return;
  window.__app._savingTx = true;
  try {
    if (txCart.length === 0) { toast('Cart is empty', 'error'); return; }
    const subtotal = txCart.reduce((s, i) => s + lineSub(i), 0);
    const totalInterest = txCart.reduce((s, i) => s + lineInt(i), 0);
    const scCheck = document.getElementById('tm-sc');
    const scDiscount = scCheck && scCheck.checked ? subtotal * 0.2 : 0;
    const discount = parseFloat(document.getElementById('tm-discount')?.value || 0) + scDiscount;
    const grandTotal = Math.max(0, subtotal + totalInterest - discount);
    if (txEditingId) { await doSaveTransaction(); return; }
    if (!await confirmModal(`Review Sale:
    Subtotal: ${peso(subtotal)}
    ${totalInterest > 0 ? 'Interest: ' + peso(totalInterest) + '\n  ' : ''}${scDiscount > 0 ? 'SC/PWD: -' + peso(scDiscount) + '\n  ' : ''}${discount > 0 ? 'Discount: -' + peso(discount) + '\n  ' : ''}→ Total: ${peso(grandTotal)}
    
    Proceed with this sale? (Save the sale?)`)) return;
    await doSaveTransaction();
  } finally { window.__app._savingTx = false; }
}

export async function resolveInvIds(items) {
  for (const item of items) {
    if (item.invId) continue;
    const desc = String(item.description || '').trim();
    if (!desc) continue;
    const qty = getQty(item.name || item.qty || '1');
    const existing = state.inventory.find(i => String(i.name || '').trim().toLowerCase() === desc.toLowerCase());
    if (existing) { item.invId = existing.id; continue; }
    const inv = {
      name: desc, description: '', sku: '', category: '',
      stock: Math.max(1, qty), minStock: 5, lowStock: 5,
      costPrice: 0, sellPrice: item.unitCost || 0, price: item.unitCost || 0,
      image: null, variants: [], createdAt: now()
    };
    const id = await dbAdd('inventory', inv);
    inv.id = id;
    state.inventory.push(inv);
    item.invId = id;
    await logAudit('inventory', 'Auto-created from sale: ' + desc);
  }
}

export async function linkCartToInventory() { return resolveInvIds(txCart); }

export async function undoSale(t) {
  if (!t || t.status === 'voided') return;
  for (const item of (t.items || [])) {
    if (item.invId) await adjustStock(item.invId, item, 1);
  }
  if (wasBalanceAdded(t)) {
    const c = await dbGet('clients', t.clientId);
    if (c) { c.balance = Math.max(0, (c.balance || 0) - (t.grandTotal || 0)); await dbPut('clients', c); }
  }
}

export async function doSaveTransaction() {
  await linkCartToInventory();
  const subtotal = txCart.reduce((s, i) => s + lineSub(i), 0);
  const totalInterest = txCart.reduce((s, i) => s + lineInt(i), 0);
  const scCheck = document.getElementById('tm-sc');
  const scDiscount = scCheck && scCheck.checked ? subtotal * 0.2 : 0;
  const discount = parseFloat(document.getElementById('tm-discount')?.value || 0) + scDiscount;
  const grandTotal = Math.max(0, subtotal + totalInterest - discount);
  const clientSel = document.getElementById('tm-client');
  const clientId = clientSel.value ? parseInt(clientSel.value) : null;
  const clientName = clientSel.options[clientSel.selectedIndex]?.text || 'Walk-in';
  const paymentMethod = document.getElementById('tm-payment')?.value || 'Cash';

  if (txEditingId) {
    const oldTxn = await dbGet('transactions', txEditingId);
    if (!oldTxn) { toast('Original transaction not found', 'error'); return; }
    if (oldTxn.status === 'voided') { toast('Cannot edit a voided sale', 'error'); return; }
    const editRollback = [];
    try {
      for (const item of (oldTxn.items || [])) {
        if (item.invId) {
          await adjustStock(item.invId, item, 1);
          editRollback.push(() => adjustStock(item.invId, item, -1));
        }
      }
      if (wasBalanceAdded(oldTxn)) {
        const oldC = await dbGet('clients', oldTxn.clientId);
        if (oldC) { oldC.balance = Math.max(0, (oldC.balance || 0) - (oldTxn.grandTotal || 0)); await dbPut('clients', oldC); }
        editRollback.push(() => dbGet('clients', oldTxn.clientId).then(cc => { if (cc) { cc.balance = (cc.balance || 0) + (oldTxn.grandTotal || 0); return dbPut('clients', cc); } }));
      }
      const newItems = txCart.map(i => ({ date: i.date, description: i.description, name: i.name, unitCost: i.unitCost, intRate: i.intRate, amount: lineAmt(i), invId: i.invId, variantName: i.variantName }));
      for (const item of txCart) {
        if (item.invId) {
          await adjustStock(item.invId, item, -1);
          editRollback.push(() => adjustStock(item.invId, item, 1));
        }
      }
      if (clientId && paymentMethod !== 'Cash') {
        const c = await dbGet('clients', clientId);
        if (c) { c.balance = (c.balance || 0) + grandTotal; await dbPut('clients', c); }
        editRollback.push(() => dbGet('clients', clientId).then(cc => { if (cc) { cc.balance = (cc.balance || 0) - grandTotal; return dbPut('clients', cc); } }));
      }
      const updated = { ...oldTxn, clientId, clientName, paymentMethod, items: newItems, subtotal, totalInterest, discount, scDiscount, grandTotal, balanceAdded: !!(clientId && paymentMethod !== 'Cash'), editedAt: now() };
      await dbPut('transactions', updated);
      toast(`Sale ${oldTxn.invoiceNo} updated`, 'success');
      await logAudit('sale-edit', `Sale ${oldTxn.invoiceNo} updated: ${peso(oldTxn.grandTotal)} → ${peso(grandTotal)}`);
    } catch (err) {
      console.error('Sale edit failed, rolling back:', err);
      for (const fn of editRollback.reverse()) await fn().catch(e => console.error('Rollback failed:', e));
      toast('Sale edit failed - rolled back: ' + err.message, 'error');
      return;
    }
  } else {
    const invNos = state.transactions.filter(t => t.invoiceNo?.startsWith('INV-')).map(t => parseInt(t.invoiceNo.replace('INV-','')) || 0);
    const nextNo = invNos.length > 0 ? Math.max(...invNos) + 1 : 1;
    const invoiceNo = 'INV-' + String(nextNo).padStart(5,'0');
    const transaction = {
      invoiceNo, clientId, clientName, date: today(), createdAt: now(),
      items: txCart.map(i => ({ date: i.date, description: i.description, name: i.name, unitCost: i.unitCost, intRate: i.intRate, amount: lineAmt(i), invId: i.invId, variantName: i.variantName })),
      subtotal, totalInterest, discount, scDiscount, grandTotal,
      paymentMethod, status: grandTotal <= 0 ? 'paid' : 'pending',
      balanceAdded: !!(clientId && paymentMethod !== 'Cash')
    };
    const rollback = [];
    try {
      await dbAdd('transactions', transaction);
      for (const item of txCart) {
        if (item.invId) {
          await adjustStock(item.invId, item, -1);
          rollback.push(() => adjustStock(item.invId, item, 1));
        }
      }
      if (clientId && paymentMethod !== 'Cash') {
        const c = await dbGet('clients', clientId);
        if (c) {
          c.balance = (c.balance || 0) + grandTotal;
          await dbPut('clients', c);
          rollback.push(() => dbGet('clients', clientId).then(cc => { if (cc) { cc.balance = (cc.balance || 0) - grandTotal; return dbPut('clients', cc); } }));
        }
      }
    } catch (err) {
      console.error('Sale failed, rolling back:', err);
      for (const fn of rollback.reverse()) await fn().catch(e => console.error('Rollback failed:', e));
      toast('Sale failed - rolled back: ' + err.message, 'error');
      return;
    }
    toast(`Sale completed! Invoice: ${invoiceNo}`, 'success');
    playSound('sale');
    await logAudit('sale', `Sale ${invoiceNo} - ${peso(grandTotal)}`);
  }
  [state.transactions, state.inventory, state.clients] = await Promise.all([
    dbAll('transactions'), dbAll('inventory'), dbAll('clients')
  ]);
  updateLowStockBadge();
  if (window.electronAPI) window.electronAPI.signalLanUpdate();
  closeModal();
  renderTxTable();
}

export function buildReceiptHTML(t) {
  const settingsMap = {};
  state.settings.forEach(s => settingsMap[s.key] = s.value);
  const shopName = settingsMap['shopName'] || 'Shop Ledger PH';
  const shopAddr = settingsMap['shopAddress'] || '';
  const shopContact = settingsMap['shopContact'] || '';
  const headerText = settingsMap['receiptHeaderText'] || '';
  const logo = settingsMap['receiptLogo'] || '';
  const footerMsg = settingsMap['receiptFooter'] || 'Thank you for your patronage!';
  const lines = [];
  if (logo) lines.push('[LOGO]');
  lines.push(' '.repeat(Math.max(0, Math.floor((32 - shopName.length) / 2))) + shopName);
  if (shopAddr) lines.push(' '.repeat(Math.max(0, Math.floor((32 - shopAddr.length) / 2))) + shopAddr);
  if (shopContact) lines.push('Contact: ' + shopContact);
  if (headerText) { headerText.split('\n').filter(Boolean).forEach(l => lines.push(l)); }
  lines.push('='.repeat(32));
  lines.push(' '.repeat(Math.max(0, Math.floor((32 - 14) / 2))) + 'OFFICIAL RECEIPT');
  lines.push('Invoice: ' + (t.invoiceNo || 'N/A'));
  lines.push('Date: ' + fmtDateTime(t.createdAt));
  if (t.clientName && t.clientName !== 'Walk-in') lines.push('Client: ' + t.clientName);
  lines.push('-'.repeat(32));
  (t.items || []).forEach(item => {
    const qt = item.name || String(item.qty || 1);
    const rate = item.intRate != null ? item.intRate : (item.interest ? +((item.interest / (getQty(item.name) * (item.unitCost || 1)) * 100).toFixed(1)) : 0);
    const sub = getQty(item.name||item.qty) * (item.unitCost||item.price||0);
    const iDate = item.date || t.date;
    const days = rate > 0 && sub > 0 ? Math.max(1, Math.floor((new Date(today()) - new Date(iDate)) / 86400000)) : 0;
    const intr = days > 0 ? calcInterest(sub, rate, days) : 0;
    lines.push((qt + '/' + (item.description || item.name || 'Item')) + (rate > 0 ? ` (${rate}%/mo, ${days}d)` : ''));
    lines.push(`  ${qt} x ${peso(item.unitCost || item.price)}  ${peso(sub + intr)}`);
  });
  lines.push('-'.repeat(32));
  lines.push(`Subtotal:         ${peso(t.subtotal)}`);
  if (t.totalInterest > 0) lines.push(`Interest:         ${peso(t.totalInterest)}`);
  if (t.scDiscount > 0) lines.push(`SC/PWD 20%:       -${peso(t.scDiscount)}`);
  if (t.discount > 0) lines.push(`Discount:         -${peso(t.discount)}`);
  lines.push(`TOTAL:            ${peso(t.grandTotal)}`);
  lines.push('='.repeat(32));
  lines.push('Payment: ' + (t.paymentMethod || 'Cash'));
  lines.push('');
  lines.push(footerMsg);
  lines.push('');
  return lines.join('\n');
}

export async function printThermalReceipt(id) {
  const t = state.transactions.find(x => x.id === id);
  if (!t) { toast('Transaction not found', 'error'); return; }
  if (!window.electronAPI?.printThermal) { toast('Thermal printing only available in desktop app', 'warning'); return; }
  const settingsMap = {};
  state.settings.forEach(s => settingsMap[s.key] = s.value);
  const host = settingsMap['thermalHost'] || '';
  const port = settingsMap['thermalPort'] || '9100';
  if (!host) { toast('Set the Thermal Printer IP in Settings first', 'warning'); return; }
  const lines = [];
  lines.push({ t: 'center', bold: true, size: 'double', text: settingsMap['shopName'] || 'Shop Ledger PH' });
  if (settingsMap['shopAddress']) lines.push({ t: 'center', text: settingsMap['shopAddress'] });
  if (settingsMap['shopContact']) lines.push({ t: 'center', text: 'Contact: ' + settingsMap['shopContact'] });
  if (settingsMap['receiptHeaderText']) settingsMap['receiptHeaderText'].split('\n').filter(Boolean).forEach(l => lines.push({ t: 'center', text: l }));
  lines.push({ t: 'divider' });
  lines.push({ t: 'center', bold: true, text: 'OFFICIAL RECEIPT' });
  lines.push({ text: 'Invoice: ' + (t.invoiceNo || 'N/A') });
  lines.push({ text: 'Date: ' + fmtDateTime(t.createdAt) });
  if (t.clientName && t.clientName !== 'Walk-in') lines.push({ text: 'Client: ' + t.clientName });
  lines.push({ t: 'divider' });
  (t.items || []).forEach(item => {
    const qt = getQty(item.name || String(item.qty || 1));
    const sub = qt * (item.unitCost || item.price || 0);
    const rate = item.intRate != null ? item.intRate : 0;
    lines.push({ text: (item.description || item.name || 'Item') + (rate > 0 ? ' (' + rate + '%/mo)' : '') });
    lines.push({ text: '  ' + qt + ' x ' + peso(item.unitCost || item.price) + '      ' + peso(sub) });
  });
  lines.push({ t: 'divider' });
  lines.push({ text: 'Subtotal:             ' + peso(t.subtotal) });
  if (t.totalInterest > 0) lines.push({ text: 'Interest:             ' + peso(t.totalInterest) });
  if (t.scDiscount > 0) lines.push({ text: 'SC/PWD 20%:           -' + peso(t.scDiscount) });
  if (t.discount > 0) lines.push({ text: 'Discount:             -' + peso(t.discount) });
  lines.push({ bold: true, text: 'TOTAL:                ' + peso(t.grandTotal) });
  lines.push({ t: 'divider' });
  lines.push({ text: 'Payment: ' + (t.paymentMethod || 'Cash') });
  lines.push({ t: 'spacer' });
  lines.push({ t: 'center', text: settingsMap['receiptFooter'] || 'Thank you for your patronage!' });
  lines.push({ t: 'spacer' });
  const result = await window.electronAPI.printThermal({ host, port, lines });
  if (result.success) toast('Receipt sent to thermal printer', 'success');
  else toast('Thermal print failed: ' + (result.error || 'Unknown error'), 'error');
}

export function viewTransactionDetail(id) {
  const t = state.transactions.find(x => x.id === id);
  if (!t) { toast('Transaction not found', 'error'); return; }
  const dynItems = (t.items||[]).map(item => ({ ...item, _amt: lineAmt(item) }));
  const dynSub = dynItems.reduce((s, i) => s + lineSub(i), 0);
  const dynInt = dynItems.reduce((s, i) => s + lineInt(i), 0);
  const dynTotal = dynSub + dynInt - t.scDiscount - t.discount;
  modal(`
    <div class="p-6">
      <div class="flex justify-between items-center mb-4">
        <div><h3 class="text-xl font-bold">${t.invoiceNo || 'N/A'}</h3><p class="text-sm text-gray-500">${fmtDate(t.date)} &middot; ${escapeHtml(t.paymentMethod || 'Cash')}</p></div>
        <button onclick="closeModal()" class="text-gray-400 hover:text-gray-600"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
      </div>
      <div class="text-sm mb-4">${escapeHtml(t.clientName || 'Walk-in')}${t.clientId ? ` &middot; <a href="#" onclick="closeModal();viewClientHistory(${t.clientId})" class="text-blue-600"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="inline-block mr-1 -mt-0.5"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>View Client</a> &middot; <a href="#" onclick="closeModal();deleteClientFromSale(${t.clientId})" class="text-red-600 hover:underline"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="inline-block mr-1 -mt-0.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>Delete</a>` : ''}</div>
      <table class="w-full text-xs mb-3"><thead><tr class="bg-gray-50 dark:bg-gray-700"><th class="p-2 text-left">Date</th><th class="p-2 text-left">Description</th><th class="p-2 text-center">Qty/Name</th><th class="p-2 text-right">Unit Cost</th><th class="p-2 text-right">Int.</th><th class="p-2 text-right">Amount</th></tr></thead>
        <tbody>${dynItems.map(item => `<tr class="border-b dark:border-gray-700"><td class="p-2">${fmtDate(item.date)}</td><td class="p-2">${escapeHtml(item.description||'-')}</td><td class="p-2 text-center">${escapeHtml(item.name||item.qty||'')}</td><td class="p-2 text-right">${peso(item.unitCost||item.price||0)}</td><td class="p-2 text-right">${item.intRate != null ? item.intRate + '%' : (item.interest ? '₱'+item.interest : '-')}</td><td class="p-2 text-right font-medium">${peso(item._amt)}</td></tr>`).join('')}</tbody>
      </table>
      <div class="border-t dark:border-gray-700 pt-2 space-y-1 text-sm">
        <div class="flex justify-between"><span>Subtotal</span><span>${peso(dynSub)}</span></div>
        ${dynInt > 0 ? `<div class="flex justify-between text-amber-600"><span>Interest (current)</span><span>${peso(dynInt)}</span></div>` : ''}
        ${t.scDiscount > 0 ? `<div class="flex justify-between text-green-600"><span>SC/PWD 20%</span><span>-${peso(t.scDiscount)}</span></div>` : ''}
        ${t.discount > 0 ? `<div class="flex justify-between text-orange-600"><span>Discount</span><span>-${peso(t.discount)}</span></div>` : ''}
        <div class="flex justify-between font-bold text-lg border-t dark:border-gray-700 pt-1"><span>Total</span><span class="text-green-600">${peso(dynTotal)}</span></div>
      </div>
      <div class="flex gap-2 mt-4">
        <button onclick="closeModal();printReceipt(${t.id})" class="flex-1 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="inline-block mr-1 -mt-0.5"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>Print Receipt</button>
        <button onclick="closeModal();printThermalReceipt(${t.id})" class="py-2 px-3 bg-gray-700 text-white rounded-lg hover:bg-gray-800 text-sm"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="inline-block mr-1 -mt-0.5"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>Thermal</button>
        ${t.status !== 'voided' && t.status !== 'return' ? `<button onclick="closeModal();editTransaction(${t.id})" class="px-3 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 text-sm"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="inline-block mr-1 -mt-0.5"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>Edit</button>` : ''}
        ${t.status !== 'voided' && t.status !== 'return' ? `<button onclick="closeModal();returnTransaction(${t.id})" class="px-3 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-sm"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="inline-block mr-1 -mt-0.5"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>Return</button>` : ''}
        ${t.status !== 'voided' && t.status !== 'return' ? `<button onclick="closeModal();refundSale(${t.id})" class="px-3 py-2 bg-fuchsia-600 text-white rounded-lg hover:bg-fuchsia-700 text-sm"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="inline-block mr-1 -mt-0.5"><path d="M3 1v9h9"/><path d="M3 10a9 9 0 1 1 2.68 6.32"/><line x1="9" y1="12" x2="15" y2="6"/><line x1="9" y1="12" x2="15" y2="18"/></svg>Refund</button>` : ''}
        ${t.status !== 'voided' && t.status !== 'return' ? `<button onclick="closeModal();voidTransaction(${t.id})" class="px-3 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="inline-block mr-1 -mt-0.5"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>Void</button>` : ''}
        <button onclick="closeModal()" class="px-4 py-2 bg-gray-200 dark:bg-gray-700 rounded-lg"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="inline-block mr-1 -mt-0.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>Close</button>
      </div>
      ${t.status === 'voided' ? '<p class="text-center text-red-500 font-bold text-sm mt-2">⚠️ VOIDED</p>' : t.status === 'return' ? '<p class="text-center text-purple-500 font-bold text-sm mt-2">↩️ RETURN</p>' : ''}
    </div>`);
}

export async function voidTransaction(id) {
  const t = await dbGet('transactions', id);
  if (!await confirmModal(`Void sale ${t.invoiceNo} (${peso(t.grandTotal)})? Ibabalik ang stock at iaadjust ang client balance.`)) return;
  if (t.status === 'voided') { toast('Already voided', 'warning'); return; }
  for (const item of (t.items || [])) {
    if (item.invId) await adjustStock(item.invId, item, 1);
  }
  if (wasBalanceAdded(t)) {
    const c = await dbGet('clients', t.clientId);
    if (c) { c.balance = Math.max(0, (c.balance || 0) - (t.grandTotal || 0)); await dbPut('clients', c); }
  }
  t.status = 'voided'; t.voidedAt = now();
  await dbPut('transactions', t);
  [state.transactions, state.inventory, state.clients] = await Promise.all([dbAll('transactions'), dbAll('inventory'), dbAll('clients')]);
  updateLowStockBadge();
  toast(`Sale ${t.invoiceNo} voided`, 'success');
  await logAudit('void', `Sale ${t.invoiceNo} voided - ${peso(t.grandTotal)}`);
  renderTxTable();
}

export async function returnTransaction(id) {
  const orig = await dbGet('transactions', id);
  if (!orig) { toast('Transaction not found', 'error'); return; }
  if (orig.status === 'voided') { toast('Cannot return a voided sale', 'warning'); return; }
  const items = orig.items || [];
  if (!items.length) { toast('No items to return', 'warning'); return; }
  const itemRows = items.map((item, idx) => `<tr><td class="p-1"><input type="checkbox" checked class="ret-item" data-idx="${idx}" /></td><td class="p-1">${escapeHtml(item.description||item.name||'Item')}</td><td class="p-1 text-center">${escapeHtml(item.name||item.qty||'1')}</td><td class="p-1 text-right">${peso(item.unitCost||item.price||0)}</td><td class="p-1 text-right">${peso(getQty(item.name||item.qty||'1') * (item.unitCost||item.price||0))}</td></tr>`).join('');
  modal(`
    <div class="p-6">
      <div class="flex justify-between items-center mb-4"><h3 class="text-xl font-bold">Return Items — ${orig.invoiceNo}</h3><button onclick="closeModal()" class="text-gray-400 hover:text-gray-600"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button></div>
      <p class="text-sm text-gray-500 mb-3">Select items to return. Inventory will be restored and client balance adjusted.</p>
      <table class="w-full text-xs mb-3"><thead><tr class="bg-gray-50 dark:bg-gray-700"><th class="p-1 w-8"></th><th class="p-1 text-left">Item</th><th class="p-1 text-center">Qty</th><th class="p-1 text-right">Price</th><th class="p-1 text-right">Amount</th></tr></thead><tbody>${itemRows}</tbody></table>
      <button onclick="confirmReturn(${id})" class="w-full py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 font-semibold"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="inline-block mr-1 -mt-0.5"><polyline points="20 6 9 17 4 12"/></svg>Process Return</button>
    </div>`);
}

export async function confirmReturn(id) {
  const orig = await dbGet('transactions', id);
  if (!orig) { toast('Transaction not found', 'error'); return; }
  const checked = document.querySelectorAll('.ret-item:checked');
  if (!checked.length) { toast('Select at least one item to return', 'warning'); return; }
  const returnItems = [];
  for (const cb of checked) {
    const idx = parseInt(cb.dataset.idx);
    const item = orig.items[idx];
    if (!item) continue;
    const qty = getQty(item.name || item.qty || '1');
    returnItems.push({ ...item, name: '-' + (item.name || qty), qty: -qty });
  }
  await doReturn(orig, returnItems);
}

export function buildReturnTxn(orig, returnItems, reason = '') {
  const retTotal = returnItems.reduce((s, i) => s + (getQty(i.name || i.qty || '1') * (i.unitCost || i.price || 0)), 0);
  return {
    invoiceNo: (orig.invoiceNo || '') + '-R',
    clientId: orig.clientId,
    clientName: orig.clientName,
    items: returnItems,
    subtotal: retTotal,
    totalInterest: 0,
    discount: 0,
    scDiscount: 0,
    grandTotal: retTotal,
    paymentMethod: orig.paymentMethod,
    date: today(),
    createdAt: now(),
    status: 'return',
    balanceAdded: false,
    refId: orig.id,
    reason: reason || ''
  };
}

export async function doReturn(orig, returnItems) {
  if (!returnItems.length) { toast('Select at least one item to return', 'warning'); return; }
  for (const item of returnItems) {
    if (item.invId) await adjustStock(item.invId, item, 1);
  }
  const retTxn = buildReturnTxn(orig, returnItems);
  const retTotal = retTxn.grandTotal || 0;
  if (wasBalanceAdded(orig)) {
    const c = await dbGet('clients', orig.clientId);
    if (c) { c.balance = Math.max(0, (c.balance || 0) - Math.abs(retTotal)); await dbPut('clients', c); }
  }
  await dbAdd('transactions', retTxn);
  [state.transactions, state.inventory] = await Promise.all([dbAll('transactions'), dbAll('inventory')]);
  if (orig.clientId) state.clients = await dbAll('clients');
  updateLowStockBadge();
  closeModal();
  toast(`Return processed: ${peso(Math.abs(retTotal))}`, 'success');
  await logAudit('return', `Return on ${orig.invoiceNo} - ${peso(Math.abs(retTotal))}`);
  renderTxTable();
}

export async function refundSale(id) {
  const orig = await dbGet('transactions', id);
  if (!orig) { toast('Transaction not found', 'error'); return; }
  if (orig.status === 'voided') { toast('Cannot refund a voided sale', 'warning'); return; }
  if (orig.status === 'return') { toast('This sale already has a return', 'warning'); return; }
  if (!await confirmModal(`Full refund of ${orig.invoiceNo} (${peso(orig.grandTotal || 0)})? Iuuli ang lahat ng items, ibabalik ang stock at iaadjust ang client balance.`)) return;
  await doReturn(orig, (orig.items || []).map(item => {
    const qty = getQty(item.name || item.qty || '1');
    return { ...item, name: '-' + (item.name || qty), qty: -qty };
  }));
}

export async function deleteClientFromSale(id) {
  const c = state.clients.find(x => x.id === id);
  if (!c) { toast('Client not found', 'error'); return; }
  const txCount = state.transactions.filter(t => t.clientId === id).length;
  const payCount = state.payments.filter(p => p.clientId === id).length;
  let msg = `Delete client "${c.name}"?`;
  if (txCount > 0 || payCount > 0) msg = `"${c.name}" has ${txCount} sale(s) and ${payCount} payment(s). All history will be removed. Continue?`;
  else if ((c.balance || 0) > 0) msg = `"${c.name}" owes ${peso(c.balance)}. Deleting will lose this debt. Continue?`;
  if (!await confirmModal(msg)) return;
  await dbDel('clients', id);
  const txs = state.transactions.filter(t => t.clientId === id);
  for (const t of txs) await undoSale(t);
  await Promise.all(txs.map(t => dbDel('transactions', t.id)));
  await Promise.all(state.payments.filter(p => p.clientId === id).map(p => dbDel('payments', p.id)));
  await logAudit('client-delete', `Deleted client "${c.name}" (${txCount} sale(s), ${payCount} payment(s))`);
  [state.clients, state.transactions, state.payments] = await Promise.all([dbAll('clients'), dbAll('transactions'), dbAll('payments')]);
  renderTxTable();
  if (document.getElementById('clientGrid')) renderClientGrid();
  updateLowStockBadge();
  toast('Client deleted');
}

export function editTransaction(id) {
  const t = state.transactions.find(x => x.id === id);
  if (!t) { toast('Transaction not found', 'error'); return; }
  txCart = (t.items || []).map(i => ({ date: i.date || today(), description: i.description || '', name: i.name || '1', unitCost: i.unitCost || 0, intRate: i.intRate || 0, invId: i.invId }));
  txEditingId = id;
  renderTransactionModal(t);
}

export async function printReceipt(id) {
  const t = await dbGet('transactions', id);
  if (!t) { toast('Transaction not found', 'error'); return; }
  modal(`
    <div class="p-6">
      <div class="flex justify-between items-center mb-4"><h3 class="text-xl font-bold">Print Receipt</h3><button onclick="closeModal()" class="text-gray-400 hover:text-gray-600"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button></div>
      <div class="space-y-3">
        <div><label class="text-xs text-gray-500 block">Paper Size</label>
          <select id="rp-size" class="w-full px-3 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800">
            <option value="80mm">80mm (Thermal)</option>
            <option value="58mm">58mm (Thermal)</option>
            <option value="letter">Letter (A4)</option>
          </select>
        </div>
        <button onclick="doPrintReceipt(${id}, false)" class="w-full py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="inline-block mr-1 -mt-0.5"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>Preview & Print</button>
        ${window.electronAPI ? `<button onclick="closeModal();doPrintReceipt(${id}, true)" class="w-full py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-semibold"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="inline-block mr-1 -mt-0.5"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>Direct Print (Default Printer)</button>` : ''}
      </div>
    </div>`);
}

export async function doPrintReceipt(id, direct) {
  const t = await dbGet('transactions', id);
  if (!t) { toast('Transaction not found', 'error'); return; }
  const sizeEl = document.getElementById('rp-size');
  const size = sizeEl ? sizeEl.value : '80mm';
  const settingsMap = {};
  state.settings.forEach(s => settingsMap[s.key] = s.value);
  const shopName = settingsMap['shopName'] || 'Shop Ledger PH';
  const shopAddr = settingsMap['shopAddress'] || '';
  const shopContact = settingsMap['shopContact'] || '';
  const headerText = settingsMap['receiptHeaderText'] || '';
  const footerMsg = settingsMap['receiptFooter'] || 'Thank you for your patronage!';
  const isWide = size === 'letter';
  const maxW = isWide ? '600px' : (size === '58mm' ? '220px' : '300px');
  const fontSize = isWide ? '12px' : (size === '58mm' ? '9px' : '11px');
  const colDivider = isWide ? '' : '<style>.receipt-table td{padding:1px 2px}</style>';

  let itemsHtml = (t.items || []).map(item => {
    const qt = item.name || String(item.qty || 1);
    const rate = item.intRate != null ? item.intRate : (item.interest ? +((item.interest / (getQty(item.name) * (item.unitCost || 1)) * 100).toFixed(1)) : 0);
    const sub = getQty(item.name||item.qty) * (item.unitCost||item.price||0);
    const iDate = item.date || t.date;
    const days = rate > 0 && sub > 0 ? Math.max(1, Math.floor((new Date(today()) - new Date(iDate)) / 86400000)) : 0;
    const intr = days > 0 ? calcInterest(sub, rate, days) : 0;
    return `<tr><td style="text-align:left">${escapeHtml(item.description||item.name||'Item')}</td><td style="text-align:center">${qt}</td><td style="text-align:right">${peso(item.unitCost||item.price||0)}</td>${rate>0?`<td style="text-align:right">${peso(intr)}</td>`:''}<td style="text-align:right;font-weight:600">${peso(sub+intr)}</td></tr>`;
  }).join('');

  const hasInt = t.totalInterest > 0;
  const colSpan = hasInt ? 4 : 3;
  const intCol = hasInt ? '<th style="text-align:right">Int</th>' : '';

  const content = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Receipt ${escapeHtml(t.invoiceNo||'')}</title>
    <style>
      body{margin:0;padding:12px;font-family:'Courier New',monospace;font-size:${fontSize};line-height:1.3;color:#000}
      .receipt{max-width:${maxW};margin:0 auto}
      .center{text-align:center}
      .bold{font-weight:700}
      h1{margin:0 0 2px;font-size:${isWide?'18px':'14px'};text-align:center}
      .shop-info{text-align:center;margin-bottom:6px;font-size:${isWide?'11px':'9px'};color:#333}
      hr{border:none;border-top:1px dashed #000;margin:6px 0}
      th{border-bottom:1px solid #000;padding:2px 4px;font-size:${isWide?'11px':'9px'}}
      td{padding:1px 4px}
      .receipt-table{width:100%;border-collapse:collapse}
      .totals{width:100%;margin-top:4px}
      .totals td{padding:1px 4px}
      .footer{text-align:center;margin-top:8px;font-size:${isWide?'11px':'9px'}}
      .payment{border-top:1px dashed #000;padding-top:4px;margin-top:4px}
      @media print{body{padding:0}}
    </style></head><body>
    <div class="receipt">
      <h1>${escapeHtml(shopName)}</h1>
      ${shopAddr ? `<div class="shop-info">${escapeHtml(shopAddr)}</div>` : ''}
      ${shopContact ? `<div class="shop-info">${escapeHtml(shopContact)}</div>` : ''}
      ${headerText ? `<div class="shop-info">${escapeHtml(headerText)}</div>` : ''}
      <hr>
      <div class="center bold">OFFICIAL RECEIPT</div>
      <div style="font-size:${isWide?'11px':'9px'}">Invoice: ${escapeHtml(t.invoiceNo||'N/A')} | ${fmtDateTime(t.createdAt)}</div>
      ${t.clientName && t.clientName !== 'Walk-in' ? `<div style="font-size:${isWide?'11px':'9px'}">Client: ${escapeHtml(t.clientName)}</div>` : ''}
      <hr>
      <table class="receipt-table"><thead><tr><th style="text-align:left">Item</th><th style="text-align:center">Qty</th><th style="text-align:right">Price</th>${intCol}<th style="text-align:right">Total</th></tr></thead>
        <tbody>${itemsHtml}</tbody></table>
      <hr>
      <table class="totals"><tr><td style="text-align:right">Subtotal:</td><td style="text-align:right;width:80px">${peso(t.subtotal)}</td></tr>
      ${t.totalInterest>0?`<tr><td style="text-align:right">Interest:</td><td style="text-align:right">${peso(t.totalInterest)}</td></tr>`:''}
      ${t.scDiscount>0?`<tr><td style="text-align:right">SC/PWD:</td><td style="text-align:right">-${peso(t.scDiscount)}</td></tr>`:''}
      ${t.discount>0?`<tr><td style="text-align:right">Discount:</td><td style="text-align:right">-${peso(t.discount)}</td></tr>`:''}
      <tr style="font-weight:700"><td style="text-align:right">TOTAL:</td><td style="text-align:right">${peso(t.grandTotal)}</td></tr></table>
      <div class="payment">Payment: ${escapeHtml(t.paymentMethod||'Cash')}</div>
      <div class="footer">${escapeHtml(footerMsg)}</div>
    </div></body></html>`;

  closeModal();
  if (direct && window.electronAPI) {
    const paperWidth = size === '58mm' ? 220 : (size === '80mm' ? 300 : 600);
    await window.electronAPI.printReceipt({ html: content, width: paperWidth });
    toast('Receipt sent to printer', 'success');
  } else {
    openPrintWindow('Receipt - ' + (t.invoiceNo || ''), isWide ? 600 : 380, 600, content, {
      extraCss: '.print-preview{padding:16px;background:#fff}.print-header,.print-footer{display:none}'
    });
  }
}

export function toggleTxBulkBar() {
  const checked = document.querySelectorAll('.tx-check:checked');
  const bar = document.getElementById('tx-bulk-bar');
  if (!bar) return;
  if (checked.length > 0) { bar.classList.remove('hidden'); const el = document.getElementById('tx-bulk-count'); if (el) el.textContent = checked.length + ' selected'; }
  else bar.classList.add('hidden');
}

export async function bulkDeleteTx() {
  const checked = document.querySelectorAll('.tx-check:checked');
  if (!checked.length) return;
  if (!await confirmModal(`Delete ${checked.length} sale(s)? Transaction history will be removed and client balances adjusted.`)) return;
  for (const cb of checked) {
    const id = parseInt(cb.value);
    const t = await dbGet('transactions', id);
    if (!t) continue;
    await undoSale(t);
    await dbDel('transactions', id);
    await logAudit('sale-delete', `Deleted sale ${t.invoiceNo} - ${peso(t.grandTotal || 0)}`);
  }
  [state.transactions, state.clients] = await Promise.all([dbAll('transactions'), dbAll('clients')]);
  renderTxTable();
  updateLowStockBadge();
  toast(`${checked.length} sale(s) deleted`);
}


// expose top-level bindings as globals (inline onclick handlers and legacy code paths rely on them)
Object.defineProperties(window, {
  getQty: { get: () => getQty, configurable: true },
  adjustStock: { get: () => adjustStock, configurable: true },
  lineSub: { get: () => lineSub, configurable: true },
  lineInt: { get: () => lineInt, configurable: true },
  lineAmt: { get: () => lineAmt, configurable: true },
  txCart: { get: () => txCart, set: (v) => { txCart = v; }, configurable: true },
  txEditingId: { get: () => txEditingId, set: (v) => { txEditingId = v; }, configurable: true },
  updateCartRowAmt: { get: () => updateCartRowAmt, configurable: true },
  debouncedRenderTxTable: { get: () => debouncedRenderTxTable, configurable: true },
  viewTransactions: { get: () => viewTransactions, configurable: true },
  renderTxTable: { get: () => renderTxTable, configurable: true },
  openTransactionModal: { get: () => openTransactionModal, configurable: true },
  renderTransactionModal: { get: () => renderTransactionModal, configurable: true },
  addToCart: { get: () => addToCart, configurable: true },
  quickAddToCart: { get: () => quickAddToCart, configurable: true },
  renderTMCart: { get: () => renderTMCart, configurable: true },
  removeCartItem: { get: () => removeCartItem, configurable: true },
  updateTMTotals: { get: () => updateTMTotals, configurable: true },
  toggleSC: { get: () => toggleSC, configurable: true },
  saveTransaction: { get: () => saveTransaction, configurable: true },
  doSaveTransaction: { get: () => doSaveTransaction, configurable: true },
  linkCartToInventory: { get: () => linkCartToInventory, configurable: true },
  undoSale: { get: () => undoSale, configurable: true },
  wasBalanceAdded: { get: () => wasBalanceAdded, configurable: true },
  buildReceiptHTML: { get: () => buildReceiptHTML, configurable: true },
  viewTransactionDetail: { get: () => viewTransactionDetail, configurable: true },
  voidTransaction: { get: () => voidTransaction, configurable: true },
  returnTransaction: { get: () => returnTransaction, configurable: true },
  confirmReturn: { get: () => confirmReturn, configurable: true },
  buildReturnTxn: { get: () => buildReturnTxn, configurable: true },
  doReturn: { get: () => doReturn, configurable: true },
  refundSale: { get: () => refundSale, configurable: true },
  deleteClientFromSale: { get: () => deleteClientFromSale, configurable: true },
  editTransaction: { get: () => editTransaction, configurable: true },
  printReceipt: { get: () => printReceipt, configurable: true },
  printThermalReceipt: { get: () => printThermalReceipt, configurable: true },
  doPrintReceipt: { get: () => doPrintReceipt, configurable: true },
  toggleTxBulkBar: { get: () => toggleTxBulkBar, configurable: true },
  bulkDeleteTx: { get: () => bulkDeleteTx, configurable: true }
});
