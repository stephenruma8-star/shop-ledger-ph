function toast(msg, type = 'info') {
  const colors = { info: 'bg-blue-600', success: 'bg-green-600', error: 'bg-red-600', warning: 'bg-yellow-600' };
  const c = document.getElementById('toasts');
  const el = document.createElement('div');
  el.className = `${colors[type] || colors.info} text-white px-4 py-3 rounded-lg shadow-lg slide-in text-sm max-w-sm`;
  el.textContent = msg;
  c.appendChild(el);
  if (type === 'error') playSound('error');
  else if (type === 'success') playSound('success');
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; setTimeout(() => el.remove(), 300); }, 3500);
}

// Sound effects
let _audioCtx;
function playSound(type) {
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
    }
  } catch (e) { /* audio not available */ }
}

// Loading spinner
function showSpinner(msg = 'Loading...') {
  const v = document.getElementById('view');
  if (v) v.innerHTML = `<div class="flex items-center justify-center h-64"><div class="text-center"><div class="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div><p class="text-gray-500 text-sm">${escapeHtml(msg)}</p></div></div>`;
}

// Confetti
function confetti() {
  const c = document.createElement('canvas');
  c.className = 'fixed inset-0 pointer-events-none z-[200]';
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

function modal(html) {
  const root = document.getElementById('modal-root');
  root.innerHTML = `<div class="fixed inset-0 bg-black/50 z-50 flex items-start justify-center pt-4 overflow-auto fade-in" onclick="if(event.target===this)closeModal()"><div class="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-[90vw] mx-4 mb-4 slide-in max-h-[95vh] overflow-auto glass-strong" onclick="event.stopPropagation()">${html}</div></div>`;
}

function closeModal() {
  document.getElementById('modal-root').innerHTML = '';
}

function toggleTheme() {
  document.documentElement.classList.toggle('dark');
  localStorage.setItem('theme', document.documentElement.classList.contains('dark') ? 'dark' : 'light');
}

function showShortcuts() {
  modal(`
    <div class="p-6">
      <div class="flex justify-between items-center mb-4"><h3 class="text-xl font-bold">⌨️ Keyboard Shortcuts</h3><button onclick="closeModal()" class="text-gray-400 hover:text-gray-600 text-2xl">&times;</button></div>
      <div class="grid grid-cols-2 gap-2 text-sm">
        <div class="flex justify-between p-2 bg-gray-50 dark:bg-gray-700 rounded"><span>F1</span><span class="text-gray-500">Dashboard</span></div>
        <div class="flex justify-between p-2 bg-gray-50 dark:bg-gray-700 rounded"><span>F2</span><span class="text-gray-500">New Sale</span></div>
        <div class="flex justify-between p-2 bg-gray-50 dark:bg-gray-700 rounded"><span>F3</span><span class="text-gray-500">Record Payment</span></div>
        <div class="flex justify-between p-2 bg-gray-50 dark:bg-gray-700 rounded"><span>F4</span><span class="text-gray-500">Clients</span></div>
        <div class="flex justify-between p-2 bg-gray-50 dark:bg-gray-700 rounded"><span>F5</span><span class="text-gray-500">Inventory</span></div>
        <div class="flex justify-between p-2 bg-gray-50 dark:bg-gray-700 rounded"><span>Ctrl+D</span><span class="text-gray-500">Dashboard</span></div>
        <div class="flex justify-between p-2 bg-gray-50 dark:bg-gray-700 rounded"><span>Ctrl+T</span><span class="text-gray-500">New Transaction</span></div>
        <div class="flex justify-between p-2 bg-gray-50 dark:bg-gray-700 rounded"><span>Ctrl+U</span><span class="text-gray-500">Utang View</span></div>
        <div class="flex justify-between p-2 bg-gray-50 dark:bg-gray-700 rounded"><span>Ctrl+I</span><span class="text-gray-500">Inventory</span></div>
      </div>
    </div>`);
}

function validateNumber(v) { return !isNaN(parseFloat(v)) && isFinite(v) && parseFloat(v) >= 0; }

function validateRequired(v) { return v !== null && v !== undefined && String(v).trim() !== ''; }

function validatePhone(v) { return /^(\+63|0)?\d{10,11}$/.test(String(v).trim()); }

function debounce(fn, ms = 250) { let timer; return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), ms); }; }

