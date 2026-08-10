import { logAudit } from './auth.js'
import { dbAdd, dbAll, dbGet, dbPut } from './database.js'
import { closeModal, escapeHtml, modal, playSound, toast, updateLowStockBadge } from './helpers.js'
import { now, peso, state, today } from './state.js'
import { adjustStock, doPrintReceipt } from './transactions.js'

let _root = null;
let _qs = { itemId: null, qty: 1, variantName: null };
let _qsBusy = false;

export function invSellPrice(inv) { return parseFloat(inv?.sellPrice || inv?.price || 0) || 0; }

function effStock(inv) {
  if (_qs.variantName && inv.variants && inv.variants.length) {
    const v = inv.variants.find(x => x.name === _qs.variantName);
    return v ? (v.stock ?? inv.stock) : (inv.stock || 0);
  }
  return inv.stock || 0;
}

export async function viewCatalog(root) {
  _root = root;
  root.innerHTML = `
    <div class="space-y-4 fade-in">
      <div class="flex gap-2 flex-wrap items-center">
        <input id="catalogSearch" placeholder="Search items..." class="flex-1 min-w-[200px] px-4 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800" oninput="renderCatalog()" />
        <button onclick="navigate('inventory')" class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="inline-block mr-1 -mt-0.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>Manage Inventory</button>
      </div>
      <div id="catalogCount" class="text-xs text-gray-400"></div>
      <div id="catalogGrid" class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3"></div>
    </div>`;
  renderCatalog();
}

export function renderCatalog() {
  const grid = document.getElementById('catalogGrid');
  if (!grid) return;
  const q = (document.getElementById('catalogSearch')?.value || '').trim().toLowerCase();
  const items = state.inventory
    .filter(i => !q || (i.name || '').toLowerCase().includes(q))
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  const countEl = document.getElementById('catalogCount');
  if (countEl) countEl.textContent = items.length + ' item' + (items.length === 1 ? '' : 's');
  if (items.length === 0) {
    grid.innerHTML = `<div class="col-span-full text-center py-16 text-gray-400">${q ? 'No items match your search' : 'No items yet — add items in Inventory to see them here'}</div>`;
    return;
  }
  grid.innerHTML = items.map(inv => {
    const price = invSellPrice(inv);
    const stock = inv.stock || 0;
    const stockHtml = stock <= 0
      ? '<span class="text-red-600 font-semibold">Out of stock</span>'
      : stock <= (inv.lowStock || 5)
        ? '<span class="text-amber-600 font-semibold">Low stock: ' + stock + ' left</span>'
        : '<span class="text-gray-500">Stock: <span class="font-semibold text-green-600">' + stock + '</span></span>';
    return `<button onclick="openQuickSaleModal(${inv.id})" class="bg-white dark:bg-gray-800 rounded-xl shadow-sm overflow-hidden text-left card-hover hover:ring-2 hover:ring-blue-500/50 group">
      <div class="h-28 bg-gray-100 dark:bg-gray-700 flex items-center justify-center overflow-hidden">
        ${inv.image ? `<img src="${inv.image}" alt="${escapeHtml(inv.name)}" class="w-full h-full object-cover group-hover:scale-105 transition-transform" />` : '<span class="text-4xl">📦</span>'}
      </div>
      <div class="p-2.5">
        <div class="font-medium text-sm truncate" title="${escapeHtml(inv.name)}">${escapeHtml(inv.name)}</div>
        <div class="text-green-600 font-bold text-sm">${peso(price)}</div>
        <div class="text-xs mt-0.5">${stockHtml}</div>
      </div>
    </button>`;
  }).join('');
}

