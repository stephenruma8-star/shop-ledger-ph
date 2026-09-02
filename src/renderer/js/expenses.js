import { logAudit } from './auth.js'
import { dbAdd, dbAll, dbDel, dbGet, dbPut } from './database.js'
import { closeModal, confirmModal, dbLoad, debounce, escapeHtml, filterByYear, modal, paginate, renderPagination, searchData, toast } from './helpers.js'
import { fmtDate, now, peso, round2, state, today } from './state.js'

export async function viewExpenses(root) {
  await dbLoad('expenses');
  root.innerHTML = `
    <div class="space-y-4 fade-in">
      <div class="flex gap-2 flex-wrap items-center">
        <input id="expSearch" placeholder="Search expenses..." class="flex-1 min-w-[200px] px-4 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800" oninput="debouncedRenderExpTable()" />
        <input id="expDateFrom" type="date" class="px-3 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm" onchange="debouncedRenderExpTable()" />
        <span class="text-gray-400 text-sm">—</span>
        <input id="expDateTo" type="date" class="px-3 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm" onchange="debouncedRenderExpTable()" />
        <button onclick="openExpenseModal()" title="F6 / Ctrl+E" class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="inline-block mr-1 -mt-0.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>New Expense</button>
      </div>
      <div class="bg-white dark:bg-gray-800 rounded-xl shadow-sm overflow-hidden glass-card">
        <div class="overflow-auto table-scroll" id="expTable"></div>
      </div>
    </div>`;
  renderExpTable();
}

export function renderExpTable() {
  const q = document.getElementById('expSearch')?.value || '';
  const df = document.getElementById('expDateFrom')?.value || '';
  const dt = document.getElementById('expDateTo')?.value || '';
  let filtered = filterByYear(searchData(state.expenses, q, ['category','description','payee']), 'date');
  if (df) filtered = filtered.filter(e => (e.date || '').replace(/-/g,'') >= df.replace(/-/g,''));
  if (dt) filtered = filtered.filter(e => (e.date || '').replace(/-/g,'') <= dt.replace(/-/g,''));
  const sorted = [...filtered].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const total = sorted.reduce((s, e) => s + (e.amount || 0), 0);
  const { items, page, totalPages } = paginate(sorted, 'exp');
  const container = document.getElementById('expTable');
  if (!container) return;
  if (sorted.length === 0) { container.innerHTML = '<div class="p-6 text-center text-gray-400">No expenses recorded</div>'; return; }
  container.innerHTML = `<div class="p-3 bg-gray-50 dark:bg-gray-700 text-sm font-medium flex justify-between"><span>Total Expenses: ${sorted.length} entries</span><span class="text-red-600 font-bold">${peso(total)}</span></div>
    <table class="w-full text-sm"><thead><tr class="bg-gray-50 dark:bg-gray-700 text-left"><th class="p-3">Date</th><th class="p-3">Category</th><th class="p-3">Description</th><th class="p-3">Payee</th><th class="p-3 text-right">Amount</th><th class="p-3 text-center">Actions</th></tr></thead>
    <tbody>${items.map(e => `<tr class="border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50">
      <td class="p-3 text-gray-500">${fmtDate(e.date)}</td><td class="p-3">${escapeHtml(e.category || '-')}</td><td class="p-3">${escapeHtml(e.description || '')}</td>
      <td class="p-3">${escapeHtml(e.payee || '-')}</td><td class="p-3 text-right font-bold text-red-600">${peso(e.amount)}</td>
      <td class="p-3 text-center"><button onclick="openExpenseModal(${e.id})" class="text-blue-600 hover:text-blue-800 text-xs mr-2"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="inline-block mr-1 -mt-0.5"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>Edit</button><button onclick="deleteExpense(${e.id})" class="text-red-600 hover:text-red-800 text-xs"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="inline-block mr-1 -mt-0.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>Del</button></td>
    </tr>`).join('')}</tbody></table>${renderPagination('exp', page, totalPages)}`;
}
export let debouncedRenderExpTable = debounce(renderExpTable, 250);

