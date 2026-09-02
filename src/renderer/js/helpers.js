import { logAudit } from './auth.js'
import { cfUpdateRowAmt, cfUpdateTotals } from './clients.js'
import { dbAdd, dbAll, dbDel, dbPut } from './database.js'
import { renderExpTable } from './expenses.js'
import { renderPayTable } from './payments.js'
import { navigate } from './router.js'
import { now, peso, state, today } from './state.js'
import { renderTxTable, txCart, updateCartRowAmt, updateTMTotals } from './transactions.js'

export function dp(d) { const p = (d||'').split('-'); return { y: p[0]||'', m: p[1]||'', d: p[2]||'' }; }

export function itemThumbHtml(item, cls) {
  const size = cls || 'w-9 h-9';
  if (item && item.image) return `<img src="${item.image}" alt="" class="${size} object-cover rounded-md shrink-0" />`;
  return `<div class="${size} rounded-md bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-base shrink-0">📦</div>`;
}

window.__app = window.__app || {};
window.__app._suggestHide = null;
window.__app._suggestIndex = -1;
window.__app._suggestMatches = [];
window.__app._pageState = { tx: 1, exp: 1, pay: 1 };
export const PAGE_SIZE = 50;

export function paginate(arr, key) {
  const st = window.__app._pageState;
  const totalPages = Math.ceil(arr.length / PAGE_SIZE) || 1;
  if ((st[key] || 1) > totalPages) st[key] = totalPages;
  const p = st[key] = st[key] || 1;
  return { items: arr.slice((p-1)*PAGE_SIZE, p*PAGE_SIZE), page: p, totalPages };
}

export function renderPagination(key, page, totalPages) {
  if (totalPages <= 1) return '';
  const prev = page > 1 ? `window.__app._pageState['${key}']=${page-1};renderPagedTable('${key}')` : '';
  const next = page < totalPages ? `window.__app._pageState['${key}']=${page+1};renderPagedTable('${key}')` : '';
  return `<div class="flex items-center justify-between px-3 py-2 bg-gray-50 dark:bg-gray-700 text-xs border-t dark:border-gray-700"><span>Page ${page} of ${totalPages}</span><div class="flex gap-1"><button onclick="${prev}" class="px-2 py-1 rounded ${page<=1?'text-gray-400 cursor-default':'bg-white dark:bg-gray-600 hover:bg-gray-200 dark:text-gray-200'}">Prev</button><button onclick="${next}" class="px-2 py-1 rounded ${page>=totalPages?'text-gray-400 cursor-default':'bg-white dark:bg-gray-600 hover:bg-gray-200 dark:text-gray-200'}">Next</button></div></div>`;
}

export function renderPagedTable(key) {
  if (key === 'tx') renderTxTable();
  else if (key === 'exp') renderExpTable();
  else if (key === 'pay') renderPayTable();
}

export function showItemSuggestions(input, prefix, i) {
  if (window.__app._suggestHide) { clearTimeout(window.__app._suggestHide); window.__app._suggestHide = null; }
  const val = input.value.trim().toLowerCase();
  let existing = document.getElementById('suggest-drop-' + prefix + '-' + i);
  if (existing) existing.remove();
  if (!val) { window.__app._suggestIndex = -1; window.__app._suggestMatches = []; return; }
  window.__app._suggestMatches = [];
  (state.quickItems || []).forEach(q => { if (q.name.toLowerCase().includes(val)) window.__app._suggestMatches.push({ name: q.name, price: q.price, invId: null, image: (state.inventory.find(i => i.name === q.name) || {}).image || null }); });
  (state.inventory || []).forEach(inv => { if (inv.name.toLowerCase().includes(val)) window.__app._suggestMatches.push({ name: inv.name, price: inv.sellPrice || inv.price || 0, invId: inv.id, image: inv.image || null }); });
  if (!window.__app._suggestMatches.length) { window.__app._suggestIndex = -1; return; }
  window.__app._suggestIndex = -1;
  const rect = input.getBoundingClientRect();
  const div = document.createElement('div');
  div.id = 'suggest-drop-' + prefix + '-' + i;
  div.className = 'fixed z-[999] bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-lg shadow-xl max-h-48 overflow-auto text-sm';
  div.style.left = rect.left + 'px';
  div.style.top = (rect.bottom + 2) + 'px';
  div.style.minWidth = Math.max(rect.width, 200) + 'px';
  div.innerHTML = window.__app._suggestMatches.slice(0, 20).map((m, idx) => `<div class="suggest-item px-3 py-1.5 cursor-pointer border-b dark:border-gray-700 last:border-0" data-index="${idx}" onmouseenter="document.querySelectorAll('.suggest-item').forEach(e=>e.classList.remove('bg-blue-100','dark:bg-blue-900/30'));this.classList.add('bg-blue-100','dark:bg-blue-900/30');window.__app._suggestIndex=${idx}" onmousedown="event.preventDefault();selectItemSuggestion('${escapeHtml(m.name)}',${m.price},${m.invId ?? 'null'},'${prefix}',${i})">${m.image ? `<img src="${m.image}" alt="" class="w-6 h-6 object-cover rounded inline-block align-middle mr-1.5" />` : ''}${escapeHtml(m.name)} <span class="text-gray-400">${peso(m.price)}</span></div>`).join('');
  document.body.appendChild(div);
  input.onkeydown = function(e) {
    const items = div.querySelectorAll('.suggest-item');
    if (!items.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      window.__app._suggestIndex = Math.min(window.__app._suggestIndex + 1, items.length - 1);
      items.forEach((el, idx) => { el.classList.toggle('bg-blue-100', idx === window.__app._suggestIndex); el.classList.toggle('dark:bg-blue-900/30', idx === window.__app._suggestIndex); });
      if (window.__app._suggestIndex >= 0) items[window.__app._suggestIndex].scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      window.__app._suggestIndex = Math.max(window.__app._suggestIndex - 1, -1);
      items.forEach((el, idx) => { el.classList.toggle('bg-blue-100', idx === window.__app._suggestIndex); el.classList.toggle('dark:bg-blue-900/30', idx === window.__app._suggestIndex); });
      if (window.__app._suggestIndex >= 0) items[window.__app._suggestIndex].scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter' && window.__app._suggestIndex >= 0) {
      e.preventDefault();
      const hit = window.__app._suggestMatches[window.__app._suggestIndex];
      if (hit) selectItemSuggestion(hit.name, hit.price, hit.invId ?? null, prefix, i);
    }
  };
}

export function clearItemSuggestions() {
  document.querySelectorAll('[id^="suggest-drop-"]').forEach(el => el.remove());
  window.__app._suggestIndex = -1;
  window.__app._suggestMatches = [];
}

