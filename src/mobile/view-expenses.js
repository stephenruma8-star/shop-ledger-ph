// ---------- EXPENSES ----------
const EXPENSE_CATS = ['Purchases','Utilities','Rent','Supplies','Transportation','Salaries','Marketing','Maintenance','Food','Other'];
async function renderExpenses() {
  const v = document.getElementById('view');
  if (!data.expenses.length) { v.innerHTML = skeleton(T('common.loading')); await loadAll(); }
  const month = (data.expenses || []).filter(e => (e.date || '').startsWith(new Date().toISOString().split('T')[0].slice(0, 7)));
  const monthTotal = month.reduce((s, e) => s + (e.amount || 0), 0);
  v.innerHTML = `
    <div class="flex items-center justify-between gap-2 mb-3 fade-in">
      <h2 class="card-title text-base"><span class="icon-tile bg-red-500/15 text-red-400"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg></span>${T('view.expenses.title')}</h2>
      <button onclick="addExpense()" class="btn btn-primary btn-sm"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>${T('exp.add')}</button>
    </div>
    <div class="grid grid-cols-2 gap-2.5 mb-3 fade-in">
      <div class="stat-card rounded-2xl p-3 text-center">
        <div class="text-[11px] font-semibold uppercase tracking-wider text-gray-500 mb-1">${T('exp.this_month')}</div>
        <div class="text-lg font-bold text-red-400 num">${peso(monthTotal)}</div>
      </div>
      <div class="stat-card rounded-2xl p-3 text-center">
        <div class="text-[11px] font-semibold uppercase tracking-wider text-gray-500 mb-1">${T('exp.total_recorded')}</div>
        <div class="text-lg font-bold text-gray-200 num">${data.expenses.length}</div>
      </div>
    </div>
    <div id="petty-row" class="mb-3"></div>
    <div class="relative mb-3 fade-in">
      <svg class="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
      <input id="exp-search" type="text" placeholder="${esc(T('exp.search_ph'))}" oninput="filterExpenses(this.value)" class="inp pl-10" />
    </div>
    <div class="grid gap-2.5 fade-in" id="exp-grid">${expenseListHTML(data.expenses)}</div>`;
  loadPettyRow();
}
function expenseListHTML(items) {
  const owner = phoneRole() !== 'cashier';
  return items.map(e => `
    <div class="glass-card rounded-2xl p-3 row card-hover">
      <span class="icon-tile bg-red-500/15 text-red-400 shrink-0"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg></span>
      <div class="flex-1 min-w-0">
        <div class="font-semibold text-sm text-gray-200 truncate">${esc(e.description || e.category || 'Expense')}</div>
        <div class="text-[11px] text-gray-500 truncate">${esc(e.category || '—')} · ${fmtDate(e.date)}${e.payee ? ' · ' + esc(e.payee) : ''}${e.queued ? ' · <span class="chip chip-amber" style="padding:.05rem .45rem;font-size:.65rem">⏳ ' + T('exp.pending') + '</span>' : ''}</div>
      </div>
      <div class="text-right shrink-0">
        <div class="font-bold text-sm text-red-400 num">${peso(e.amount)}</div>
        ${owner && e.id ? `<div class="flex gap-1 justify-end mt-1"><button onclick="renderExpenseEdit(${JSON.stringify(e.id)})" class="text-[11px] text-blue-400 px-1">✏️</button><button onclick="deleteExpense(${JSON.stringify(e.id)})" class="text-[11px] text-red-400 px-1">✕</button></div>` : ''}
      </div>
    </div>`).join('');
}
function filterExpenses(q) {
  q = (q || '').toLowerCase();
  const g = document.getElementById('exp-grid');
  if (g) g.innerHTML = expenseListHTML(data.expenses.filter(e => ((e.description || '') + ' ' + (e.category || '') + ' ' + (e.payee || '')).toLowerCase().includes(q)));
}
function addExpense() {
  document.getElementById('modal-root').innerHTML = `
    <div class="fixed inset-0 bg-black/70 z-[45] flex items-end sm:items-center justify-center fade-in" onclick="if(event.target===this)closeQuick()">
      <div class="w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-4 pb-6 slide-up" style="background:rgba(15,23,42,.97);border:1px solid rgba(255,255,255,.09);border-bottom:none;box-shadow:0 -12px 40px rgba(0,0,0,.5);max-height:92dvh;overflow-y:auto" onclick="event.stopPropagation()">
        <div class="grabber mb-3" style="margin-bottom:.9rem"></div>
        <div class="flex items-center justify-between mb-4">
          <div class="flex items-center gap-1.5">
            <span class="icon-tile bg-red-500/15 text-red-400"><svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg></span>
            <h3 class="font-bold text-gray-100 text-sm">${T('exp.add')}</h3>
          </div>
          <button onclick="closeQuick()" class="w-9 h-9 rounded-xl btn-ghost flex items-center justify-center text-gray-400"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
        </div>
        <div class="space-y-3">
          <div>
            <label class="text-[11px] font-semibold uppercase tracking-wider text-gray-500 block mb-1.5">${T('exp.desc')}</label>
            <input id="ex-desc" type="text" placeholder="${esc(T('exp.desc_ph'))}" class="inp" />
          </div>
          <div class="grid grid-cols-2 gap-2.5">
            <div>
              <label class="text-[11px] font-semibold uppercase tracking-wider text-gray-500 block mb-1.5">${T('exp.category')}</label>
              <select id="ex-category" class="inp">${EXPENSE_CATS.map(c => '<option' + (c === 'Purchases' ? ' selected' : '') + '>' + c + '</option>').join('')}</select>
            </div>
            <div>
              <label class="text-[11px] font-semibold uppercase tracking-wider text-gray-500 block mb-1.5">${T('exp.amount')}</label>
              <input id="ex-amount" type="number" min="0" step="0.01" placeholder="0.00" inputmode="decimal" class="inp" />
            </div>
            <div>
              <label class="text-[11px] font-semibold uppercase tracking-wider text-gray-500 block mb-1.5">${T('exp.date')}</label>
              <input id="ex-date" type="date" value="${new Date().toISOString().split('T')[0]}" class="inp" />
            </div>
            <div>
              <label class="text-[11px] font-semibold uppercase tracking-wider text-gray-500 block mb-1.5">${T('exp.payee')}</label>
              <input id="ex-payee" type="text" placeholder="${esc(T('exp.payee_ph'))}" class="inp" />
            </div>
          </div>
          <button onclick="submitExpense()" class="btn btn-primary btn-lg"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>${T('exp.save')}</button>
        </div>
      </div>
    </div>`;
}
async function submitExpense() {
  const description = (document.getElementById('ex-desc').value || '').trim();
  const amount = parseFloat(document.getElementById('ex-amount').value);
  const category = document.getElementById('ex-category').value;
  const date = document.getElementById('ex-date').value || new Date().toISOString().split('T')[0];
  const payee = (document.getElementById('ex-payee').value || '').trim();
  if (!amount || amount <= 0) return toast(T('exp.need_amount'), 'err');
  if (!takeSubmitLock('expense')) return;
  try {
    const r = await apiPost('/api/expenses', { description, amount, category, date, payee });
    closeQuick();
    if (r.queued) {
      data.expenses.push({ id: Date.now(), date, category, description, amount, payee, queued: true });
      if (currentView === 'expenses') renderExpenses();
      toast(T('exp.queued'), 'ok');
      return;
    }
    toast(T('exp.ok'), 'ok');
    await refreshAll();
  } catch (e) { toast(T('exp.failed', { msg: e.message }), 'err'); }
  finally { releaseSubmitLock('expense'); }
}
function renderExpenseEdit(id) {
  const e = (data.expenses || []).find(x => String(x.id) === String(id));
  if (!e) return;
  document.getElementById('modal-root').innerHTML = `
    <div class="fixed inset-0 bg-black/70 z-[45] flex items-end sm:items-center justify-center fade-in" onclick="if(event.target===this)closeQuick()">
      <div class="w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-4 pb-6 slide-up glass-card" onclick="event.stopPropagation()">
        <div class="grabber mb-3" style="margin-bottom:.9rem"></div>
        <h3 class="font-bold text-gray-100 text-sm mb-3">${T('exp.edit_title')}</h3>
        <div class="space-y-3">
          <div>
            <label class="text-[11px] font-semibold uppercase tracking-wider text-gray-500 block mb-1.5">${T('exp.desc')}</label>
            <input id="ee-desc" type="text" value="${esc(e.description || '')}" class="inp" />
          </div>
          <div>
            <label class="text-[11px] font-semibold uppercase tracking-wider text-gray-500 block mb-1.5">${T('exp.amount')}</label>
            <input id="ee-amount" type="number" min="0" step="0.01" value="${e.amount || ''}" class="inp" />
          </div>
          <button onclick="submitExpenseEdit(${JSON.stringify(id)})" class="btn btn-primary btn-lg">${T('exp.save')}</button>
        </div>
      </div>
    </div>`;
}
async function submitExpenseEdit(id) {
  const description = ((document.getElementById('ee-desc') || {}).value || '').trim();
  const amount = parseFloat((document.getElementById('ee-amount') || {}).value);
  if (!amount || amount <= 0) { toast(T('exp.need_amount'), 'err'); return; }
  if (!takeSubmitLock('expedit')) return;
  try {
    await apiPost('/api/expenses/' + encodeURIComponent(id), { description, amount }, 'PUT');
    closeQuick();
    toast(T('exp.updated'), 'ok');
    await refreshAll();
  } catch (e) { toast(T('exp.failed', { msg: e.message }), 'err'); }
  finally { releaseSubmitLock('expedit'); }
}
let expDelArmed = null;
async function deleteExpense(id) {
  if (expDelArmed !== id) {
    expDelArmed = id;
    toast(T('exp.delete_confirm'), 'info');
    setTimeout(() => { if (expDelArmed === id) expDelArmed = null; }, 5000);
    return;
  }
  expDelArmed = null;
  if (!takeSubmitLock('expdel')) return;
  try {
    await apiPost('/api/expenses/' + encodeURIComponent(id), {}, 'DELETE');
    toast(T('exp.deleted'), 'ok');
    await refreshAll();
  } catch (e) { toast(T('exp.failed', { msg: e.message }), 'err'); }
  finally { releaseSubmitLock('expdel'); }
}
// ---------- petty cash ----------
async function loadPettyRow() {
  const box = document.getElementById('petty-row');
  if (!box) return;
  let bal = null;
  try {
    const r = await apiGet('/api/petty-cash');
    if (r && typeof r.balance === 'number') bal = r.balance;
  } catch (e) {}
  if (bal === null) { box.innerHTML = ''; return; }
  box.innerHTML = `
    <div class="glass-card rounded-2xl p-3 fade-in flex items-center gap-3">
      <div class="flex-1 min-w-0">
        <div class="text-[11px] font-semibold uppercase tracking-wider text-gray-500">${T('petty.title')}</div>
        <div class="text-lg font-bold text-amber-400 num">${peso(bal)}</div>
      </div>
      <button onclick="pettySheet('add')" class="btn btn-ghost btn-sm">+ ${T('petty.add').split(' ')[0]}</button>
      <button onclick="pettySheet('withdraw')" class="btn btn-ghost btn-sm">−</button>
    </div>`;
}
function pettySheet(dir) {
  document.getElementById('modal-root').innerHTML = `
    <div class="fixed inset-0 bg-black/70 z-[45] flex items-end sm:items-center justify-center fade-in" onclick="if(event.target===this)closeQuick()">
      <div class="w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-4 pb-6 slide-up glass-card" onclick="event.stopPropagation()">
        <div class="grabber mb-3" style="margin-bottom:.9rem"></div>
        <h3 class="font-bold text-gray-100 text-sm mb-3">${T('petty.title')}</h3>
        <input id="petty-amount" type="number" min="0" step="0.01" placeholder="${esc(T('petty.amount_ph'))}" class="inp mb-3" />
        <button onclick="submitPettyMove('${dir}')" class="btn btn-primary btn-lg">${T('petty.go')}</button>
      </div>
    </div>`;
}
async function submitPettyMove(dir) {
  const amount = parseFloat((document.getElementById('petty-amount') || {}).value);
  if (!amount || amount <= 0) { toast(T('exp.need_amount'), 'err'); return; }
  if (!takeSubmitLock('petty')) return;
  try {
    const r = await apiPost('/api/petty-cash', { amount, dir });
    if (r && r.queued) toast(T('exp.queued'), 'ok');
    else { feelOk(); toast(T('petty.done'), 'ok'); }
    closeQuick();
    await refreshAll();
  } catch (e) { feelErr(); toast(T('petty.failed', { msg: e.message }), 'err'); }
  finally { releaseSubmitLock('petty'); }
}

