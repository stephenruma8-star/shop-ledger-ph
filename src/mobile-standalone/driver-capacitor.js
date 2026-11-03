// ---------- CAPACITOR SQLITE DRIVER ----------
// Driver for @capacitor-community/sqlite via the raw bridge (no bundler).
// Concatenated into the standalone bundle; nativePlugin() comes from core.
async function makeCapacitorDriver() {
  const S = nativePlugin('CapacitorSQLite');
  if (!S || typeof S.createConnection !== 'function') throw new Error('SQLite plugin missing');
  const DBN = 'shopledger.db';
  try {
    await S.createConnection({ database: DBN, version: 1, encrypted: false, mode: 'no-encryption', readonly: false });
  } catch (e) { /* connection already exists: reuse */ }
  await S.open({ database: DBN, readonly: false });
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