export function selectItemSuggestion(name, price, invId, prefix, i) {
  const d = document.getElementById('suggest-drop-' + prefix + '-' + i);
  if (d) d.remove();
  const descEl = document.getElementById(prefix + '-desc-' + i);
  const qtyEl = document.getElementById(prefix + '-qty-' + i);
  const costEl = document.getElementById(prefix + '-cost-' + i);
  if (descEl) descEl.value = name;
  if (qtyEl) qtyEl.value = '1';
  if (costEl) costEl.value = price;
  const cart = prefix === 'cf' ? cfCart : txCart;
  cart[i].description = name;
  cart[i].name = '1';
  cart[i].unitCost = price;
  cart[i].invId = invId;
  cart[i].variantName = '';
  const invItem = state.inventory.find(x => x.id === invId);
  if (invItem && invItem.variants && invItem.variants.length > 0) {
    cart[i].variantName = invItem.variants[0].name;
    const existingPicker = document.getElementById('vpicker-' + prefix + '-' + i);
    if (existingPicker) existingPicker.remove();
    const picker = document.createElement('select');
    picker.id = 'vpicker-' + prefix + '-' + i;
    picker.className = 'ml-1 px-1 py-0.5 border dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-xs';
    picker.style.maxWidth = '80px';
    picker.innerHTML = invItem.variants.map((v, vi) => `<option value="${escapeHtml(v.name)}" ${vi === 0 ? 'selected' : ''}>${escapeHtml(v.name)} (${v.stock})</option>`).join('');
    picker.onchange = function() { cart[i].variantName = this.value; };
    if (descEl && descEl.parentNode) descEl.parentNode.appendChild(picker);
  }
  if (prefix === 'cf') { cfUpdateRowAmt(i); cfUpdateTotals(); }
  else { updateCartRowAmt(i); updateTMTotals(); }
}

document.addEventListener('click', function(e) {
  clearItemSuggestions();
});

export function startClock() {
  function tick() {
    const el = document.getElementById('sidebar-clock');
    if (!el) return;
    const now = new Date();
    const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const h = String(now.getHours()).padStart(2,'0');
    const m = String(now.getMinutes()).padStart(2,'0');
    const s = String(now.getSeconds()).padStart(2,'0');
    el.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="inline-block mr-1 -mt-0.5"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>${days[now.getDay()]}, ${months[now.getMonth()]} ${now.getDate()}, ${now.getFullYear()} <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="inline-block mx-1 -mt-0.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>${h}:${m}:${s}`;
  }
  tick();
  setInterval(tick, 1000);
}

const CONN_ICON_ON = `<path d="M5 12.55a11 11 0 0 1 14.08 0"/><path d="M1.42 9a16 16 0 0 1 21.16 0"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/>`;
const CONN_ICON_OFF = `<line x1="1" y1="1" x2="23" y2="23"/><path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"/><path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"/><path d="M10.71 5.05A16 16 0 0 1 22.58 9"/><path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/>`;
let _connChecking = false;
let _connTimer = null;

function _connApply(mode, label, icon) {
  const containers = document.querySelectorAll('.conn-status');
  const svg = `<svg class="conn-icon inline-block" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${icon}</svg>`;
  containers.forEach(el => {
    el.classList.remove('conn-online', 'conn-offline', 'conn-checking');
    el.classList.add('conn-' + mode);
    const lbl = el.querySelector('.conn-label');
    if (lbl) lbl.textContent = label;
    const ic = el.querySelector('.conn-icon');
    if (ic) ic.outerHTML = svg;
  });
  const banner = document.getElementById('conn-banner');
  if (banner) banner.classList.toggle('hidden', mode !== 'offline');
}

export async function updateConnStatus() {
  if (!navigator.onLine) { _connApply('offline', 'Offline', CONN_ICON_OFF); return; }
  if (_connChecking) return;
  _connChecking = true;
  _connApply('checking', 'Checking…', CONN_ICON_ON);
  try {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 5000);
    const res = await fetch('https://www.gstatic.com/generate_204', { cache: 'no-store', signal: ctrl.signal });
    clearTimeout(to);
    if (!res.ok) throw new Error('Bad status ' + res.status);
    _connApply('online', 'Online', CONN_ICON_ON);
  } catch (e) {
    _connApply('offline', 'Offline', CONN_ICON_OFF);
  } finally {
    _connChecking = false;
  }
}

export function initConnIndicator() {
  updateConnStatus();
  window.addEventListener('online', updateConnStatus);
  window.addEventListener('offline', updateConnStatus);
  if (_connTimer) clearInterval(_connTimer);
  _connTimer = setInterval(updateConnStatus, 30000);
}

export function populateYearSelector() {
  const sel = document.getElementById('year-selector');
  if (!sel) return;
  const years = new Set();
  state.transactions.forEach(t => { if (t.date) years.add(t.date.split('-')[0]); });
  state.payments.forEach(p => { if (p.date) years.add(p.date.split('-')[0]); });
  state.expenses.forEach(e => { if (e.date) years.add(e.date.split('-')[0]); });
  const currentYear = String(new Date().getFullYear());
  years.add(currentYear);
  const sorted = [...years].sort((a, b) => b - a);
  sel.innerHTML = '<option value="all">All Years</option>' + sorted.map(y => `<option value="${y}" ${state.selectedYear === y ? 'selected' : ''}>${y}</option>`).join('');
}

export function changeYear(year) {
  state.selectedYear = year;
  localStorage.setItem('selectedYear', year);
  if (year === 'all') { showAllYearsSummary(); return; }
  navigate(state.currentRoute);
}

