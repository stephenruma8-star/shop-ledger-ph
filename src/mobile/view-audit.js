// ---------- ACTIVITY LOG (owner phones only) ----------
let auditList = [];
async function renderAudit() {
  const v = document.getElementById('view');
  v.innerHTML = skeleton(T('common.loading'));
  auditList = [];
  try { auditList = await apiGet('/api/audit?limit=100'); } catch (e) { auditList = null; }
  if (!Array.isArray(auditList)) {
    v.innerHTML = `
    <div class="glass-card rounded-2xl p-6 mt-10 text-center fade-in">
      <div class="text-lg font-bold text-gray-100 mb-1">${T('aud.unavailable')}</div>
      <p class="text-xs text-gray-400">${T('aud.cashier')}</p>
    </div>`;
    return;
  }
  v.innerHTML = `
    <h2 class="card-title text-base mb-3 fade-in"><span class="icon-tile bg-violet-500/15 text-violet-400"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg></span>${T('view.audit.title')}</h2>
    <div class="relative mb-3 fade-in">
      <svg class="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
      <input id="audit-search" type="text" placeholder="${esc(T('aud.search_ph'))}" oninput="filterAudit(this.value)" autocomplete="off" class="inp pl-10" />
    </div>
    <div class="grid gap-2 fade-in" id="audit-list">${auditListHTML(auditList)}</div>`;
}
function auditActionColor(a) {
  a = String(a || '');
  if (/^sale|^payment|^po$|^supplier-payment|^print/.test(a)) return 'text-green-400';
  if (/failed|error|delete|void|revoke/.test(a)) return 'text-red-400';
  if (/stocktake|inventory|expense/.test(a)) return 'text-amber-400';
  return 'text-blue-400';
}
function auditTime(ts) {
  try {
    const d = new Date(ts);
    if (isNaN(d)) return String(ts || '');
    return d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' }) + ' ' +
      d.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' });
  } catch (e) { return String(ts || ''); }
}
function auditListHTML(items) {
  if (!items.length) return `<div class="text-center text-gray-500 py-10"><svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#475569" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="mx-auto mb-2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg><p class="text-sm">${T('aud.empty')}</p></div>`;
  return items.map(l => `
    <div class="glass-card rounded-xl px-3 py-2.5">
      <div class="flex items-center gap-2">
        <span class="text-[11px] font-bold ${auditActionColor(l.action)} shrink-0">${esc(l.action || 'event')}</span>
        <span class="text-[11px] text-gray-500 ml-auto shrink-0">${esc(auditTime(l.createdAt))}</span>
      </div>
      <div class="text-xs text-gray-300 mt-0.5 break-words">${esc(l.details || '')}</div>
    </div>`).join('');
}
function filterAudit(q) {
  q = (q || '').toLowerCase();
  const g = document.getElementById('audit-list');
  if (g) g.innerHTML = auditListHTML((auditList || []).filter(l => ((l.action || '') + ' ' + (l.details || '')).toLowerCase().includes(q)));
}
