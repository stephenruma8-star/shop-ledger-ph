// ---------- PWA install ----------
let deferredInstallPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  updateInstallRow();
});
async function installApp() {
  if (!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  try { await deferredInstallPrompt.userChoice; } catch (e) {}
  deferredInstallPrompt = null;
  updateInstallRow();
}
function updateInstallRow() {
  const b = document.getElementById('install-app-btn');
  const h = document.getElementById('install-hint');
  if (!b) return;
  if (isNativeApp()) {
    b.classList.add('hidden');
    if (h) h.textContent = T('set.install_native');
    return;
  }
  if (deferredInstallPrompt) {
    b.classList.remove('hidden');
    if (h) h.textContent = T('set.install_prompt');
  } else {
    b.classList.add('hidden');
    if (h) h.textContent = T('set.install_hint');
  }
}

