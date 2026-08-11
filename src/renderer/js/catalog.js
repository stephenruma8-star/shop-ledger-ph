import { logAudit } from './auth.js'
import { dbAdd, dbAll, dbGet, dbPut } from './database.js'
import { calcInterest, closeModal, escapeHtml, modal, playSound, toast, updateLowStockBadge } from './helpers.js'
import { now, peso, state, today } from './state.js'
import { adjustStock, doPrintReceipt } from './transactions.js'

let _root = null;
let _qs = { itemId: null, qty: 1, variantName: null };
let _qsBusy = false;
let _cart = [];

const INT_RATES = ['0', '5', '10', '15', '20', '25', '30', '40', '50'];

export function invSellPrice(inv) { return parseFloat(inv?.sellPrice || inv?.price || 0) || 0; }

export function effStock(inv, variantName) {
  if (variantName && inv.variants && inv.variants.length) {
    const v = inv.variants.find(x => x.name === variantName);
    return v ? (v.stock ?? inv.stock) : (inv.stock || 0);
  }
  return inv.stock || 0;
}

function lineInterest(sub, rate) { return (rate || 0) > 0 && sub > 0 ? calcInterest(sub, rate, 1) : 0; }

function nextInvoiceNo() {
  const invNos = state.transactions.filter(t => t.invoiceNo?.startsWith('INV-')).map(t => parseInt(t.invoiceNo.replace('INV-', '')) || 0);
  return 'INV-' + String(invNos.length > 0 ? Math.max(...invNos) + 1 : 1).padStart(5, '0');
}

function cartItem(invId, variantName, qty, intRate) {
  const inv = state.inventory.find(i => i.id === invId);
  return {
    date: today(), description: inv ? inv.name : 'Item', name: String(qty),
    unitCost: inv ? invSellPrice(inv) : 0, intRate: intRate || 0,
    invId, variantName: variantName || null
  };
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
      <div id="qs-cart" class="sticky bottom-0 z-20"></div>
    </div>`;
  renderCatalog();
  renderCartPanel();
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
        <div><label class="text-xs text-gray-500 block">Interest (%/mo)</label>
          <select id="qs-interest" onchange="qsUpd()" class="w-full px-3 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm">
            ${INT_RATES.map(r => `<option value="${r}" ${r === '0' ? 'selected' : ''}>${r === '0' ? '0 (Cash sale)' : r + '%'}</option>`).join('')}
          </select>
        </div>
        <div><label class="text-xs text-gray-500 block">Discount (₱)</label><input id="qs-discount" type="number" value="0" min="0" step="0.01" class="w-full px-3 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm" oninput="qsUpd()" /></div>
        <div><label class="text-xs text-gray-500 block">Receipt Paper</label>
          <select id="qs-rpsize" class="w-full px-3 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm">
            <option value="80mm">80mm (Thermal)</option><option value="58mm">58mm (Thermal)</option><option value="letter">Letter (A4)</option>
          </select>
        </div>
        <div class="flex items-end pb-1"><label class="flex items-center gap-1 text-sm"><input type="checkbox" id="qs-sc" onchange="qsUpd()" /> SC/PWD 20% Discount</label></div>
      </div>
      <div class="mt-4 space-y-1 text-sm">
        <div class="flex justify-between"><span>Subtotal</span><span id="qs-subtotal"></span></div>
        <div class="flex justify-between text-amber-600"><span>Interest</span><span id="qs-interestline"></span></div>
        <div class="flex justify-between text-green-600"><span>SC/PWD 20%</span><span id="qs-scline"></span></div>
        <div class="flex justify-between"><span>Discount</span><span class="text-orange-600" id="qs-discountline"></span></div>
        <div class="flex justify-between font-bold text-lg border-t dark:border-gray-700 pt-1"><span>Total</span><span class="text-green-600" id="qs-total"></span></div>
        <div class="flex justify-between text-xs text-gray-400"><span>Client balance</span><span id="qs-balance"></span></div>
      </div>
      <div class="flex gap-2 mt-4">
        <button onclick="qsSell(true)" class="flex-[2] py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-semibold"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="inline-block mr-1 -mt-0.5"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>Sell & Print Receipt</button>
        <button onclick="qsSell(false)" class="flex-1 py-2 border-2 border-blue-600 text-blue-600 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20 font-semibold">Sell</button>
        <button onclick="qsAddToCart()" class="flex-1 py-2 border dark:border-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">Add to Cart</button>
        <button onclick="closeModal()" class="flex-1 py-2 border dark:border-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">Cancel</button>
      </div>
      <p class="text-xs text-gray-400 mt-2 text-center">Sales to clients are added to their balance (utang) automatically. Add to Cart lets you combine items into one sale.</p>
    </div>`);
  qsRender();
}

