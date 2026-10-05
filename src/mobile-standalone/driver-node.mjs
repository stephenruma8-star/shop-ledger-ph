// Test-only SQLite driver for the standalone store (node:sqlite).
// Mirrors the driver contract used on-device (Capacitor plugin).
import { DatabaseSync } from 'node:sqlite';

export function makeNodeDriver(path) {
  const db = new DatabaseSync(path || ':memory:');
  const norm = (p) => (p || []).map(v => (v === undefined ? null : v));
  return {
    exec(sql) { db.exec(sql); return Promise.resolve(); },
    run(sql, params) {
      const r = db.prepare(sql).run(...norm(params));
      return Promise.resolve({ lastID: Number(r.lastInsertRowid) || 0, changes: r.changes || 0 });
    },
    get(sql, params) {
      const r = db.prepare(sql).get(...norm(params));
      return Promise.resolve(r === undefined ? undefined : r);
    },
    all(sql, params) {
      return Promise.resolve(db.prepare(sql).all(...norm(params)));
    },
    close() { try { db.close(); } catch { /* already closed */ } }
  };
}
