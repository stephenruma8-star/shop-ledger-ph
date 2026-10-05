// ---------- STANDALONE CORE ----------
// Local-first replacements for the network/session layer. Same function
// names and response shapes as the LAN client, so every shared view works
// unchanged. No imports/exports: concatenated. Requires store.js first.
const IS_STANDALONE = true;
const STANDALONE_VERSION = '4.0.0';
function isNativeApp() {
  try { return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()); } catch (e) { return false; }
}
function nativePlugin(name) {
  try { return (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins[name]) || null; } catch (e) { return null; }
}
const API = '';
const HDR = () => ({});
const peso = (n) => '₱' + (Number(n) || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
function esc(s) { const d = document.createElement('div'); d.textContent = s == null ? '' : s; return d.innerHTML; }
function fmtDate(d) {
  if (!d) return '';
  const dt = new Date(d);
  if (isNaN(dt)) return d;
  return dt.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
}
let data = { stats: null, clients: [], inventory: [], transactions: [], expenses: [], suppliers: [], purchaseOrders: [], reports: null, settings: {}, quickItems: [] };
let cart = [];
let currentView = 'home';
let navModalOpen = false;
let qStepQty = 1;
let poItems = [];
let refreshBusy = false;
// Standalone: one owner, always signed in. No pairing, no tokens.
function getToken() { return 'local'; }
function getClaim() { return ''; }
function phoneRole() { return 'owner'; }
// Local API: same paths, same shapes, zero network.
async function apiGet(path) {
  try {
    return await localApi('GET', path);
  } catch (e) {
    throw new Error((e && e.json && e.json.error) || (e && e.message) || ('HTTP ' + (e && e.status)));
  }
}
async function apiPostRaw(path, body, method) {
  let j;
  try {
    j = await localApi(method || 'POST', path, body);
  } catch (e) {
    throw new Error((e && e.json && e.json.error) || (e && e.message) || ('HTTP ' + (e && e.status)));
  }
  if (!j || j.success === false) throw new Error((j && j.error) || 'Request failed');
  return j;
}
async function apiPost(path, body, method) { return apiPostRaw(path, body, method); }
let itemImages = {};
async function loadItemImages() {
  try {
    const missing = (data.inventory || []).map(i => i.id).filter(id => id !== undefined && id !== null && !(id in itemImages));
    if (!missing.length) return;
    for (let k = 0; k < missing.length; k += 100) {
      const chunk = missing.slice(k, k + 100);
      const m = await apiGet('/api/inventory/images?ids=' + chunk.map(id => encodeURIComponent(id)).join(',')).catch(() => null);
      if (m) for (const id of Object.keys(m)) itemImages[id] = m[id] || null;
      chunk.forEach(id => { if (!(id in itemImages)) itemImages[id] = null; });
    }
  } catch (e) {}
}
function itemImage(item) {
  try {
    if (!item) return '';
    if (item.image) return item.image;
    return itemImages[item.id] || '';
  } catch (e) { return ''; }
}
function applyRoleGating() {
  try {
    document.querySelectorAll('[data-nav="reports"], [data-nav="expenses"], [data-nav="suppliers"], [data-nav="purchase-orders"]').forEach(el => {
      el.style.display = '';
    });
  } catch (e) {}
}
function applyBrand() {
  try {
    const el = document.getElementById('brand-name');
    if (el) el.textContent = (data.settings && data.settings.shopName) || 'Shop Ledger PH';
  } catch (e) {}
}
function toast(msg, type) {
  const root = document.getElementById('toast-root');
  if (!root) return;
  const el = document.createElement('div');  el.className = (type === 'err' ? 'bg-red-600' : type === 'ok' ? 'bg-green-600' : 'bg-blue-600') + ' text-white text-sm px-4 py-3 rounded-xl shadow-xl border border-white/10 slide-in text-center';
  el.textContent = msg;
  root.appendChild(el);
  setTimeout(() => { el.style.transition = 'opacity .3s'; el.style.opacity = '0'; setTimeout(() => { try { el.remove(); } catch (e) {} }, 300); }, 2600);
}
let audioCtx = null;
function buzz(pattern) {
  try {
    const H = nativePlugin('Haptics');
    if (H && typeof H.vibrate === 'function') {
      H.vibrate({ duration: Array.isArray(pattern) ? pattern[0] : (pattern || 15) }).catch(() => {});
      return;
    }
    if (navigator.vibrate) navigator.vibrate(pattern);
  } catch (e) {}
}
function beep(freq, dur, delay) {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    audioCtx = audioCtx || new AC();
    if (audioCtx.state === 'suspended') { try { audioCtx.resume().catch(() => {}); } catch (e) {} }
    const t = audioCtx.currentTime + (delay || 0);
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.type = 'sine'; o.frequency.value = freq || 880;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.22, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + (dur || 0.12));
    o.connect(g); g.connect(audioCtx.destination);
    o.start(t); o.stop(t + (dur || 0.12) + 0.05);
  } catch (e) {}
}
function feelAdd() { buzz(12); beep(660, 0.08); }
function feelOk() { buzz(15); beep(880, 0.1); }
function feelSale() { buzz([20, 40, 20]); beep(660, 0.1); beep(990, 0.16, 0.12); }
function feelErr() { buzz([45, 45, 45]); beep(220, 0.18); }
// Diagnostics stay on the phone (nothing to upload to). Same cap/hook.
const DIAG_KEY = 'slpDiag';
const DIAG_MAX = 50;
function diagPush(kind, message) {
  try {
    const list = JSON.parse(localStorage.getItem(DIAG_KEY) || '[]');
    if (!Array.isArray(list)) return;
    list.push({ at: new Date().toISOString(), kind: String(kind || 'error').slice(0, 20), message: String(message || '').slice(0, 500) });
    while (list.length > DIAG_MAX) list.shift();
    localStorage.setItem(DIAG_KEY, JSON.stringify(list));
  } catch (e) {}
}
function diagTake() {
  try {
    const list = JSON.parse(localStorage.getItem(DIAG_KEY) || '[]');
    localStorage.setItem(DIAG_KEY, '[]');
    return Array.isArray(list) ? list : [];
  } catch (e) { return []; }
}
function setupDiagHook() {
  try {
    window.addEventListener('error', (e) => {
      diagPush('js-error', ((e && e.message) || 'error') + ' @ ' + ((e && e.filename) || '') + ':' + ((e && e.lineno) || ''));
    });
    window.addEventListener('unhandledrejection', (e) => {
      const r = e && e.reason;
      diagPush('unhandled-rejection', (r && (r.stack || r.message)) || String(r));
    });
  } catch (e) {}
}
async function uploadDiagnostics(manual) {
  const entries = diagTake();
  if (!entries.length) { if (manual) toast(T('diag.empty'), 'info'); return 0; }
  // Standalone keeps the log on-device: mark reviewed, report the count.
  try { localStorage.setItem('slpDiagSent', new Date().toISOString()); } catch (e) {}
  if (manual) toast(T('diag.sent', { n: entries.length }), 'ok');
  updateDiagRow();
  return entries.length;
}
async function updateDiagRow() {
  const box = document.getElementById('diag-row');
  if (!box) return;
  let pending = 0, sent = '';
  try {
    const list = JSON.parse(localStorage.getItem(DIAG_KEY) || '[]');
    if (Array.isArray(list)) pending = list.length;
    sent = localStorage.getItem('slpDiagSent') || '';
  } catch (e) {}
  box.innerHTML = `
    <p class="text-[11px] text-gray-500 mb-2">${T('diag.desc')}</p>
    <p class="text-[11px] text-gray-500 mb-2">${pending ? T('diag.pending', { n: pending }) : T('diag.empty_short')}${sent ? ' · ' + T('diag.last', { at: String(sent).slice(0, 10) }) : ''}</p>
    <button onclick="uploadDiagnostics(true)" class="w-full py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-500">${T('diag.send')}</button>`;
}
function buildStatementText(client, sales, payments) {
  client = client || {};
  const L = [];
  L.push(T('cli.stmt_title'));
  L.push(client.name || '');
  if (client.phone) L.push(client.phone);
  if (client.address) L.push(client.address);
  L.push('--------------------------------');
  (sales || []).forEach(t => {
    L.push(`${t.date || ''}  ${t.invoiceNo || ''}  ${peso(t.grandTotal)} (${t.status || ''})`);
  });
  (payments || []).forEach(p => {
    L.push(`${p.date || ''}  ${T('cli.stmt_pay')}  -${peso(p.amount)}${p.type ? ' (' + p.type + ')' : ''}`);
  });
  L.push('--------------------------------');
  L.push(T('cli.stmt_balance', { amt: peso(client.balance) }));
  return L.join('\n');
}
function buildReceiptText(t, shop) {
  t = t || {}; shop = shop || {};
  const L = [];
  L.push(shop.shopName || 'Shop Ledger PH');
  if (shop.shopAddress) L.push(shop.shopAddress);
  if (shop.shopContact) L.push(shop.shopContact);
  L.push('--------------------------------');
  L.push('Invoice: ' + (t.invoiceNo || 'N/A'));
  L.push('Date: ' + (t.createdAt || t.date || ''));
  if (t.clientName && t.clientName !== 'Walk-in') L.push('Client: ' + t.clientName);
  (t.items || []).forEach(it => {
    const q = parseFloat(it.qty) || 1;
    const p = it.unitCost || it.price || 0;
    L.push(`${it.description || it.name || 'Item'}  ${q} x ${peso(p)} = ${peso(q * p)}`);
  });
  L.push('--------------------------------');
  L.push('TOTAL: ' + peso(t.grandTotal) + ' (' + (t.paymentMethod || 'Cash') + ')');
  L.push(shop.receiptFooter || 'Thank you for your patronage!');
  return L.join('\n');
}
const submitLocks = {};
function takeSubmitLock(key) {
  try {
    if (submitLocks[key]) return false;
    submitLocks[key] = true;
    return true;
  } catch (e) { return true; }
}
function releaseSubmitLock(key) {
  try { submitLocks[key] = false; } catch (e) {}
}
async function shareText(title, text) {
  try {
    const S = nativePlugin('Share');
    if (S && typeof S.share === 'function') {
      await S.share({ title, text, dialogTitle: title });
      return true;
    }
  } catch (e) {}
  try {
    if (navigator.share) { await navigator.share({ title, text }); return true; }
  } catch (e) { if (e && e.name === 'AbortError') return true; }
  try {
    await navigator.clipboard.writeText(text);
    toast(T('share.copied'), 'ok');
    return true;
  } catch (e) {}
  toast(T('share.unavailable'), 'err');
  return false;
}
async function shareReceiptTxn(id) {
  let t = null;
  try { t = await apiGet('/api/transactions/' + encodeURIComponent(id)); }
  catch (e) { toast(T('txn.load_fail', { msg: e.message }), 'err'); return; }
  const text = buildReceiptText(t, (data.settings || {}));
  await shareText('Receipt ' + (t.invoiceNo || ''), text);
}
// Pull-to-refresh without the network guards (PIN + modal guards kept).
function setupPullRefresh() {
  let startY = null;
  try {
    window.addEventListener('touchstart', (e) => {
      try {
        if ((e.touches || []).length !== 1) { startY = null; return; }
        startY = e.touches[0].clientY;
      } catch (err) { startY = null; }
    }, { passive: true });
    window.addEventListener('touchmove', (e) => {
      try {
        if (startY === null || (e.touches || []).length !== 1) return;
        const dy = e.touches[0].clientY - startY;
        if (dy < 80) return;
        startY = null;
        if (pinHashGet() && !pinSessionOk()) return;
        if (navModalOpen || document.getElementById('pin-lock')) return;
        try {
          const sc = document.getElementById('scan-overlay');
          if (sc && sc.style.display !== 'none') return;
        } catch (err) {}
        const ae = document.activeElement;
        if (ae && /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName || '')) return;
        if ((window.scrollY || 0) > 0) return;
        if (refreshBusy) return;
        const cs = document.getElementById('conn-status');
        if (cs) cs.textContent = T('common.refreshing');
        refreshAll();
      } catch (err) {}
    }, { passive: true });
    window.addEventListener('touchend', () => { startY = null; }, { passive: true });
  } catch (e) {}
}
// ---------- local dataset ----------
function setConn(ok) {
  const el = document.getElementById('conn-status');
  if (el) el.textContent = ok ? T('conn.live') : T('conn.offline');
  const dot = document.getElementById('conn-dot');
  if (dot) { dot.className = 'w-1.5 h-1.5 rounded-full inline-block ' + (ok ? 'bg-green-400' : 'bg-red-500'); }
}
async function loadClients() {
  try { data.clients = await apiGet('/api/clients'); setConn(true); }
  catch (e) { setConn(false); }
}
async function loadAll() {
  try {
    const safeGet = (p, fallback) => apiGet(p).catch(() => fallback);
    const [stats, inventory, transactions, expenses, suppliers, purchaseOrders, reports, settings, alerts] = await Promise.all([
      apiGet('/api/stats'), apiGet('/api/inventory'), apiGet('/api/transactions?limit=100'),
      safeGet('/api/expenses', []), safeGet('/api/suppliers', []), safeGet('/api/purchase-orders', []),
      safeGet('/api/reports', null), safeGet('/api/settings', {}), safeGet('/api/alerts', { out: [], low: [], outCount: 0, lowCount: 0 })
    ]);
    const quickItems = await safeGet('/api/quick-items', []);
    data.stats = stats; data.inventory = inventory; data.transactions = transactions;
    data.expenses = expenses; data.suppliers = suppliers; data.purchaseOrders = purchaseOrders;
    data.reports = reports; data.settings = settings; data.alerts = alerts;
    data.quickItems = Array.isArray(quickItems) ? quickItems : [];
    await loadItemImages();
    await loadClients();
    setConn(true);
    return true;
  } catch (e) { setConn(false); return false; }
}
async function refreshAll() {
  if (refreshBusy) return;
  refreshBusy = true;
  try {
    const ok = await loadAll();
    if (ok && currentView && typeof showView === 'function') showView(currentView);
    applyBrand();
  } finally { refreshBusy = false; }
}
function syncNow() { toast(T('conn.live'), 'ok'); }
// Dead-path guard: desktop-only flows reference the pair screen, but the
// standalone app is always signed in (getToken() === 'local'), so this is
// unreachable. Defined anyway so nothing can throw a ReferenceError.
function renderPairScreen() { setConn(true); }
function popEl(el) {
  if (!el) return;
  el.classList.remove('badge-pop'); void el.offsetWidth; el.classList.add('badge-pop');
}
function updateCartUI() {
  const c = cart.reduce((s, i) => s + i.qty, 0);
  const btn = document.getElementById('cart-count');
  if (btn) { if (btn.textContent !== String(c)) { btn.textContent = c; popEl(btn); } }
  const badge = document.getElementById('cart-badge');
  if (badge) {
    const was = badge.textContent;
    badge.textContent = c;
    badge.classList.toggle('hidden', c === 0); badge.classList.toggle('flex', c > 0);
    if (c > 0 && was !== String(c)) popEl(badge);
  }
  if (currentView === 'sale' && navModalOpen) updateNavMeta('sale');
}
// Settings substitutes (no desktop to check for updates, no PWA install).
async function bundledAppVersion() { return 'standalone-' + STANDALONE_VERSION; }
function updateInstallRow() {
  try {
    const hint = document.getElementById('install-hint');
    if (hint) hint.textContent = 'Standalone v' + STANDALONE_VERSION + ' — this phone holds its own ledger.';
    const btn = document.getElementById('install-app-btn');
    if (btn) btn.classList.add('hidden');
  } catch (e) {}
}
function installApp() { return false; }
function updateUpdateRow() {
  const box = document.getElementById('update-row');
  if (!box) return;
  box.innerHTML = `<p class="text-[11px] text-gray-500">Standalone v${STANDALONE_VERSION} — updates arrive as a new APK.</p>`;
}
