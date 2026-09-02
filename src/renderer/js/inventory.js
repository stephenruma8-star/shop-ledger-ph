import { logAudit } from './auth.js'
import { dbAdd, dbAll, dbDel, dbGet, dbPut } from './database.js'
import { closeModal, confirmModal, dbLoad, debounce, escapeHtml, itemThumbHtml, modal, searchData, toast, updateLowStockBadge } from './helpers.js'
import { escHtml } from './printLayout.js'
import { now, peso, state } from './state.js'
import { getQty } from './transactions.js'

export async function viewInventory(root) {
  await dbLoad('inventory');
  root.innerHTML = `
    <div class="space-y-4 fade-in">
      <div class="flex gap-2 flex-wrap items-center">
        <input id="invSearch" placeholder="Search inventory..." class="flex-1 min-w-[200px] px-4 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800" oninput="debouncedRenderInvTable()" />
        <button onclick="openInventoryModal()" title="F5 / Ctrl+I" class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="inline-block mr-1 -mt-0.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>New Item</button>
        <button onclick="showReorderSuggestions()" class="px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="inline-block mr-1 -mt-0.5"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>Reorder</button>
      </div>
      <div id="reorderSection" class="hidden"></div>
      <div class="bg-white dark:bg-gray-800 rounded-xl shadow-sm overflow-hidden glass-card">
        <div class="overflow-auto table-scroll" id="invTable"></div>
      </div>
    </div>`;
  renderInvTable();
}

export function renderInvTable() {
  const q = document.getElementById('invSearch')?.value || '';
  const filtered = searchData(state.inventory, q, ['name','sku','category','barcode']);
  const sorted = [...filtered].sort((a, b) => a.name?.localeCompare(b.name));
  const container = document.getElementById('invTable');
  if (!container) return;
  if (sorted.length === 0) { container.innerHTML = '<div class="empty-state"><svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg><p class="font-medium text-gray-500">No inventory items yet</p><p class="text-sm mt-1">Click "New Item" to add your first product</p></div>'; return; }
  container.innerHTML = `<table class="w-full text-sm"><thead><tr class="bg-gray-50 dark:bg-gray-700 text-left"><th class="p-3 w-10"><input type="checkbox" onchange="document.querySelectorAll('.inv-check').forEach(c=>c.checked=this.checked);toggleInvBulkBar()" /></th><th class="p-3 w-12">Photo</th><th class="p-3">Name</th><th class="p-3">SKU</th><th class="p-3">Category</th><th class="p-3 text-right">Price</th>        <th class="p-3 text-right">Cost</th><th class="p-3 text-center">Stock</th><th class="p-3 text-left">Unit</th><th class="p-3 text-center">Actions</th></tr></thead>
    <tbody>${sorted.map(i => {
      const low = (i.stock || 0) <= (i.minStock || 5);
      return `<tr class="border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50">
        <td class="p-3 w-10"><input type="checkbox" value="${i.id}" class="inv-check" onchange="toggleInvBulkBar()" /></td>
        <td class="p-3">${itemThumbHtml(i)}</td>
        <td class="p-3 font-medium">${escapeHtml(i.name)}</td><td class="p-3 text-gray-500">${escapeHtml(i.sku || '-')}</td>
        <td class="p-3">${escapeHtml(i.category || '-')}</td><td class="p-3 text-right">${peso(i.sellPrice||i.price||0)}</td>
        <td class="p-3 text-right text-gray-500">${peso(i.costPrice||0)}</td>
        <td class="p-3 text-center"><span class="${low ? 'text-red-600 font-bold' : ''}">${i.stock || 0}</span>${low ? ' ⚠️' : ''}</td>
        <td class="p-3 text-left text-gray-500 text-xs">${escapeHtml(i.unit||'pcs')}${i.variants && i.variants.length ? `<br><span class="text-blue-500 font-medium">${i.variants.length} vars</span>` : ''}</td>
        <td class="p-3 text-center">
          <button onclick="openInventoryModal(${i.id})" class="text-blue-600 hover:text-blue-800 text-xs mr-2"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="inline-block mr-1 -mt-0.5"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>Edit</button>
          <button onclick="viewItemHistory(${i.id})" class="text-green-600 hover:text-green-800 text-xs mr-2"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="inline-block mr-1 -mt-0.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>History</button>
          <button onclick="deleteInv(${i.id})" class="text-red-600 hover:text-red-800 text-xs"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="inline-block mr-1 -mt-0.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>Del</button>
        </td></tr>`;
    }).join('')}</tbody></table>
    <div id="inv-bulk-bar" class="hidden sticky bottom-0 bg-blue-50 dark:bg-blue-900/20 border-t border-blue-200 dark:border-blue-800 px-3 py-2 flex items-center gap-2 text-sm">
      <span id="inv-bulk-count" class="font-semibold">0 selected</span>
      <button onclick="bulkEditInv()" class="px-3 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="inline-block mr-1 -mt-0.5"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>Edit Selected</button>
      <button onclick="bulkDeleteInv()" class="ml-auto px-3 py-1 bg-red-600 text-white rounded text-xs hover:bg-red-700"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="inline-block mr-1 -mt-0.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>Delete Selected</button>
    </div>`;
}
export function addVariantRow() {
  const list = document.getElementById('if-variants-list');
  if (!list) return;
  const div = document.createElement('div');
  div.className = 'flex gap-1 items-center';
  div.innerHTML = `<input class="iv-name flex-1 px-2 py-1 border dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-xs" placeholder="e.g. Small" /><input class="iv-stock w-20 px-2 py-1 border dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-xs text-right" type="number" value="0" placeholder="Qty" /><button onclick="this.parentElement.remove()" class="text-red-500 hover:text-red-700 text-xs"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>`;
  list.appendChild(div);
}

