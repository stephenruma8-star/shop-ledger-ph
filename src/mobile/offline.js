// ---------- offline write queue ----------
const QUEUE_KEY = 'slpOfflineQueue';
let offlineQueue = [];
function loadQueue() {
  try { offlineQueue = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]'); } catch (e) { offlineQueue = []; }
  if (!Array.isArray(offlineQueue)) offlineQueue = [];
  updateQueueUI();
}
function saveQueue() { try { localStorage.setItem(QUEUE_KEY, JSON.stringify(offlineQueue)); } catch (e) {} }
function updateQueueUI() {
  const b = document.getElementById('offline-banner');
  const c = document.getElementById('pending-count');
  if (!b || !c) return;
  const n = offlineQueue.length;
  c.textContent = String(n);
  // The banner lays out with flex (gap + centering only work as flex).
  b.classList.toggle('hidden', n === 0);
  b.classList.toggle('flex', n > 0);
}
function queueOp(path, body, method) {
  offlineQueue.push({ id: Date.now() + '-' + Math.random().toString(36).slice(2, 8), path, body, method: method || 'POST', at: new Date().toISOString() });
  saveQueue(); updateQueueUI();
}
let flushPromise = null;
async function flushQueue() {
  // Single-flight: concurrent triggers (WS + online event + manual sync)
  // share one run instead of interleaving replays.
  if (flushPromise) return flushPromise;
  flushPromise = (async () => {
    let synced = 0, failed = 0;
  while (offlineQueue.length) {
    const op = offlineQueue[0];
    try { await apiPostRaw(op.path, op.body, op.method); }
    catch (e) {
      // Still offline: keep everything, retry later. Rejected by the shop:
      // drop just that op (it can never succeed) so it stops blocking the rest.
      if (e && (e.name === 'TypeError' || e.name === 'AbortError')) break;
      diagPush('dropped-queue', (op.path || '') + ' ' + JSON.stringify(op.body || {}).slice(0, 200));
      offlineQueue.shift(); failed++;
      continue;
    }
    offlineQueue.shift(); synced++;
  }
  saveQueue(); updateQueueUI();
  if (synced) {
    toast(synced === 1 ? T('sync.synced_one') : T('sync.synced_many', { n: synced }), 'ok');
    refreshAll();
    if (offlineQueue.length) toast(T('sync.pending', { n: offlineQueue.length }), 'err');
  }
  if (failed) toast(T('sync.failed', { n: failed }), 'err');
  return synced;
  })().finally(() => { flushPromise = null; });
  return flushPromise;
}
async function syncNow() {
  let n = 0;
  try { n = await flushQueue(); } catch (e) {}
  if (!n) toast(T('sync.none'), 'err');
}

// Last dataset revision we hold. Survives reloads so a fresh boot with
// unchanged shop data still skips the heavy endpoints after one probe.
let cachedDataVersion = null;
try {
  const _cv = JSON.parse(localStorage.getItem('slpDataV') ?? 'null');
  if (typeof _cv === 'number') cachedDataVersion = _cv;
} catch (e) {}
async function loadAll() {
  try {
    const safeGet = (p, fallback) => apiGet(p).catch(() => fallback);
    const cashier = phoneRole() === 'cashier';
    // Refresh diet: one tiny version probe first. When the shop data hasn't
    // changed since our cached copy, skip all nine heavy endpoints.
    let serverV = null;
    try {
      const vv = await apiGet('/api/version');
      if (vv && typeof vv.v === 'number') serverV = vv.v;
    } catch (e) {}
    const hasData = !!((data.inventory && data.inventory.length) || (data.clients && data.clients.length));
    if (serverV !== null && hasData && serverV === cachedDataVersion) return true;
    const [stats, inventory, transactions, expenses, suppliers, purchaseOrders, reports, settings, alerts] = await Promise.all([
      cashier ? null : apiGet('/api/stats'), apiGet('/api/inventory'), apiGet('/api/transactions?limit=100'),
      safeGet('/api/expenses', []), safeGet('/api/suppliers', []), safeGet('/api/purchase-orders', []),
      safeGet('/api/reports', null), safeGet('/api/settings', {}), safeGet('/api/alerts', { out: [], low: [], outCount: 0, lowCount: 0 })
    ]);
    const quickItems = await safeGet('/api/quick-items', []);
    data.stats = stats; data.inventory = inventory; data.transactions = transactions;
    data.expenses = expenses; data.suppliers = suppliers; data.purchaseOrders = purchaseOrders;
    data.reports = reports; data.settings = settings; data.alerts = alerts;
    data.quickItems = Array.isArray(quickItems) ? quickItems : [];
    if (serverV !== null) {
      cachedDataVersion = serverV;
      try { localStorage.setItem('slpDataV', JSON.stringify(serverV)); } catch (e) {}
    }
    await loadItemImages();
    await loadClients();
    if (offlineQueue.length) flushQueue();
    return true;
  } catch (e) { setConn(false); return false; }
}
let lastClientsLoad = 0;
async function loadClients() {
  try { data.clients = await apiGet('/api/clients'); setConn(true); }
  catch (e) { setConn(false); }
}
function setConn(ok) {
  const el = document.getElementById('conn-status');
  if (el) el.textContent = ok ? T('conn.live') : T('conn.offline');
  const dot = document.getElementById('conn-dot');
  if (dot) { dot.className = 'w-1.5 h-1.5 rounded-full inline-block ' + (ok ? 'bg-green-400' : 'bg-red-500'); }
}

