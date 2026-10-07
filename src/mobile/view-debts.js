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
      <h2 class="card-title text-base"><span class="icon-tile bg-orange-500/15 text-orange-400"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg></span>${T('view.debts.title')}</h2>
      <div class="flex gap-1.5 shrink-0">
      <button onclick="openDebtFormSetup()" class="btn btn-ghost btn-sm shrink-0"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="shrink-0"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>Form</button>      ${owner ? `<button onclick="sendSmsReminders()" class="btn btn-ghost btn-sm shrink-0"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="shrink-0"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>${T('debts.sms')}</button>` : ''}
      ${(typeof IS_STANDALONE !== 'undefined' && IS_STANDALONE) ? `<button onclick="applyInterestNow()" class="btn btn-ghost btn-sm shrink-0"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="shrink-0"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>Interest</button>` : ''}
      </div>
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
      </div>`).join('') || `<div class="text-center text-gray-500 py-10"><svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#15803d" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="mx-auto mb-2"><polyline points="20 6 9 17 4 12"/></svg><p class="text-sm">${T('debts.empty')}</p></div>`}
    </div>`;
}
async function sendSmsReminders() {  if (!takeSubmitLock('sms')) return;
  toast(T('debts.sending'), 'info');
  try {
    const r = await apiPost('/api/sms-reminders', {});
    feelOk();
    // Standalone: no SMS gateway on the phone — open one pre-filled text
    // per debtor (smsto: needs no permission, one tap each).
    if (r && Array.isArray(r.texts) && r.texts.length) {
      const list = r.texts.map((t, i) =>
        `<a href="smsto:${esc(t.phone)}?body=${encodeURIComponent(t.text)}" class="row py-2.5" style="text-decoration:none">
          <span class="flex-1 min-w-0"><span class="block font-semibold text-sm text-gray-200 truncate">${esc(t.name)}</span>
          <span class="block text-[11px] text-gray-500 truncate">${esc(t.phone)}</span></span>
          <span class="btn btn-ghost btn-sm shrink-0">📩 Text</span>
        </a>`).join('');
      document.getElementById('modal-root').innerHTML = `
        <div class="fixed inset-0 bg-black/70 z-[45] flex items-end sm:items-center justify-center fade-in" onclick="if(event.target===this)closeQuick()">
          <div class="w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-4 pb-6 slide-up glass-card" style="max-height:92dvh;overflow-y:auto" onclick="event.stopPropagation()">
            <div class="grabber mb-3" style="margin-bottom:.9rem"></div>
            <h3 class="font-bold text-gray-100 text-sm mb-1 flex items-center gap-2"><span class="icon-tile bg-orange-500/15 text-orange-400"><svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg></span>Reminders (${r.texts.length})</h3>
            <p class="text-[11px] text-gray-500 mb-2">Tap Text to open each message ready to send.</p>
            ${list}
            <button onclick="closeQuick()" class="btn btn-ghost w-full mt-3"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" class="shrink-0"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>Close</button>
          </div>
        </div>`;
    } else {
      toast(T('debts.sent', { n: (r && r.sent) || 0 }), 'ok');
    }
  } catch (e) { feelErr(); toast(T('debts.failed', { msg: e.message }), 'err'); }
  finally { releaseSubmitLock('sms'); }
}
// Standalone-only daily interest (same math as the desktop): accrues each
// debtor's own rate over the days since the last run. Same-day reruns apply
// nothing; first run only stamps the date.
async function applyInterestNow() {
  if (!takeSubmitLock('interest')) return;
  toast('Applying daily interest…', 'info');
  try {
    const r = await apiPost('/api/interest/apply', {});
    feelOk();
    if (r && r.applied > 0) toast('Interest applied to ' + r.applied + ' client(s) over ' + (r.days || 0) + ' day(s)', 'ok');
    else toast('Nothing to apply', 'ok');
    await refreshAll();
  } catch (e) { feelErr(); toast('Interest failed: ' + e.message, 'err'); }
  finally { releaseSubmitLock('interest'); }
}