export let debouncedRenderInvTable = debounce(renderInvTable, 250);

let _invImage = null;

export function invPickImage() {
  const el = document.getElementById('if-image-input');
  if (el) el.click();
}

export function invImageChanged(input) {
  const file = input.files && input.files[0];
  if (!file) return;
  if (!/^image\//.test(file.type)) { toast('Please choose an image file', 'error'); input.value = ''; return; }
  const fr = new FileReader();
  fr.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      const MAX = 320;
      const scale = Math.min(1, MAX / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      _invImage = canvas.toDataURL('image/jpeg', 0.8);
      renderInvImagePreview();
    };
    img.onerror = () => { toast('Could not read the image', 'error'); input.value = ''; };
    img.src = e.target.result;
  };
  fr.readAsDataURL(file);
}

export function invClearImage() { _invImage = null; renderInvImagePreview(); }

export function renderInvImagePreview() {
  const wrap = document.getElementById('if-image-preview');
  if (!wrap) return;
  wrap.innerHTML = _invImage
    ? `<img src="${_invImage}" alt="" class="w-20 h-20 object-cover rounded-lg border dark:border-gray-700" />`
    : `<div class="w-20 h-20 rounded-lg border border-dashed dark:border-gray-600 flex items-center justify-center text-3xl text-gray-400">📦</div>`;
  const rm = document.getElementById('if-image-remove');
  if (rm) rm.classList.toggle('hidden', !_invImage);
}

