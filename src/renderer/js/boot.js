import { applyPermissions } from './auth.js'
import { cfCart, cfRenderCart } from './clients.js'
import { dbAdd, dbAll, dbPut, openDB } from './database.js'
import { escapeHtml, hashPassword, initConnIndicator, modal, playSound, startClock, toast } from './helpers.js'
import { AppParticles } from './particles.js'
import { emailBackupFlow, fileBackupFlow } from './reports.js'
import { loadAll, navigate } from './router.js'
import { state, today } from './state.js'
import { renderTMCart, txCart, updateTMTotals } from './transactions.js'

function _formatBytes(n) {
  const v = Number(n) || 0;
  if (v <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(v) / Math.log(1024)), units.length - 1);
  return (v / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1) + ' ' + units[i];
}

export function showUpdateProgress(msg = 'Starting download…') {
  modal(`
    <div class="p-6 w-[360px] max-w-full">
      <div class="flex justify-between items-center mb-3"><h3 class="text-xl font-bold">Downloading Update</h3></div>
      <div class="flex items-center gap-3 mb-3">
        <svg class="animate-spin text-blue-600 shrink-0" width="22" height="22" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3" opacity="0.25"/><path d="M22 12a10 10 0 0 1-10 10" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>
        <span id="update-progress-text" class="text-sm text-gray-600 dark:text-gray-300">${escapeHtml(msg)}</span>
      </div>
      <div class="h-2.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
        <div id="update-progress-bar" class="h-full bg-gradient-to-r from-blue-600 to-indigo-600 transition-all duration-300" style="width:0%"></div>
      </div>
      <p id="update-progress-meta" class="text-xs text-gray-400 mt-2 min-h-[1em]"></p>
      <div class="flex justify-end mt-3"><button onclick="closeModal()" class="px-3 py-1.5 text-xs border dark:border-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">Hide</button></div>
    </div>`);
}