export function qsRender() {
  const inv = state.inventory.find(i => i.id === _qs.itemId);
  if (!inv) return;
  const qtyEl = document.getElementById('qs-qty');
  const qty = Math.max(1, parseInt(qtyEl?.value) || 1);
  const stock = effStock(inv, _qs.variantName);
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
  const rate = parseFloat(document.getElementById('qs-interest')?.value) || 0;
  const interest = lineInterest(subtotal, rate);
  const scCheck = document.getElementById('qs-sc');
  const scDiscount = scCheck && scCheck.checked ? subtotal * 0.2 : 0;
  const discount = Math.max(0, parseFloat(document.getElementById('qs-discount')?.value) || 0) + scDiscount;
  const total = Math.max(0, subtotal + interest - discount);
  const totEl = document.getElementById('qs-total');
  if (totEl) totEl.textContent = peso(total);
  const subtEl = document.getElementById('qs-subtotal');
  if (subtEl) subtEl.textContent = qty + ' × ' + peso(price) + ' = ' + peso(subtotal);
  const intEl = document.getElementById('qs-interestline');
  if (intEl) intEl.textContent = interest > 0 ? peso(interest) : '-₱0.00';
  const scEl = document.getElementById('qs-scline');
  if (scEl) scEl.textContent = scDiscount > 0 ? '-' + peso(scDiscount) : '-₱0.00';
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
  const inv = state.inventory.find(i => i.id === _qs.itemId);
  const max = inv ? effStock(inv, _qs.variantName) : 9999;
  const next = Math.min(Math.max(1, (parseInt(qtyEl.value) || 1) + delta), Math.max(1, max));
  qtyEl.value = String(next);
  qsRender();
}

export function qsSetVariant(variantName) {
  _qs.variantName = variantName;
  const qtyEl = document.getElementById('qs-qty');
  if (qtyEl) {
    const inv = state.inventory.find(i => i.id === _qs.itemId);
    const max = inv ? effStock(inv, variantName) : 9999;
    if (parseInt(qtyEl.value) > max) { qtyEl.value = String(Math.max(1, max)); }
  }
  qsRender();
}

export function qsUpd() {
  qsRender();
}

export function qsAddToCart() {
  const inv = state.inventory.find(i => i.id === _qs.itemId);
  if (!inv) { toast('Item not found', 'error'); return; }
  const qtyEl = document.getElementById('qs-qty');
  const qty = Math.max(1, parseInt(qtyEl?.value) || 1);
  if (effStock(inv, _qs.variantName) < qty) { toast('Not enough stock', 'error'); return; }
  const rate = parseFloat(document.getElementById('qs-interest')?.value) || 0;
  const existing = _cart.find(l => l.invId === inv.id && (l.variantName || null) === (_qs.variantName || null));
  if (existing) {
    existing.qty += qty;
    existing.intRate = rate;
  } else {
    _cart.push({ invId: inv.id, variantName: _qs.variantName || null, qty, unitCost: invSellPrice(inv), intRate: rate });
  }
  closeModal();
  renderCartPanel();
  toast('Added to cart', 'success');
}

function cartLineHtml(l, i) {
  const inv = state.inventory.find(x => x.id === l.invId);
  return `<div class="flex items-center gap-2 bg-gray-50 dark:bg-gray-700/40 rounded-lg px-2 py-1.5">
    <span class="w-8 h-8 rounded overflow-hidden flex items-center justify-center bg-gray-100 dark:bg-gray-700 shrink-0">${inv?.image ? `<img src="${inv.image}" alt="" class="w-full h-full object-cover" />` : '<span class="text-base">📦</span>'}</span>
    <div class="min-w-0 flex-1">
      <div class="text-xs font-medium truncate">${escapeHtml(inv?.name || 'Item')}${l.variantName ? ` <span class="text-gray-400">(${escapeHtml(l.variantName)})</span>` : ''}</div>
      <div class="text-[10px] text-gray-400">${peso(l.unitCost)} each${l.intRate > 0 ? ' · ' + l.intRate + '%/mo' : ''}</div>
    </div>
    <div class="flex items-center gap-1">
      <button onclick="qsCartStep(${i},-1)" class="w-6 h-6 rounded border dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 text-sm leading-none">-</button>
      <span class="w-8 text-center text-xs font-semibold">${l.qty}</span>
      <button onclick="qsCartStep(${i},1)" class="w-6 h-6 rounded border dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 text-sm leading-none">+</button>
    </div>
    <span class="text-xs font-bold w-16 text-right">${peso(l.qty * l.unitCost)}</span>
    <button onclick="qsCartRemove(${i})" class="text-red-500 shrink-0"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
  </div>`;
}