export function openInventoryModal(id) {
  const isEdit = !!id;
  const i = isEdit ? state.inventory.find(x => x.id === id) : null;
  _invImage = isEdit ? (i.image || null) : null;
  modal(`
    <div class="p-6">
      <div class="flex justify-between items-center mb-4"><h3 class="text-xl font-bold">${isEdit ? 'Edit' : 'New'} Inventory Item</h3><button onclick="closeModal()" class="text-gray-400 hover:text-gray-600"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button></div>
      <div class="space-y-3">
        <div class="grid grid-cols-2 gap-3">
          <div><label class="text-xs text-gray-500 block">Name *</label><input id="if-name" value="${isEdit ? escapeHtml(i.name||'') : ''}" class="w-full px-3 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800" /></div>
          <div><label class="text-xs text-gray-500 block">SKU</label><input id="if-sku" value="${isEdit ? escapeHtml(i.sku||'') : ''}" class="w-full px-3 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800" /></div>
        </div>
        <div><label class="text-xs text-gray-500 block">Barcode (scan or type)</label><input id="if-barcode" value="${isEdit ? escapeHtml(i.barcode||'') : ''}" class="w-full px-3 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 font-mono" placeholder="Scan barcode with scanner or type manually" /></div>
        <div><label class="text-xs text-gray-500 block">Category</label><input id="if-category" value="${isEdit ? escapeHtml(i.category||'') : ''}" class="w-full px-3 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800" /></div>
        <div>
          <label class="text-xs text-gray-500 block">Picture (optional)</label>
          <div class="flex items-center gap-3 mt-1">
            <div id="if-image-preview" class="w-20 h-20 rounded-lg overflow-hidden"></div>
            <div class="flex flex-col gap-1">
              <button type="button" onclick="invPickImage()" class="text-xs px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700">📷 Upload</button>
              <button type="button" id="if-image-remove" onclick="invClearImage()" class="text-xs px-3 py-1.5 bg-red-600 text-white rounded-lg hover:bg-red-700 hidden">Remove</button>
            </div>
            <input type="file" id="if-image-input" accept="image/*" class="hidden" onchange="invImageChanged(this)" />
          </div>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div><label class="text-xs text-gray-500 block">Sell Price *</label><input id="if-price" type="number" step="0.01" value="${isEdit ? (i.sellPrice||i.price||0) : '0'}" class="w-full px-3 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800" /></div>
          <div><label class="text-xs text-gray-500 block">Cost Price</label><input id="if-cost" type="number" step="0.01" value="${isEdit ? (i.costPrice||0) : '0'}" class="w-full px-3 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800" /></div>
        </div>
        <div class="grid grid-cols-3 gap-3">
          <div><label class="text-xs text-gray-500 block">Stock *</label><input id="if-stock" type="number" value="${isEdit ? (i.stock||0) : '0'}" class="w-full px-3 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800" /></div>
          <div><label class="text-xs text-gray-500 block">Min Stock</label><input id="if-min" type="number" value="${isEdit ? (i.minStock||5) : '5'}" class="w-full px-3 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800" /></div>
          <div><label class="text-xs text-gray-500 block">Unit</label><input id="if-unit" value="${isEdit ? escapeHtml(i.unit||'') : ''}" class="w-full px-3 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800" placeholder="pcs, kg, L..." /></div>
        </div>
        <div>
          <label class="flex items-center gap-2 text-sm"><input type="checkbox" id="if-hasVariants" onchange="document.getElementById('if-variants-section').classList.toggle('hidden',!this.checked)" ${isEdit && i.variants && i.variants.length ? 'checked' : ''} /> Has Variants (sizes/colors)</label>
          <div id="if-variants-section" class="${isEdit && i.variants && i.variants.length ? '' : 'hidden'} mt-2 space-y-1">
            <div id="if-variants-list">${isEdit && i.variants ? i.variants.map((v,vi) => `<div class="flex gap-1 items-center"><input class="iv-name flex-1 px-2 py-1 border dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-xs" value="${escapeHtml(v.name||'')}" placeholder="Name" /><input class="iv-stock w-20 px-2 py-1 border dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-xs text-right" type="number" value="${v.stock||0}" placeholder="Qty" /><button onclick="this.parentElement.remove()" class="text-red-500 hover:text-red-700 text-xs"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button></div>`).join('') : ''}</div>
            <button onclick="addVariantRow()" class="text-xs text-blue-600 hover:text-blue-800"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="inline-block mr-0.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>Add Variant</button>
          </div>
        </div>
        <div class="flex gap-2 pt-2">
          <button onclick="saveInv(${isEdit ? id : 'null'})" class="flex-1 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="inline-block mr-1 -mt-0.5"><polyline points="20 6 9 17 4 12"/></svg>${isEdit ? 'Update' : 'Save'}</button>
          <button onclick="closeModal()" class="px-4 py-2 bg-gray-200 dark:bg-gray-700 rounded-lg"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="inline-block mr-1 -mt-0.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>Cancel</button>
        </div>
      </div>
    </div>`);
  renderInvImagePreview();
}