export function showAllYearsSummary() {
  const years = new Set();
  state.transactions.forEach(t => { if (t.date) years.add(t.date.split('-')[0]); });
  state.expenses.forEach(e => { if (e.date) years.add(e.date.split('-')[0]); });
  state.payments.forEach(p => { if (p.date) years.add(p.date.split('-')[0]); });
  const currentYear = String(new Date().getFullYear());
  years.add(currentYear);
  const sortedYears = [...years].sort((a, b) => b - a);

  let totalSales = 0, totalExpenses = 0, totalPayments = 0;
  let yearRows = sortedYears.map(y => {
    const sales = state.transactions.filter(t => (t.date||'').startsWith(y)).reduce((s, t) => s + (t.grandTotal || 0), 0);
    const expenses = state.expenses.filter(e => (e.date||'').startsWith(y)).reduce((s, e) => s + (e.amount || 0), 0);
    const payments = state.payments.filter(p => (p.date||'').startsWith(y)).reduce((s, p) => s + (p.amount || 0), 0);
    totalSales += sales; totalExpenses += expenses; totalPayments += payments;
    const net = sales - expenses - payments;
    return `<tr class="border-b dark:border-gray-700"><td class="p-2 font-semibold">${y}</td><td class="p-2 text-right text-green-600">${peso(sales)}</td><td class="p-2 text-right text-red-500">${peso(expenses)}</td><td class="p-2 text-right text-blue-600">${peso(payments)}</td><td class="p-2 text-right font-bold ${net >= 0 ? 'text-green-600' : 'text-red-600'}">${peso(net)}</td></tr>`;
  }).join('');

  let clientRows = state.clients.filter(c => (c.balance || 0) > 0).map(c => {
    const charged = state.transactions.filter(t => t.clientId === c.id).reduce((s, t) => s + (t.grandTotal || 0), 0);
    const paid = state.payments.filter(p => p.clientId === c.id).reduce((s, p) => s + (p.amount || 0), 0);
    const since = c.ledgerYear || (() => { const tx = state.transactions.filter(tx2 => tx2.clientId === c.id && tx2.date).sort((a, b) => a.date.localeCompare(b.date))[0]; return tx ? tx.date.split('-')[0] : '—'; })();
    return `<tr class="border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer" onclick="closeModal();viewClientHistory(${c.id})"><td class="p-2 font-medium">${escapeHtml(c.name)}</td><td class="p-2 text-xs text-gray-400">${since}</td><td class="p-2 text-right">${peso(charged)}</td><td class="p-2 text-right text-green-600">${peso(paid)}</td><td class="p-2 text-right font-bold ${(c.balance||0)>0?'text-red-600':'text-green-600'}">${peso(c.balance)}</td></tr>`;
  }).join('');

  const totNet = totalSales - totalExpenses - totalPayments;
  modal(`<div class="p-4 flex flex-col" style="min-height:70vh">
    <div class="flex justify-between items-center mb-3 shrink-0">
      <h3 class="text-xl font-bold">All Years Overview</h3>
      <button onclick="closeModal();navigate(state.currentRoute)" class="text-gray-400 hover:text-gray-600"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
    </div>
    <div class="mb-4">
      <h4 class="font-semibold text-sm mb-1">Financial Summary</h4>
      <div class="overflow-auto rounded-lg border dark:border-gray-700">
        <table class="w-full text-sm"><thead><tr class="bg-gray-50 dark:bg-gray-700 text-xs uppercase tracking-wide"><th class="p-2 text-left">Year</th><th class="p-2 text-right">Sales</th><th class="p-2 text-right">Expenses</th><th class="p-2 text-right">Payments</th><th class="p-2 text-right">Net</th></tr></thead>
        <tbody>${yearRows}<tr class="font-bold bg-blue-50 dark:bg-blue-900/20"><td class="p-2">Total</td><td class="p-2 text-right text-green-600">${peso(totalSales)}</td><td class="p-2 text-right text-red-500">${peso(totalExpenses)}</td><td class="p-2 text-right text-blue-600">${peso(totalPayments)}</td><td class="p-2 text-right ${totNet>=0?'text-green-600':'text-red-600'}">${peso(totNet)}</td></tr></tbody></table>
      </div>
    </div>
    <div class="flex-1 min-h-0">
      <h4 class="font-semibold text-sm mb-1">Clients with Outstanding Balance</h4>
      <div class="overflow-auto max-h-[40vh] rounded-lg border dark:border-gray-700">
        <table class="w-full text-sm"><thead><tr class="bg-gray-50 dark:bg-gray-700 text-xs uppercase tracking-wide sticky top-0"><th class="p-2 text-left">Name</th><th class="p-2 text-left">Since</th><th class="p-2 text-right">Charged</th><th class="p-2 text-right">Paid</th><th class="p-2 text-right">Balance</th></tr></thead>
        <tbody>${clientRows || '<tr><td class="p-4 text-center text-gray-400" colspan="5">No outstanding balances</td></tr>'}</tbody></table>
      </div>
    </div>
  </div>`);
}

export function filterByYear(data, dateField) {
  if (state.selectedYear === 'all' || !data || !data.length) return data;
  const y = state.selectedYear;
  return data.filter(d => {
    const dStr = d[dateField];
    if (!dStr) return true;
    return dStr.startsWith(y) || dStr.startsWith(y + '-') || new Date(dStr).getFullYear().toString() === y;
  });
}

export function lookupItem(prefix, i) {
  const input = document.getElementById(prefix + '-desc-' + i);
  if (!input) return;
  const val = input.value.trim().toLowerCase();
  if (!val) return;
  let match = state.quickItems.find(q => q.name.toLowerCase() === val);
  if (!match) match = state.inventory.find(inv => inv.name.toLowerCase() === val);
  if (!match) return;
  const qtyEl = document.getElementById(prefix + '-qty-' + i);
  const costEl = document.getElementById(prefix + '-cost-' + i);
  const price = match.price || match.sellPrice || 0;
  const cart = prefix === 'cf' ? cfCart : txCart;
  cart[i].description = match.name;
  cart[i].name = '1';
  cart[i].unitCost = price;
  cart[i].invId = match.id || null;
  if (qtyEl) qtyEl.value = '1';
  if (costEl) costEl.value = price;
  if (prefix === 'cf') { cfUpdateRowAmt(i); cfUpdateTotals(); }
  else { updateCartRowAmt(i); updateTMTotals(); }
}

export function intRateOptions(selected) {
  let opts = '<option value="0"' + (Number(selected) === 0 ? ' selected' : '') + '>0%</option>';
  for (let r = 0.5; r <= 20; r += 0.5) {
    const v = Math.round(r * 10) / 10;
    opts += '<option value="' + v + '"' + (Number(selected) === v ? ' selected' : '') + '>' + v + '%</option>';
  }
  return opts;
}

export function calcInterest(sub, ratePct, days) {
  return sub === 0 || ratePct === 0 ? 0 : parseFloat((sub * (ratePct / 100) * (days / 30)).toFixed(2));
}

export function toast(msg, type = 'info') {
  const colors = { info: 'bg-blue-600', success: 'bg-green-600', error: 'bg-red-600', warning: 'bg-yellow-600' };
  const icons = { info: '<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>', success: '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>', error: '<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>', warning: '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>' };
  const c = document.getElementById('toasts');
  if (!c) return;
  const el = document.createElement('div');
  el.className = `${colors[type] || colors.info} text-white px-4 py-3 rounded-xl shadow-lg text-sm max-w-sm toast-enter flex items-center gap-2`;
  el.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="shrink-0">${icons[type] || icons.info}</svg><span>${msg}</span>`;
  c.appendChild(el);
  if (type === 'error') playSound('error');
  else if (type === 'success') playSound('success');
  setTimeout(() => { el.classList.remove('toast-enter'); el.classList.add('toast-exit'); setTimeout(() => el.remove(), 200); }, 3500);
}

// Sound effects
export let _audioCtx;
export function playSound(type) {
  try {
    if (!_audioCtx) _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = _audioCtx.createOscillator();
    const gain = _audioCtx.createGain();
    osc.connect(gain); gain.connect(_audioCtx.destination);
    if (type === 'success') {
      osc.frequency.setValueAtTime(523, _audioCtx.currentTime);
      osc.frequency.setValueAtTime(659, _audioCtx.currentTime + 0.1);
      osc.frequency.setValueAtTime(784, _audioCtx.currentTime + 0.2);
      gain.gain.setValueAtTime(0.15, _audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, _audioCtx.currentTime + 0.4);
      osc.start(_audioCtx.currentTime); osc.stop(_audioCtx.currentTime + 0.4);
    } else if (type === 'error') {
      osc.frequency.setValueAtTime(200, _audioCtx.currentTime);
      osc.frequency.setValueAtTime(150, _audioCtx.currentTime + 0.15);
      gain.gain.setValueAtTime(0.15, _audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, _audioCtx.currentTime + 0.3);
      osc.start(_audioCtx.currentTime); osc.stop(_audioCtx.currentTime + 0.3);
    } else if (type === 'payment') {
      osc.frequency.setValueAtTime(440, _audioCtx.currentTime);
      osc.frequency.setValueAtTime(554, _audioCtx.currentTime + 0.08);
      osc.frequency.setValueAtTime(659, _audioCtx.currentTime + 0.16);
      gain.gain.setValueAtTime(0.12, _audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, _audioCtx.currentTime + 0.3);
      osc.start(_audioCtx.currentTime); osc.stop(_audioCtx.currentTime + 0.3);
    } else if (type === 'sale') {
      [659.25, 987.77, 1318.5].forEach((f, i) => {
        const o2 = _audioCtx.createOscillator();
        const g2 = _audioCtx.createGain();
        o2.connect(g2); g2.connect(_audioCtx.destination);
        o2.frequency.setValueAtTime(f, _audioCtx.currentTime + i * 0.09);
        g2.gain.setValueAtTime(0.16, _audioCtx.currentTime + i * 0.09);
        g2.gain.exponentialRampToValueAtTime(0.001, _audioCtx.currentTime + i * 0.09 + 0.35);
        o2.start(_audioCtx.currentTime + i * 0.09); o2.stop(_audioCtx.currentTime + i * 0.09 + 0.35);
      });
    } else if (type === 'alert') {
      for (let i = 0; i < 3; i++) {
        const o2 = _audioCtx.createOscillator();
        const g2 = _audioCtx.createGain();
        o2.connect(g2); g2.connect(_audioCtx.destination);
        o2.frequency.setValueAtTime(660, _audioCtx.currentTime + i * 0.2);
        g2.gain.setValueAtTime(0.15, _audioCtx.currentTime + i * 0.2);
        g2.gain.exponentialRampToValueAtTime(0.001, _audioCtx.currentTime + i * 0.2 + 0.15);
        o2.start(_audioCtx.currentTime + i * 0.2); o2.stop(_audioCtx.currentTime + i * 0.2 + 0.15);
      }
    }
  } catch (e) { /* audio not available */ }
}

export function animateCount(el, target, fmt) {
  if (!el) return;
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    el.textContent = fmt ? fmt(target) : String(Math.round(target));
    return;
  }
  const dur = 900;
  const start = performance.now();
  function frame(now) {
    const t = Math.min((now - start) / dur, 1);
    const ease = 1 - Math.pow(1 - t, 3);
    el.textContent = fmt ? fmt(target * ease) : String(Math.round(target * ease));
    if (t < 1) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

// Loading spinner
export function showSpinner(msg = 'Loading...') {
  const v = document.getElementById('view');
  if (v) v.innerHTML = `<div class="flex items-center justify-center h-64"><div class="text-center"><div class="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div><p class="text-gray-500 text-sm">${escapeHtml(msg)}</p></div></div>`;
}