export function openQuickSaleModal(id) {
  const inv = state.inventory.find(i => i.id === id);
  if (!inv) { toast('Item not found', 'error'); return; }
  if ((inv.stock || 0) <= 0) { toast('Item is out of stock', 'error'); return; }
  _qs = { itemId: id, qty: 1, variantName: inv.variants && inv.variants.length ? inv.variants[0].name : null };
  _qsBusy = false;
  const price = invSellPrice(inv);
  const clients = state.clients;
  const variants = inv.variants || [];
  modal(`
    <div class="p-6">
      <div class="flex justify-between items-center mb-4"><h3 class="text-xl font-bold">Quick Sale</h3><button onclick="closeModal()" class="text-gray-400 hover:text-gray-600"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button></div>
      <div class="flex gap-4">
        <div class="w-28 h-28 shrink-0 rounded-xl overflow-hidden bg-gray-100 dark:bg-gray-700 flex items-center justify-center border dark:border-gray-700">
          ${inv.image ? `<img src="${inv.image}" alt="" class="w-full h-full object-cover" />` : '<span class="text-5xl">📦</span>'}
        </div>
        <div class="flex-1 space-y-1 min-w-0">
          <div class="text-lg font-bold leading-tight">${escapeHtml(inv.name)}</div>
          <div class="text-green-600 font-bold text-xl">${peso(price)}</div>
          <div class="text-xs" id="qs-stockline"></div>
        </div>
      </div>
      <div class="grid grid-cols-2 gap-2 mt-4">
        <div><label class="text-xs text-gray-500 block">Qty</label>
          <div class="flex items-center gap-1">
            <button onclick="qsStep(-1)" class="w-9 h-9 rounded-lg border dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 font-bold">-</button>
            <input id="qs-qty" type="number" value="1" min="1" class="flex-1 min-w-0 px-2 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm text-center" oninput="qsUpd()" />
            <button onclick="qsStep(1)" class="w-9 h-9 rounded-lg border dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 font-bold">+</button>
          </div>
        </div>
        ${variants.length ? `<div><label class="text-xs text-gray-500 block">Variant</label><select id="qs-variant" onchange="qsSetVariant(this.value)" class="w-full px-3 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm">${variants.map(v => `<option value="${escapeHtml(v.name)}">${escapeHtml(v.name)}</option>`).join('')}</select></div>` : ''}
        <div><label class="text-xs text-gray-500 block">Client</label>
          <select id="qs-client" onchange="qsUpd()" class="w-full px-3 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm">
            <option value="">Walk-in</option>${clients.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('')}
          </select>
        </div>
        <div><label class="text-xs text-gray-500 block">Payment</label>
          <select id="qs-payment" class="w-full px-3 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm">
            <option>Cash</option><option>GCash</option><option>Maya</option><option>Bank Transfer</option>
          </select>
        </div>
        <div><label class="text-xs text-gray-500 block">Discount (₱)</label><input id="qs-discount" type="number" value="0" min="0" step="0.01" class="w-full px-3 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm" oninput="qsUpd()" /></div>
      </div>
      <div class="mt-4 space-y-1 text-sm">
        <div class="flex justify-between"><span>Subtotal</span><span id="qs-subtotal"></span></div>
        <div class="flex justify-between"><span>Discount</span><span class="text-orange-600" id="qs-discountline"></span></div>
        <div class="flex justify-between font-bold text-lg border-t dark:border-gray-700 pt-1"><span>Total</span><span class="text-green-600" id="qs-total"></span></div>
        <div class="flex justify-between text-xs text-gray-400"><span>Client balance</span><span id="qs-balance"></span></div>
      </div>
      <div class="flex gap-2 mt-4">
        <button onclick="qsSell(true)" class="flex-[2] py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-semibold"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="inline-block mr-1 -mt-0.5"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>Sell & Print Receipt</button>
        <button onclick="qsSell(false)" class="flex-1 py-2 border-2 border-blue-600 text-blue-600 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20 font-semibold">Sell</button>
        <button onclick="closeModal()" class="flex-1 py-2 border dark:border-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">Cancel</button>
      </div>
      <p class="text-xs text-gray-400 mt-2 text-center">Sales to clients are added to their balance (utang) automatically.</p>
    </div>`);
  qsRender();
}

export function qsRender() {
  const inv = state.inventory.find(i => i.id === _qs.itemId);
  if (!inv) return;
  const qtyEl = document.getElementById('qs-qty');
  const qty = Math.max(1, parseInt(qtyEl?.value) || 1);
  const stock = effStock(inv);
  const stockEl = document.getElementById('qs-stockline');
  if (stockEl) {
    stockEl.innerHTML = stock <= 0
      ? '<span class="text-red-600 font-semibold">Out of stock</span>'
      : stock <= (inv.lowStock || 5)
        ? '<span class="text-amber-600 font-semibold">Low stock: ' + stock + ' left</span>'
        : '<span class="text-green-600 font-semibold">Stock: ' + stock + '</span>';
  }
  const price = invSellPrice(inv);
  const subtotal = qty * price;
  const discount = Math.max(0, parseFloat(document.getElementById('qs-discount')?.value) || 0);
  const total = Math.max(0, subtotal - discount);
  const totEl = document.getElementById('qs-total');
  if (totEl) totEl.textContent = peso(total);
  const subtEl = document.getElementById('qs-subtotal');
  if (subtEl) subtEl.textContent = qty + ' × ' + peso(price) + ' = ' + peso(subtotal);
  const discEl = document.getElementById('qs-discountline');
  if (discEl) discEl.textContent = discount > 0 ? '-' + peso(discount) : '-₱0.00';
  const clientSel = document.getElementById('qs-client');
  const balEl = document.getElementById('qs-balance');
  if (balEl && clientSel) {
    const c = clientSel.value ? state.clients.find(x => x.id === parseInt(clientSel.value)) : null;
    balEl.textContent = c ? peso(c.balance || 0) : '';
  }
}