export async function saveInv(id) {
  const nmEl = document.getElementById('if-name');
  const skEl = document.getElementById('if-sku');
  const bcEl = document.getElementById('if-barcode');
  const ctEl = document.getElementById('if-category');
  const prEl = document.getElementById('if-price');
  const csEl = document.getElementById('if-cost');
  const stEl = document.getElementById('if-stock');
  const mnEl = document.getElementById('if-min');
  const unEl = document.getElementById('if-unit');
  if (!nmEl || !skEl || !ctEl || !prEl || !csEl || !stEl || !mnEl) { toast('Form not ready', 'error'); return; }
  const name = nmEl.value.trim();
  if (requireFields([{ el: nmEl, msg: 'Please fill out this field' }])) return;
  const sku = skEl.value.trim();
  const barcode = bcEl ? bcEl.value.trim() : '';
  const dupName = state.inventory.find(i => i.name.toLowerCase() === name.toLowerCase() && i.id !== id);
  if (dupName) { toast('Item with this name already exists', 'error'); return; }
  const dupSku = sku && state.inventory.find(i => i.sku && i.sku.toLowerCase() === sku.toLowerCase() && i.id !== id);
  if (dupSku) { toast('Item with this SKU already exists', 'error'); return; }
  const dupBarcode = barcode && state.inventory.find(i => i.barcode && i.barcode === barcode && i.id !== id);
  if (dupBarcode) { toast('Item with this barcode already exists', 'error'); return; }
  const hasVariants = document.getElementById('if-hasVariants')?.checked;
  let variants = [];
  if (hasVariants) {
    const nameEls = document.querySelectorAll('.iv-name');
    const stockEls = document.querySelectorAll('.iv-stock');
    for (let i = 0; i < nameEls.length; i++) {
      const vn = nameEls[i].value.trim();
      if (vn) variants.push({ name: vn, stock: parseInt(stockEls[i]?.value) || 0 });
    }
  }
  const totalStock = variants.length > 0 ? variants.reduce((s, v) => s + v.stock, 0) : (parseInt(stEl.value) || 0);

  const obj = {
    name, sku, barcode,
    category: ctEl.value.trim(),
    sellPrice: parseFloat(prEl.value) || 0,
    costPrice: parseFloat(csEl.value) || 0,
    stock: totalStock,
    minStock: parseInt(mnEl.value) || 5,
    lowStock: parseInt(mnEl.value) || 5,
    unit: (unEl ? unEl.value.trim() : '') || 'pcs',
    variants: variants.length > 0 ? variants : undefined,
    image: _invImage || undefined
  };
  if (id) {
    const existing = await dbGet('inventory', id);
    if (existing) {
      obj.createdAt = existing.createdAt;
      const oldStock = existing.stock || 0;
      const newStock = obj.stock || 0;
      if (oldStock !== newStock) await logAudit('inventory', `${existing.name}: stock ${oldStock} → ${newStock} (adj: ${newStock - oldStock})`);
    }
    obj.id = id; await dbPut('inventory', obj); toast('Item updated');
  } else { obj.createdAt = now(); await dbAdd('inventory', obj); await logAudit('inventory', `New item: ${obj.name}`); toast('Item added'); }
  closeModal();
  state.inventory = await dbAll('inventory');
  updateLowStockBadge();
  renderInvTable();
}

