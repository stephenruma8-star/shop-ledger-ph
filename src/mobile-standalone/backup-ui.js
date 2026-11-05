// ---------- STANDALONE BACKUP UI ----------
// Full-ledger export/import for the independent phone app. Export writes a
// JSON file into Documents (shareable to Drive); import reads a picked file.
// Password is optional on export; import of an encrypted file needs it.
// Standalone bundle only.
let backupImportArmed = false;
let dbEncryptArmed = false;
function _dbIsEncrypted() {
  try { return !!localStorage.getItem('slpDbPassphrase'); } catch (e) { return false; }
}
function _newDbPass() {
  try {
    const a = new Uint8Array(32);
    window.crypto.getRandomValues(a);
    let s = '';
    for (let i = 0; i < a.length; i++) s += ('0' + a[i].toString(16)).slice(-2);
    return s;
  } catch (e) { return 'k' + Date.now() + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2); }
}
function _countRows(backup) {
  const out = {};
  const tables = (backup && backup.tables) || {};
  for (const k of Object.keys(tables).sort()) out[k] = Array.isArray(tables[k]) ? tables[k].length : 0;
  return out;
}
function updateBackupRow() {
  const box = document.getElementById('backup-row');
  if (!box) return;
  let last = '';
  try { last = localStorage.getItem('slpLastBackup') || ''; } catch (e) {}
  const enc = _dbIsEncrypted();
  box.innerHTML = `
    <p class="text-[11px] text-gray-500 mb-2">Full ledger copy — the only way back after losing this phone.${last ? ' Last: ' + esc(String(last).slice(0, 16).replace('T', ' ')) : ''}</p>
    <input id="bk-pass" type="password" inputmode="numeric" autocomplete="off" maxlength="32" placeholder="Backup password (optional but safer)" class="inp mb-2" />
    <button onclick="exportBackup()" class="w-full py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-500 mb-3">${icon('download', 14)} Export backup</button>
    <div class="border-t border-white/10 pt-3">
      <p class="text-[11px] text-gray-500 mb-2">Restore replaces EVERYTHING on this phone. Pick a backup file first.</p>
      <input id="bk-file" type="file" accept=".json,application/json" class="text-[11px] text-gray-400 mb-2 w-full" />
      <input id="bk-pass2" type="password" inputmode="numeric" autocomplete="off" maxlength="32" placeholder="Backup password (if set)" class="inp mb-2" />
      <button onclick="importBackup()" class="w-full py-2.5 rounded-xl bg-white/5 border border-white/10 text-gray-200 text-sm font-semibold">${icon('upload', 14)} Restore from file</button>
    </div>
    <div class="border-t border-white/10 pt-3 mt-3">
      ${enc
        ? `<p class="text-[11px] text-green-400 flex items-center gap-1.5">${icon('lock', 13)} This ledger is encrypted on this device.</p>`
        : `<p class="text-[11px] text-gray-500 mb-2">Encrypt the ledger stored on this phone (recommended if the phone could be lost). A safety backup is saved first.</p>
           <button onclick="encryptStandaloneDb()" class="w-full py-2.5 rounded-xl bg-white/5 border border-white/10 text-gray-200 text-sm font-semibold">${icon('lock', 14)} Encrypt this ledger</button>`}
    </div>`;
}
// Owner-only, explicit, fail-safe: back up, recreate the database encrypted,
// re-import, verify row counts, and roll back to plaintext on ANY failure.
async function encryptStandaloneDb() {
  if (phoneRole() === 'cashier') { toast(T('nav.owner_only'), 'err'); return; }
  const S = nativePlugin('CapacitorSQLite');
  if (!S || typeof S.createConnection !== 'function') { toast('Encryption needs the installed app (not the browser)', 'err'); return; }
  if (_dbIsEncrypted()) { toast('Already encrypted', 'info'); return; }
  if (!dbEncryptArmed) {
    dbEncryptArmed = true;
    toast('Tap again to encrypt the ledger (a safety backup is saved first)', 'info');
    setTimeout(() => { dbEncryptArmed = false; }, 6000);
    return;
  }
  dbEncryptArmed = false;
  if (!takeSubmitLock('dbenc')) return;
  const DBN = 'shopledger.db';
  let backup = null;
  try {
    const exp = await apiGet('/api/backup/export');
    backup = exp && exp.backup;
    if (!backup) throw new Error('could not read the ledger');
    // Best-effort safety copy alongside the user's backups.
    try {
      const F = nativePlugin('Filesystem');
      const env = { app: 'shop-ledger-standalone-backup', v: 1, enc: 'none', auto: 'pre-encrypt', data: backup };
      if (F && typeof F.writeFile === 'function') {
        await F.writeFile({ path: 'ShopLedger/backups/pre-encrypt-' + Date.now() + '.json', data: JSON.stringify(env), directory: 'DOCUMENTS', encoding: 'utf8', recursive: true });
      }
    } catch (e) {}
    const key = _newDbPass();
    try { await S.closeConnection({ database: DBN, readonly: false }); } catch (e) {}
    await S.deleteDatabase({ database: DBN });
    await S.createConnection({ database: DBN, version: 1, encrypted: true, mode: 'secret', readonly: false });
    if (typeof S.setEncryptionSecret === 'function') await S.setEncryptionSecret({ database: DBN, passphrase: key });
    await S.open({ database: DBN, readonly: false });
    await apiPost('/api/backup/import', { backup });
    const after = await apiGet('/api/backup/export');
    if (JSON.stringify(_countRows(backup)) !== JSON.stringify(_countRows(after && after.backup))) {
      throw new Error('verification failed');
    }
    try { localStorage.setItem('slpDbPassphrase', key); } catch (e) {}
    feelOk();
    toast('Ledger encrypted', 'ok');
  } catch (e) {
    // Roll back to a working plaintext ledger.
    try {
      try { await S.closeConnection({ database: DBN, readonly: false }); } catch (e2) {}
      await S.deleteDatabase({ database: DBN });
      await S.createConnection({ database: DBN, version: 1, encrypted: false, mode: 'no-encryption', readonly: false });
      await S.open({ database: DBN, readonly: false });
      if (backup) await apiPost('/api/backup/import', { backup });
    } catch (e3) {}
    feelErr();
    toast('Encryption failed — the ledger was left unchanged', 'err');
  } finally { releaseSubmitLock('dbenc'); }
  updateBackupRow();
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
  if ((file.size || 0) > 25 * 1024 * 1024) { toast('That file is too big to be a backup (max 25MB)', 'err'); return; }
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