function escapeHtml(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
function dbLoad(store) {
  if (state[store] && state[store].length > 0) return Promise.resolve(state[store]);
  return dbAll(store).then(data => { state[store] = data; return data; });
}

async function hashPassword(pw) { const b = new TextEncoder().encode(pw); const h = await crypto.subtle.digest('SHA-256', b); return Array.from(new Uint8Array(h)).map(b => b.toString(16).padStart(2,'0')).join(''); }
let _confirmResolve = null;
function confirmModal(msg, label) {
  _confirmResolve = null;
  modal(`<div class="p-6"><h3 class="text-lg font-bold mb-3">${escapeHtml(msg)}</h3><div class="flex gap-2 justify-end"><button onclick="closeModal();_confirmResolve&&_confirmResolve(false)" class="px-4 py-2 border dark:border-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">Cancel</button><button onclick="closeModal();_confirmResolve&&_confirmResolve(true)" class="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-semibold">${escapeHtml(label||'Confirm')}</button></div></div>`);
  return new Promise(r => { _confirmResolve = r; });
}

function searchData(arr, query, fields) {
  if (!query || !query.trim()) return arr;
  const q = query.toLowerCase().trim();
  return arr.filter(item => fields.some(f => String(item[f] || '').toLowerCase().includes(q)));
}

function updateLowStockBadge() {
  const badge = document.getElementById('lowStockBadge');
  if (!badge) return;
  const count = (state.inventory || []).filter(i => (i.stock || 0) <= (i.minStock || 5)).length;
  if (count > 0) { badge.textContent = count; badge.classList.remove('hidden'); }
  else badge.classList.add('hidden');
}

function updateNotifications() {
  const badge = document.getElementById('notif-badge');
  const panel = document.getElementById('notif-panel');
  if (!badge) return;
  const overdue = (state.clients || []).filter(c => (c.balance || 0) > 0 && c.dueDate && c.dueDate < today()).length;
  const lowStock = (state.inventory || []).filter(i => (i.stock || 0) <= (i.minStock || 5)).length;
  const recentPOs = (state.purchaseOrders || []).filter(po => po.status === 'Received' && po.receivedAt && new Date(po.receivedAt) > new Date(Date.now() - 86400000)).length;
  const total = overdue + lowStock + recentPOs;
  if (total > 0) { badge.textContent = total; badge.classList.remove('hidden'); }
  else badge.classList.add('hidden');
  if (panel) {
    panel.innerHTML = `<div class="p-3 space-y-2 text-sm">
      <div class="flex justify-between items-center border-b dark:border-gray-700 pb-2"><span class="font-bold">Notifications</span><button onclick="document.getElementById('notif-panel').classList.add('hidden')" class="text-xs text-gray-400 hover:text-gray-600">&times;</button></div>
      ${overdue > 0 ? `<div class="flex items-center gap-2 text-red-600"><span>⚠️</span><span>${overdue} overdue utang</span></div>` : ''}
      ${lowStock > 0 ? `<div class="flex items-center gap-2 text-orange-600"><span>📦</span><span>${lowStock} low stock items</span></div>` : ''}
      ${recentPOs > 0 ? `<div class="flex items-center gap-2 text-green-600"><span>📋</span><span>${recentPOs} POs received today</span></div>` : ''}
      ${total === 0 ? '<div class="text-gray-400 text-center py-4">✓ All good!</div>' : ''}
    </div>`;
  }
}

function toggleNotifPanel() {
  const panel = document.getElementById('notif-panel');
  if (!panel) return;
  panel.classList.toggle('hidden');
  updateNotifications();
}

async function applyDailyInterest() {
  const rateSetting = state.settings.find(s => s.key === 'dailyInterestRate');
  const rate = parseFloat(rateSetting?.value) || 0;
  if (rate <= 0) return;
  const lastDateSetting = state.settings.find(s => s.key === 'lastInterestDate');
  const lastDate = lastDateSetting?.value || '';
  const todayStr = today();
  if (lastDate === todayStr) return;
  const clients = state.clients.filter(c => (c.balance || 0) > 0);
  if (clients.length === 0) return;
  let fromDate = lastDate;
  if (!fromDate) {
    await dbAdd('settings', { key: 'lastInterestDate', value: todayStr });
    return;
  }
  const days = Math.floor((new Date(todayStr) - new Date(fromDate)) / 86400000);
  if (days <= 0) return;
  let applied = 0;
  for (const c of clients) {
    const interest = parseFloat((c.balance * (rate / 100) * days).toFixed(2));
    if (interest <= 0) continue;
    c.balance = parseFloat((c.balance + interest).toFixed(2));
    c.interestAccrued = (c.interestAccrued || 0) + interest;
    await dbPut('clients', c);
    applied++;
  }
  if (lastDateSetting) { lastDateSetting.value = todayStr; await dbPut('settings', lastDateSetting); }
  else { await dbAdd('settings', { key: 'lastInterestDate', value: todayStr }); }
  state.settings = await dbAll('settings');
  state.clients = await dbAll('clients');
  if (applied > 0) toast(`Interest applied: ${applied} client(s) over ${days} day(s)`, 'info');
  await logAudit('interest', `Daily interest applied: ${rate}% × ${days} days on ${applied} client(s)`);
}

async function runCloudBackup() {
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
  }
}

async function checkCloudBackupDue() {
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
  if (interval === 'daily') { await runCloudBackup(); return; }
  if (interval === 'weekly') {
    const daysSince = Math.floor((new Date(todayStr) - new Date(lastBackup || '2000-01-01')) / 86400000);
    if (daysSince >= 7) await runCloudBackup();
    return;
  }
  if (interval === 'monthly') {
    const d = new Date(lastBackup || '2000-01-01');
    if (d.getMonth() !== new Date().getMonth() || d.getFullYear() !== new Date().getFullYear()) await runCloudBackup();
  }
}
