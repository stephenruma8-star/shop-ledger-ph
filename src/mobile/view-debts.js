// ---------- DEBTS (utang overview + SMS reminders) ----------
async function renderDebts() {
  const v = document.getElementById('view');
  if (!data.clients.length) { v.innerHTML = skeleton(T('common.loading')); await loadAll(); }
  const today = new Date().toISOString().split('T')[0];
  const debtors = (data.clients || [])
    .filter(c => (c.balance || 0) > 0)
    .map(c => {
      let overdueDays = 0;
      if (c.dueDate && c.dueDate < today) {
        overdueDays = Math.floor((new Date(today + 'T00:00:00') - new Date(c.dueDate + 'T00:00:00')) / 86400000);
      }
      return { ...c, overdueDays };
    })
    .sort((a, b) => (b.balance || 0) - (a.balance || 0));
  const total = debtors.reduce((s, c) => s + (c.balance || 0), 0);
  const owner = phoneRole() !== 'cashier';
  v.innerHTML = `
    <div class="flex items-center justify-between gap-2 mb-3 fade-in">
      <h2 class="card-title text-base">${T('view.debts.title')}</h2>
      ${owner ? `<button onclick="sendSmsReminders()" class="btn btn-ghost btn-sm shrink-0">📱 ${T('debts.sms')}</button>` : ''}
    </div>
    <div class="stat-card rounded-2xl p-3.5 text-center mb-3 fade-in">
      <div class="text-[11px] font-semibold uppercase tracking-wider text-gray-500 mb-1">${T('debts.total')}</div>
      <div class="text-xl font-bold text-orange-400 num">${peso(total)}</div>
      <div class="text-[11px] text-gray-500 mt-1">${T('debts.count', { n: debtors.length })}</div>
    </div>
    <div class="grid gap-2.5 fade-in">
      ${debtors.map(c => `
      <div class="glass-card rounded-2xl p-3 row card-hover" onclick='openClientDetail(${JSON.stringify(c.id)})' style="cursor:pointer">
        <span class="w-10 h-10 rounded-full bg-orange-600/20 text-orange-300 border border-orange-500/30 font-bold text-sm flex items-center justify-center shrink-0">${esc(((c.name || '?').trim().charAt(0) || '?').toUpperCase())}</span>
        <div class="flex-1 min-w-0">
          <div class="font-semibold text-sm text-gray-200 truncate">${esc(c.name)}</div>
          <div class="text-[11px] ${c.overdueDays > 0 ? 'text-red-400 font-semibold' : 'text-gray-500'}">${c.overdueDays > 0 ? T('debts.overdue', { n: c.overdueDays }) : (c.dueDate ? T('debts.due', { d: c.dueDate }) : '')}</div>
        </div>
        <div class="font-bold text-sm text-orange-400 num shrink-0">${peso(c.balance)}</div>
      </div>`).join('') || `<p class="text-sm text-gray-500 text-center py-6">${T('debts.empty')}</p>`}
    </div>`;
}
async function sendSmsReminders() {
  if (!takeSubmitLock('sms')) return;
  toast(T('debts.sending'), 'info');
  try {
    const r = await apiPost('/api/sms-reminders', {});
    feelOk();
    toast(T('debts.sent', { n: (r && r.sent) || 0 }), 'ok');
  } catch (e) { feelErr(); toast(T('debts.failed', { msg: e.message }), 'err'); }
  finally { releaseSubmitLock('sms'); }
}