let ws = null; let wsAuthed = false;
let wsBackoffMs = 5000;
// Set when the shop rejects our token: retrying is pointless (and drains the
// battery) until a fresh pairing, which reloads the page and resets this.
let wsTokenDead = false;
// API may point at the shop computer while this page is bundled locally
// (native app) — derive the socket host from it, not from our own URL.
function serverLink() {
  try {
    const u = new URL(API);
    if (u.hostname) return { host: u.hostname, secure: u.protocol === 'https:' };
  } catch (e) {}
  return { host: window.location.hostname, secure: window.location.protocol === 'https:' };
}
function storedWsPort() {
  try { return localStorage.getItem('slpWsPort') || ''; } catch (e) { return ''; }
}
function wsRetryLater() {
  // Exponential backoff with jitter so a dead desktop doesn't keep every
  // phone hammering it: 5s → ~30s max. Reset on successful auth. Never
  // scheduled for a rejected token (fresh pairing reloads the page anyway).
  if (wsTokenDead) return;
  try {
    const jitter = Math.floor(Math.random() * 2000);
    setTimeout(connectWS, Math.min(wsBackoffMs, 30000) + jitter);
    wsBackoffMs = Math.min(Math.floor(wsBackoffMs * 1.5), 30000);
  } catch (e) {}
}
function connectWS() {
  const tok = getToken();
  if (!tok || wsTokenDead) return;
  const params = new URLSearchParams(window.location.search);
  const wsPort = params.get('ws') || storedWsPort() || '3458';
  const link = serverLink();
  const proto = link.secure ? 'wss' : 'ws';
  const url = proto + '://' + link.host + ':' + wsPort;
  try { ws = new WebSocket(url); } catch (e) { wsRetryLater(); return; }
  ws.onopen = () => { try { ws.send(JSON.stringify({ type: 'auth', token: getToken() })); } catch (e) {} };
  ws.onmessage = (ev) => {
    let msg; try { msg = JSON.parse(ev.data); } catch (e) { return; }
    if (msg.type === 'auth-ok') { wsAuthed = true; wsBackoffMs = 5000; setConn(true); if (offlineQueue.length) flushQueue(); }
    else if (msg.type === 'auth-error') { wsTokenDead = true; try { ws.close(); } catch (e) {} }
    else if (msg.type === 'update') refreshAll();
  };
  ws.onclose = () => { wsAuthed = false; wsRetryLater(); };
  ws.onerror = () => { try { ws.close(); } catch (e) {} };
}

let refreshBusy = false;
async function refreshAll() {
  if (refreshBusy) return; refreshBusy = true;
  try {
    await loadAll();
    applyBrand();
    if (currentView === 'home') renderHome();
    else if (currentView === 'clients') renderClients();
    else if (currentView === 'inventory') renderInventory();
    else if (currentView === 'transactions') renderTransactions();
    else if (currentView === 'catalog') renderCatalog(null);
    else if (currentView === 'sale') renderSale();
    else if (currentView === 'pay') renderPay();
    else if (currentView === 'expenses') renderExpenses();
    else if (currentView === 'suppliers') renderSuppliers();
    else if (currentView === 'purchase-orders') renderPOs();
    else if (currentView === 'reports') renderReports();
    else if (currentView === 'settings') renderSettings();
    else if (currentView === 'stocktake') renderStocktake();
    else if (currentView === 'audit') renderAudit();
    else if (currentView === 'help') renderHelp();
    else if (currentView === 'debts') renderDebts();
    toast(T('common.refreshed'), 'ok');
  } catch (e) { /* keep current view */ }
  refreshBusy = false;
}

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

