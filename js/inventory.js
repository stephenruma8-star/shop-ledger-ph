async function viewInventory(root) {
  await dbLoad('inventory');
  root.innerHTML = `
    <div class="space-y-4 fade-in">
      <div class="flex gap-2 flex-wrap items-center">
        <input id="invSearch" placeholder="Search inventory..." class="flex-1 min-w-[200px] px-4 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800" oninput="debouncedRenderInvTable()" />
        <button onclick="openInventoryModal()" class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">+ New Item</button>
        <button onclick="showReorderSuggestions()" class="px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700">Reorder</button>
      </div>
      <div id="reorderSection" class="hidden"></div>
      <div class="bg-white dark:bg-gray-800 rounded-xl shadow-sm overflow-hidden glass-card">
        <div class="overflow-auto" id="invTable"></div>
      </div>
    </div>`;
  renderInvTable();
}

function renderInvTable() {
  const q = document.getElementById('invSearch')?.value || '';
  const filtered = searchData(state.inventory, q, ['name','sku','category']);
  const sorted = [...filtered].sort((a, b) => a.name?.localeCompare(b.name));
  const container = document.getElementById('invTable');
  if (!container) return;
  if (sorted.length === 0) { container.innerHTML = '<div class="p-6 text-center text-gray-400">No inventory items</div>'; return; }
  container.innerHTML = `<table class="w-full text-sm"><thead><tr class="bg-gray-50 dark:bg-gray-700 text-left"><th class="p-3">Name</th><th class="p-3">SKU</th><th class="p-3">Category</th><th class="p-3 text-right">Price</th><th class="p-3 text-right">Cost</th><th class="p-3 text-center">Stock</th><th class="p-3 text-center">Actions</th></tr></thead>
    <tbody>${sorted.map(i => {
      const low = (i.stock || 0) <= (i.minStock || 5);
      return `<tr class="border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50">
        <td class="p-3 font-medium">${escapeHtml(i.name)}</td><td class="p-3 text-gray-500">${escapeHtml(i.sku || '-')}</td>
        <td class="p-3">${escapeHtml(i.category || '-')}</td><td class="p-3 text-right">${peso(i.sellPrice||i.price||0)}</td>
        <td class="p-3 text-right text-gray-500">${peso(i.costPrice||0)}</td>
        <td class="p-3 text-center"><span class="${low ? 'text-red-600 font-bold' : ''}">${i.stock || 0}</span>${low ? ' ⚠️' : ''}</td>
        <td class="p-3 text-center">
          <button onclick="openInventoryModal(${i.id})" class="text-blue-600 hover:text-blue-800 text-xs mr-2">Edit</button>
          <button onclick="deleteInv(${i.id})" class="text-red-600 hover:text-red-800 text-xs">Del</button>
        </td></tr>`;
    }).join('')}</tbody></table>`;
}
var debouncedRenderInvTable = debounce(renderInvTable, 250);

function openInventoryModal(id) {
  const isEdit = !!id;
  const i = isEdit ? state.inventory.find(x => x.id === id) : null;
  modal(`
    <div class="p-6">
      <div class="flex justify-between items-center mb-4"><h3 class="text-xl font-bold">${isEdit ? 'Edit' : 'New'} Inventory Item</h3><button onclick="closeModal()" class="text-gray-400 text-2xl">&times;</button></div>
      <div class="space-y-3">
        <div class="grid grid-cols-2 gap-3">
          <div><label class="text-xs text-gray-500 block">Name *</label><input id="if-name" value="${isEdit ? escapeHtml(i.name||'') : ''}" class="w-full px-3 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800" /></div>
          <div><label class="text-xs text-gray-500 block">SKU</label><input id="if-sku" value="${isEdit ? escapeHtml(i.sku||'') : ''}" class="w-full px-3 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800" /></div>
        </div>
        <div><label class="text-xs text-gray-500 block">Category</label><input id="if-category" value="${isEdit ? escapeHtml(i.category||'') : ''}" class="w-full px-3 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800" /></div>
        <div class="grid grid-cols-2 gap-3">
          <div><label class="text-xs text-gray-500 block">Sell Price *</label><input id="if-price" type="number" step="0.01" value="${isEdit ? (i.sellPrice||i.price||0) : '0'}" class="w-full px-3 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800" /></div>
          <div><label class="text-xs text-gray-500 block">Cost Price</label><input id="if-cost" type="number" step="0.01" value="${isEdit ? (i.costPrice||0) : '0'}" class="w-full px-3 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800" /></div>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div><label class="text-xs text-gray-500 block">Stock *</label><input id="if-stock" type="number" value="${isEdit ? (i.stock||0) : '0'}" class="w-full px-3 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800" /></div>
          <div><label class="text-xs text-gray-500 block">Min Stock</label><input id="if-min" type="number" value="${isEdit ? (i.minStock||5) : '5'}" class="w-full px-3 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800" /></div>
        </div>
        <div class="flex gap-2 pt-2">
          <button onclick="saveInv(${isEdit ? id : 'null'})" class="flex-1 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">${isEdit ? 'Update' : 'Save'}</button>
          <button onclick="closeModal()" class="px-4 py-2 bg-gray-200 dark:bg-gray-700 rounded-lg">Cancel</button>
        </div>
      </div>
    </div>`);
}