export async function deleteInv(id) {
  const item = state.inventory.find(i => i.id === id);
  if (!item) return;
  const used = state.transactions.some(t => (t.items||[]).some(i => i.invId === id));
  if (used) {
    if (!await confirmModal(`"${item.name}" was used in past sales. Delete anyway? (Data in those sales will remain.)`)) return;
  } else {
    if (!await confirmModal(`Delete "${item.name}"?`)) return;
  }
  await dbDel('inventory', id);
  state.inventory = await dbAll('inventory');
  renderInvTable();
  toast('Item deleted');
}

export function showReorderSuggestions() {
  const sec = document.getElementById('reorderSection');
  if (!sec) return;
  const needsReorder = state.inventory.filter(i => (i.stock || 0) <= (i.minStock || 5)).sort((a, b) => ((a.stock||0)/(a.minStock||5)) - ((b.stock||0)/(b.minStock||5)));
  if (needsReorder.length === 0) {
    sec.classList.add('hidden'); toast('All items sufficiently stocked', 'success'); return;
  }
  sec.classList.remove('hidden');
  sec.innerHTML = `<div class="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4 shadow-sm">
    <div class="flex justify-between items-center mb-2"><h3 class="font-bold text-sm text-amber-800 dark:text-amber-300">Reorder Suggestions</h3>
      <div class="flex gap-2 items-center">
        <button onclick="sendLowStockSMS()" class="px-2 py-1 bg-amber-600 text-white rounded text-xs hover:bg-amber-700"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="inline-block mr-1 -mt-0.5"><rect x="3" y="11" width="18" height="10" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>SMS Alert</button>
        <button onclick="document.getElementById('reorderSection').classList.add('hidden')" class="text-amber-600 hover:text-amber-800 text-xs"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="inline-block mr-1 -mt-0.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>Close</button>
      </div>
    </div>
    <table class="w-full text-xs"><thead><tr class="text-left text-amber-700 dark:text-amber-400"><th class="p-1">Item</th><th class="p-1 text-right">Stock</th><th class="p-1 text-right">Min</th><th class="p-1 text-right">Suggest</th><th class="p-1 text-right">Cost</th><th class="p-1 text-right">Total</th></tr></thead>
    <tbody>${needsReorder.map(i => {
      const suggest = Math.max((i.minStock||5) * 2 - (i.stock||0), (i.minStock||5));
      return `<tr class="border-b border-amber-200 dark:border-amber-800"><td class="p-1">${escapeHtml(i.name)}</td><td class="p-1 text-right text-red-600 font-bold">${i.stock||0}</td><td class="p-1 text-right">${i.minStock||5}</td><td class="p-1 text-right font-bold">${suggest}</td><td class="p-1 text-right">${peso(i.costPrice||0)}</td><td class="p-1 text-right">${peso((i.costPrice||0) * suggest)}</td></tr>`;
    }).join('')}</tbody></table></div>`;
}

export async function sendLowStockSMS() {
  if (!window.electronAPI?.sendSMS) { toast('SMS only available in desktop app', 'warning'); return; }
  const settingsMap = {};
  state.settings.forEach(s => settingsMap[s.key] = s.value);
  const apiKey = settingsMap['smsApiKey'] || '';
  const number = settingsMap['smsAlertNumber'] || '';
  if (!apiKey) { toast('Set Semaphore API key in Settings first', 'warning'); return; }
  if (!number) { toast('Set SMS Alert Number in Settings first', 'warning'); return; }
  const low = state.inventory.filter(i => (i.stock || 0) <= (i.minStock || 5)).sort((a, b) => ((a.stock||0)/(a.minStock||5)) - ((b.stock||0)/(b.minStock||5)));
  if (low.length === 0) { toast('No low stock items', 'success'); return; }
  const shop = settingsMap['shopName'] || 'Shop Ledger PH';
  let message = shop + ' - LOW STOCK ALERT\n';
  for (const i of low.slice(0, 15)) message += i.name + ': ' + (i.stock || 0) + '/' + (i.minStock || 5) + '\n';
  if (low.length > 15) message += '+' + (low.length - 15) + ' more...';
  const result = await window.electronAPI.sendSMS({ apiKey, number, message });
  if (result.success) toast(`Low stock SMS sent (${low.length} item(s))`, 'success');
  else toast('SMS failed: ' + (result.error || 'Unknown error'), 'error');
}

