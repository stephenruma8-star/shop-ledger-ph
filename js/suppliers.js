async function viewSuppliers(root) {
  await dbLoad('suppliers');
  root.innerHTML = `
    <div class="space-y-4 fade-in">
      <div class="flex gap-2 flex-wrap items-center">
        <input id="supSearch" placeholder="Search suppliers..." class="flex-1 min-w-[200px] px-4 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800" oninput="debouncedRenderSupTable()" />
        <button onclick="openSupplierModal()" class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">+ New Supplier</button>
      </div>
      <div class="bg-white dark:bg-gray-800 rounded-xl shadow-sm overflow-hidden glass-card">
        <div class="overflow-auto" id="supTable"></div>
      </div>
    </div>`;
  renderSupTable();
}

var debouncedRenderSupTable = debounce(renderSupTable, 250);
function renderSupTable() {
  const q = document.getElementById('supSearch')?.value || '';
  const filtered = searchData(state.suppliers, q, ['name','contact','email','category']);
  const container = document.getElementById('supTable');
  if (!container) return;
  if (filtered.length === 0) { container.innerHTML = '<div class="p-6 text-center text-gray-400">No suppliers</div>'; return; }
  container.innerHTML = `<table class="w-full text-sm"><thead><tr class="bg-gray-50 dark:bg-gray-700 text-left"><th class="p-3">Name</th><th class="p-3">Contact</th><th class="p-3">Email</th><th class="p-3">Category</th><th class="p-3 text-center">Actions</th></tr></thead>
    <tbody>${filtered.map(s => `<tr class="border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50">
      <td class="p-3 font-medium">${escapeHtml(s.name)}</td><td class="p-3">${escapeHtml(s.contact || '-')}</td><td class="p-3 text-gray-500">${escapeHtml(s.email || '-')}</td>
      <td class="p-3">${escapeHtml(s.category || '-')}</td>
      <td class="p-3 text-center"><button onclick="openSupplierModal(${s.id})" class="text-blue-600 hover:text-blue-800 text-xs mr-2">Edit</button><button onclick="deleteSup(${s.id})" class="text-red-600 hover:text-red-800 text-xs">Del</button></td>
    </tr>`).join('')}</tbody></table>`;
}

function openSupplierModal(id) {
  const isEdit = !!id;
  const s = isEdit ? state.suppliers.find(x => x.id === id) : null;
  modal(`
    <div class="p-6">
      <div class="flex justify-between items-center mb-4"><h3 class="text-xl font-bold">${isEdit ? 'Edit' : 'New'} Supplier</h3><button onclick="closeModal()" class="text-gray-400 text-2xl">&times;</button></div>
      <div class="space-y-3">
        <div><label class="text-xs text-gray-500 block">Name *</label><input id="sf-name" value="${isEdit ? escapeHtml(s.name||'') : ''}" class="w-full px-3 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800" /></div>
        <div class="grid grid-cols-2 gap-3">
          <div><label class="text-xs text-gray-500 block">Contact</label><input id="sf-contact" value="${isEdit ? escapeHtml(s.contact||'') : ''}" class="w-full px-3 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800" /></div>
          <div><label class="text-xs text-gray-500 block">Email</label><input id="sf-email" value="${isEdit ? escapeHtml(s.email||'') : ''}" class="w-full px-3 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800" /></div>
        </div>
        <div><label class="text-xs text-gray-500 block">Category</label><input id="sf-category" value="${isEdit ? escapeHtml(s.category||'') : ''}" class="w-full px-3 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800" /></div>
        <div><label class="text-xs text-gray-500 block">Address</label><input id="sf-address" value="${isEdit ? escapeHtml(s.address||'') : ''}" class="w-full px-3 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800" /></div>
        <div class="flex gap-2 pt-2">
          <button onclick="saveSup(${isEdit ? id : 'null'})" class="flex-1 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">${isEdit ? 'Update' : 'Save'}</button>
          <button onclick="closeModal()" class="px-4 py-2 bg-gray-200 dark:bg-gray-700 rounded-lg">Cancel</button>
        </div>
      </div>
    </div>`);
}

async function saveSup(id) {
  const name = document.getElementById('sf-name').value.trim();
  if (!name) { toast('Name is required', 'error'); return; }
  const obj = {
    name, contact: document.getElementById('sf-contact').value.trim(),
    email: document.getElementById('sf-email').value.trim(),
    category: document.getElementById('sf-category').value.trim(),
    address: document.getElementById('sf-address').value.trim()
  };
  if (id) { const existing = await dbGet('suppliers', id); if (existing) obj.createdAt = existing.createdAt; obj.id = id; await dbPut('suppliers', obj); toast('Supplier updated'); }
  else { obj.createdAt = now(); await dbAdd('suppliers', obj); toast('Supplier added'); }
  closeModal();
  state.suppliers = await dbAll('suppliers');
  renderSupTable();
}

async function deleteSup(id) {
  if (!await confirmModal('Delete this supplier?')) return;
  await dbDel('suppliers', id);
  state.suppliers = await dbAll('suppliers');
  renderSupTable();
  toast('Supplier deleted');
}
