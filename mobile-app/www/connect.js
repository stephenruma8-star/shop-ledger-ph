// Bootstrap: pick the shop computer, then hand off to the bundled phone UI
// (www/app/index.html, synced from the desktop repo). Works as a plain web
// page too — native-only bits (QR scan) hide when no Capacitor runtime.
function capPlugin(name) {
  try { return window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins[name]; } catch (e) { return null; }
}
function isNative() {
  try { return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()); } catch (e) { return false; }
}
function showError(msg) {
  const el = document.getElementById('connect-error');
  if (!el) return;
  el.textContent = msg;
  el.style.display = 'block';
}
function clearError() {
  const el = document.getElementById('connect-error');
  if (el) el.style.display = 'none';
}
function loadServers() {
  try { return JSON.parse(localStorage.getItem('slpServers') || '[]'); } catch (e) { return []; }
}
function saveServers(list) {
  try { localStorage.setItem('slpServers', JSON.stringify(list)); } catch (e) {}
}
function normalizeUrl(raw) {
  let u = String(raw || '').trim();
  if (!u) return null;
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(u)) u = 'http://' + u;
  let parsed = null;
  try { parsed = new URL(u); } catch (e) { return null; }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
  return parsed;
}
async function checkHealth(base) {
  const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const t = setTimeout(() => { try { ctrl && ctrl.abort(); } catch (e) {} }, 8000);
  try {
    const r = await fetch(base + '/api/health', ctrl ? { signal: ctrl.signal } : undefined);
    const j = await r.json().catch(() => ({}));
    return r.ok && j && j.status === 'ok';
  } catch (e) {
    return false;
  } finally {
    try { clearTimeout(t); } catch (e) {}
  }
}
function rememberServer(urlObj) {
  const list = loadServers().filter(s => s && s.url !== urlObj.origin);
  list.unshift({ name: urlObj.hostname, url: urlObj.origin, addedAt: Date.now() });
  saveServers(list.slice(0, 8));
  renderServers();
}
async function goShop(urlObj, claim) {
  clearError();
  const ok = await checkHealth(urlObj.origin);
  if (!ok) {
    showError('No shop answering at ' + urlObj.origin + ' — same Wi-Fi? Desktop app running?');
    return;
  }
  try {
    localStorage.setItem('slpServerUrl', urlObj.origin);
    const ws = urlObj.searchParams.get('ws');
    if (ws) localStorage.setItem('slpWsPort', ws);
    else localStorage.removeItem('slpWsPort');
  } catch (e) {}
  rememberServer(urlObj);
  window.location.href = 'app/index.html' + (claim ? '?claim=' + encodeURIComponent(claim) : '');
}
async function connectManual() {
  const raw = (document.getElementById('srv-url') || {}).value || '';
  const urlObj = normalizeUrl(raw);
  if (!urlObj) {
    showError('Enter the shop address, e.g. http://192.168.1.5:3456');
    return;
  }
  goShop(urlObj, null);
}
async function scanShopQR() {
  clearError();
  const B = capPlugin('CapacitorBarcodeScanner') || capPlugin('BarcodeScanner');
  if (!B || typeof B.scanBarcode !== 'function') {
    showError('QR scanning needs the installed app — type the address instead.');
    return;
  }
  let text = '';
  try {
    const r = await B.scanBarcode({ hint: 0, scanButton: false, scanText: 'Point at the shop QR code' });
    text = r && (r.ScanResult || r.scanResult || '');
  } catch (e) {
    showError('Scan cancelled or failed — type the address instead.');
    return;
  }
  if (!text) {
    showError('Nothing scanned — type the address instead.');
    return;
  }
  const urlObj = normalizeUrl(text);
  if (!urlObj) {
    showError('That QR is not a shop address — type the address instead.');
    return;
  }
  let claim = '';
  try { claim = urlObj.searchParams.get('claim') || ''; } catch (e) {}
  goShop(urlObj, claim);
}
function forgetServer(url) {
  saveServers(loadServers().filter(s => s && s.url !== url));
  renderServers();
}
function renderServers() {
  const box = document.getElementById('srv-list');
  if (!box) return;
  const list = loadServers();
  box.innerHTML = list.map(s => (
    '<div class="srv"><div class="meta"><b>' + escapeHtml(s.name || s.url) + '</b><span>' + escapeHtml(s.url) + '</span></div>' +
    '<button class="btn-primary" data-connect="' + escapeHtml(s.url) + '">Open</button>' +
    '<button class="btn-danger" data-forget="' + escapeHtml(s.url) + '">✕</button></div>'
  )).join('');
  box.querySelectorAll('[data-connect]').forEach(b => b.addEventListener('click', () => {
    const urlObj = normalizeUrl(b.getAttribute('data-connect'));
    if (urlObj) goShop(urlObj, null);
  }));
  box.querySelectorAll('[data-forget]').forEach(b => b.addEventListener('click', () => forgetServer(b.getAttribute('data-forget'))));
}
function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
document.addEventListener('DOMContentLoaded', () => {
  if (!isNative()) {
    const scan = document.getElementById('scan-btn');
    if (scan) scan.style.display = 'none';
  }
  renderServers();
  try {
    fetch('app/version.json').then(r => r.json()).then(v => {
      const el = document.getElementById('ver-foot');
      if (el && v && v.desktopVersion) el.textContent = 'phone UI v' + v.desktopVersion + ' · synced ' + (v.syncedAt || '').slice(0, 10);
    }).catch(() => {});
  } catch (e) {}
});