// Confetti
export function confetti() {
  const c = document.createElement('canvas');
  c.className = 'fixed inset-0 pointer-events-none z-[500]';
  c.width = window.innerWidth; c.height = window.innerHeight;
  document.body.appendChild(c);
  const ctx = c.getContext('2d');
  const colors = ['#f56565','#ed8936','#ecc94b','#48bb78','#4299e1','#9f7aea','#ed64a6'];
  const pieces = Array.from({length: 120}, () => ({
    x: Math.random() * c.width, y: Math.random() * c.height - c.height,
    w: Math.random() * 8 + 4, h: Math.random() * 6 + 3,
    color: colors[Math.floor(Math.random() * colors.length)],
    vx: (Math.random() - 0.5) * 4, vy: Math.random() * 3 + 2,
    rot: Math.random() * 360, rv: (Math.random() - 0.5) * 10
  }));
  let frames = 0;
  function draw() {
    if (frames++ > 150) { c.remove(); return; }
    ctx.clearRect(0, 0, c.width, c.height);
    pieces.forEach(p => {
      p.x += p.vx; p.vy += 0.05; p.y += p.vy; p.rot += p.rv;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot * Math.PI / 180);
      ctx.fillStyle = p.color; ctx.fillRect(-p.w/2, -p.h/2, p.w, p.h); ctx.restore();
    });
    requestAnimationFrame(draw);
  }
  draw();
}

export function modal(html) {
  const root = document.getElementById('modal-root');
  if (!root) return;
  root.innerHTML = `<div class="fixed inset-0 bg-black/50 z-[400] flex items-start justify-center pt-4 overflow-auto fade-in" onclick="if(event.target===this)closeModal()"><div class="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-[90vw] mx-4 mb-4 slide-in max-h-[95vh] overflow-auto glass-strong" onclick="event.stopPropagation()">${html}</div></div>`;
}

export function closeModal() {
  if (_confirmResolve) { _confirmResolve(false); _confirmResolve = null; }
  clearItemSuggestions();
  const root = document.getElementById('modal-root');
  if (root) root.innerHTML = '';
}

export function toggleSidebar() {
  const aside = document.querySelector('#app > aside');
  const overlay = document.getElementById('sidebar-overlay');
  if (!aside) return;
  const isOpen = aside.classList.toggle('open');
  if (overlay) overlay.classList.toggle('open', isOpen);
}

export function toggleSidebarCollapse() {
  const aside = document.getElementById('app-sidebar');
  if (!aside) return;
  const collapsed = aside.classList.toggle('sidebar-collapsed');
  localStorage.setItem('sidebarCollapsed', collapsed ? '1' : '0');
  const icon = document.getElementById('collapse-icon');
  if (icon) icon.style.transform = collapsed ? 'rotate(180deg)' : '';
}

export function toggleTheme() {
  document.documentElement.classList.toggle('dark');
  localStorage.setItem('theme', document.documentElement.classList.contains('dark') ? 'dark' : 'light');
}

