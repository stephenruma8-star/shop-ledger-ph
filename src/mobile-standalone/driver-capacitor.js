// ---------- CAPACITOR SQLITE DRIVER ----------
// Driver for @capacitor-community/sqlite via the raw bridge (no bundler).
// Concatenated into the standalone bundle; nativePlugin() comes from core.
async function makeCapacitorDriver() {
  const S = nativePlugin('CapacitorSQLite');
  if (!S || typeof S.createConnection !== 'function') throw new Error('SQLite plugin missing');
  const DBN = 'shopledger.db';
  const KEY_NAME = 'slpDbPassphrase';
  // Random 256-bit passphrase for a brand-new encrypted database.
  const newPass = () => {
    try {
      const a = new Uint8Array(32);
      window.crypto.getRandomValues(a);
      let s = '';
      for (let i = 0; i < a.length; i++) s += ('0' + a[i].toString(16)).slice(-2);
      return s;
    } catch (e) { return 'k' + Date.now() + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2); }
  };
  let storedPass = null;
  try { storedPass = localStorage.getItem(KEY_NAME) || null; } catch (e) {}
  const openPlain = async () => {
    await S.createConnection({ database: DBN, version: 1, encrypted: false, mode: 'no-encryption', readonly: false });
    await S.open({ database: DBN, readonly: false });
  };
  const openEnc = async (p) => {
    await S.createConnection({ database: DBN, version: 1, encrypted: true, mode: 'secret', readonly: false });
    if (typeof S.setEncryptionSecret === 'function') await S.setEncryptionSecret({ database: DBN, passphrase: p });
    await S.open({ database: DBN, readonly: false });
  };
  // Wipe a half-created connection/file and start clean in plaintext.
  const resetToPlain = async () => {
    try { await S.closeConnection({ database: DBN, readonly: false }); } catch (e) {}
    try { await S.deleteDatabase({ database: DBN }); } catch (e) {}
    await openPlain();
  };
  if (storedPass) {
    // This install was created encrypted: open it with the stored key.
    try { await openEnc(storedPass); }
    catch (e) {
      try { localStorage.removeItem(KEY_NAME); } catch (e2) {}
      await resetToPlain();
    }
  } else {
    // No key yet. Only ENCRYPT a brand-new database; an existing (plaintext)
    // ledger is opened as-is so no data is ever migrated/lost here.
    let exists = true;
    try { const r = await S.isDatabase({ database: DBN }); exists = !!(r && r.result); } catch (e) { exists = true; }
    if (!exists) {
      const p = newPass();
      try {
        await openEnc(p);
        try { localStorage.setItem(KEY_NAME, p); } catch (e) {}
      } catch (e) {
        await resetToPlain();
      }
    } else {
      await openPlain();
    }
  }
  const norm = (p) => (p || []).map(v => (v === undefined ? null : v));
  // The plugin wraps execute()/run() in its own transaction by default, so an
  // explicit `BEGIN` statement passed to execute() throws ("cannot start a
  // transaction within a transaction"). Route BEGIN/COMMIT/ROLLBACK to the
  // plugin's real transaction API and run everything else un-wrapped.
  const txKind = (sql) => {
    const s = String(sql || '').trim().replace(/;+\s*$/, '').toUpperCase();
    if (s === 'BEGIN' || s === 'BEGIN TRANSACTION') return 'begin';
    if (s === 'COMMIT' || s === 'END' || s === 'END TRANSACTION') return 'commit';
    if (s === 'ROLLBACK' || s === 'ROLLBACK TRANSACTION') return 'rollback';
    return '';
  };
  return {
    exec(sql) {
      const k = txKind(sql);
      if (k === 'begin') return S.beginTransaction({ database: DBN }).then(() => ({}));
      if (k === 'commit') return S.commitTransaction({ database: DBN }).then(() => ({}));
      if (k === 'rollback') return S.rollbackTransaction({ database: DBN }).then(() => ({}));
      return S.execute({ database: DBN, statements: sql, transaction: false, readonly: false, isSQL92: true }).then(() => ({}));
    },
    run(sql, params) {
      return S.run({ database: DBN, statement: sql, values: norm(params), transaction: false, readonly: false }).then(r => ({
        lastID: (r && r.changes && r.changes.lastId) || 0,
        changes: (r && r.changes && r.changes.changes) || 0
      }));
    },
    get(sql, params) {
      return S.query({ database: DBN, statement: sql, values: norm(params) }).then(r => ((r && r.values) || [])[0]);
    },
    all(sql, params) {
      return S.query({ database: DBN, statement: sql, values: norm(params) }).then(r => ((r && r.values) || []));
    },
    beginTransaction() { return S.beginTransaction({ database: DBN }).then(() => ({})); },
    commitTransaction() { return S.commitTransaction({ database: DBN }).then(() => ({})); },
    rollbackTransaction() { return S.rollbackTransaction({ database: DBN }).then(() => ({})); }
  };
}
