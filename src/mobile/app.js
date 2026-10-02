// ---------- init ----------
async function startApp() {
  await loadAll();
  if (!getToken()) return; // session expired mid-boot; pair screen already shown
  applyRoleGating();
  applyBrand();
  const ls = document.getElementById('loading-screen');
  if (ls) ls.classList.add('hidden');
  showView('home');
  connectWS();
  setInterval(() => { /* keep WS alive */ }, 25000);
  watchPinActivity(); armAutoLock();
  setupNativeBack();
  checkMobileUpdate(false);
  uploadDiagnostics(false);
}
// Android back button: peel UI layers instead of killing the app.
function setupNativeBack() {
  try {
    const App = nativePlugin('App');
    if (!App || typeof App.addListener !== 'function') return;
    App.addListener('backButton', () => {
      try {
        const sc = document.getElementById('scan-overlay');
        if (sc && sc.style.display !== 'none') { stopBarcodeScan(); return; }
        if (document.getElementById('pin-lock')) return; // locked stays locked
        if (navModalOpen) { closeNavModal(); return; }
        const mr = document.getElementById('modal-root');
        if (mr && mr.firstChild) { closeQuick(); return; }
        if (typeof App.minimizeApp === 'function') App.minimizeApp();
      } catch (e) {}
    });
  } catch (e) {}
}
(async () => {
  try {
    const proto = window.location.protocol;
    const host = window.location.hostname;
    // No service worker inside the native shell (custom scheme) or on plain
    // http — the app still works, it just always loads fresh from the shop.
    if ('serviceWorker' in navigator && !isNativeApp() && (proto === 'https:' || host === 'localhost')) {
      navigator.serviceWorker.register('/mobile-sw.js').catch(() => {});
    }
  } catch (e) { /* PWA upgrade path unavailable on plain http - app still works */ }
  applyDisplayPrefs();
  applyStaticLang();
  setupPullRefresh();
  setupDiagHook();
  if (!getToken()) { renderPairScreen(); return; }
  loadQueue();
  window.addEventListener('online', () => { if (offlineQueue.length) flushQueue(); });
  if (pinHashGet() && !pinSessionOk()) { renderPinLock(true); return; }
  await startApp();
})();