export function renderCartPanel() {
  const el = document.getElementById('qs-cart');
  if (!el) return;
  if (_cart.length === 0) { el.innerHTML = ''; return; }
  const clients = state.clients;
  const subtotal = _cart.reduce((s, l) => s + l.qty * l.unitCost, 0);
  const totalInterest = _cart.reduce((s, l) => s + lineInterest(l.qty * l.unitCost, l.intRate), 0);
  const scCheck = document.getElementById('qs-cart-sc');
  const scDiscount = scCheck && scCheck.checked ? subtotal * 0.2 : 0;
  const discount = Math.max(0, parseFloat(document.getElementById('qs-cart-discount')?.value) || 0) + scDiscount;
  const grand = Math.max(0, subtotal + totalInterest - discount);
  el.innerHTML = `
    <div class="bg-white dark:bg-gray-800 rounded-t-2xl shadow-2xl border border-b-0 dark:border-gray-700 glass-card">
      <div class="px-3 py-2 flex items-center gap-2 border-b dark:border-gray-700">
        <span class="font-bold text-sm">Quick Cart (${_cart.length})</span>
        <span class="text-xs text-gray-400">${peso(grand)} total</span>
        <button onclick="qsCartClear()" class="ml-auto text-xs text-red-500 hover:underline">Clear cart</button>
      </div>
      <div class="max-h-56 overflow-auto px-3 py-2 space-y-1.5">${_cart.map((l, i) => cartLineHtml(l, i)).join('')}</div>
      <div class="px-3 pb-2 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 text-sm">
        <div><label class="text-xs text-gray-500 block">Client</label>
          <select id="qs-cart-client" onchange="qsCartTotals()" class="w-full px-2 py-1.5 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-xs">
            <option value="">Walk-in</option>${clients.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('')}
          </select>
        </div>
        <div><label class="text-xs text-gray-500 block">Payment</label>
          <select id="qs-cart-payment" class="w-full px-2 py-1.5 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-xs">
            <option>Cash</option><option>GCash</option><option>Maya</option><option>Bank Transfer</option>
          </select>
        </div>
        <div><label class="text-xs text-gray-500 block">Interest (%/mo, all lines)</label>
          <select id="qs-cart-interest" onchange="qsCartInterest(this.value)" class="w-full px-2 py-1.5 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-xs">
            ${INT_RATES.map(r => `<option value="${r}" ${r === '0' ? 'selected' : ''}>${r === '0' ? '0 (Cash sale)' : r + '%'}</option>`).join('')}
          </select>
        </div>
        <div><label class="text-xs text-gray-500 block">Discount (₱)</label><input id="qs-cart-discount" type="number" value="0" min="0" step="0.01" class="w-full px-2 py-1.5 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-xs" oninput="qsCartTotals()" /></div>
        <div><label class="text-xs text-gray-500 block">Receipt Paper</label>
          <select id="qs-cart-rpsize" class="w-full px-2 py-1.5 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-xs">
            <option value="80mm">80mm (Thermal)</option><option value="58mm">58mm (Thermal)</option><option value="letter">Letter (A4)</option>
          </select>
        </div>
        <div class="flex items-end pb-1"><label class="flex items-center gap-1 text-xs"><input type="checkbox" id="qs-cart-sc" onchange="qsCartTotals()" /> SC/PWD 20%</label></div>
      </div>
      <div class="px-3 pb-2 space-y-1 text-sm">
        <div class="flex justify-between"><span>Subtotal</span><span id="qs-cart-sub"></span></div>
        <div class="flex justify-between text-amber-600"><span>Interest</span><span id="qs-cart-int"></span></div>
        <div class="flex justify-between text-green-600"><span>SC/PWD 20%</span><span id="qs-cart-sc2"></span></div>
        <div class="flex justify-between"><span>Discount</span><span class="text-orange-600" id="qs-cart-disc"></span></div>
        <div class="flex justify-between font-bold text-lg border-t dark:border-gray-700 pt-1"><span>Total</span><span class="text-green-600" id="qs-cart-total"></span></div>
        <div class="flex justify-between text-xs text-gray-400"><span>Client balance</span><span id="qs-cart-balance"></span></div>
      </div>
      <div class="flex gap-2 px-3 pb-3">
        <button onclick="qsCartSell(true)" class="flex-[2] py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-semibold"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="inline-block mr-1 -mt-0.5"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>Sell & Print Receipt</button>
        <button onclick="qsCartSell(false)" class="flex-1 py-2 border-2 border-blue-600 text-blue-600 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20 font-semibold">Sell</button>
      </div>
    </div>`;
  qsCartTotals();
}

