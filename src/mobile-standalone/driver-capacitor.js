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
  return {
    exec(sql) { return S.execute({ database: DBN, statements: sql }).then(() => ({})); },
    run(sql, params) {
      return S.run({ database: DBN, statement: sql, values: norm(params) }).then(r => ({
        lastID: (r && r.changes && r.changes.lastId) || 0,
        changes: (r && r.changes && r.changes.changes) || 0
      }));
    },
    get(sql, params) {
      return S.query({ database: DBN, statement: sql, values: norm(params) }).then(r => ((r && r.values) || [])[0]);
    },
    all(sql, params) {
      return S.query({ database: DBN, statement: sql, values: norm(params) }).then(r => ((r && r.values) || []));
    }
  };
}
