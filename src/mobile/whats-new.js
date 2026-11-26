// ---------- WHAT'S NEW (phone) ----------
// Release notes come from the shared src/shared/whats-new.json, injected as
// SHOP_WHATS_NEW by scripts/build-mobile.mjs and scripts/build-standalone.mjs.
// Opening the sheet marks the latest phone release as seen, clearing the
// header dot and the Settings badge.
const WHATS_NEW_SEEN_KEY = 'slpWhatsNewSeenMobile';
const WN_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function whatsNewEntries() {
  const all = (typeof SHOP_WHATS_NEW !== 'undefined' && Array.isArray(SHOP_WHATS_NEW)) ? SHOP_WHATS_NEW : [];
  return all
    .filter(e => e && e.app === 'mobile')
    .slice()
    .sort((a, b) => {
      const byDate = String(b.date || '').localeCompare(String(a.date || ''));
      return byDate || String(b.version || '').localeCompare(String(a.version || ''), undefined, { numeric: true });
    });
}
function whatsNewLatest() { return whatsNewEntries()[0] || null; }
function whatsNewUnseen() {
  const latest = whatsNewLatest();
  if (!latest) return false;
  try { return localStorage.getItem(WHATS_NEW_SEEN_KEY) !== latest.id; } catch (e) { return false; }
}
function markWhatsNewSeen() {
  const latest = whatsNewLatest();
  if (!latest) return;
  try { localStorage.setItem(WHATS_NEW_SEEN_KEY, latest.id); } catch (e) { /* storage unavailable */ }
}
function updateWhatsNewBadges() {
  const unseen = whatsNewUnseen();
  const dot = document.getElementById('wn-dot');
  if (dot) dot.classList.toggle('hidden', !unseen);
  const badge = document.getElementById('wn-settings-badge');
  if (badge) badge.classList.toggle('hidden', !unseen);
}
function wnDateLabel(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
  if (!m) return String(iso || '');
  return WN_MONTHS[(parseInt(m[2], 10) || 1) - 1] + ' ' + (parseInt(m[3], 10) || 1) + ', ' + m[1];
}
function wnTextFor(value, lang) {
  if (!value) return '';
  return value[lang] || value.en || '';
}
function wnChangeLabel(type) {
  if (type === 'new') return T('wn.new');
  if (type === 'fixed') return T('wn.fixed');
  return T('wn.improved');
}
function wnChangeClass(type) {
  if (type === 'new') return 'bg-green-500/15 text-green-400';
  if (type === 'fixed') return 'bg-amber-500/15 text-amber-400';
  return 'bg-blue-500/15 text-blue-400';
}
function openWhatsNew() {
  const entries = whatsNewEntries();
  const wasUnseen = whatsNewUnseen();
  const lang = phoneLang();
  const rows = entries.map((entry, index) => {
    const isLatest = index === 0;
    const changes = (entry.changes || []).map(change => `
      <li class="flex items-start gap-2">
        <span class="shrink-0 mt-0.5 text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded ${wnChangeClass(change.type)}">${esc(wnChangeLabel(change.type))}</span>
        <span class="text-xs leading-tight text-gray-400">${esc(wnTextFor(change.text, lang))}</span>
      </li>`).join('');
    return `
      <section class="rounded-xl p-3" style="border:1px solid rgba(148,163,184,.18)">
        <div class="flex items-center justify-between gap-2 mb-1">
          <div class="flex items-center gap-1.5 min-w-0">
            <span class="text-[11px] font-bold text-blue-400">v${esc(entry.version)}</span>
            ${isLatest && wasUnseen ? `<span class="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-green-500/15 text-green-400">${esc(T('wn.badge'))}</span>` : ''}
          </div>
          <span class="text-[10px] text-gray-500 shrink-0">${esc(wnDateLabel(entry.date))}</span>
        </div>
        <div class="text-sm font-semibold text-gray-200 mb-1.5">${esc(wnTextFor(entry.title, lang))}</div>
        <ul class="space-y-1.5">${changes}</ul>
      </section>`;
  }).join('');
  document.getElementById('modal-root').innerHTML = `
    <div class="fixed inset-0 bg-black/70 z-[45] flex items-end sm:items-center justify-center fade-in" onclick="if(event.target===this)closeQuick()">
      <div class="w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-4 pb-6 slide-up glass-card" style="max-height:94vh;max-height:94dvh;overflow-y:auto" onclick="event.stopPropagation()">
        <div class="grabber mb-3" style="margin-bottom:.9rem"></div>
        <div class="flex items-start justify-between gap-2 mb-3">
          <div class="min-w-0">
            <h3 class="font-bold text-gray-100 text-base flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-amber-400 shrink-0"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
              ${esc(T('wn.title'))}
            </h3>
            <p class="text-[11px] text-gray-500 mt-0.5">${esc(T('wn.sub'))}</p>
          </div>
          <button onclick="closeQuick()" aria-label="${escAttr(T('wn.close'))}" class="w-9 h-9 rounded-xl btn-ghost flex items-center justify-center text-gray-400 shrink-0"><svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
        </div>
        <div class="space-y-2">${rows || `<p class="text-sm text-gray-500 text-center py-6">${esc(T('wn.empty'))}</p>`}</div>
        <button onclick="closeQuick()" class="btn btn-primary btn-lg mt-3">${esc(T('wn.close'))}</button>
      </div>
    </div>`;
  markWhatsNewSeen();
  updateWhatsNewBadges();
  feelOk();
}
