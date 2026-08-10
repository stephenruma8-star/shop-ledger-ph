import { logAudit } from './auth.js'
import { dbAdd, dbAll, dbDel, dbGet, dbPut } from './database.js'
import { closeModal, confirmModal, dbLoad, debounce, escapeHtml, itemThumbHtml, modal, searchData, toast } from './helpers.js'
import { fmtDate, now, peso, state, today } from './state.js'

export let poItems = [];

export async function viewPurchaseOrders(root) {
  await Promise.all([dbLoad('purchaseOrders'), dbLoad('suppliers'), dbLoad('inventory')]);
  root.innerHTML = `
    <div class="space-y-4 fade-in">
      <div class="flex gap-2 flex-wrap items-center">
        <input id="poSearch" placeholder="Search POs..." class="flex-1 min-w-[200px] px-4 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800" oninput="debouncedRenderPOTable()" />
        <button onclick="openPOModal()" class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="inline-block mr-1 -mt-0.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>New PO</button>
      </div>
      <div class="bg-white dark:bg-gray-800 rounded-xl shadow-sm overflow-hidden glass-card">
        <div class="overflow-auto" id="poTable"></div>
      </div>
    </div>`;
  renderPOTable();
}

export let debouncedRenderPOTable = debounce(renderPOTable, 250);
export function renderPOTable() {
  const q = document.getElementById('poSearch')?.value || '';
  const filtered = searchData(state.purchaseOrders, q, ['poNo','supplierName','status']);
  const sorted = [...filtered].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const container = document.getElementById('poTable');
  if (!container) return;
  if (sorted.length === 0) { container.innerHTML = '<div class="p-6 text-center text-gray-400">No purchase orders</div>'; return; }
  container.innerHTML = `<table class="w-full text-sm"><thead><tr class="bg-gray-50 dark:bg-gray-700 text-left"><th class="p-3">PO No</th><th class="p-3">Supplier</th><th class="p-3">Date</th><th class="p-3">Items</th><th class="p-3 text-right">Total</th><th class="p-3">Status</th><th class="p-3 text-center">Actions</th></tr></thead>
    <tbody>${sorted.map(po => {
      const statusColors = { Pending: 'bg-yellow-100 text-yellow-700', Received: 'bg-green-100 text-green-700', Cancelled: 'bg-red-100 text-red-700' };
      return `<tr class="border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50">
        <td class="p-3 font-medium">${po.poNo || 'N/A'}</td><td class="p-3">${escapeHtml(po.supplierName || '-')}</td><td class="p-3 text-gray-500">${fmtDate(po.date)}</td>
        <td class="p-3">${(po.items||[]).length}</td><td class="p-3 text-right font-bold">${peso(po.total||0)}</td>
        <td class="p-3"><span class="px-2 py-0.5 rounded-full text-xs ${statusColors[po.status] || 'bg-gray-100'}">${escapeHtml(po.status || 'Pending')}</span></td>
        <td class="p-3 text-center">
          <button onclick="receivePO(${po.id})" class="text-green-600 hover:text-green-800 text-xs mr-2" ${po.status === 'Received' ? 'disabled' : ''}><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="inline-block mr-1 -mt-0.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>Receive</button>
          <button onclick="deletePO(${po.id})" class="text-red-600 hover:text-red-800 text-xs"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="inline-block mr-1 -mt-0.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>Del</button>
        </td></tr>`;
    }).join('')}</tbody></table>`;
}

export function openPOModal() {
  poItems = [];
  const suppliers = state.suppliers;
  const inv = state.inventory;
  renderPOCart();
  modal(`
    <div class="p-6 max-w-3xl">
      <div class="flex justify-between items-center mb-4"><h3 class="text-xl font-bold">New Purchase Order</h3><button onclick="closeModal()" class="text-gray-400 hover:text-gray-600"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button></div>
      <div class="space-y-3">
        <div class="grid grid-cols-2 gap-3">
          <div><label class="text-xs text-gray-500 block">Supplier</label><select id="po-supplier" class="w-full px-3 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800"><option value="">Select...</option>${suppliers.map(s => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join('')}</select></div>
          <div><label class="text-xs text-gray-500 block">Date</label><input id="po-date" type="date" value="${today()}" class="w-full px-3 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800" /></div>
        </div>
        <div><label class="text-xs text-gray-500 block">Add Items</label>
          <div class="flex gap-2"><select id="po-item-select" class="flex-1 px-3 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm"><option value="">Select item...</option>${inv.map(i => `<option value="${i.id}" data-name="${escapeHtml(i.name)}" data-price="${i.costPrice||0}">${escapeHtml(i.name)} - ${peso(i.costPrice||0)}</option>`).join('')}</select>
          <input id="po-qty" type="number" value="1" min="1" class="w-16 px-2 text-center border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm" />
          <input id="po-price" type="number" step="0.01" value="" placeholder="Price" class="w-24 px-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm" />
          <button onclick="addPOItem()" class="px-3 py-2 bg-blue-600 text-white rounded-lg text-sm"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg></button></div>
        </div>
        <div><h4 class="font-semibold text-sm mb-1">Items</h4><div id="po-cart" class="max-h-40 overflow-auto border dark:border-gray-700 rounded-lg p-2"></div></div>
        <div class="flex justify-between font-bold">Total: <span id="po-total">${peso(0)}</span></div>
        <button onclick="savePO()" class="w-full py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-semibold"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="inline-block mr-1 -mt-0.5"><polyline points="20 6 9 17 4 12"/></svg>Create Purchase Order</button>
      </div>
    </div>`);
}