export function toggleInvBulkBar() {
  const checked = document.querySelectorAll('.inv-check:checked');
  const bar = document.getElementById('inv-bulk-bar');
  if (!bar) return;
  if (checked.length > 0) { bar.classList.remove('hidden'); const el = document.getElementById('inv-bulk-count'); if (el) el.textContent = checked.length + ' selected'; }
  else bar.classList.add('hidden');
}

export async function bulkDeleteInv() {
  const checked = document.querySelectorAll('.inv-check:checked');
  if (!checked.length) return;
  if (!await confirmModal(`Delete ${checked.length} inventory item(s)?`)) return;
  for (const cb of checked) await dbDel('inventory', parseInt(cb.value));
  state.inventory = await dbAll('inventory');
  renderInvTable();
  updateLowStockBadge();
  toast(`${checked.length} item(s) deleted`);
}

export function bulkEditInv() {
  const checked = document.querySelectorAll('.inv-check:checked');
  if (!checked.length) return;
  modal(`
    <div class="p-6">
      <div class="flex justify-between items-center mb-4"><h3 class="text-xl font-bold">Bulk Edit (${checked.length} items)</h3><button onclick="closeModal()" class="text-gray-400 hover:text-gray-600"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button></div>
      <div class="space-y-3">
        <div><label class="text-xs text-gray-500 block">New Price (leave blank to keep)</label><input id="be-price" type="number" step="0.01" class="w-full px-3 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800" /></div>
        <div><label class="text-xs text-gray-500 block">New Category (leave blank to keep)</label><input id="be-category" class="w-full px-3 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800" /></div>
        <button onclick="applyBulkEdit()" class="w-full py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="inline-block mr-1 -mt-0.5"><polyline points="20 6 9 17 4 12"/></svg>Apply</button>
      </div>
    </div>`);
}

export async function applyBulkEdit() {
  const priceEl = document.getElementById('be-price');
  const catEl = document.getElementById('be-category');
  if (!priceEl || !catEl) { toast('Form not ready', 'error'); return; }
  const newPrice = parseFloat(priceEl.value);
  const newCat = catEl.value.trim();
  if (isNaN(newPrice) && !newCat) { toast('Enter a price or category to update', 'warning'); return; }
  const checked = document.querySelectorAll('.inv-check:checked');
  for (const cb of checked) {
    const item = state.inventory.find(i => i.id === parseInt(cb.value));
    if (!item) continue;
    if (!isNaN(newPrice)) item.sellPrice = newPrice;
    if (newCat) item.category = newCat;
    await dbPut('inventory', item);
  }
  state.inventory = await dbAll('inventory');
  renderInvTable();
  closeModal();
  toast(`${checked.length} item(s) updated`);
}