export function showShortcuts() {
  modal(`
    <div class="p-6">
      <div class="flex justify-between items-center mb-4"><h3 class="text-xl font-bold">⌨️ Keyboard Shortcuts</h3><button onclick="closeModal()" class="text-gray-400 hover:text-gray-600"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button></div>
      <div class="space-y-2 text-sm">
        <div class="grid grid-cols-2 gap-2">
          <div class="p-2 bg-blue-50 dark:bg-blue-900/20 rounded col-span-2 font-semibold text-xs text-blue-600">Navigation</div>
          <div class="flex justify-between p-2 bg-gray-50 dark:bg-gray-700 rounded"><span>F1 / Ctrl+D</span><span class="text-gray-500">Dashboard</span></div>
          <div class="flex justify-between p-2 bg-gray-50 dark:bg-gray-700 rounded"><span>F2 / Ctrl+T</span><span class="text-gray-500">Sales</span></div>
          <div class="flex justify-between p-2 bg-gray-50 dark:bg-gray-700 rounded"><span>F3 / Ctrl+Shift+P</span><span class="text-gray-500">Payments</span></div>
          <div class="flex justify-between p-2 bg-gray-50 dark:bg-gray-700 rounded"><span>F4 / Ctrl+Shift+C</span><span class="text-gray-500">Clients</span></div>
          <div class="flex justify-between p-2 bg-gray-50 dark:bg-gray-700 rounded"><span>F5 / Ctrl+I</span><span class="text-gray-500">Inventory</span></div>
          <div class="flex justify-between p-2 bg-gray-50 dark:bg-gray-700 rounded"><span>F6 / Ctrl+E</span><span class="text-gray-500">Expenses</span></div>
          <div class="flex justify-between p-2 bg-gray-50 dark:bg-gray-700 rounded"><span>F7 / Ctrl+R</span><span class="text-gray-500">Reports</span></div>
          <div class="flex justify-between p-2 bg-gray-50 dark:bg-gray-700 rounded"><span>F8 / Ctrl+Shift+S</span><span class="text-gray-500">Settings</span></div>
          <div class="flex justify-between p-2 bg-gray-50 dark:bg-gray-700 rounded"><span>F9</span><span class="text-gray-500">Stock Take</span></div>
          <div class="flex justify-between p-2 bg-gray-50 dark:bg-gray-700 rounded"><span>F10</span><span class="text-gray-500">Suppliers</span></div>
          <div class="flex justify-between p-2 bg-gray-50 dark:bg-gray-700 rounded"><span>F11</span><span class="text-gray-500">Purchase Orders</span></div>
          <div class="flex justify-between p-2 bg-gray-50 dark:bg-gray-700 rounded"><span>Ctrl+U</span><span class="text-gray-500">Debts</span></div>
        </div>
        <div class="grid grid-cols-2 gap-2">
          <div class="p-2 bg-green-50 dark:bg-green-900/20 rounded col-span-2 font-semibold text-xs text-green-600">Actions</div>
          <div class="flex justify-between p-2 bg-gray-50 dark:bg-gray-700 rounded"><span>Esc</span><span class="text-gray-500">Close modal</span></div>
          <div class="flex justify-between p-2 bg-gray-50 dark:bg-gray-700 rounded"><span>Enter</span><span class="text-gray-500">Save modal form</span></div>
          <div class="flex justify-between p-2 bg-gray-50 dark:bg-gray-700 rounded"><span>Ctrl+Enter</span><span class="text-gray-500">Save (from textarea)</span></div>
          <div class="flex justify-between p-2 bg-gray-50 dark:bg-gray-700 rounded"><span>Ctrl+F</span><span class="text-gray-500">Focus page search</span></div>
          <div class="flex justify-between p-2 bg-gray-50 dark:bg-gray-700 rounded"><span>Ctrl+K</span><span class="text-gray-500">Global search</span></div>
          <div class="flex justify-between p-2 bg-gray-50 dark:bg-gray-700 rounded"><span>Ctrl+/</span><span class="text-gray-500">Show shortcuts</span></div>
          <div class="flex justify-between p-2 bg-gray-50 dark:bg-gray-700 rounded"><span>Ctrl+Shift+T</span><span class="text-gray-500">Toggle dark mode</span></div>
        </div>
      </div>
    </div>`);
}

export function focusPageSearch() {
  const searchInput = document.querySelector('#view input[placeholder*="Search"], #view input[type="search"], #txSearch, #paySearch, #expSearch, #utangSearch, #invSearch');
  if (searchInput) { searchInput.focus(); searchInput.select(); }
}

export function saveCurrentModal() {
  const saveBtn = document.querySelector('#modal-root button.bg-blue-600:not([onclick*="closeModal"]), #modal-root button.bg-green-600');
  if (saveBtn) saveBtn.click();
}

export function validateNumber(v) { return !isNaN(parseFloat(v)) && isFinite(v) && parseFloat(v) >= 0; }

export function validateRequired(v) { return v !== null && v !== undefined && String(v).trim() !== ''; }

export function setFieldError(el, msg) {
  if (!el || !el.parentElement) return;
  const wrap = el.parentElement;
  const err = wrap.querySelector(':scope > .field-error');
  if (msg) {
    el.classList.add('border-red-500', 'ring-1', 'ring-red-400');
    if (err) err.textContent = msg;
    else { const s = document.createElement('span'); s.className = 'field-error block text-xs text-red-600 dark:text-red-400 mt-1'; s.textContent = msg; el.insertAdjacentElement('afterend', s); }
  } else {
    el.classList.remove('border-red-500', 'ring-1', 'ring-red-400');
    if (err) err.remove();
  }
}

export function requireFields(specs) {
  let firstBad = null;
  for (const s of specs) {
    const ok = s.test ? s.test(s.el) : String(s.el.value ?? '').trim() !== '';
    setFieldError(s.el, ok ? null : (s.msg || 'Please fill out this field'));
    if (!ok && !firstBad) firstBad = s.el;
  }
  if (firstBad) firstBad.focus();
  return firstBad;
}

export function validatePhone(v) { return /^(\+63|0)?\d{10,11}$/.test(String(v).trim()); }

export function debounce(fn, ms = 250) { let timer; return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), ms); }; }

export function escapeHtml(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
export function dbLoad(store) {
  if (state[store] && state[store].length > 0) return Promise.resolve(state[store]);
  return dbAll(store).then(data => { state[store] = data; return data; });
}

const _pwEnc = new TextEncoder();
const _pwB64enc = (bytes) => { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(s); };
const _pwB64dec = (str) => { const bin = atob(str); return Uint8Array.from(bin, c => c.charCodeAt(0)); };
const _pwTimingSafeEq = (a, b) => {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a[i] ^ b[i];
  return d === 0;
};
async function sha256Hex(pw) {
  const h = await crypto.subtle.digest('SHA-256', _pwEnc.encode(pw));
  return Array.from(new Uint8Array(h)).map(b => b.toString(16).padStart(2, '0')).join('');
}
const PBKDF2_ITER = 210000;
// Salted PBKDF2-SHA-256 hash: "pbkdf2$<iter>$<saltB64>$<hashB64>".
// Replaces the old unsalted SHA-256 hex (helpers.js v3.9.2); verifyPassword() still
// accepts legacy hex and plaintext so existing users can log in and are upgraded on success.
export async function hashPassword(pw) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', _pwEnc.encode(pw), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: PBKDF2_ITER, hash: 'SHA-256' }, key, 256);
  return `pbkdf2$${PBKDF2_ITER}$${_pwB64enc(salt)}$${_pwB64enc(new Uint8Array(bits))}`;
}
export async function verifyPassword(pw, stored) {
  if (!pw || !stored) return false;
  if (typeof stored === 'string' && stored.startsWith('pbkdf2$')) {
    const parts = stored.split('$');
    if (parts.length !== 4) return false;
    const iters = parseInt(parts[1], 10);
    if (!(iters > 0)) return false;
    let salt, want;
    try { salt = _pwB64dec(parts[2]); want = _pwB64dec(parts[3]); } catch (e) { return false; }
    if (want.length !== 32) return false;
    const key = await crypto.subtle.importKey('raw', _pwEnc.encode(pw), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: iters, hash: 'SHA-256' }, key, 256);
    return _pwTimingSafeEq(new Uint8Array(bits), want);
  }
  if (typeof stored === 'string' && /^[0-9a-f]{64}$/i.test(stored)) {
    return _pwTimingSafeEq(_pwEnc.encode(await sha256Hex(pw)), _pwEnc.encode(stored.toLowerCase()));
  }
  return stored === pw;
}
export let _confirmResolve = null;
export function confirmModal(msg, label) {
  if (_confirmResolve) { _confirmResolve(false); _confirmResolve = null; }
  modal(`<div class="p-6"><h3 class="text-lg font-bold mb-3">${escapeHtml(msg)}</h3><div class="flex gap-2 justify-end"><button onclick="closeModal();_confirmResolve&&_confirmResolve(false)" class="px-4 py-2 border dark:border-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="inline-block mr-1 -mt-0.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>Cancel</button><button onclick="_confirmResolve&&_confirmResolve(true);closeModal()" class="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-semibold"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="inline-block mr-1 -mt-0.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>${escapeHtml(label||'Confirm')}</button></div></div>`);
  return new Promise(r => { _confirmResolve = r; });
}

