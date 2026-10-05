// ---------- STANDALONE BOOT ----------
// No pairing, no WebSocket, no update checks: open the local database and
// go. PIN lock still guards the front door. Concatenated last.
async function startStandalone() {
  try {
    await initStore(makeCapacitorDriver());
  } catch (e) {
    try { diagPush('store-init', String((e && e.message) || e)); } catch (_) {}
    toast('Database failed to open: ' + ((e && e.message) || e), 'err');
    const ls = document.getElementById('loading-screen');
    if (ls) ls.classList.add('hidden');
    return;
  }
  await loadAll();
  applyRoleGating();
  applyBrand();
  wirePrinter();
  const ls = document.getElementById('loading-screen');
  if (ls) ls.classList.add('hidden');
  showView('home');
  watchPinActivity(); armAutoLock();
  setupNativeBack();
  try {
    const b = document.getElementById('offline-banner');
    if (b) b.style.display = 'none';
  } catch (e) {}
}
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
// Thermal printer: first-party ShopPrinter bridge (raw TCP to the Wi-Fi
// printer IP in Settings). Absent without it: share-text fallback stays.
function wirePrinter() {
  try {
    const P = nativePlugin('ShopPrinter');
    if (!P || typeof P.send !== 'function') return;
    setPrinterFn(async (lines, host, port) => {
      if (!host) return { success: false, error: 'Set the Thermal Printer IP in Settings first' };
      try {
        await P.send({ host, port: parseInt(port, 10) || 9100, data: escposBytes(lines) });
        return { success: true };
      } catch (e) { return { success: false, error: (e && e.message) || 'Print failed' }; }
    });
  } catch (e) {}
}
// pin.js calls startApp() after a boot-time unlock: same entry point.
function startApp() { return startStandalone(); }
(async () => {
  try {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations().catch(() => []);
      regs.forEach(r => { try { r.unregister(); } catch (e) {} });
    }
  } catch (e) {}
  applyDisplayPrefs();
  applyStaticLang();
  setupPullRefresh();
  setupDiagHook();
  if (pinHashGet() && !pinSessionOk()) { renderPinLock(true); return; }
  await startStandalone();
})();