window.__app = window.__app || {};
if (window.electronAPI) {
  window.__app.getDBDump = async () => {
    const stores = ['clients','transactions','payments','inventory','quickItems','settings','users','expenses','suppliers','purchaseOrders','supplierPayments','notifications','auditLogs'];
    const results = await Promise.all(stores.map(s => dbAll(s).catch(() => [])));
    const dump = {};
    stores.forEach((s, i) => {
      if (s === 'users') dump[s] = results[i].map(u => { const { password, ...rest } = u; return rest; });
      else dump[s] = results[i];
    });
    return dump;
  };
  window.electronAPI.onShortcut((action) => {
    if (action === 'new-sale') navigate('transactions');
    else if (action === 'new-payment') navigate('payments');
    else if (action === 'file-backup') { if (typeof fileBackupFlow === 'function') fileBackupFlow(); }
    else if (action === 'email-backup') { if (typeof emailBackupFlow === 'function') emailBackupFlow(); }
  });
  window.electronAPI.onUpdateAvailable((info) => {
    if (document.getElementById('app').classList.contains('hidden')) return;
    const remindTs = localStorage.getItem('updateRemindLater');
    if (remindTs && Date.now() < parseInt(remindTs)) return;
    const version = info.version || info.name || 'new version';
    modal(`
      <div class="p-6">
        <div class="flex justify-between items-center mb-4"><h3 class="text-xl font-bold">Update Available</h3><button onclick="closeModal()" class="text-gray-400 hover:text-gray-600"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button></div>
        <p class="text-gray-600 dark:text-gray-300 mb-4">Version <strong>${version}</strong> is ready to download.</p>
        <div class="flex gap-2">
          <button onclick="localStorage.removeItem('updateRemindLater');window.electronAPI.downloadUpdate();closeModal();showUpdateProgress()" class="flex-1 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="inline-block mr-1 -mt-0.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>Download Update</button>
          <button onclick="localStorage.setItem('updateRemindLater',Date.now()+86400000);closeModal()" class="px-4 py-2 bg-gray-200 dark:bg-gray-700 rounded-lg">Later (24h)</button>
        </div>
      </div>`);
  });
  window.electronAPI.onUpdateNotAvailable(() => {
    toast('You are up to date', 'success');
  });
  window.electronAPI.onUpdateError((message) => {
    toast('Update check failed: ' + message, 'warning');
  });
  window.electronAPI.onUpdateDownloaded((info) => {
    const version = info.version || info.name || 'new version';
    modal(`
      <div class="p-6">
        <div class="flex justify-between items-center mb-4"><h3 class="text-xl font-bold">Update Ready</h3><button onclick="closeModal()" class="text-gray-400 hover:text-gray-600"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button></div>
        <p class="text-gray-600 dark:text-gray-300 mb-4">Version <strong>${version}</strong> downloaded. Restart to apply?</p>
        <div class="flex gap-2">
          <button onclick="window.electronAPI.installUpdate()" class="flex-1 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-semibold"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="inline-block mr-1 -mt-0.5"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>Restart Now</button>
          <button onclick="closeModal()" class="px-4 py-2 bg-gray-200 dark:bg-gray-700 rounded-lg">Later (24h)</button>
        </div>
      </div>`);
  });
  window.electronAPI.onUpdateProgress((info) => {
    const bar = document.getElementById('update-progress-bar');
    const text = document.getElementById('update-progress-text');
    const meta = document.getElementById('update-progress-meta');
    if (!bar && !text && !meta) return;
    const pct = Math.min(100, Math.max(0, Number(info.percent) || 0));
    if (bar) bar.style.width = pct + '%';
    if (text) text.textContent = `Downloading… ${Math.round(pct)}%`;
    const speed = _formatBytes(info.bytesPerSecond) + '/s';
    const transferred = _formatBytes(info.transferred);
    const total = info.total ? _formatBytes(info.total) : '';
    if (meta) meta.textContent = total ? `${transferred} of ${total} · ${speed}` : `${transferred} · ${speed}`;
  });
  window.electronAPI.onLanUpdateSignal((info) => {
    modal(`
      <div class="p-6">
        <div class="flex justify-between items-center mb-4"><h3 class="text-xl font-bold">LAN Update Signal</h3><button onclick="closeModal()" class="text-gray-400 hover:text-gray-600"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button></div>
        <p class="text-gray-600 dark:text-gray-300 mb-4">Update signaled by <strong>${escapeHtml(info.from)}</strong>${info.version ? ' (v'+escapeHtml(info.version)+')' : ''}. Check for updates now?</p>
        <div class="flex gap-2">
          <button onclick="localStorage.removeItem('updateRemindLater');window.electronAPI.downloadUpdate();closeModal();showUpdateProgress()" class="flex-1 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="inline-block mr-1 -mt-0.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>Download Update</button>
          <button onclick="closeModal()" class="px-4 py-2 bg-gray-200 dark:bg-gray-700 rounded-lg">Later</button>
        </div>
      </div>`);
  });
  window.electronAPI.onConfirmExit(() => {
    playSound('alert');
    modal(`<div class="p-6"><h3 class="text-lg font-bold mb-3">Exit Shop Ledger PH?</h3><div class="flex gap-2 justify-end"><button onclick="closeModal()" class="px-4 py-2 border dark:border-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">No</button><button onclick="window.electronAPI.exitConfirmed();closeModal()" class="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-semibold">Yes</button></div></div>`);
  });
  window.electronAPI.onLanDataRefresh(async (info) => {
    if (document.querySelector('.fixed.inset-0')) return;
    try {
      const route = state.currentRoute;
      await loadAll();
      if (route !== 'settings') navigate(route);
      toast('Data refreshed from ' + (info?.source === 'mobile' ? 'mobile' : 'LAN'), 'info');
    } catch (e) { /* ignore */ }
  });
  window.electronAPI.onHiddenToTray(() => {
    toast('Hidden to tray — LAN/mobile server still running', 'info');
  });
}

