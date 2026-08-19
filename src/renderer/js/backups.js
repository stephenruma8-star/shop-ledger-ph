// Backups modal, Quick Items modal and cloud sync actions.
import { dbAdd, dbAll, dbDel, dbGet, dbPut } from './database.js'
import { closeModal, confirmModal, escapeHtml, modal, toast } from './helpers.js'
import { state } from './state.js'

function formatBytes(n) {
  const v = Number(n) || 0;
  if (v <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(v) / Math.log(1024)), units.length - 1);
  return (v / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1) + ' ' + units[i];
}

function statusBadge(b) {
  if (b.status === 'ok') return '<span class="px-2 py-0.5 rounded-full text-xs bg-green-100 text-green-700">OK</span>';
  if (b.status === 'failed') return '<span class="px-2 py-0.5 rounded-full text-xs bg-red-100 text-red-700">Failed</span>';
  return '<span class="px-2 py-0.5 rounded-full text-xs bg-yellow-100 text-yellow-700">Creating</span>';
}

function actionCell(b) {
  const name = escapeHtml(b.name);
  const retry = `<button onclick="retryLocalBackup('${name}')" class="px-2 py-1 bg-amber-500 text-white rounded text-xs hover:bg-amber-600">Retry</button>`;
  const restore = `<button onclick="restoreLocalBackup('${name}')" class="px-2 py-1 bg-indigo-600 text-white rounded text-xs hover:bg-indigo-700">Restore</button>`;
  const dash = '<span class="text-gray-300 text-xs">—</span>';
  return b.status === 'failed' ? retry : b.status === 'ok' ? restore : dash;
}

export async function openBackupsModal() {
  if (!window.electronAPI?.getLocalBackups) { toast('Backups only available in the desktop app', 'warning'); return; }
  const renderList = async (rows) => rows.length > 0
    ? `<div class="overflow-auto max-h-72 border dark:border-gray-700 rounded-lg"><table class="w-full text-sm"><thead><tr class="bg-gray-50 dark:bg-gray-700 sticky top-0"><th class="p-2 text-left">File</th><th class="p-2 text-left">Date</th><th class="p-2 text-right">Size</th><th class="p-2 text-center">Status</th><th class="p-2 text-center">Actions</th></tr></thead><tbody>${
        rows.map(b => `<tr class="border-b dark:border-gray-700"><td class="p-2 font-mono text-xs">${escapeHtml(b.name)}</td><td class="p-2 text-xs">${escapeHtml(new Date(b.date).toLocaleString())}</td><td class="p-2 text-right text-xs">${formatBytes(b.size)}</td><td class="p-2 text-center">${statusBadge(b)}</td><td class="p-2 text-center">${actionCell(b)}</td></tr>`).join('')
      }</tbody></table></div>`
    : '<p class="text-gray-400 text-sm py-4 text-center">No backups yet — click Back Up Now</p>';
  const res = await window.electronAPI.getLocalBackups();
  const rows = res.success ? res.backups : [];
  modal(`
    <div class="p-6 w-[720px] max-w-[95vw]">
      <div class="flex justify-between items-center mb-4"><h3 class="text-xl font-bold">Backups</h3><button onclick="closeModal()" class="text-gray-400 hover:text-gray-600"><svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button></div>
      <div class="grid grid-cols-2 gap-2 mb-3">
        <div><label class="text-xs text-gray-500 block">Encryption Password <span class="text-gray-400">(optional)</span></label><input id="local-backup-password" type="password" class="w-full px-3 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm" placeholder="Password to protect this backup" /></div>
        <div class="flex items-end gap-2">
          <button onclick="createLocalBackup()" class="flex-1 px-3 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700">Back Up Now</button>
          <button onclick="syncCloudBackups()" class="flex-1 px-3 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">Sync to Cloud</button>
        </div>
      </div>
      <p class="text-xs text-gray-400 mb-2">Snapshots of the live database are saved to the app folder. Sync copies them to your cloud backup folder (Settings → Cloud Backup).</p>
      <div id="backups-list">${await renderList(rows)}</div>
    </div>`);
}