export function qsCartTotals() {
  const subtotal = _cart.reduce((s, l) => s + l.qty * l.unitCost, 0);
  const totalInterest = _cart.reduce((s, l) => s + lineInterest(l.qty * l.unitCost, l.intRate), 0);
  const scCheck = document.getElementById('qs-cart-sc');
  const scDiscount = scCheck && scCheck.checked ? subtotal * 0.2 : 0;
  const discount = Math.max(0, parseFloat(document.getElementById('qs-cart-discount')?.value) || 0) + scDiscount;
  const grand = Math.max(0, subtotal + totalInterest - discount);
  const subEl = document.getElementById('qs-cart-sub');
  if (subEl) subEl.textContent = peso(subtotal);
  const intEl = document.getElementById('qs-cart-int');
  if (intEl) intEl.textContent = totalInterest > 0 ? peso(totalInterest) : '-₱0.00';
  const scEl = document.getElementById('qs-cart-sc2');
  if (scEl) scEl.textContent = scDiscount > 0 ? '-' + peso(scDiscount) : '-₱0.00';
  const discEl = document.getElementById('qs-cart-disc');
  if (discEl) discEl.textContent = discount > 0 ? '-' + peso(discount) : '-₱0.00';
  const totEl = document.getElementById('qs-cart-total');
  if (totEl) totEl.textContent = peso(grand);
  const clientSel = document.getElementById('qs-cart-client');
  const balEl = document.getElementById('qs-cart-balance');
  if (balEl && clientSel) {
    const c = clientSel.value ? state.clients.find(x => x.id === parseInt(clientSel.value)) : null;
    balEl.textContent = c ? peso(c.balance || 0) : '';
  }
}

export function qsCartInterest(rate) {
  const r = parseFloat(rate) || 0;
  _cart.forEach(l => { l.intRate = r; });
  renderCartPanel();
}

export function qsCartStep(i, delta) {
  const l = _cart[i];
  if (!l) return;
  const inv = state.inventory.find(x => x.id === l.invId);
  const max = inv ? Math.max(1, effStock(inv, l.variantName)) : 9999;
  l.qty = Math.min(Math.max(1, l.qty + delta), max);
  renderCartPanel();
}

export function qsCartRemove(i) {
  _cart.splice(i, 1);
  renderCartPanel();
}

export function qsCartClear() {
  _cart = [];
  renderCartPanel();
}

