import { dbAdd, dbAll, dbDel, dbGet, dbPut } from './database.js'
import { closeModal, confirmModal, dbLoad, debounce, escapeHtml, modal, searchData, toast } from './helpers.js'
import { now, state } from './state.js'

export async function viewSuppliers(root) {
  await dbLoad('suppliers');
  root.innerHTML = `
    <div class="space-y-4 fade-in">
      <div class="flex gap-2 flex-wrap items-center">
        <input id="supSearch" placeholder="Search suppliers..." class="flex-1 min-w-[200px] px-4 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800" oninput="debouncedRenderSupTable()" />
        <button onclick="openSupplierModal()" class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="inline-block mr-1 -mt-0.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>New Supplier</button>
      </div>
      <div class="bg-white dark:bg-gray-800 rounded-xl shadow-sm overflow-hidden glass-card">
        <div class="overflow-auto" id="supTable"></div>
      </div>
    </div>`;
  renderSupTable();
}

export let debouncedRenderSupTable = debounce(renderSupTable, 250);
export function renderSupTable() {
  const q = document.getElementById('supSearch')?.value || '';
  const filtered = searchData(state.suppliers, q, ['name','contact','email','category']);
  const container = document.getElementById('supTable');
  if (!container) return;
  if (filtered.length === 0) { container.innerHTML = '<div class="p-6 text-center text-gray-400">No suppliers</div>'; return; }
  container.innerHTML = `<table class="w-full text-sm"><thead><tr class="bg-gray-50 dark:bg-gray-700 text-left"><th class="p-3">Name</th><th class="p-3">Contact</th><th class="p-3">Email</th><th class="p-3">Category</th><th class="p-3 text-center">Actions</th></tr></thead>
    <tbody>${filtered.map(s => `<tr class="border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50">
      <td class="p-3 font-medium">${escapeHtml(s.name)}</td><td class="p-3">${escapeHtml(s.contact || '-')}</td><td class="p-3 text-gray-500">${escapeHtml(s.email || '-')}</td>
      <td class="p-3">${escapeHtml(s.category || '-')}</td>
      <td class="p-3 text-center"><button onclick="openSupplierModal(${s.id})" class="text-blue-600 hover:text-blue-800 text-xs mr-2"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="inline-block mr-1 -mt-0.5"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>Edit</button><button onclick="deleteSup(${s.id})" class="text-red-600 hover:text-red-800 text-xs"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="inline-block mr-1 -mt-0.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>Del</button></td>
    </tr>`).join('')}</tbody></table>`;
}

export function openSupplierModal(id) {
  const isEdit = !!id;
  const s = isEdit ? state.suppliers.find(x => x.id === id) : null;
  modal(`
    <div class="p-6">
      <div class="flex justify-between items-center mb-4"><h3 class="text-xl font-bold">${isEdit ? 'Edit' : 'New'} Supplier</h3><button onclick="closeModal()" class="text-gray-400 hover:text-gray-600"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button></div>
      <div class="space-y-3">
        <div><label class="text-xs text-gray-500 block">Name *</label><input id="sf-name" value="${isEdit ? escapeHtml(s.name||'') : ''}" class="w-full px-3 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800" /></div>
        <div class="grid grid-cols-2 gap-3">
          <div><label class="text-xs text-gray-500 block">Contact</label><input id="sf-contact" value="${isEdit ? escapeHtml(s.contact||'') : ''}" class="w-full px-3 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800" /></div>
          <div><label class="text-xs text-gray-500 block">Email</label><input id="sf-email" value="${isEdit ? escapeHtml(s.email||'') : ''}" class="w-full px-3 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800" /></div>
        </div>
        <div><label class="text-xs text-gray-500 block">Category</label><input id="sf-category" value="${isEdit ? escapeHtml(s.category||'') : ''}" class="w-full px-3 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800" /></div>
        <div><label class="text-xs text-gray-500 block">Address</label><input id="sf-address" value="${isEdit ? escapeHtml(s.address||'') : ''}" class="w-full px-3 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800" /></div>
        <div class="flex gap-2 pt-2">
          <button onclick="saveSup(${isEdit ? id : 'null'})" class="flex-1 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="inline-block mr-1 -mt-0.5"><polyline points="20 6 9 17 4 12"/></svg>${isEdit ? 'Update' : 'Save'}</button>
          <button onclick="closeModal()" class="px-4 py-2 bg-gray-200 dark:bg-gray-700 rounded-lg"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="inline-block mr-1 -mt-0.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>Cancel</button>
        </div>
      </div>
    </div>`);
}

export async function saveSup(id) {
  const nmEl = document.getElementById('sf-name');
  const emEl = document.getElementById('sf-email');
  const ctEl = document.getElementById('sf-contact');
  const cgEl = document.getElementById('sf-category');
  const adEl = document.getElementById('sf-address');
  if (!nmEl || !emEl || !ctEl || !cgEl || !adEl) { toast('Form not ready', 'error'); return; }
  const name = nmEl.value.trim();
  const email = emEl.value.trim();
  if (requireFields([
    { el: nmEl, msg: 'Please fill out this field' },
    { el: emEl, test: () => !email || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email), msg: 'Invalid email format' }
  ])) return;
  const obj = {
    name, contact: ctEl.value.trim(),
    email,
    category: cgEl.value.trim(),
    address: adEl.value.trim()
  };
  if (id) { const existing = await dbGet('suppliers', id); if (existing) obj.createdAt = existing.createdAt; obj.id = id; await dbPut('suppliers', obj); toast('Supplier updated'); }
  else { obj.createdAt = now(); await dbAdd('suppliers', obj); toast('Supplier added'); }
  closeModal();
  state.suppliers = await dbAll('suppliers');
  renderSupTable();
}

export async function deleteSup(id) {
  if (!await confirmModal('Delete this supplier?')) return;
  await dbDel('suppliers', id);
  state.suppliers = await dbAll('suppliers');
  renderSupTable();
  toast('Supplier deleted');
}


// expose top-level bindings as globals (inline onclick handlers and legacy code paths rely on them)
Object.defineProperties(window, {
  viewSuppliers: { get: () => viewSuppliers, configurable: true },
  debouncedRenderSupTable: { get: () => debouncedRenderSupTable, configurable: true },
  renderSupTable: { get: () => renderSupTable, configurable: true },
  openSupplierModal: { get: () => openSupplierModal, configurable: true },
  saveSup: { get: () => saveSup, configurable: true },
  deleteSup: { get: () => deleteSup, configurable: true }
});