export async function createLocalBackup() {
  if (!window.electronAPI?.createLocalBackup) { toast('Desktop app only', 'warning'); return; }
  const pw = document.getElementById('local-backup-password')?.value || '';
  const btn = document.querySelector('#modal-root button[onclick="createLocalBackup()"]');
  if (btn) { btn.disabled = true; btn.textContent = 'Backing up...'; }
  try {
    const r = await window.electronAPI.createLocalBackup(pw);
    if (r.success) { toast('Backup saved', 'success'); await refreshBackupsList(); }
    else toast('Backup failed: ' + (r.backup?.error || r.error || 'Unknown error'), 'error');
  } catch (e) { toast('Backup failed: ' + e.message, 'error'); }
  if (btn) { btn.disabled = false; btn.textContent = 'Back Up Now'; }
}

export async function retryLocalBackup(name) {
  if (!window.electronAPI?.retryLocalBackup) { toast('Desktop app only', 'warning'); return; }
  const pw = document.getElementById('local-backup-password')?.value || '';
  toast('Retrying backup...', 'info');
  const r = await window.electronAPI.retryLocalBackup(name, pw);
  if (r.success) { toast('Backup retried successfully', 'success'); await refreshBackupsList(); }
  else toast('Retry failed: ' + (r.backup?.error || r.error || 'Unknown error'), 'error');
}

export async function refreshBackupsList() {
  const holder = document.getElementById('backups-list');
  if (!holder) return;
  const res = await window.electronAPI.getLocalBackups();
  const rows = res.success ? res.backups : [];
  holder.innerHTML = rows.length > 0
    ? `<div class="overflow-auto max-h-72 border dark:border-gray-700 rounded-lg"><table class="w-full text-sm"><thead><tr class="bg-gray-50 dark:bg-gray-700 sticky top-0"><th class="p-2 text-left">File</th><th class="p-2 text-left">Date</th><th class="p-2 text-right">Size</th><th class="p-2 text-center">Status</th><th class="p-2 text-center">Actions</th></tr></thead><tbody>${
        rows.map(b => `<tr class="border-b dark:border-gray-700"><td class="p-2 font-mono text-xs">${escapeHtml(b.name)}</td><td class="p-2 text-xs">${escapeHtml(new Date(b.date).toLocaleString())}</td><td class="p-2 text-right text-xs">${formatBytes(b.size)}</td><td class="p-2 text-center">${statusBadge(b)}</td><td class="p-2 text-center">${actionCell(b)}</td></tr>`).join('')
      }</tbody></table></div>`
    : '<p class="text-gray-400 text-sm py-4 text-center">No backups yet — click Back Up Now</p>';
}

export async function restoreLocalBackup(name) {
  if (!window.electronAPI?.restoreLocalBackup) { toast('Desktop app only', 'warning'); return; }
  const ok = await confirmModal(`Restore database from <b>${escapeHtml(name)}</b>?<br><span class="text-xs text-gray-400">The current database is replaced by this snapshot. A safety copy (<code>.prerestore</code>) is kept. The app reloads after restoring.</span>`, 'Restore');
  if (!ok) return;
  const pw = document.getElementById('local-backup-password')?.value || '';
  toast('Restoring backup...', 'info');
  const r = await window.electronAPI.restoreLocalBackup(name, pw);
  if (r.success) {
    toast('Database restored', 'success');
    await refreshBackupsList();
    closeModal();
    setTimeout(() => { try { window.location.reload(); } catch (e) {} }, 800);
    try { window.__app?.loadAll?.(); } catch (e) {}
  } else toast('Restore failed: ' + (r.error || 'Unknown error'), 'error');
}

export async function syncCloudBackups() {
  if (!window.electronAPI?.syncSavedSqliteBackups) { toast('Sync only available in the desktop app', 'warning'); return; }
  toast('Syncing backups to cloud folder...', 'info');
  const r = await window.electronAPI.syncSavedSqliteBackups();
  if (r.success) toast(r.note || `Synced ${r.copied.length} backup(s) to cloud`, 'success');
  else toast('Sync failed: ' + (r.error || 'Cloud backup folder not configured in Settings'), 'error');
}