export function viewItemHistory(id) {
  const item = state.inventory.find(i => i.id === id);
  if (!item) { toast('Item not found', 'error'); return; }
  const entries = [];
  state.transactions.forEach(t => {
    (t.items || []).filter(it => it.invId === id).forEach(it => {
      const qty = getQty(it.name || '1');
      entries.push({ date: t.date || t.createdAt, type: 'sale', ref: t.invoiceNo || 'Sale', client: t.clientName || 'Walk-in', qty: -qty, price: it.unitCost || 0, total: -(qty * (it.unitCost || 0)), sort: t.createdAt || t.date });
    });
  });
  const itemNameLower = item.name.toLowerCase();
  (state.auditLogs || []).filter(a => a.action === 'inventory' && a.details && a.details.toLowerCase().includes(itemNameLower)).forEach(a => {
    const match = a.details.match(/stock (.+?) → (.+?) \(adj: (.+?)\)/);
    if (match) {
      const adj = parseFloat(match[3]);
      entries.push({ date: a.date || a.createdAt, type: 'adjust', ref: '', client: '', qty: adj, price: 0, total: 0, sort: a.createdAt || a.date, note: a.details });
    } else {
      entries.push({ date: a.date || a.createdAt, type: 'adjust', ref: '', client: '', qty: 0, price: 0, total: 0, sort: a.createdAt || a.date, note: a.details });
    }
  });
  entries.sort((a, b) => (a.sort || '').localeCompare(b.sort || ''));
  let running = 0;
  let rows = entries.map(e => {
    running += e.qty;
    const icon = e.type === 'sale' ? '🔴' : '🟡';
    return `<tr class="border-b dark:border-gray-700"><td class="p-2 whitespace-nowrap text-xs text-gray-500">${escHtml(e.date || '')}</td><td class="p-2 text-xs">${icon} ${e.type === 'sale' ? escHtml(e.ref) : 'Adjust'}</td><td class="p-2 text-xs text-gray-500">${e.type === 'sale' ? escHtml(e.client) : escHtml(e.note || '')}</td><td class="p-2 text-right text-xs ${e.qty < 0 ? 'text-red-600' : 'text-green-600'}">${e.qty > 0 ? '+' : ''}${e.qty}</td><td class="p-2 text-right text-xs font-semibold">${running}</td></tr>`;
  }).join('');

  modal(`<div class="p-4 flex flex-col" style="min-height:60vh">
    <div class="flex justify-between items-center mb-3 shrink-0">
      <div class="flex items-center gap-3">${itemThumbHtml(item, 'w-16 h-16')}<div><h3 class="text-xl font-bold">${escHtml(item.name)}</h3><p class="text-xs text-gray-500">SKU: ${escHtml(item.sku || '—')} · Current Stock: <strong class="${(item.stock||0) <= (item.minStock||5) ? 'text-red-600' : 'text-green-600'}">${item.stock || 0}</strong> · Price: ${peso(item.sellPrice||item.price||0)}</p></div></div>
      <button onclick="closeModal()" class="text-gray-400 hover:text-gray-600"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
    </div>
    <div class="flex-1 overflow-auto min-h-0">
      <table class="w-full text-sm"><thead><tr class="bg-gray-50 dark:bg-gray-700 text-xs uppercase tracking-wide sticky top-0"><th class="p-2 text-left">Date</th><th class="p-2 text-left">Reference</th><th class="p-2 text-left">Detail</th><th class="p-2 text-right">Qty</th><th class="p-2 text-right">Balance</th></tr></thead>
      <tbody>${rows || '<tr><td class="p-4 text-center text-gray-400" colspan="5">No history for this item</td></tr>'}</tbody></table>
    </div>
  </div>`);
}


// expose top-level bindings as globals (inline onclick handlers and legacy code paths rely on them)
Object.defineProperties(window, {
  viewInventory: { get: () => viewInventory, configurable: true },
  renderInvTable: { get: () => renderInvTable, configurable: true },
  addVariantRow: { get: () => addVariantRow, configurable: true },
  debouncedRenderInvTable: { get: () => debouncedRenderInvTable, configurable: true },
  openInventoryModal: { get: () => openInventoryModal, configurable: true },
  invPickImage: { get: () => invPickImage, configurable: true },
  invImageChanged: { get: () => invImageChanged, configurable: true },
  invClearImage: { get: () => invClearImage, configurable: true },
  saveInv: { get: () => saveInv, configurable: true },
  deleteInv: { get: () => deleteInv, configurable: true },
  showReorderSuggestions: { get: () => showReorderSuggestions, configurable: true },
  sendLowStockSMS: { get: () => sendLowStockSMS, configurable: true },
  toggleInvBulkBar: { get: () => toggleInvBulkBar, configurable: true },
  bulkDeleteInv: { get: () => bulkDeleteInv, configurable: true },
  bulkEditInv: { get: () => bulkEditInv, configurable: true },
  applyBulkEdit: { get: () => applyBulkEdit, configurable: true },
  viewItemHistory: { get: () => viewItemHistory, configurable: true }
});