export function openExpenseModal(id) {
  const isEdit = !!id;
  const e = isEdit ? state.expenses.find(x => x.id === id) : null;
  const categories = ['Purchases','Utilities','Rent','Supplies','Transportation','Salaries','Marketing','Maintenance','Food','Other'];
  modal(`
    <div class="p-6">
      <div class="flex justify-between items-center mb-4"><h3 class="text-xl font-bold">${isEdit ? 'Edit' : 'New'} Expense</h3><button onclick="closeModal()" class="text-gray-400 hover:text-gray-600"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button></div>
      <div class="space-y-3">
        <div class="grid grid-cols-2 gap-3">
          <div><label class="text-xs text-gray-500 block">Date</label><input id="ef-date" type="date" value="${isEdit ? (e.date||today()) : today()}" class="w-full px-3 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800" /></div>
          <div><label class="text-xs text-gray-500 block">Category</label><select id="ef-category" class="w-full px-3 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800">${categories.map(c => `<option ${isEdit && e.category === c ? 'selected' : ''}>${c}</option>`).join('')}</select></div>
        </div>
        <div><label class="text-xs text-gray-500 block">Description</label><input id="ef-desc" value="${isEdit ? escapeHtml(e.description||'') : ''}" class="w-full px-3 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800" /></div>
        <div class="grid grid-cols-2 gap-3">
          <div><label class="text-xs text-gray-500 block">Amount *</label><input id="ef-amount" type="number" step="0.01" value="${isEdit ? (e.amount||0) : ''}" class="w-full px-3 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800" /></div>
          <div><label class="text-xs text-gray-500 block">Payee</label><input id="ef-payee" value="${isEdit ? escapeHtml(e.payee||'') : ''}" class="w-full px-3 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800" /></div>
        </div>
        <div class="flex gap-2 pt-2">
          <button onclick="saveExpense(${isEdit ? id : 'null'})" class="flex-1 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="inline-block mr-1 -mt-0.5"><polyline points="20 6 9 17 4 12"/></svg>${isEdit ? 'Update' : 'Save'}</button>
          <button onclick="closeModal()" class="px-4 py-2 bg-gray-200 dark:bg-gray-700 rounded-lg"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="inline-block mr-1 -mt-0.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>Cancel</button>
        </div>
      </div>
    </div>`);
}

export async function saveExpense(id) {
  const amtEl = document.getElementById('ef-amount');
  const dateEl = document.getElementById('ef-date');
  const catEl = document.getElementById('ef-category');
  const descEl = document.getElementById('ef-desc');
  const payeeEl = document.getElementById('ef-payee');
  if (!amtEl || !dateEl || !catEl || !descEl || !payeeEl) { toast('Form element missing', 'error'); return; }
  const amount = round2(parseFloat(amtEl.value));
  if (requireFields([{ el: amtEl, test: () => amount > 0, msg: 'Valid amount required' }])) return;
  const obj = {
    date: dateEl.value || today(), category: catEl.value,
    description: descEl.value.trim(),
    amount, payee: payeeEl.value.trim()
  };
  if (id) { const existing = await dbGet('expenses', id); if (existing) obj.createdAt = existing.createdAt; obj.id = id; await dbPut('expenses', obj); await logAudit('expense-edit', `${obj.category}: ${peso(obj.amount)} - ${obj.description || ''}`.trim()); toast('Expense updated'); }
  else { obj.createdAt = now(); await dbAdd('expenses', obj); await logAudit('expense-add', `${obj.category}: ${peso(obj.amount)} - ${obj.description || ''}`.trim()); toast('Expense recorded ✓'); }
  closeModal();
  state.expenses = await dbAll('expenses');
  renderExpTable();
}

export async function deleteExpense(id) {
  if (!await confirmModal('Delete this expense?')) return;
  await dbDel('expenses', id);
  state.expenses = await dbAll('expenses');
  renderExpTable();
  await logAudit('expense-delete', `Deleted expense #${id}`);
  toast('Expense deleted');
}


// expose top-level bindings as globals (inline onclick handlers and legacy code paths rely on them)
Object.defineProperties(window, {
  viewExpenses: { get: () => viewExpenses, configurable: true },
  renderExpTable: { get: () => renderExpTable, configurable: true },
  debouncedRenderExpTable: { get: () => debouncedRenderExpTable, configurable: true },
  openExpenseModal: { get: () => openExpenseModal, configurable: true },
  saveExpense: { get: () => saveExpense, configurable: true },
  deleteExpense: { get: () => deleteExpense, configurable: true }
});