export function addPOItem() {
  const sel = document.getElementById('po-item-select');
  const qtyEl = document.getElementById('po-qty');
  const prEl = document.getElementById('po-price');
  if (!sel || !qtyEl || !prEl) { toast('Form not ready', 'warning'); return; }
  const opt = sel.options[sel.selectedIndex];
  if (!opt || !opt.value) { toast('Select an item', 'warning'); return; }
  const invId = parseInt(opt.value);
  const name = opt.dataset.name;
  const defaultPrice = parseFloat(opt.dataset.price);
  const qty = parseInt(qtyEl.value) || 1;
  const price = parseFloat(prEl.value) || defaultPrice;
  const existing = poItems.find(i => i.invId === invId);
  if (existing) { existing.qty += qty; existing.price = price; }
  else { poItems.push({ invId, name, price, qty }); }
  renderPOCart();
}

export function renderPOCart() {
  const el = document.getElementById('po-cart');
  const totalEl = document.getElementById('po-total');
  if (!el) return;
  if (poItems.length === 0) { el.innerHTML = '<p class="text-gray-400 text-xs">No items added</p>'; if (totalEl) totalEl.textContent = peso(0); return; }
  const total = poItems.reduce((s, i) => s + (i.price * i.qty), 0);
  if (totalEl) totalEl.textContent = peso(total);
  el.innerHTML = poItems.map((item, i) => {
  const invItem = item.invId ? state.inventory.find(x => x.id === item.invId) : null;
  return `<div class="flex justify-between items-center py-1 border-b dark:border-gray-700 last:border-0 text-sm">
    <span class="flex items-center gap-2">${invItem ? itemThumbHtml(invItem, 'w-6 h-6') : ''}<span>${escapeHtml(item.name)} x${item.qty} @ ${peso(item.price)}</span></span>
    <div><span class="font-medium">${peso(item.price * item.qty)}</span><button onclick="removePOItem(${i})" class="ml-2 text-red-500"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button></div>
  </div>`;
}).join('');
}

export function removePOItem(i) { poItems.splice(i, 1); renderPOCart(); }

export async function savePO() {
  if (poItems.length === 0) { toast('Add at least one item', 'error'); return; }
  const supplierSel = document.getElementById('po-supplier');
  const dtEl = document.getElementById('po-date');
  if (!supplierSel || !dtEl) { toast('Form not ready', 'error'); return; }
  const supplierId = supplierSel.value ? parseInt(supplierSel.value) : null;
  const supplierName = supplierSel.options[supplierSel.selectedIndex]?.text || 'Unknown';
  const date = dtEl.value || today();
  const total = poItems.reduce((s, i) => s + (i.price * i.qty), 0);
  const existingPOs = state.purchaseOrders.filter(p => p.poNo?.startsWith('PO-'));
  const nextNo = existingPOs.length > 0 ? Math.max(...existingPOs.map(p => parseInt(p.poNo.replace('PO-','')) || 0)) + 1 : 1;
  const poNo = 'PO-' + String(nextNo).padStart(5,'0');
  await dbAdd('purchaseOrders', {
    poNo, supplierId, supplierName, date, items: poItems.map(i => ({...i})),
    total, status: 'Pending', createdAt: now()
  });
  state.purchaseOrders = await dbAll('purchaseOrders');
  renderPOTable();
  await logAudit('po', `PO ${poNo} created from ${supplierName}`);
  toast(`PO ${poNo} created`, 'success');
  closeModal();
}

export async function receivePO(id) {
  const po = await dbGet('purchaseOrders', id);
  if (!po) { toast('PO not found', 'error'); return; }
  if (po.status === 'Received') { toast('Already received', 'warning'); return; }
  if (!await confirmModal(`Receive PO ${po.poNo}? This will update inventory.`)) return;
  for (const item of (po.items || [])) {
    if (item.invId) {
      const inv = await dbGet('inventory', item.invId);
      if (inv) {
        inv.stock = (inv.stock || 0) + item.qty;
        if (item.price > 0) inv.costPrice = item.price;
        await dbPut('inventory', inv);
      }
    }
  }
  po.status = 'Received';
  po.receivedAt = now();
  await dbPut('purchaseOrders', po);
  state.purchaseOrders = await dbAll('purchaseOrders');
  state.inventory = await dbAll('inventory');
  renderPOTable();
  toast(`PO ${po.poNo} received`, 'success');
  await logAudit('po-receive', `PO ${po.poNo} received`);
}

export async function deletePO(id) {
  if (!await confirmModal('Delete this purchase order?')) return;
  await dbDel('purchaseOrders', id);
  state.purchaseOrders = await dbAll('purchaseOrders');
  renderPOTable();
  toast('PO deleted');
}


// expose top-level bindings as globals (inline onclick handlers and legacy code paths rely on them)
Object.defineProperties(window, {
  poItems: { get: () => poItems, set: (v) => { poItems = v; }, configurable: true },
  viewPurchaseOrders: { get: () => viewPurchaseOrders, configurable: true },
  debouncedRenderPOTable: { get: () => debouncedRenderPOTable, configurable: true },
  renderPOTable: { get: () => renderPOTable, configurable: true },
  openPOModal: { get: () => openPOModal, configurable: true },
  addPOItem: { get: () => addPOItem, configurable: true },
  renderPOCart: { get: () => renderPOCart, configurable: true },
  removePOItem: { get: () => removePOItem, configurable: true },
  savePO: { get: () => savePO, configurable: true },
  receivePO: { get: () => receivePO, configurable: true },
  deletePO: { get: () => deletePO, configurable: true }
});