export async function seedIfEmpty() {
  const [users, clients, inventory, quickItems, settings] = await Promise.all([
    dbAll('users'), dbAll('clients'), dbAll('inventory'), dbAll('quickItems'), dbAll('settings')
  ]);
  if (users.length === 0) {
    await dbAdd('users', { username: 'admin', password: await hashPassword('admin123'), name: 'Administrator', role: 'admin' });
  }
  if (settings.length === 0) {
    await dbAdd('settings', { key: 'shopName', value: 'My Sari-Sari Store' });
    await dbAdd('settings', { key: 'shopContact', value: '' });
    await dbAdd('settings', { key: 'shopAddress', value: 'Philippines' });
  }
}

export async function updateVersionBadge() {
  let version = ((state.settings || []).find(s => s.key === 'lastBuildVersion') || {}).value || '';
  if (window.electronAPI?.getAppVersion) {
    try {
      const v = await window.electronAPI.getAppVersion();
      if (v) version = v;
    } catch (e) { /* keep fallback */ }
  }
  if (!version) version = '3.4.27';
  const text = 'v' + version;
  for (const id of ['sidebar-version', 'login-version', 'app-version-label']) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  }
}

export async function showMobileAccess() {
  if (!window.electronAPI?.generateMobileQR) { toast('Mobile access only available in the desktop app', 'warning'); return; }
  try {
    const info = await window.electronAPI.generateMobileQR();
    const ts = info.tailscale || null;
    modal(`
      <div class="p-6">
        <div class="flex justify-between items-center mb-4"><h3 class="text-xl font-bold">Mobile Access</h3><button onclick="closeModal()" class="text-gray-400 hover:text-gray-600"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button></div>
        <p class="text-sm text-gray-500 mb-3">Scan the QR with your phone camera. <strong>Network QR</strong> works on the same Wi-Fi — <strong>Anywhere QR</strong> works from any network (Tailscale).</p>
        <div class="flex justify-center mb-1"><img src="${info.qr}" alt="Network QR code" class="w-56 h-56 rounded-lg border dark:border-gray-700 bg-white p-2" /></div>
        <p class="text-xs text-center text-gray-400 mb-3">📶 Network QR — same Wi-Fi only</p>
        <div class="flex gap-2 mb-2">
          <input id="mobile-url" readonly value="${escapeHtml(info.url)}" onclick="this.select()" class="flex-1 px-3 py-2 border dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800 text-sm font-mono" />
          <button onclick="copyMobileUrl('mobile-url')" class="px-3 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 shrink-0"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="inline-block mr-1 -mt-0.5"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>Copy</button>
        </div>
        ${ts ? `
        <div class="my-4 border-t dark:border-gray-700"></div>
        <div class="flex justify-center mb-1"><img src="${ts.qr}" alt="Anywhere QR code" class="w-56 h-56 rounded-lg border dark:border-gray-700 bg-white p-2" /></div>
        <p class="text-xs text-center text-gray-400 mb-3">🌐 Anywhere QR — works on mobile data or any Wi-Fi (Tailscale)</p>
        <div class="flex gap-2 mb-2">
          <input id="mobile-url-ts" readonly value="${escapeHtml(ts.url)}" onclick="this.select()" class="flex-1 px-3 py-2 border dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800 text-sm font-mono" />
          <button onclick="copyMobileUrl('mobile-url-ts')" class="px-3 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 shrink-0"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="inline-block mr-1 -mt-0.5"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>Copy</button>
        </div>` : ''}
        <div class="text-xs text-gray-400 space-y-1">
          <p>• Open the page on your phone to view clients and log payments.</p>
          <p>• Keep this app running — it hosts the mobile page on port 3456.</p>
          <p>• New phones: install Tailscale (free) and sign in to this account to use the Anywhere QR.</p>
          <p>• If the address is ever rejected, reopen this window and rescan to get the current code.</p>
        </div>
      </div>`);
  } catch (err) {
    toast('Mobile access failed: ' + err.message, 'error');
  }
}

export async function copyMobileUrl(id) {
  const el = document.getElementById(id || 'mobile-url');
  if (!el) return;
  try {
    await navigator.clipboard.writeText(el.value);
    toast('URL copied');
  } catch (e) {
    el.select();
    document.execCommand('copy');
    toast('URL copied');
  }
}

