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
  checkStockNotify();
  maybeAutoUpdateCheck();
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
// First run: no PIN means no gate at all, so setup is mandatory before the
// ledger opens. There is no reset path (no server to revoke against) — the
// screen says so, and backups are the way back.
async function renderFirstRunPin() {
  try { const ls = document.getElementById('loading-screen'); if (ls) ls.classList.add('hidden'); } catch (e) {}
  document.body.insertAdjacentHTML('beforeend', `
    <div id="pin-lock" class="fixed inset-0 z-[60] flex items-center justify-center" style="background:linear-gradient(135deg,#0f172a,#1e3a5f 55%,#1d4ed8);padding:1rem">
      <div class="glass-card rounded-2xl p-6 w-full max-w-xs text-center fade-in">
        <div class="text-lg font-bold text-gray-100 mb-1">${T('lock.setup_title')}</div>
        <p class="text-xs text-gray-400 mb-3">${T('lock.setup_sub')}</p>
        <input id="pin-setup-new" inputmode="numeric" autocomplete="off" maxlength="8" placeholder="${T('set.pin_new_ph')}" class="w-full text-center text-2xl font-mono font-bold tracking-[0.3em] px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-gray-100 outline-none focus:border-blue-500 mb-2" />
        <input id="pin-setup-confirm" inputmode="numeric" autocomplete="off" maxlength="8" placeholder="${T('set.pin_confirm_ph')}" class="w-full text-center text-2xl font-mono font-bold tracking-[0.3em] px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-gray-100 outline-none focus:border-blue-500 mb-2" />
        <p id="pin-setup-error" class="hidden text-xs text-red-400 mb-2"></p>
        <button onclick="saveFirstRunPin()" class="w-full py-3 rounded-xl bg-blue-600 text-white font-semibold hover:bg-blue-500">${T('lock.setup_btn')}</button>
        <p class="text-[11px] text-amber-400/90 mt-3">${T('lock.setup_noreset')}</p>
      </div>
    </div>`);
}
async function saveFirstRunPin() {
  const errEl = document.getElementById('pin-setup-error');
  const fail = (msg) => { if (errEl) { errEl.textContent = msg; errEl.classList.remove('hidden'); } feelErr(); };
  const a = ((document.getElementById('pin-setup-new') || {}).value || '').replace(/\D/g, '');
  const b = ((document.getElementById('pin-setup-confirm') || {}).value || '').replace(/\D/g, '');
  if (a.length < 4) { fail(T('pin.need4')); return; }
  if (a !== b) { fail(T('pin.mismatch')); return; }
  const h = await sha256hex('slp-pin:' + a);
  if (!h) { fail(T('pin.save_fail')); return; }
  try { localStorage.setItem('slpPinHash', h); } catch (e) { fail(T('pin.save_fail')); return; }
  pinSessionSet(true);
  try { const ov = document.getElementById('pin-lock'); if (ov) ov.remove(); } catch (e) {}
  feelOk();
  toast(T('pin.on'), 'ok');
  await startStandalone();
}
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
  if (!pinHashGet()) { renderFirstRunPin(); return; }
  if (pinHashGet() && !pinSessionOk()) { renderPinLock(true); return; }
  await startStandalone();
})();