export function parseCSVLine(line) {
  const parts = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { inQuotes = !inQuotes; }
    else if (ch === ',' && !inQuotes) { parts.push(current.trim()); current = ''; }
    else { current += ch; }
  }
  parts.push(current.trim());
  return parts;
}

export function searchData(arr, query, fields) {
  if (!query || !query.trim()) return arr;
  const q = query.toLowerCase().trim();
  return arr.filter(item => fields.some(f => String(item[f] || '').toLowerCase().includes(q)));
}

export function updateLowStockBadge() {
  const badge = document.getElementById('lowStockBadge');
  if (!badge) return;
  const count = (state.inventory || []).filter(i => (i.stock || 0) <= (i.minStock || 5)).length;
  if (count > 0) { badge.textContent = count; badge.classList.remove('hidden'); }
  else badge.classList.add('hidden');
}

export function pushSysNotif(id, text, act = 'dismiss', icon = 'ℹ️') {
  window.__sysNotifs = window.__sysNotifs || [];
  window.__sysNotifs = window.__sysNotifs.filter(n => n.id !== id);
  window.__sysNotifs.push({ id, text, act, icon });
  updateNotifications();
}

export function dismissSysNotif(id) {
  if (!window.__sysNotifs) return;
  window.__sysNotifs = window.__sysNotifs.filter(n => n.id !== id);
  updateNotifications();
}

export function updateNotifications() {
  const badge = document.getElementById('notif-badge');
  const panel = document.getElementById('notif-panel');
  if (!badge) return;
  const overdue = (state.clients || []).filter(c => (c.balance || 0) > 0 && c.dueDate && c.dueDate < today()).length;
  const lowStock = (state.inventory || []).filter(i => (i.stock || 0) <= (i.minStock || 5)).length;
  const recentPOs = (state.purchaseOrders || []).filter(po => po.status === 'Received' && po.receivedAt && new Date(po.receivedAt) > new Date(Date.now() - 86400000)).length;
  const sys = window.__sysNotifs || [];
  const total = overdue + lowStock + recentPOs + sys.length;
  if (total > 0) { badge.textContent = total; badge.classList.remove('hidden'); }
  else badge.classList.add('hidden');
  if (panel) {
    const sysRows = sys.map(n => {
      let btn = '';
      if (n.act === 'download') btn = `<button onclick="window.electronAPI.downloadUpdate();window.dismissSysNotif('${n.id}');if(window.showUpdateProgress)window.showUpdateProgress()" class="ml-auto shrink-0 text-[11px] px-2 py-1 rounded-lg bg-blue-600 text-white hover:bg-blue-700">Download</button>`;
      else if (n.act === 'restart') btn = `<button onclick="window.electronAPI.installUpdate();window.dismissSysNotif('${n.id}')" class="ml-auto shrink-0 text-[11px] px-2 py-1 rounded-lg bg-green-600 text-white hover:bg-green-700">Restart</button>`;
      else btn = `<button onclick="window.dismissSysNotif('${n.id}')" class="ml-auto shrink-0 text-gray-400 hover:text-gray-600" aria-label="Dismiss" title="Dismiss"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>`;
      return `<div class="flex items-center gap-2 text-gray-700 dark:text-gray-300"><span class="shrink-0">${n.icon}</span><span class="min-w-0 break-words">${escapeHtml(n.text)}</span>${btn}</div>`;
    }).join('');
    panel.innerHTML = `<div class="p-3 space-y-2 text-sm">
      <div class="flex justify-between items-center border-b dark:border-gray-700 pb-2"><span class="font-bold">Notifications</span><button onclick="document.getElementById('notif-panel').classList.add('hidden')" class="text-gray-400 hover:text-gray-600"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button></div>
      ${sys.length ? `<div class="border-b dark:border-gray-700 pb-2 space-y-2">${sysRows}</div>` : ''}
      ${overdue > 0 ? `<div class="flex items-center gap-2 text-red-600"><span>⚠️</span><span>${overdue} overdue balances</span></div>` : ''}
      ${lowStock > 0 ? `<div class="flex items-center gap-2 text-orange-600"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="shrink-0"><line x1="16.5" y1="9.4" x2="7.5" y2="4.21"/><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg><span>${lowStock} low stock items</span></div>` : ''}
      ${recentPOs > 0 ? `<div class="flex items-center gap-2 text-green-600"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="shrink-0"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg><span>${recentPOs} POs received today</span></div>` : ''}
      ${total === 0 ? '<div class="text-gray-400 text-center py-4">✓ All good!</div>' : ''}
    </div>`;
  }
}

export function toggleNotifPanel() {
  const panel = document.getElementById('notif-panel');
  if (!panel) return;
  panel.classList.toggle('hidden');
  updateNotifications();
}

export function hasInterestItems(clientId) {
  return (state.transactions || []).some(t => t.clientId === clientId && (t.items || []).some(i => parseFloat(i.intRate) > 0));
}

export function getInterestRate(clientId) {
  const txns = (state.transactions || [])
    .filter(t => t.clientId === clientId)
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  for (const t of txns) {
    const item = (t.items || []).find(i => parseFloat(i.intRate) > 0);
    if (item) return parseFloat(item.intRate);
  }
  return 0;
}

export async function applyDailyInterest() {
  const lastDateSetting = state.settings.find(s => s.key === 'lastInterestDate');
  const lastDate = lastDateSetting?.value || '';
  const todayStr = today();
  if (lastDate === todayStr) return;
  const clients = state.clients.filter(c => (c.balance || 0) > 0 && hasInterestItems(c.id));
  if (clients.length === 0) return;
  let fromDate = lastDate;
  if (!fromDate) {
    await dbAdd('settings', { key: 'lastInterestDate', value: todayStr });
    return;
  }
  const fromTs = new Date(fromDate).getTime();
  const todayTs = new Date(todayStr).getTime();
  if (isNaN(fromTs) || isNaN(todayTs)) return;
  const days = Math.floor((todayTs - fromTs) / 86400000);
  if (days <= 0) return;
  let applied = 0;
  const snapshots = [];
  const ledgerRows = [];
  let nextInt = 1;
  const intNos = (state.transactions || []).filter(t => t.invoiceNo?.startsWith('INT-')).map(t => parseInt(t.invoiceNo.replace('INT-', '')) || 0);
  if (intNos.length > 0) nextInt = Math.max(...intNos) + 1;
  for (const c of clients) {
    const rate = getInterestRate(c.id);
    if (rate <= 0) continue;
    snapshots.push({ id: c.id, balance: c.balance });
    try {
      const interest = parseFloat((c.balance * (rate / 100) * days).toFixed(2));
      if (interest <= 0) continue;
      c.balance = parseFloat((c.balance + interest).toFixed(2));
      await dbPut('clients', c);
      const invoiceNo = 'INT-' + String(nextInt).padStart(5, '0');
      nextInt++;
      const rowId = await dbAdd('transactions', {
        invoiceNo, clientId: c.id, clientName: c.name, date: todayStr, createdAt: now(),
        items: [], subtotal: 0, totalInterest: interest, discount: 0, scDiscount: 0,
        grandTotal: interest, paymentMethod: 'Interest', status: 'interest', balanceAdded: false
      });
      ledgerRows.push(rowId);
      applied++;
    } catch (e) {
      for (const snap of snapshots) {
        const orig = state.clients.find(x => x.id === snap.id);
        if (orig) orig.balance = snap.balance;
      }
      for (const rid of ledgerRows) await dbDel('transactions', rid).catch(() => {});
      state.clients = await dbAll('clients');
      toast('Interest application failed — balances rolled back', 'error');
      return;
    }
  }
  if (lastDateSetting) { lastDateSetting.value = todayStr; await dbPut('settings', lastDateSetting); }
  else { await dbAdd('settings', { key: 'lastInterestDate', value: todayStr }); }
  state.settings = await dbAll('settings');
  state.clients = await dbAll('clients');
  if (applied > 0) {
    state.transactions = await dbAll('transactions');
    await logAudit('interest', `Daily interest applied to ${applied} client(s) over ${days} day(s)`);
    toast(`Interest applied: ${applied} client(s) over ${days} day(s)`, 'info');
    pushSysNotif('interest', `Daily interest applied to ${applied} client(s) over ${days} day(s)`, 'dismiss', '💰');
  }
}