export function qsStep(delta) {
  const qtyEl = document.getElementById('qs-qty');
  if (!qtyEl) return;
  const next = Math.max(1, (parseInt(qtyEl.value) || 1) + delta);
  qtyEl.value = String(next);
  qsRender();
}

export function qsSetVariant(variantName) {
  _qs.variantName = variantName;
  qsRender();
}

export function qsUpd() {
  qsRender();
}

export async function qsSell(toPrint) {
  if (_qsBusy) return;
  const inv = state.inventory.find(i => i.id === _qs.itemId);
  if (!inv) { toast('Item not found', 'error'); return; }
  const qtyEl = document.getElementById('qs-qty');
  const qty = Math.max(1, parseInt(qtyEl?.value) || 1);
  const stock = effStock(inv);
  if (stock < qty) { toast('Not enough stock', 'error'); return; }
  const clientSel = document.getElementById('qs-client');
  const clientId = clientSel && clientSel.value ? parseInt(clientSel.value) : null;
  const clientName = clientId ? (state.clients.find(c => c.id === clientId)?.name || 'Walk-in') : 'Walk-in';
  const paymentMethod = document.getElementById('qs-payment')?.value || 'Cash';
  const discount = Math.max(0, parseFloat(document.getElementById('qs-discount')?.value) || 0);
  const price = invSellPrice(inv);
  const subtotal = qty * price;
  const grandTotal = Math.max(0, subtotal - discount);
  const item = { date: today(), description: inv.name, name: String(qty), unitCost: price, intRate: 0, invId: inv.id, variantName: _qs.variantName || null };
  const invNos = state.transactions.filter(t => t.invoiceNo?.startsWith('INV-')).map(t => parseInt(t.invoiceNo.replace('INV-', '')) || 0);
  const nextNo = invNos.length > 0 ? Math.max(...invNos) + 1 : 1;
  const invoiceNo = 'INV-' + String(nextNo).padStart(5, '0');
  const transaction = {
    invoiceNo, clientId, clientName, date: today(), createdAt: now(),
    items: [item], subtotal, totalInterest: 0, discount, scDiscount: 0, grandTotal,
    paymentMethod, status: grandTotal <= 0 ? 'paid' : 'pending'
  };
  _qsBusy = true;
  let newId = null;
  const rollback = [];
  try {
    newId = await dbAdd('transactions', transaction);
    await adjustStock(inv.id, item, -1);
    rollback.push(() => adjustStock(inv.id, item, 1));
    if (clientId) {
      const c = await dbGet('clients', clientId);
      if (c) {
        c.balance = (c.balance || 0) + grandTotal;
        await dbPut('clients', c);
        rollback.push(() => dbGet('clients', clientId).then(cc => { if (cc) { cc.balance = (cc.balance || 0) - grandTotal; return dbPut('clients', cc); } }));
      }
    }
  } catch (err) {
    console.error('Quick sale failed, rolling back:', err);
    for (const fn of rollback.reverse()) await fn().catch(e => console.error('Rollback failed:', e));
    toast('Sale failed - rolled back: ' + err.message, 'error');
    _qsBusy = false;
    return;
  }
  toast('Sale completed! Invoice: ' + invoiceNo, 'success');
  playSound('sale');
  await logAudit('sale', `Sale ${invoiceNo} - ${peso(grandTotal)}`);
  [state.transactions, state.inventory, state.clients] = await Promise.all([
    dbAll('transactions'), dbAll('inventory'), dbAll('clients')
  ]);
  updateLowStockBadge();
  if (window.electronAPI) window.electronAPI.signalLanUpdate();
  closeModal();
  renderCatalog();
  _qsBusy = false;
  if (toPrint && newId) {
    await doPrintReceipt(newId, !!window.electronAPI);
  }
}


// expose top-level bindings as globals (inline onclick handlers and legacy code paths rely on them)
Object.defineProperties(window, {
  viewCatalog: { get: () => viewCatalog, configurable: true },
  renderCatalog: { get: () => renderCatalog, configurable: true },
  openQuickSaleModal: { get: () => openQuickSaleModal, configurable: true },
  qsStep: { get: () => qsStep, configurable: true },
  qsSetVariant: { get: () => qsSetVariant, configurable: true },
  qsUpd: { get: () => qsUpd, configurable: true },
  qsSell: { get: () => qsSell, configurable: true }
});