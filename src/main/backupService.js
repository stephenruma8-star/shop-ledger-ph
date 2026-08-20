// Local backup service: snapshots, restore, auto daily snapshots + rotation, DB health.
// Pure Node (no electron import) so it can be smoke-tested; wiring is injected via configure().
const path = require('path');
const fs = require('fs');
const { encryptData, decryptData } = require('./crypto.js');
const dbm = require('./db.js');

let cfg = {
  userDataPath: null,
  backupsDir: null,
  getSettings: async () => null,
  setSetting: async () => { throw new Error('setSetting not wired'); },
  getRendererDump: async () => null,
  notify: () => {}
};

function configure(opts) { cfg = { ...cfg, ...(opts || {}) }; }

function backupsDir() { return cfg.backupsDir; }
function backupsIndexPath() { return path.join(backupsDir(), 'backups.json'); }

function readBackupIndex() {
  try { return JSON.parse(fs.readFileSync(backupsIndexPath(), 'utf8')); } catch (e) { return []; }
}

function writeBackupIndex(list) {
  try {
    fs.mkdirSync(backupsDir(), { recursive: true });
    fs.writeFileSync(backupsIndexPath(), JSON.stringify(list, null, 2));
  } catch (e) { console.error('backup index write failed:', e.message); }
}

function backupFileName() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `backup-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}.bak`;
}

function sqliteReady() {
  try {
    const s = dbm.init(cfg.userDataPath);
    return !!(s && s.ok);
  } catch (e) { return false; }
}

// Writes one backup file at filePath. Returns { size, type, encrypted }.
// SQLite backend -> consistent live snapshot (integrity-checked); otherwise a renderer JSON dump.
async function snapshotFile(filePath, password) {
  let type = 'snapshot';
  let encrypted = false;
  if (sqliteReady()) {
    const s = await dbm.snapshot(filePath);
    if (password) {
      fs.writeFileSync(filePath, JSON.stringify(encryptData(fs.readFileSync(filePath), password)));
      encrypted = true;
    }
    const chk = dbm.integrityCheck();
    if (!chk.ok) throw new Error('Snapshot failed integrity check: ' + (chk.result || chk.error));
    dbm.optimize();
    return { size: s.size, type, encrypted };
  }
  type = 'json';
  const dump = await cfg.getRendererDump();
  const raw = Buffer.from(JSON.stringify(dump), 'utf8');
  if (password) {
    fs.writeFileSync(filePath, JSON.stringify(encryptData(raw, password)));
    encrypted = true;
  } else {
    fs.writeFileSync(filePath, raw);
  }
  return { size: fs.statSync(filePath).size, type, encrypted };
}

async function backupEntry(filePath, password, name, auto) {
  fs.mkdirSync(backupsDir(), { recursive: true });
  const list = readBackupIndex();
  const entry = { name, date: new Date().toISOString(), size: 0, status: 'creating', type: 'snapshot', encrypted: false, auto: !!auto };
  const idx = list.findIndex(b => b.name === name);
  if (idx >= 0) list[idx] = entry;
  else list.push(entry);
  writeBackupIndex(list);
  try {
    const info = await snapshotFile(filePath, password);
    entry.size = info.size;
    entry.type = info.type;
    entry.encrypted = info.encrypted;
    entry.status = 'ok';
  } catch (e) {
    entry.status = 'failed';
    entry.error = e.message;
    try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath); } catch (e2) {}
  }
  writeBackupIndex(list);
  return entry;
}

async function createBackup(password, auto) {
  const list = readBackupIndex();
  let name = backupFileName();
  let i = 2;
  while (list.some(b => b.name === name) || fs.existsSync(path.join(backupsDir(), name))) {
    name = backupFileName() + '-' + String(i++).padStart(2, '0');
  }
  return backupEntry(path.join(backupsDir(), name), password, name, !!auto);
}

async function retryBackup(name, password) {
  const list = readBackupIndex();
  const ex = list.find(b => b.name === name);
  return backupEntry(path.join(backupsDir(), name), password, name, !!(ex && ex.auto));
}

function listBackups() {
  const withSize = readBackupIndex().map(b => {
    const fp = path.join(backupsDir(), b.name);
    let size = b.size || 0;
    try { if (fs.existsSync(fp)) size = fs.statSync(fp).size; } catch (e) {}
    return { ...b, size };
  });
  return { success: true, backups: withSize.reverse() };
}

// Removes the oldest auto snapshots beyond `keep` (manual backups are never pruned).
function pruneAutoSnapshots(keep) {
  const list = readBackupIndex();
  const keepCount = Math.max(1, parseInt(keep, 10) || 14);
  const auto = list.filter(b => b.auto).sort((a, b) => new Date(a.date) - new Date(b.date));
  const excess = auto.slice(0, Math.max(0, auto.length - keepCount));
  if (excess.length === 0) return 0;
  const names = new Set(excess.map(b => b.name));
  writeBackupIndex(list.filter(b => !names.has(b.name)));
  for (const b of excess) {
    try { fs.unlinkSync(path.join(backupsDir(), b.name)); } catch (e) {}
  }
  return excess.length;
}

// One auto snapshot per day (settings autoSnapshotEnabled + snapshotKeepCount).
async function planLocalSnapshot() {
  const m = (await cfg.getSettings()) || {};
  if (m.autoSnapshotEnabled !== 'true') return { planned: false, reason: 'disabled' };
  const todayStr = new Date().toISOString().split('T')[0];
  if (m.lastAutoSnapshot === todayStr) return { planned: false, reason: 'already-today' };
  const entry = await createBackup('', true);
  if (entry.status === 'ok') {
    await cfg.setSetting('lastAutoSnapshot', todayStr);
    const pruned = pruneAutoSnapshots(m.snapshotKeepCount || 14);
    return { planned: true, entry, pruned };
  }
  return { planned: false, reason: 'failed', entry };
}