export async function runCloudBackup() {
  if (!window.electronAPI) return;
  const settingsMap = {};
  state.settings.forEach(s => settingsMap[s.key] = s.value);
  const pw = settingsMap['cloudBackupPassword'] || '';
  if (!pw) return;
  const folder = settingsMap['cloudBackupFolder'] || '';
  if (!folder) return;
  const users = state.users.map(u => { const { password, ...rest } = u; return rest; });
  const data = {
    clients: state.clients, transactions: state.transactions,
    payments: state.payments, inventory: state.inventory,
    quickItems: state.quickItems, expenses: state.expenses,
    suppliers: state.suppliers, purchaseOrders: state.purchaseOrders,
    supplierPayments: state.supplierPayments || [],
    notifications: state.notifications,
    auditLogs: state.auditLogs, users,
    settings: state.settings, exportedAt: now()
  };
  const filename = `shop-ledger-ph-backup-${today()}.enc`;
  const result = await window.electronAPI.saveEncryptedBackupToPath(data, pw, filename, folder);
  if (result.success) {
    const existing = state.settings.find(s => s.key === 'lastCloudBackup');
    if (existing) { existing.value = today(); await dbPut('settings', existing); }
    else { await dbAdd('settings', { key: 'lastCloudBackup', value: today() }); }
    state.settings = await dbAll('settings');
    toast('Cloud backup saved', 'success');
    await logAudit('backup', 'Auto cloud backup saved to ' + folder);
    return true;
  }
  return false;
}

export async function checkCloudBackupDue() {
  const settingsMap = {};
  state.settings.forEach(s => settingsMap[s.key] = s.value);
  if (settingsMap['cloudBackupEnabled'] !== 'true') return;
  const folder = settingsMap['cloudBackupFolder'] || '';
  const pw = settingsMap['cloudBackupPassword'] || '';
  if (!folder || !pw) return;
  const lastBackup = settingsMap['lastCloudBackup'] || '';
  const interval = settingsMap['cloudBackupInterval'] || 'daily';
  const todayStr = today();
  if (lastBackup === todayStr) return;
  if (interval === 'daily') { if (await runCloudBackup()) pushSysNotif('backup', 'Auto cloud backup saved', 'dismiss', '☁️'); return; }
  if (interval === 'weekly') {
    const daysSince = Math.floor((new Date(todayStr) - new Date(lastBackup || '2000-01-01')) / 86400000);
    if (daysSince >= 7 && await runCloudBackup()) pushSysNotif('backup', 'Auto cloud backup saved', 'dismiss', '☁️');
    return;
  }
  if (interval === 'monthly') {
    const d = new Date(lastBackup || '2000-01-01');
    if ((d.getMonth() !== new Date().getMonth() || d.getFullYear() !== new Date().getFullYear()) && await runCloudBackup()) pushSysNotif('backup', 'Auto cloud backup saved', 'dismiss', '☁️');
  }
}

export async function sendOverdueReminders() {
  if (!window.electronAPI?.sendSMS) return { sent: 0, failed: 0, total: 0 };
  const settingsMap = {};
  state.settings.forEach(s => settingsMap[s.key] = s.value);
  const apiKey = settingsMap['smsApiKey'] || '';
  if (!apiKey) return { sent: 0, failed: 0, total: 0, error: 'SMS API key not configured in Settings' };
  const overdue = state.clients.filter(c => (c.balance || 0) > 0 && c.dueDate && c.dueDate < today() && c.phone);
  if (overdue.length === 0) return { sent: 0, failed: 0, total: 0 };
  const shopName = settingsMap['shopName'] || 'Shop';
  const targets = overdue.slice(0, 100);
  let sent = 0, failed = 0;
  for (const c of targets) {
    const msg = `Hi ${c.name}, this is a friendly reminder from ${shopName}. Your balance of ${peso(c.balance)} is overdue. Please settle at your earliest convenience. Thank you!`;
    try {
      const r = await window.electronAPI.sendSMS({ apiKey, number: c.phone, message: msg });
      if (r.success) sent++; else failed++;
    } catch (e) { failed++; }
    await new Promise(res => setTimeout(res, 250));
  }
  const existing = state.settings.find(s => s.key === 'lastSmsReminder');
  if (existing) { existing.value = today(); await dbPut('settings', existing); }
  else { await dbAdd('settings', { key: 'lastSmsReminder', value: today() }); }
  state.settings = await dbAll('settings');
  await logAudit('auto-sms', `SMS reminders sent to ${sent} overdue client(s)`);
  if (sent > 0) pushSysNotif('sms', `SMS reminders sent to ${sent} overdue client(s)`, 'dismiss', '📱');
  return { sent, failed, total: targets.length };
}

export async function checkSmsReminderDue() {
  const settingsMap = {};
  state.settings.forEach(s => settingsMap[s.key] = s.value);
  if (settingsMap['smsAutoReminderEnabled'] !== 'true') return;
  if (!settingsMap['smsApiKey']) return;
  const lastRun = settingsMap['lastSmsReminder'] || '';
  const todayStr = today();
  if (lastRun === todayStr) return;
  const freq = settingsMap['smsAutoReminderFreq'] || 'monthly';
  if (freq === 'daily') {
    await sendOverdueReminders();
    return;
  }
  if (freq === 'weekly') {
    if (!lastRun) { await sendOverdueReminders(); return; }
    const daysSince = Math.floor((new Date(todayStr) - new Date(lastRun)) / 86400000);
    if (daysSince >= 7) await sendOverdueReminders();
    return;
  }
  const last = lastRun ? new Date(lastRun) : null;
  const cur = new Date(todayStr);
  if (last && last.getMonth() === cur.getMonth() && last.getFullYear() === cur.getFullYear()) return;
  const day = parseInt(settingsMap['smsAutoReminderDay'] || '1') || 1;
  if (parseInt(todayStr.split('-')[2]) === day) await sendOverdueReminders();
}