async function sellItems(items, opts, printSize) {
  const subtotal = items.reduce((s, it) => s + getQtyOf(it) * (it.unitCost || 0), 0);
  const totalInterest = items.reduce((s, it) => s + lineInterest(getQtyOf(it) * (it.unitCost || 0), it.intRate || 0), 0);
  const scDiscount = opts.sc ? subtotal * 0.2 : 0;
  const discount = Math.max(0, opts.discount || 0) + scDiscount;
  const grandTotal = Math.max(0, subtotal + totalInterest - discount);
  const invoiceNo = nextInvoiceNo();
  const transaction = {
    invoiceNo, clientId: opts.clientId, clientName: opts.clientName,
    date: today(), createdAt: now(), items,
    subtotal, totalInterest, discount, scDiscount, grandTotal,
    paymentMethod: opts.paymentMethod, status: grandTotal <= 0 ? 'paid' : 'pending'
  };
  _qsBusy = true;
  let newId = null;
  const rollback = [];
  try {
    newId = await dbAdd('transactions', transaction);
    for (const it of items) {
      if (it.invId) {
        await adjustStock(it.invId, it, -1);
        rollback.push(() => adjustStock(it.invId, it, 1));
      }
    }
    if (opts.clientId) {
      const c = await dbGet('clients', opts.clientId);
      if (c) {
        c.balance = (c.balance || 0) + grandTotal;
        await dbPut('clients', c);
        rollback.push(() => dbGet('clients', opts.clientId).then(cc => { if (cc) { cc.balance = (cc.balance || 0) - grandTotal; return dbPut('clients', cc); } }));
      }
    }
  } catch (err) {
    console.error('Quick sale failed, rolling back:', err);
    for (const fn of rollback.reverse()) await fn().catch(e => console.error('Rollback failed:', e));
    toast('Sale failed - rolled back: ' + err.message, 'error');
    _qsBusy = false;
    return null;
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
  if (toPrint && newId) await printTx(newId, printSize);
  return newId;
}

function getQtyOf(it) { const m = String(it.name || '1').match(/^[\d.]+/); return m ? parseFloat(m[0]) : 1; }

function printTx(id, size) {
  const el = document.createElement('input');
  el.type = 'hidden';
  el.id = 'rp-size';
  el.value = size || '80mm';
  document.body.appendChild(el);
  return doPrintReceipt(id, !!window.electronAPI).finally(() => { try { el.remove(); } catch (e) { /* ignore */ } });
}

export async function qsSell(toPrint) {
  if (_qsBusy) return;
  const inv = state.inventory.find(i => i.id === _qs.itemId);
  if (!inv) { toast('Item not found', 'error'); return; }
  const qtyEl = document.getElementById('qs-qty');
  const qty = Math.max(1, parseInt(qtyEl?.value) || 1);
  if (effStock(inv, _qs.variantName) < qty) { toast('Not enough stock', 'error'); return; }
  const clientSel = document.getElementById('qs-client');
  const clientId = clientSel && clientSel.value ? parseInt(clientSel.value) : null;
  const clientName = clientId ? (state.clients.find(c => c.id === clientId)?.name || 'Walk-in') : 'Walk-in';
  const paymentMethod = document.getElementById('qs-payment')?.value || 'Cash';
  const rate = parseFloat(document.getElementById('qs-interest')?.value) || 0;
  const scCheck = document.getElementById('qs-sc');
  const sc = !!(scCheck && scCheck.checked);
  const discount = Math.max(0, parseFloat(document.getElementById('qs-discount')?.value) || 0);
  const printSize = document.getElementById('qs-rpsize')?.value || '80mm';
  const item = cartItem(inv.id, _qs.variantName, qty, rate);
  await sellItems([item], { clientId, clientName, paymentMethod, discount, sc }, toPrint ? printSize : null);
  renderCatalog();
}

export async function qsCartSell(toPrint) {
  if (_qsBusy) return;
  if (_cart.length === 0) { toast('Cart is empty', 'error'); return; }
  const items = _cart.map(l => {
    const inv = state.inventory.find(x => x.id === l.invId);
    if (!inv) return null;
    if (effStock(inv, l.variantName) < l.qty) return null;
    return cartItem(l.invId, l.variantName, l.qty, l.intRate);
  });
  if (items.some(it => it === null)) { toast('Not enough stock for one or more items', 'error'); return; }
  const clientSel = document.getElementById('qs-cart-client');
  const clientId = clientSel && clientSel.value ? parseInt(clientSel.value) : null;
  const clientName = clientId ? (state.clients.find(c => c.id === clientId)?.name || 'Walk-in') : 'Walk-in';
  const paymentMethod = document.getElementById('qs-cart-payment')?.value || 'Cash';
  const scCheck = document.getElementById('qs-cart-sc');
  const sc = !!(scCheck && scCheck.checked);
  const discount = Math.max(0, parseFloat(document.getElementById('qs-cart-discount')?.value) || 0);
  const printSize = document.getElementById('qs-cart-rpsize')?.value || '80mm';
  const newId = await sellItems(items, { clientId, clientName, paymentMethod, discount, sc }, toPrint ? printSize : null);
  if (newId !== null) {
    _cart = [];
    renderCatalog();
    renderCartPanel();
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
  qsSell: { get: () => qsSell, configurable: true },
  qsAddToCart: { get: () => qsAddToCart, configurable: true },
  renderCartPanel: { get: () => renderCartPanel, configurable: true },
  qsCartTotals: { get: () => qsCartTotals, configurable: true },
  qsCartInterest: { get: () => qsCartInterest, configurable: true },
  qsCartStep: { get: () => qsCartStep, configurable: true },
  qsCartRemove: { get: () => qsCartRemove, configurable: true },
  qsCartClear: { get: () => qsCartClear, configurable: true },
  qsCartSell: { get: () => qsCartSell, configurable: true }
});