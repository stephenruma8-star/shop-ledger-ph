// ---------- WHAT'S NEW (desktop) ----------
// Release notes live in one shared file (src/shared/whats-new.json) so the
// phone and desktop never drift. Vite inlines the JSON at build time.
import { escapeHtml, modal } from './helpers.js';
import { getLang, t } from './i18n.js';
import releaseNotes from '../../shared/whats-new.json';

const APP = 'desktop';
const SEEN_KEY = 'slpWhatsNewSeenDesktop';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function entriesForApp() {
  return (Array.isArray(releaseNotes) ? releaseNotes : [])
    .filter(e => e && e.app === APP)
    .slice()
    .sort((a, b) => {
      const byDate = String(b.date || '').localeCompare(String(a.date || ''));
      return byDate || String(b.version || '').localeCompare(String(a.version || ''), undefined, { numeric: true });
    });
}

function formatDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
  if (!m) return String(iso || '');
  return MONTHS[(parseInt(m[2], 10) || 1) - 1] + ' ' + (parseInt(m[3], 10) || 1) + ', ' + m[1];
}

function textFor(value) {
  if (!value) return '';
  return value[getLang()] || value.en || '';
}

function changeLabel(type) {
  if (type === 'new') return t('wn-new');
  if (type === 'fixed') return t('wn-fixed');
  return t('wn-improved');
}

function changeClass(type) {
  if (type === 'new') return 'bg-green-500/15 text-green-400';
  if (type === 'fixed') return 'bg-amber-500/15 text-amber-400';
  return 'bg-blue-500/15 text-blue-400';
}

export function whatsNewEntries() { return entriesForApp(); }

export function whatsNewLatest() { return entriesForApp()[0] || null; }

export function whatsNewUnseen() {
  const latest = whatsNewLatest();
  if (!latest) return false;
  try { return localStorage.getItem(SEEN_KEY) !== latest.id; } catch (e) { return false; }
}

export function markWhatsNewSeen() {
  const latest = whatsNewLatest();
  if (!latest) return;
  try { localStorage.setItem(SEEN_KEY, latest.id); } catch (e) { /* storage unavailable */ }
}

export function updateWhatsNewBadge() {
  const dot = document.getElementById('whats-new-dot');
  if (!dot) return;
  dot.classList.toggle('hidden', !whatsNewUnseen());
}

export function openWhatsNew() {
  const entries = entriesForApp();
  const wasUnseen = whatsNewUnseen();
  markWhatsNewSeen();
  updateWhatsNewBadge();
  const rows = entries.map((entry, index) => {
    const isLatest = index === 0;
    const changes = (entry.changes || []).map(change => `
      <li class="flex items-start gap-2">
        <span class="shrink-0 mt-0.5 text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded ${changeClass(change.type)}">${escapeHtml(changeLabel(change.type))}</span>
        <span class="text-sm text-gray-700 dark:text-gray-300">${escapeHtml(textFor(change.text))}</span>
      </li>`).join('');
    return `
      <section class="border border-gray-200 dark:border-gray-700 rounded-xl p-4">
        <div class="flex items-center justify-between gap-2 mb-2">
          <div class="flex items-center gap-2 min-w-0">
            <span class="text-xs font-bold text-blue-600 dark:text-blue-400">v${escapeHtml(entry.version)}</span>
            ${isLatest && wasUnseen ? `<span class="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-green-500/15 text-green-400">${escapeHtml(t('wn-badge'))}</span>` : ''}
          </div>
          <span class="text-[11px] text-gray-400 shrink-0">${escapeHtml(formatDate(entry.date))}</span>
        </div>
        <h4 class="font-bold mb-2">${escapeHtml(textFor(entry.title))}</h4>
        <ul class="space-y-1.5">${changes}</ul>
      </section>`;
  }).join('');
  modal(`
    <div class="p-6">
      <div class="flex items-start justify-between gap-4 mb-4">
        <div class="min-w-0">
          <h3 class="text-xl font-bold flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-amber-400 shrink-0"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
            ${escapeHtml(t('whats-new'))}
          </h3>
          <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">${escapeHtml(t('wn-sub'))}</p>
        </div>
        <button onclick="closeModal()" aria-label="${escapeHtml(t('wn-close'))}" class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 shrink-0"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
      </div>
      <div class="space-y-3">${rows || `<p class="text-sm text-gray-500">${escapeHtml(t('wn-empty'))}</p>`}</div>
      <button onclick="closeModal()" class="w-full mt-4 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700">${escapeHtml(t('wn-close'))}</button>
    </div>`);
}

Object.defineProperties(window, {
  openWhatsNew: { get: () => openWhatsNew, configurable: true },
  whatsNewEntries: { get: () => whatsNewEntries, configurable: true },
  whatsNewLatest: { get: () => whatsNewLatest, configurable: true },
  whatsNewUnseen: { get: () => whatsNewUnseen, configurable: true },
  markWhatsNewSeen: { get: () => markWhatsNewSeen, configurable: true },
  updateWhatsNewBadge: { get: () => updateWhatsNewBadge, configurable: true }
});

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', updateWhatsNewBadge);
  else updateWhatsNewBadge();
}