export async function checkForNewBuild() {
  try {
    const res = await fetch('version.json?' + Date.now());
    if (!res.ok) return;
    const ver = await res.json();
    const existing = state.settings.find(s => s.key === 'lastBuildVersion');
    const currentVer = existing ? existing.value : '';
    if (ver.version && ver.version !== currentVer) {
      if (currentVer) {
        const notes = ver.notes ? ' — ' + ver.notes : '';
        setTimeout(() => {
          toast(`📦 New build v${ver.version} available${notes}. Go to Settings → Rebuild & Restart .exe`, 'info');
        }, 2000);
      }
      if (existing) { existing.value = ver.version; await dbPut('settings', existing); }
      else { await dbAdd('settings', { key: 'lastBuildVersion', value: ver.version }); }
    }
    updateVersionBadge();
  } catch (e) { /* offline or no version.json */ }
}

export async function boot() {
  try {
    await openDB();
    await seedIfEmpty();
    await loadAll();
    const ls = document.getElementById('loading-screen');
    if (ls) { ls.classList.add('fade-out'); await new Promise(r => setTimeout(r, 300)); ls.classList.add('hidden'); }
    const savedUser = sessionStorage.getItem('shopUser');
    if (savedUser) {
      try { state.user = JSON.parse(savedUser); } catch (e) { sessionStorage.removeItem('shopUser'); }
      document.getElementById('login-screen').classList.add('hidden');
      document.getElementById('app').classList.remove('hidden');
      document.getElementById('user-info').textContent = `${state.user.name} (${state.user.role})`;
      startClock();
      applyPermissions();
    }
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark') document.documentElement.classList.add('dark');
    navigate(state.currentRoute);
    await updateVersionBadge();
    checkForNewBuild();
    initConnIndicator();
  } catch (e) {
    console.error('Boot error:', e);
    const ls = document.getElementById('loading-screen');
    if (ls) { ls.classList.add('fade-out'); setTimeout(() => ls.classList.add('hidden'), 300); }
    document.getElementById('login-screen')?.classList.remove('hidden');
    const errEl = document.getElementById('login-error');
    if (errEl) { errEl.textContent = 'Boot error: ' + e.message; errEl.classList.remove('hidden'); }
  }
}

document.addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.shiftKey && e.key === 'B') {
    const tmCart = document.getElementById('tm-cart');
    if (tmCart && tmCart.offsetParent !== null) {
      e.preventDefault();
      txCart.push({date:today(),description:'',name:'1',unitCost:0,intRate:0,invId:null});
      renderTMCart();
      updateTMTotals();
      return;
    }
    const cfCartEl = document.getElementById('cf-cart');
    if (cfCartEl && cfCartEl.offsetParent !== null) {
      e.preventDefault();
      cfCart.push({date:today(),description:'',name:'1',unitCost:0,intRate:0,invId:null});
      cfRenderCart();
    }
  }
});

