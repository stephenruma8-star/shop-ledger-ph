// ---------- phone app updates ----------
// Sideloaded APKs have no auto-update: this checks the GitHub releases for a
// newer mobile APK (at most once a day, plus on demand from Settings) and
// hands the download to the system browser, which installs it like any
// sideloaded file. Silent unless an update is actually available.
const UPDATE_CHECK_KEY = 'slpUpdateCheck';
const UPDATE_CHECK_MS = 24 * 60 * 60 * 1000;
const RELEASES_URL = 'https://api.github.com/repos/stephenruma8-star/shop-ledger-ph/releases/latest';
function cmpAppVer(a, b) {
  const pa = String(a || '').split('.').map(x => parseInt(x, 10) || 0);
  const pb = String(b || '').split('.').map(x => parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) < (pb[i] || 0) ? -1 : 1;
  }
  return 0;
}
async function bundledAppVersion() {
  // Native build version first; else the synced snapshot stamp. Empty when
  // unknown (plain browser without a snapshot) — the check stays silent then.
  try {
    const App = nativePlugin('App');
    if (App && typeof App.getInfo === 'function') {
      const info = await App.getInfo();
      if (info && info.version) return String(info.version);
    }
  } catch (e) {}
  try {
    const r = await fetch('version.json', { cache: 'no-store' });
    if (r.ok) {
      const v = await r.json().catch(() => null);
      if (v && v.desktopVersion) return String(v.desktopVersion);
    }
  } catch (e) {}
  return '';
}
async function fetchLatestRelease() {
  try {
    const r = await fetchTimeout(RELEASES_URL, { headers: { Accept: 'application/vnd.github+json' } });
    if (!r.ok) return null;
    return await r.json().catch(() => null);
  } catch (e) { return null; }
}
function findApkAsset(rel) {
  const assets = (rel && rel.assets) || [];
  const hit = assets.find(a => /Shop-Ledger-Mobile-.*\.apk$/i.test(a.name || ''));
  return hit && hit.browser_download_url ? { name: hit.name, url: hit.browser_download_url } : null;
}
async function checkMobileUpdate(manual) {
  try {
    if (!manual) {
      let last = 0;
      try { last = Number(localStorage.getItem(UPDATE_CHECK_KEY) || 0); } catch (e) {}
      if (last && Date.now() - last < UPDATE_CHECK_MS) return 'throttled';
    }
    try { localStorage.setItem(UPDATE_CHECK_KEY, String(Date.now())); } catch (e) {}
    const cur = await bundledAppVersion();
    if (!cur) return 'unknown';
    const rel = await fetchLatestRelease();
    if (!rel) return 'unknown';
    const tag = String(rel.tag_name || '').replace(/^v/, '');
    const apk = findApkAsset(rel);
    if (!tag || !apk) return 'unknown';
    if (cmpAppVer(tag, cur) <= 0) return 'updated';
    renderUpdateSheet(tag, apk.url);
    return 'available';
  } catch (e) { return 'unknown'; }
}
async function checkMobileUpdateNow() {
  toast(T('upd.checking'), 'info');
  const r = await checkMobileUpdate(true);
  if (r === 'updated') toast(T('upd.uptodate'), 'ok');
  else if (r === 'unknown' || r === 'throttled') toast(T('upd.unknown'), 'err');
  // 'available' renders its own sheet.
}
let pendingUpdateUrl = '';
function renderUpdateSheet(tag, url) {
  // The URL rides in a variable, never in HTML: escaping download links
  // mangles their query strings.
  pendingUpdateUrl = url;
  document.getElementById('modal-root').innerHTML = `
    <div class="fixed inset-0 bg-black/70 z-[45] flex items-end sm:items-center justify-center fade-in" onclick="if(event.target===this)closeQuick()">
      <div class="w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-5 pb-6 slide-up glass-card text-center">
        <div class="text-4xl mb-2">⬆️</div>
        <div class="text-lg font-bold text-gray-100 mb-1">${T('upd.title')}</div>
        <p class="text-xs text-gray-400 mb-4">${T('upd.body', { tag })}</p>
        <button onclick="downloadPendingUpdate()" class="btn btn-primary btn-lg mb-2">${T('upd.download')}</button>
        <button onclick="closeQuick()" class="btn btn-ghost btn-lg">${T('upd.later')}</button>
      </div>
    </div>`;
  feelOk();
}
async function downloadPendingUpdate() {
  const u = pendingUpdateUrl;
  pendingUpdateUrl = '';
  await downloadMobileUpdate(u);
}
async function downloadMobileUpdate(url) {
  if (!url) return;
  try {
    const B = nativePlugin('Browser');
    if (B && typeof B.open === 'function') {
      await B.open({ url });
      closeQuick();
      toast(T('upd.downloading'), 'ok');
      return;
    }
  } catch (e) {}
  try { window.open(url, '_blank'); closeQuick(); } catch (e) { toast(T('upd.open_fail'), 'err'); }
}
async function updateUpdateRow() {
  const box = document.getElementById('update-row');
  if (!box) return;
  box.innerHTML = `<p class="text-[11px] text-gray-500">${T('set.checking')}</p>`;
  const cur = await bundledAppVersion();
  box.innerHTML = `
    <div class="text-[11px] text-gray-500 mb-2">${T('set.this_app')}<strong class="text-gray-300">${esc(cur || 'unknown')}</strong></div>
    <button onclick="checkMobileUpdateNow()" class="w-full py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-500">${T('set.check_updates')}</button>`;
}
