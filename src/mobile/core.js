function isNativeApp() {
  try { return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()); } catch (e) { return false; }
}
function nativePlugin(name) {
  try { return (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins[name]) || null; } catch (e) { return null; }
}
// LAN sync is plain HTTP to the shop PC. Cleartext is allowed only for the
// local network: a saved http:// server URL with a public host is rejected
// (https:// stays allowed for any host, e.g. a Tailscale tunnel).
function isPrivateHost(host) {
  const h = String(host || '').toLowerCase().replace(/^\[|\]$/g, '');
  if (!h) return false;
  if (h === 'localhost' || h.endsWith('.local') || h === '10.0.2.2') return true;
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const a = +m[1], b = +m[2];
    if (a === 10 || a === 127) return true;
    if (a === 192 && b === 168) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 169 && b === 254) return true;
    return false;
  }
  if (h.includes(':')) return h === '::1' || h.startsWith('fe80:') || h.startsWith('fc') || h.startsWith('fd');
  return false;
}
function safeServerUrl(raw) {
  const u = String(raw || '').trim().replace(/\/+$/, '');
  if (!u) return '';
  try {
    const parsed = new URL(u);
    if (parsed.protocol === 'https:') return u;
    if (parsed.protocol === 'http:' && isPrivateHost(parsed.hostname)) return u;
    return '';
  } catch (e) { return ''; }
}
// In the native app the UI is bundled (capacitor://localhost) while the shop
// lives at the saved LAN address; in the browser it is just the page origin.
const API = (() => {
  try {
    const u = localStorage.getItem('slpServerUrl');
    if (u) { const safe = safeServerUrl(u); if (safe) return safe; }
  } catch (e) {}
  return window.location.origin;
})();
const peso = (n) => '₱' + (Number(n) || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
// A negative balance is money the store holds for the client (overpayment as
// credit); show it as "<amount> credit" instead of a confusing negative.
function pesoBal(n) { const v = Number(n) || 0; return v < 0 ? peso(Math.abs(v)) + ' ' + T('cli.credit') : peso(v); }
function esc(s) { const d = document.createElement('div'); d.textContent = s == null ? '' : s; return d.innerHTML; }
// escAttr: esc() does NOT escape quotes (text-node serialization leaves ' and
// " raw), so it is unsafe inside attribute values and quoted JS strings.
// Use this for value="...", placeholder="...", data-* and similar spots.
function escAttr(s) { return esc(s).replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
// jsArg: a JS literal safe to embed inside a double-quoted onclick attribute.
// JSON.stringify's own double quotes would otherwise close the attribute early,
// truncating the handler into a silently dead button.
function jsArg(x) { const s = JSON.stringify(x); return (s === undefined ? 'null' : s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
// Local YYYY-MM-DD (matches the desktop today() and the store _todayStr;
// toISOString would be UTC and can disagree near midnight).
function phoneToday() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
// Typeable date fields: Android's native date picker has no keyboard, so date
// inputs are text boxes with a numeric keypad. onDateInput auto-inserts the
// dashes while typing; validDateStr accepts only a complete, real YYYY-MM-DD.
function onDateInput(el) {
  if (!el) return;
  const digits = String(el.value || '').replace(/\D/g, '').slice(0, 8);
  let out = digits;
  if (digits.length > 4) out = digits.slice(0, 4) + '-' + digits.slice(4, 6) + (digits.length > 6 ? '-' + digits.slice(6) : '');
  if (el.value !== out) el.value = out;
}
function validDateStr(s) {
  const v = String(s || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return '';
  const y = +v.slice(0, 4), m = +v.slice(5, 7), d = +v.slice(8, 10);
  const dt = new Date(v + 'T00:00:00');
  if (isNaN(dt.getTime()) || dt.getFullYear() !== y || dt.getMonth() + 1 !== m || dt.getDate() !== d) return '';
  return v;
}
function dateTypedAttrs() {
  return 'type="text" inputmode="numeric" maxlength="10" autocomplete="off" placeholder="YYYY-MM-DD" oninput="onDateInput(this)"';
}
// Calendar affordance beside a typeable date. A transparent native
// <input type="date"> sits over the icon, so a REAL tap opens the system
// picker (programmatic showPicker/click is unreliable in Android WebView);
// the chosen day is written back into the text field. Typing AND picking work.
function datePickBtn(targetId) {
  const id = String(targetId).replace(/'/g, "\\'");
  const onchange = "if(this.value){var t=document.getElementById('" + id + "');if(t){t.value=this.value;try{t.dispatchEvent(new Event('change',{bubbles:true}));}catch(e){}}}";
  return '<span class="relative inline-flex shrink-0" style="width:2.9rem;min-height:2.2rem;align-self:stretch">'
    + '<span class="absolute inset-0 flex items-center justify-center rounded-lg border border-white/10 text-gray-300" style="background:rgba(30,41,59,.6);pointer-events:none">' + icon('calendar', 16) + '</span>'
    + '<input type="date" aria-label="Pick a date" onchange="' + onchange + '" style="position:absolute;inset:0;width:100%;height:100%;opacity:0;cursor:pointer" />'
    + '</span>';
}
// Line interest: rate is %/MONTH, prorated by whole days from the line date
// (min 1 day): sub * rate/100 * days/30.
function lineIntCalc(sub, rate, dateStr, todayStr) {
  sub = Number(sub) || 0; rate = Number(rate) || 0;
  if (!sub || !rate) return 0;
  const t = String(todayStr || phoneToday()).slice(0, 10);
  const d = String(dateStr || t).slice(0, 10);
  let days = Math.floor((new Date(t) - new Date(d)) / 86400000);
  if (isNaN(days)) return 0;
  days = Math.max(1, days);
  return Math.round(sub * (rate / 100) * (days / 30) * 100) / 100;
}
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

function getClaim() {
  const m = window.location.search.match(/claim=([^&]+)/);
  return m ? decodeURIComponent(m[1]) : '';
}
function getToken() {
  // A stored device token always wins: QR claims are single-use, so a reload
  // must not swap the working token for a burned claim. ?token= only seeds
  // fresh phones (legacy QR links / bookmarks).
  try {
    const stored = localStorage.getItem('slpToken') || '';
    if (stored) return stored;
  } catch (e) {}
  const m = window.location.search.match(/token=([^&]+)/);
  const urlToken = m ? m[1] : '';
  if (urlToken) { try { localStorage.setItem('slpToken', urlToken); } catch (e) {} }
  return urlToken;
}
const HDR = () => ({ 'X-Auth-Token': getToken() });

// Counter role: cashier phones see counter work only (no revenue figures,
// reports, or expenses). Legacy/master sessions default to owner.
function phoneRole() {
  try { return localStorage.getItem('slpRole') || 'owner'; } catch (e) { return 'owner'; }
}
// Thumbnails live outside the list payloads (see /api/inventory/images) and
// are cached here per boot; only unseen ids are ever fetched.
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
    const hide = phoneRole() === 'cashier';
    document.querySelectorAll('[data-nav="reports"], [data-nav="expenses"], [data-nav="suppliers"], [data-nav="purchase-orders"]').forEach(el => {
      el.style.display = hide ? 'none' : '';
    });
  } catch (e) {}
}
// Single brand slot: the header shows the shop's own name (loaded with
// settings); the app name lives only on the boot splash + document title.
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

// ---------- feel: haptics + sound ----------
// Vibration + beep confirm actions without looking (noisy shops, pocket use).
// Everything guarded: desktops and browsers without these APIs just skip.
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

const API_TIMEOUT_MS = 15000;
async function fetchTimeout(url, opts) {
  // Stalled shop Wi-Fi must never wedge the UI on a hung request: abort past
  // the timeout. AbortError is treated as a network drop by apiPost (queues).
  if (typeof AbortController === 'undefined') return fetch(url, opts);
  const ctrl = new AbortController();
  const t = setTimeout(() => { try { ctrl.abort(); } catch (e) {} }, API_TIMEOUT_MS);
  try {
    return await fetch(url, { ...(opts || {}), signal: ctrl.signal });
  } finally { try { clearTimeout(t); } catch (e) {} }
}
async function apiGet(path) {
  const r = await fetchTimeout(API + path, { headers: HDR() });
  if (r.status === 401 && getToken()) {
    try { localStorage.removeItem('slpToken'); localStorage.removeItem('slpRole'); } catch (e) {}
    renderPairScreen(T('pair.session_expired'));
    throw new Error('HTTP 401');
  }
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}
// ---------- diagnostics ----------
// JS errors are queued on-device (cap 50) and uploaded to the shop computer,
// where they land in mobile-diag.json and the desktop logs. Without this a
// crashing phone fails silently and nobody ever finds out.
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
  try {
    let appVersion = '';
    try { appVersion = await bundledAppVersion(); } catch (e) {}
    await apiPost('/api/mobile-diag', { entries: entries.slice(0, 20), appVersion });
    try { localStorage.setItem('slpDiagSent', new Date().toISOString()); } catch (e) {}
    if (manual) toast(T('diag.sent', { n: entries.length }), 'ok');
    updateDiagRow();
    return entries.length;
  } catch (e) {
    try {
      const back = JSON.parse(localStorage.getItem(DIAG_KEY) || '[]');
      localStorage.setItem(DIAG_KEY, JSON.stringify(entries.concat(Array.isArray(back) ? back : []).slice(-DIAG_MAX)));
    } catch (_) {}
    if (manual) toast(T('diag.failed', { msg: e.message }), 'err');
    return 0;
  }
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
// Statement of account text for sharing (Messenger, SMS, print notes).
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
  L.push(T('cli.stmt_balance', { amt: pesoBal(client.balance) }));
  return L.join('\n');
}
// ---------- receipt sharing ----------
// Plain-text receipt any messenger accepts. Chain: native Share sheet →
// Web Share API → clipboard, whichever this phone supports.
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
    const q = parseFloat((it.qty != null && it.qty !== '') ? it.qty : it.name) || 1;
    const p = it.unitCost || it.price || 0;
    L.push(`${it.description || 'Item'}  ${q} x ${peso(p)} = ${peso(q * p)}`);
  });
  L.push('--------------------------------');
  L.push('TOTAL: ' + peso(t.grandTotal) + ' (' + (t.paymentMethod || 'Cash') + ')');
  L.push(shop.receiptFooter || 'Thank you for your patronage!');
  return L.join('\n');
}
// Submit locks: a double-tapped Save must never post twice (double sales,
// double payments). Keyed per flow; always released in a finally block.
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
// Share chain used by receipts and reports: native sheet → Web Share API
// → clipboard, whichever this phone supports.
// Open the OS print dialog (printer selection / "search for printer", like
// Word) for an HTML document. Uses the native ShopPrinter bridge when present;
// otherwise a hidden iframe + browser print as a fallback.
function systemPrintHtml(html, jobName) {
  try {
    const S = nativePlugin('ShopPrinter');
    if (S && typeof S.printHtml === 'function') {
      toast(T('receipt.search_printers'), 'info');
      S.printHtml({ html, jobName: jobName || 'Receipt' }).catch(e => toast(T('sale.print_failed', { msg: e.message }), 'err'));
      return true;
    }
  } catch (e) {}
  try {
    const frame = document.createElement('iframe');
    frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
    frame.onload = () => {
      try { frame.contentWindow.focus(); frame.contentWindow.print(); }
      catch (e) { toast(T('sale.print_failed', { msg: e.message }), 'err'); }
      setTimeout(() => { try { frame.remove(); } catch (e) {} }, 60000);
    };
    frame.srcdoc = html;
    document.body.appendChild(frame);
    return true;
  } catch (e) { toast(T('sale.print_failed', { msg: e.message }), 'err'); return false; }
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