document.addEventListener('click', (e) => {
  const panel = document.getElementById('notif-panel');
  const container = document.getElementById('notif-container');
  if (panel && !panel.classList.contains('hidden') && container && !container.contains(e.target)) {
    panel.classList.add('hidden');
  }
});
export let _loginParticleRAF = null;
export function initLoginParticles() {
  try {
    let canvas = document.getElementById('login-canvas');
    if (!canvas) { canvas = document.createElement('canvas'); canvas.id = 'login-canvas'; }
    const ls = document.getElementById('login-screen');
    if (!ls) return;
    canvas.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;z-index:0;pointer-events:none;display:block';
    if (!canvas.parentNode) ls.insertBefore(canvas, ls.firstChild);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const W = window.innerWidth, H = window.innerHeight;
    canvas.width = W; canvas.height = H;
    const pts = [];
    let mx = W / 2, my = H / 2;
    for (let i = 0; i < 60; i++) pts.push({ x: Math.random() * W, y: Math.random() * H, vx: (Math.random() - 0.5) * 0.3, vy: (Math.random() - 0.5) * 0.3 });
    document.addEventListener('mousemove', (e) => { mx = e.clientX; my = e.clientY; });
    function frame() {
      const visible = !document.getElementById('login-screen').classList.contains('hidden');
      if (visible) {
        ctx.clearRect(0, 0, W, H);
        for (const p of pts) {
          const dx = mx - p.x, dy = my - p.y, dt = Math.sqrt(dx * dx + dy * dy);
          if (dt < 250) { p.vx += (dx / (dt || 1)) * 0.05; p.vy += (dy / (dt || 1)) * 0.05; }
          for (const other of pts) {
            if (other === p) continue;
            const rdx = p.x - other.x, rdy = p.y - other.y, rdist = Math.sqrt(rdx * rdx + rdy * rdy);
            if (rdist < 40 && rdist > 1) { p.vx += (rdx / rdist) * 0.03; p.vy += (rdy / rdist) * 0.03; }
          }
          p.vx += (Math.random() - 0.5) * 0.08; p.vy += (Math.random() - 0.5) * 0.08;
          const sp = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
          if (sp > 1.2) { p.vx = (p.vx / sp) * 1.2; p.vy = (p.vy / sp) * 1.2; }
          p.x += p.vx; p.y += p.vy;
          if (p.x < 0) p.x = W; if (p.x > W) p.x = 0;
          if (p.y < 0) p.y = H; if (p.y > H) p.y = 0;
          ctx.beginPath(); ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fill();
        }
        for (let i = 0; i < pts.length; i++) {
          for (let j = i + 1; j < pts.length; j++) {
            const dx = pts[i].x - pts[j].x, dy = pts[i].y - pts[j].y, d = Math.sqrt(dx * dx + dy * dy);
            if (d < 180) {
              ctx.beginPath(); ctx.moveTo(pts[i].x, pts[i].y); ctx.lineTo(pts[j].x, pts[j].y);
              ctx.strokeStyle = `rgba(255,255,255,${(1 - d / 180) * 0.25})`; ctx.lineWidth = 0.5; ctx.stroke();
            }
          }
          const cdx = mx - pts[i].x, cdy = my - pts[i].y, cd = Math.sqrt(cdx * cdx + cdy * cdy);
          if (cd < 250 && cd > 5) {
            ctx.beginPath(); ctx.moveTo(pts[i].x, pts[i].y); ctx.lineTo(mx, my);
            ctx.strokeStyle = `rgba(255,255,255,${(1 - cd / 250) * 0.5})`; ctx.lineWidth = 1; ctx.stroke();
          }
        }
        _loginParticleRAF = requestAnimationFrame(frame);
      } else {
        _loginParticleRAF = null;
      }
    }
    _loginParticleRAF = requestAnimationFrame(frame);
    window.resumeLoginParticles = function() {
      if (!_loginParticleRAF) _loginParticleRAF = requestAnimationFrame(frame);
    };
  } catch (e) { console.error('Login particle error:', e); }
}

document.addEventListener('DOMContentLoaded', () => {
  boot();
  initLoginParticles();
  if (typeof AppParticles !== 'undefined') AppParticles.init();
});


// expose top-level bindings as globals (inline onclick handlers and legacy code paths rely on them)
Object.defineProperties(window, {
  seedIfEmpty: { get: () => seedIfEmpty, configurable: true },
  updateVersionBadge: { get: () => updateVersionBadge, configurable: true },
  showMobileAccess: { get: () => showMobileAccess, configurable: true },
  copyMobileUrl: { get: () => copyMobileUrl, configurable: true },
  checkForNewBuild: { get: () => checkForNewBuild, configurable: true },
  showUpdateProgress: { get: () => showUpdateProgress, configurable: true },
  boot: { get: () => boot, configurable: true },
  _loginParticleRAF: { get: () => _loginParticleRAF, set: (v) => { _loginParticleRAF = v; }, configurable: true },
  initLoginParticles: { get: () => initLoginParticles, configurable: true }
});