// expose top-level bindings as globals (inline onclick handlers and legacy code paths rely on them)
export async function checkUpdatesFromHeader() {
  const btn = document.getElementById('header-update-btn');
  if (!window.electronAPI?.checkUpdate) { toast('Update check only available in the desktop app', 'warning'); return; }
  if (btn) btn.disabled = true;
  try {
    const result = await window.electronAPI.checkUpdate();
    if (!result.success) toast(result.error || 'Update check unavailable', 'warning');
  } catch (err) {
    toast('Update check failed: ' + err.message, 'warning');
  }
  if (btn) btn.disabled = false;
}

export function globalSearch(query) {
  const results = document.getElementById('global-search-results');
  if (!results) return;
  const q = query.trim().toLowerCase();
  if (q.length < 2) { results.classList.add('hidden'); return; }
  if (!window.state) return;
  const hits = [];
  (window.state.inventory || []).forEach(inv => {
    const name = (inv.name || '').toLowerCase();
    const sku = (inv.sku || '').toLowerCase();
    if (name.includes(q) || sku.includes(q)) hits.push({ type: 'Inventory', label: inv.name, sub: `SKU: ${inv.sku || 'N/A'} — ₱${inv.price}`, route: 'inventory' });
  });
  (window.state.clients || []).forEach(cl => {
    const name = (cl.name || '').toLowerCase();
    if (name.includes(q)) hits.push({ type: 'Client', label: cl.name, sub: `Balance: ₱${cl.balance || 0}`, route: 'utang' });
  });
  (window.state.transactions || []).forEach(tx => {
    const name = (tx.clientName || '').toLowerCase();
    const items = (tx.items || []).map(i => i.name).join(', ').toLowerCase();
    if (name.includes(q) || items.includes(q)) hits.push({ type: 'Transaction', label: `${tx.clientName || 'Walk-in'} — ₱${tx.total}`, sub: tx.date, route: 'transactions' });
  });
  (window.state.expenses || []).forEach(ex => {
    const desc = (ex.description || '').toLowerCase();
    const cat = (ex.category || '').toLowerCase();
    if (desc.includes(q) || cat.includes(q)) hits.push({ type: 'Expense', label: ex.description, sub: `₱${ex.amount} — ${ex.category}`, route: 'expenses' });
  });
  (window.state.payments || []).forEach(p => {
    const name = (p.clientName || '').toLowerCase();
    if (name.includes(q)) hits.push({ type: 'Payment', label: `${p.clientName} — ₱${p.amount}`, sub: p.date, route: 'payments' });
  });
  if (hits.length === 0) {
    results.innerHTML = '<div class="p-4 text-center text-gray-400 text-sm">No results found</div>';
  } else {
    results.innerHTML = hits.slice(0, 12).map(h =>
      `<div class="px-4 py-2.5 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer border-b border-gray-100 dark:border-gray-700 last:border-0 transition-colors" onclick="navigate('${h.route}');document.getElementById('global-search-results').classList.add('hidden');document.getElementById('global-search').value='';">
        <div class="flex items-center gap-2">
          <span class="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-300">${h.type}</span>
          <span class="font-medium text-sm">${escapeHtml(h.label)}</span>
        </div>
        <p class="text-xs text-gray-400 mt-0.5 ml-16">${escapeHtml(h.sub)}</p>
      </div>`
    ).join('');
  }
  results.classList.remove('hidden');
}

Object.defineProperties(window, {
  dp: { get: () => dp, configurable: true },
  PAGE_SIZE: { get: () => PAGE_SIZE, configurable: true },
  paginate: { get: () => paginate, configurable: true },
  renderPagination: { get: () => renderPagination, configurable: true },
  renderPagedTable: { get: () => renderPagedTable, configurable: true },
  showItemSuggestions: { get: () => showItemSuggestions, configurable: true },
  clearItemSuggestions: { get: () => clearItemSuggestions, configurable: true },
  selectItemSuggestion: { get: () => selectItemSuggestion, configurable: true },
  startClock: { get: () => startClock, configurable: true },
  updateConnStatus: { get: () => updateConnStatus, configurable: true },
  initConnIndicator: { get: () => initConnIndicator, configurable: true },
  populateYearSelector: { get: () => populateYearSelector, configurable: true },
  changeYear: { get: () => changeYear, configurable: true },
  showAllYearsSummary: { get: () => showAllYearsSummary, configurable: true },
  filterByYear: { get: () => filterByYear, configurable: true },
  lookupItem: { get: () => lookupItem, configurable: true },
  intRateOptions: { get: () => intRateOptions, configurable: true },
  calcInterest: { get: () => calcInterest, configurable: true },
  toast: { get: () => toast, configurable: true },
  _audioCtx: { get: () => _audioCtx, set: (v) => { _audioCtx = v; }, configurable: true },
  playSound: { get: () => playSound, configurable: true },
  animateCount: { get: () => animateCount, configurable: true },
  showSpinner: { get: () => showSpinner, configurable: true },
  confetti: { get: () => confetti, configurable: true },
  modal: { get: () => modal, configurable: true },
  closeModal: { get: () => closeModal, configurable: true },
  toggleSidebar: { get: () => toggleSidebar, configurable: true },
  toggleSidebarCollapse: { get: () => toggleSidebarCollapse, configurable: true },
  toggleTheme: { get: () => toggleTheme, configurable: true },
  showShortcuts: { get: () => showShortcuts, configurable: true },
  focusPageSearch: { get: () => focusPageSearch, configurable: true },
  saveCurrentModal: { get: () => saveCurrentModal, configurable: true },
  validateNumber: { get: () => validateNumber, configurable: true },
  validateRequired: { get: () => validateRequired, configurable: true },
  setFieldError: { get: () => setFieldError, configurable: true },
  requireFields: { get: () => requireFields, configurable: true },
  validatePhone: { get: () => validatePhone, configurable: true },
  debounce: { get: () => debounce, configurable: true },
  escapeHtml: { get: () => escapeHtml, configurable: true },
  dbLoad: { get: () => dbLoad, configurable: true },
  hashPassword: { get: () => hashPassword, configurable: true },
  verifyPassword: { get: () => verifyPassword, configurable: true },
  _confirmResolve: { get: () => _confirmResolve, set: (v) => { _confirmResolve = v; }, configurable: true },
  confirmModal: { get: () => confirmModal, configurable: true },
  parseCSVLine: { get: () => parseCSVLine, configurable: true },
  searchData: { get: () => searchData, configurable: true },
  updateLowStockBadge: { get: () => updateLowStockBadge, configurable: true },
  updateNotifications: { get: () => updateNotifications, configurable: true },
  pushSysNotif: { get: () => pushSysNotif, configurable: true },
  dismissSysNotif: { get: () => dismissSysNotif, configurable: true },
  toggleNotifPanel: { get: () => toggleNotifPanel, configurable: true },
  hasInterestItems: { get: () => hasInterestItems, configurable: true },
  getInterestRate: { get: () => getInterestRate, configurable: true },
  applyDailyInterest: { get: () => applyDailyInterest, configurable: true },
  sendOverdueReminders: { get: () => sendOverdueReminders, configurable: true },
  checkSmsReminderDue: { get: () => checkSmsReminderDue, configurable: true },
  runCloudBackup: { get: () => runCloudBackup, configurable: true },
  checkCloudBackupDue: { get: () => checkCloudBackupDue, configurable: true },
  checkUpdatesFromHeader: { get: () => checkUpdatesFromHeader, configurable: true },
  globalSearch: { get: () => globalSearch, configurable: true }
});