export async function openQuickItemsModal() {
  const rows = state.quickItems || (state.quickItems = await dbAll('quickItems'));
  modal(`
    <div class="p-6 w-[560px] max-w-[95vw]">
      <div class="flex justify-between items-center mb-4"><h3 class="text-xl font-bold flex items-center gap-2"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-blue-600 shrink-0"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg>Quick Items</h3><button onclick="closeModal()" class="text-gray-400 hover:text-gray-600"><svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button></div>
      <p class="text-xs text-gray-400 mb-3">Quick items are one-tap products used for fast mobile and counter sales.</p>
      <div class="space-y-2 mb-3">${rows.length > 0 ? rows.map(q => `
        <div class="flex items-center gap-2">
          <input class="flex-1 px-2 py-1.5 border dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-sm" value="${escapeHtml(q.name)}" data-qi-id="${q.id}" data-field="name" onblur="saveQuickItemField(this)" />
          <input class="w-24 px-2 py-1.5 border dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-sm" type="number" step="0.01" value="${q.price}" data-qi-id="${q.id}" data-field="price" onblur="saveQuickItemField(this)" />
          <button onclick="deleteQuickItemRow(${q.id})" class="text-red-500 text-sm px-1 hover:text-red-600" title="Delete"><svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="inline-block"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>
        </div>`).join('') : '<p class="text-gray-400 text-sm text-center py-3">No quick items yet — add one below</p>'}</div>
      <div class="flex gap-2">
        <input id="new-qi-name" placeholder="Item name" class="flex-1 px-3 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm" onkeydown="if(event.key==='Enter')addQuickItemRow()" />
        <input id="new-qi-price" type="number" step="0.01" placeholder="Price" class="w-24 px-3 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm" onkeydown="if(event.key==='Enter')addQuickItemRow()" />
        <button onclick="addQuickItemRow()" class="px-3 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">Add</button>
      </div>
    </div>`);
}

export async function addQuickItemRow() {
  const nm = document.getElementById('new-qi-name');
  const pr = document.getElementById('new-qi-price');
  if (!nm || !pr || !nm.value.trim()) { toast('Enter item name', 'warning'); return; }
  await dbAdd('quickItems', { name: nm.value.trim(), price: parseFloat(pr.value) || 0 });
  state.quickItems = await dbAll('quickItems');
  await openQuickItemsModal();
  toast('Quick item added', 'success');
}

export async function deleteQuickItemRow(id) {
  await dbDel('quickItems', id);
  state.quickItems = await dbAll('quickItems');
  await openQuickItemsModal();
}

export async function saveQuickItemField(el) {
  const id = parseInt(el.dataset.qiId);
  const field = el.dataset.field;
  const val = field === 'price' ? (parseFloat(el.value) || 0) : el.value.trim();
  const item = await dbGet('quickItems', id);
  if (item) {
    item[field] = val;
    await dbPut('quickItems', item);
    state.quickItems = await dbAll('quickItems');
  }
}

// expose top-level bindings as globals (inline onclick handlers rely on them)
Object.defineProperties(window, {
  openBackupsModal: { get: () => openBackupsModal, configurable: true },
  createLocalBackup: { get: () => createLocalBackup, configurable: true },
  retryLocalBackup: { get: () => retryLocalBackup, configurable: true },
  restoreLocalBackup: { get: () => restoreLocalBackup, configurable: true },
  refreshBackupsList: { get: () => refreshBackupsList, configurable: true },
  syncCloudBackups: { get: () => syncCloudBackups, configurable: true },
  openQuickItemsModal: { get: () => openQuickItemsModal, configurable: true },
  addQuickItemRow: { get: () => addQuickItemRow, configurable: true },
  deleteQuickItemRow: { get: () => deleteQuickItemRow, configurable: true },
  saveQuickItemField: { get: () => saveQuickItemField, configurable: true }
});