async function viewExpenses(root) {
  await dbLoad('expenses');
  root.innerHTML = `
    <div class="space-y-4 fade-in">
      <div class="flex gap-2 flex-wrap items-center">
        <input id="expSearch" placeholder="Search expenses..." class="flex-1 min-w-[200px] px-4 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800" oninput="debouncedRenderExpTable()" />
        <button onclick="openExpenseModal()" class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">+ New Expense</button>
      </div>
      <div class="bg-white dark:bg-gray-800 rounded-xl shadow-sm overflow-hidden glass-card">
        <div class="overflow-auto" id="expTable"></div>
      </div>
    </div>`;
  renderExpTable();
}

function renderExpTable() {
  const q = document.getElementById('expSearch')?.value || '';
  const filtered = searchData(state.expenses, q, ['category','description','payee']);
  const sorted = [...filtered].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const total = sorted.reduce((s, e) => s + (e.amount || 0), 0);
  const container = document.getElementById('expTable');
  if (!container) return;
  if (sorted.length === 0) { container.innerHTML = '<div class="p-6 text-center text-gray-400">No expenses recorded</div>'; return; }
  container.innerHTML = `<div class="p-3 bg-gray-50 dark:bg-gray-700 text-sm font-medium flex justify-between"><span>Total Expenses: ${sorted.length} entries</span><span class="text-red-600 font-bold">${peso(total)}</span></div>
    <table class="w-full text-sm"><thead><tr class="bg-gray-50 dark:bg-gray-700 text-left"><th class="p-3">Date</th><th class="p-3">Category</th><th class="p-3">Description</th><th class="p-3">Payee</th><th class="p-3 text-right">Amount</th><th class="p-3 text-center">Actions</th></tr></thead>
    <tbody>${sorted.slice(0, 100).map(e => `<tr class="border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50">
      <td class="p-3 text-gray-500">${fmtDate(e.date)}</td><td class="p-3">${escapeHtml(e.category || '-')}</td><td class="p-3">${escapeHtml(e.description || '')}</td>
      <td class="p-3">${escapeHtml(e.payee || '-')}</td><td class="p-3 text-right font-bold text-red-600">${peso(e.amount)}</td>
      <td class="p-3 text-center"><button onclick="openExpenseModal(${e.id})" class="text-blue-600 hover:text-blue-800 text-xs mr-2">Edit</button><button onclick="deleteExpense(${e.id})" class="text-red-600 hover:text-red-800 text-xs">Del</button></td>
    </tr>`).join('')}</tbody></table>`;
}
var debouncedRenderExpTable = debounce(renderExpTable, 250);

function openExpenseModal(id) {
  const isEdit = !!id;
  const e = isEdit ? state.expenses.find(x => x.id === id) : null;
  const categories = ['Utilities','Rent','Supplies','Transportation','Salaries','Marketing','Maintenance','Food','Other'];
  modal(`
    <div class="p-6">
      <div class="flex justify-between items-center mb-4"><h3 class="text-xl font-bold">${isEdit ? 'Edit' : 'New'} Expense</h3><button onclick="closeModal()" class="text-gray-400 text-2xl">&times;</button></div>
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
          <button onclick="saveExpense(${isEdit ? id : 'null'})" class="flex-1 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">${isEdit ? 'Update' : 'Save'}</button>
          <button onclick="closeModal()" class="px-4 py-2 bg-gray-200 dark:bg-gray-700 rounded-lg">Cancel</button>
        </div>
      </div>
    </div>`);
}

async function saveExpense(id) {
  const amount = parseFloat(document.getElementById('ef-amount').value);
  if (!amount || amount <= 0) { toast('Valid amount required', 'error'); return; }
  const obj = {
    date: document.getElementById('ef-date').value || today(),
    category: document.getElementById('ef-category').value,
    description: document.getElementById('ef-desc').value.trim(),
    amount, payee: document.getElementById('ef-payee').value.trim()
  };
  if (id) { const existing = await dbGet('expenses', id); if (existing) obj.createdAt = existing.createdAt; obj.id = id; await dbPut('expenses', obj); toast('Expense updated'); }
  else { obj.createdAt = now(); await dbAdd('expenses', obj); toast('Expense recorded'); }
  closeModal();
  state.expenses = await dbAll('expenses');
  renderExpTable();
}

async function deleteExpense(id) {
  if (!await confirmModal('Delete this expense?')) return;
  await dbDel('expenses', id);
  state.expenses = await dbAll('expenses');
  renderExpTable();
  toast('Expense deleted');
}