// Swaps the live database for a snapshot backup (encrypted ones need the password).
async function restoreBackup(name, password) {
  const entry = readBackupIndex().find(b => b.name === name);
  if (!entry) return { success: false, error: 'Backup not found' };
  const filePath = path.join(backupsDir(), name);
  if (!fs.existsSync(filePath)) return { success: false, error: 'Backup file missing' };
  let restorePath = filePath;
  try {
    if (entry.encrypted) {
      if (!password) return { success: false, error: 'This backup is encrypted - enter its password to restore' };
      let dec;
      try { dec = decryptData(JSON.parse(fs.readFileSync(filePath, 'utf8')), password); }
      catch (e) { return { success: false, error: 'Wrong password or corrupted backup' }; }
      restorePath = filePath + '.tmp';
      fs.writeFileSync(restorePath, dec);
    }
    const head = fs.readFileSync(restorePath);
    if (head.slice(0, 16).toString('ascii') !== 'SQLite format 3\u0000') return { success: false, error: 'Not a valid database snapshot' };
    const r = dbm.replaceWith(restorePath);
    if (!r.ok) return { success: false, error: r.error };
    cfg.notify({ source: 'app', kind: 'restore', backup: name });
    return { success: true, info: r };
  } catch (e) { return { success: false, error: e.message }; }
  finally {
    if (restorePath !== filePath) { try { fs.unlinkSync(restorePath); } catch (e) {} }
  }
}

// Copies every local backup into the configured cloud backup folder.
async function syncSavedSqliteBackups() {
  const m = (await cfg.getSettings()) || {};
  const folder = m.cloudBackupFolder || '';
  if (!folder) return { success: false, error: 'Cloud backup folder not configured in Settings' };
  fs.mkdirSync(folder, { recursive: true });
  const copied = [];
  const failed = [];
  for (const b of readBackupIndex()) {
    const src = path.join(backupsDir(), b.name);
    if (!fs.existsSync(src)) continue;
    try { fs.copyFileSync(src, path.join(folder, b.name)); copied.push(b.name); }
    catch (e) { failed.push(b.name); }
  }
  if (copied.length === 0 && failed.length === 0) return { success: true, copied, failed, note: 'No local backups to sync' };
  return { success: failed.length === 0, copied, failed };
}

// Imports a { store: [records...] } JSON dump (or a legacy encrypted backup of one) into
// the live database, replacing all stores. The current DB is kept as .prerestore.
async function importJsonBackup({ filePath, password }) {
  let raw;
  try { raw = fs.readFileSync(filePath, 'utf8'); } catch (e) { return { success: false, error: 'Cannot read file: ' + e.message }; }
  let parsed;
  try { parsed = JSON.parse(raw); } catch (e) { return { success: false, error: 'Not a valid JSON backup file' }; }
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && typeof parsed.data === 'string' && (parsed.salt || parsed.iv)) {
    if (!password) return { success: false, error: 'This backup is encrypted - enter its password to import' };
    try { parsed = JSON.parse(decryptData(parsed, password).toString('utf8')); }
    catch (e) { return { success: false, error: 'Wrong password or corrupted backup' }; }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || !Object.values(parsed).some(Array.isArray)) {
    return { success: false, error: 'Not a backup dump (expected { store: [records...] })' };
  }
  const r = dbm.replaceFromDump(parsed);
  if (!r.ok) return { success: false, error: r.error };
  cfg.notify({ source: 'app', kind: 'import', file: path.basename(filePath) });
  return { success: true, counts: r.counts };
}

// Database health + maintenance: status / integrity / compact (VACUUM).
function dbHealth(action) {
  const info = dbm.init(cfg.userDataPath);
  if (!info.ok) return { success: false, backend: 'indexeddb', error: info.error || 'SQLite unavailable' };
  const out = { success: true, backend: 'sqlite' };
  const st = dbm.stats();
  const list = readBackupIndex();
  const details = {
    backend: 'sqlite',
    sqlitePath: (st.ok && st.path) || info.path || '',
    dbSizeBytes: (st.ok && st.size) || info.size || 0,
    tableCount: 0,
    schemaVersion: dbm.schemaVersion(),
    lastSnapshot: null,
    snapshotCount: list.length,
    counts: {}
  };
  if (st.ok) {
    details.tableCount = Object.keys(st.counts).length;
    details.counts = st.counts;
  }
  const lastOk = [...list].reverse().find(b => b.status === 'ok');
  if (lastOk) details.lastSnapshot = lastOk.name;
  if (action === 'status' || action === 'integrity') {
    const chk = dbm.integrityCheck();
    details.integrityOk = chk.ok;
    details.integrityResult = chk.ok ? 'ok' : (chk.result || chk.error);
    details.lastIntegrityCheck = new Date().toISOString();
  }
  if (action === 'compact') {
    const v = dbm.vacuum();
    details.compacted = v.ok;
    if (v.ok) details.dbSizeBytes = v.size;
    else details.error = v.error;
  }
  out.details = details;
  return out;
}

module.exports = { configure, createBackup, retryBackup, listBackups, pruneAutoSnapshots, planLocalSnapshot, restoreBackup, importJsonBackup, syncSavedSqliteBackups, dbHealth, readBackupIndex };