async function saveInv(id) {
  const name = document.getElementById('if-name').value.trim();
  if (!name) { toast('Name is required', 'error'); return; }
  const sku = document.getElementById('if-sku').value.trim();
  const dupName = state.inventory.find(i => i.name.toLowerCase() === name.toLowerCase() && i.id !== id);
  if (dupName) { toast('Item with this name already exists', 'error'); return; }
  const dupSku = sku && state.inventory.find(i => i.sku && i.sku.toLowerCase() === sku.toLowerCase() && i.id !== id);
  if (dupSku) { toast('Item with this SKU already exists', 'error'); return; }
  const obj = {
    name, sku: document.getElementById('if-sku').value.trim(),
    category: document.getElementById('if-category').value.trim(),
    sellPrice: parseFloat(document.getElementById('if-price').value) || 0,
    costPrice: parseFloat(document.getElementById('if-cost').value) || 0,
    stock: parseInt(document.getElementById('if-stock').value) || 0,
    minStock: parseInt(document.getElementById('if-min').value) || 5
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

async function deleteInv(id) {
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

function showReorderSuggestions() {
  const sec = document.getElementById('reorderSection');
  if (!sec) return;
  const needsReorder = state.inventory.filter(i => (i.stock || 0) <= (i.minStock || 5)).sort((a, b) => ((a.stock||0)/(a.minStock||5)) - ((b.stock||0)/(b.minStock||5)));
  if (needsReorder.length === 0) {
    sec.classList.add('hidden'); toast('All items sufficiently stocked', 'success'); return;
  }
  sec.classList.remove('hidden');
  sec.innerHTML = `<div class="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4 shadow-sm">
    <div class="flex justify-between items-center mb-2"><h3 class="font-bold text-sm text-amber-800 dark:text-amber-300">Reorder Suggestions</h3><button onclick="document.getElementById('reorderSection').classList.add('hidden')" class="text-amber-600 text-xs">Close</button></div>
    <table class="w-full text-xs"><thead><tr class="text-left text-amber-700 dark:text-amber-400"><th class="p-1">Item</th><th class="p-1 text-right">Stock</th><th class="p-1 text-right">Min</th><th class="p-1 text-right">Suggest</th><th class="p-1 text-right">Cost</th><th class="p-1 text-right">Total</th></tr></thead>
    <tbody>${needsReorder.map(i => {
      const suggest = Math.max((i.minStock||5) * 2 - (i.stock||0), (i.minStock||5));
      return `<tr class="border-b border-amber-200 dark:border-amber-800"><td class="p-1">${escapeHtml(i.name)}</td><td class="p-1 text-right text-red-600 font-bold">${i.stock||0}</td><td class="p-1 text-right">${i.minStock||5}</td><td class="p-1 text-right font-bold">${suggest}</td><td class="p-1 text-right">${peso(i.costPrice||0)}</td><td class="p-1 text-right">${peso((i.costPrice||0) * suggest)}</td></tr>`;
    }).join('')}</tbody></table></div>`;
}
