// ---------- STANDALONE BACKUP UI ----------
// Full-ledger export/import for the independent phone app. Export writes a
// JSON file into Documents (shareable to Drive); import reads a picked file.
// Password is optional on export; import of an encrypted file needs it.
// Standalone bundle only.
let backupImportArmed = false;
function updateBackupRow() {
  const box = document.getElementById('backup-row');
  if (!box) return;
  let last = '';
  try { last = localStorage.getItem('slpLastBackup') || ''; } catch (e) {}
  box.innerHTML = `
    <p class="text-[11px] text-gray-500 mb-2">Full ledger copy — the only way back after losing this phone.${last ? ' Last: ' + esc(String(last).slice(0, 16).replace('T', ' ')) : ''}</p>
    <input id="bk-pass" type="password" inputmode="numeric" autocomplete="off" maxlength="32" placeholder="Backup password (optional but safer)" class="inp mb-2" />
    <button onclick="exportBackup()" class="w-full py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-500 mb-3">⬇ Export backup</button>
    <div class="border-t border-white/10 pt-3">
      <p class="text-[11px] text-gray-500 mb-2">Restore replaces EVERYTHING on this phone. Pick a backup file first.</p>
      <input id="bk-file" type="file" accept=".json,application/json" class="text-[11px] text-gray-400 mb-2 w-full" />
      <input id="bk-pass2" type="password" inputmode="numeric" autocomplete="off" maxlength="32" placeholder="Backup password (if set)" class="inp mb-2" />
      <button onclick="importBackup()" class="w-full py-2.5 rounded-xl bg-white/5 border border-white/10 text-gray-200 text-sm font-semibold">⬆ Restore from file</button>
    </div>`;
}
function _backupFileName() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return 'shop-ledger-backup-' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes()) + '.json';
}
async function exportBackup() {
  if (!takeSubmitLock('bkexp')) return;
  try {
    const pw = ((document.getElementById('bk-pass') || {}).value || '');
    const r = await apiGet('/api/backup/export');
    if (!r || !r.backup) throw new Error('empty backup');
    const envelope = pw ? await backupEncrypt(JSON.stringify(r.backup), pw)
      : { app: 'shop-ledger-standalone-backup', v: 1, enc: 'none', data: r.backup };
    const text = JSON.stringify(envelope);
    const name = _backupFileName();
    let uri = '';
    try {
      const F = nativePlugin('Filesystem');
      if (!F || typeof F.writeFile !== 'function') throw new Error('no fs');
      const w = await F.writeFile({ path: 'ShopLedger/backups/' + name, data: text, directory: 'DOCUMENTS', encoding: 'utf8', recursive: true });
      uri = (w && w.uri) || '';
    } catch (e) { toast('Could not save file: ' + (e && e.message), 'err'); return; }
    try { localStorage.setItem('slpLastBackup', new Date().toISOString()); } catch (e) {}
    updateBackupRow();
    feelOk();
    // Offer the share sheet (Drive, Bluetooth, messenger) with the file.
    try {
      const S = nativePlugin('Share');
      if (uri && S && typeof S.share === 'function') {
        await S.share({ title: 'Shop Ledger backup', text: 'Shop Ledger backup ' + name + (pw ? ' (password protected)' : ' (NOT password protected)'), files: [uri], dialogTitle: 'Save backup copy' });
        toast('Backup saved + shared', 'ok');
        return;
      }
    } catch (e) {}
    toast('Backup saved to Documents/ShopLedger/backups/' + name, 'ok');
  } catch (e) { feelErr(); toast('Export failed: ' + (e && e.message), 'err'); }
  finally { releaseSubmitLock('bkexp'); }
}
async function importBackup() {
  const inp = document.getElementById('bk-file');
  const file = inp && inp.files && inp.files[0];
  if (!file) { toast('Pick a backup file first', 'err'); return; }
  if (!backupImportArmed) {
    backupImportArmed = true;
    toast('Tap Restore again to REPLACE everything with this file', 'info');
    setTimeout(() => { backupImportArmed = false; }, 6000);
    return;
  }
  backupImportArmed = false;
  if (!takeSubmitLock('bkimp')) return;
  try {
    const text = await file.text();
    let obj;
    try { obj = JSON.parse(text); } catch (e) { throw new Error('Not a backup file'); }
    let inner;
    if (obj && obj.enc === 'none' && obj.data) inner = obj.data;
    else {
      const pw = ((document.getElementById('bk-pass2') || {}).value || '');
      inner = JSON.parse(await backupDecrypt(obj, pw));
    }
    const r = await apiPost('/api/backup/import', { backup: inner });
    const n = r && r.counts ? Object.values(r.counts).reduce((s, x) => s + (x || 0), 0) : 0;
    try { if (inp) inp.value = ''; } catch (e) {}
    feelSale();
    toast('Restored ' + n + ' records — verify your totals', 'ok');
    await refreshAll();
  } catch (e) { feelErr(); toast('Restore failed: ' + (e && e.message), 'err'); }
  finally { releaseSubmitLock('bkimp'); }
}
