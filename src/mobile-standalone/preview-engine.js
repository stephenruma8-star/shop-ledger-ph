// ---------- PREVIEW ENGINE (browser demo only, never shipped) ----------
// In-memory SQL engine implementing exactly the statements store.js uses,
// so the standalone bundle boots in a plain browser with demo data.
// Concatenated AFTER driver-capacitor.js so makeCapacitorDriver here wins.
function makePreviewTables() {
  const tables = {};
  const parseCols = (def) => {
    const cols = [];
    let depth = 0, cur = '';
    for (const ch of def) {
      if (ch === '(') depth++;
      if (ch === ')') depth--;
      if (ch === ',' && depth === 0) { cols.push(cur); cur = ''; }
      else cur += ch;
    }
    if (cur.trim()) cols.push(cur);
    return cols.map(c => c.trim().split(/\s+/)[0].replace(/["'`]/g, '')).filter(Boolean);
  };
  return {
    tables,
    exec(sql) {
      const s = String(sql || '').trim();
      const up = s.toUpperCase();
      if (up === 'BEGIN' || up === 'COMMIT' || up === 'ROLLBACK') return;
      let m = s.match(/CREATE TABLE IF NOT EXISTS (\w+)\s*\(([\s\S]+)\)/i) || s.match(/CREATE TABLE (\w+)\s*\(([\s\S]+)\)/i);
      if (m) {
        if (!tables[m[1]]) tables[m[1]] = { cols: parseCols(m[2]), rows: [], seq: 0 };
        return;
      }
      m = s.match(/ALTER TABLE (\w+) ADD COLUMN (\w+)/i);
      if (m && tables[m[1]] && !tables[m[1]].cols.includes(m[2])) { tables[m[1]].cols.push(m[2]); return; }
      m = s.match(/DELETE FROM (\w+)\s*$/i);
      if (m && tables[m[1]]) { tables[m[1]].rows = []; return; }
      throw new Error('preview-engine: unsupported exec: ' + s.slice(0, 60));
    },
    run(sql, params) {
      const p = (params || []).slice();
      let m = String(sql).match(/INSERT INTO (\w+)\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)/i);
      if (m) {
        const t = tables[m[1]];
        const cols = m[2].split(',').map(c => c.trim());
        // VALUES may mix ? placeholders with SQL literals (e.g. scDiscount 0)
        const toks = [];
        {
          let depth = 0, cur = '';
          for (const ch of m[3]) {
            if (ch === '(') depth++;
            if (ch === ')') depth--;
            if (ch === ',' && depth === 0) { toks.push(cur.trim()); cur = ''; }
            else cur += ch;
          }
          if (cur.trim()) toks.push(cur.trim());
        }
        const lit = (tok) => {
          const q = tok.match(/^'(.*)'$/s);
          if (q) return q[1];
          const n = Number(tok);
          return isNaN(n) ? tok : n;
        };
        let pi = 0;
        const row = {};
        cols.forEach((c, i) => {
          const tok = toks[i];
          row[c] = (tok === '?' ? (pi < p.length ? p[pi++] : null) : lit(tok));
          if (row[c] === undefined) row[c] = null;
        });
        if (!('id' in row) || row.id == null) row.id = ++t.seq;
        else if (row.id > t.seq) t.seq = row.id;
        t.rows.push(row);
        return { lastID: row.id, changes: 1 };
      }
      m = String(sql).match(/UPDATE (\w+) SET (.+?) WHERE id = \?/i);
      if (m) {
        const t = tables[m[1]];
        const sets = m[2].split(',').map(x => x.trim().split('=')[0].trim());
        const id = p[p.length - 1];
        const row = t.rows.find(r => String(r.id) === String(id));
        if (row) sets.forEach((c, i) => { row[c] = p[i]; });
        return { lastID: 0, changes: row ? 1 : 0 };
      }
      m = String(sql).match(/DELETE FROM (\w+) WHERE id = \?/i);
      if (m) {
        const t = tables[m[1]];
        const before = t.rows.length;
        t.rows = t.rows.filter(r => String(r.id) !== String(p[0]));
        return { lastID: 0, changes: before - t.rows.length };
      }
      throw new Error('preview-engine: unsupported run: ' + String(sql).slice(0, 60));
    },
    _where(t, clause, p) {
      let idx = 0;
      const orParts = clause.split(/\s+OR\s+/i);
      return t.rows.filter(row => orParts.some(part => {
        const conds = part.split(/\s+AND\s+/i);
        return conds.every(c => {
          c = c.trim();
          let m = c.match(/(\w+)\s*=\s*\?/);
          if (m) { const v = p[idx++]; return String(row[m[1]] ?? '') === String(v ?? ''); }
          m = c.match(/(\w+)\s+LIKE\s+'([^']*)%'/i);
          if (m) return String(row[m[1]] ?? '').startsWith(m[2]);
          m = c.match(/(\w+)\s*=\s*'([^']*)'/);
          if (m) return String(row[m[1]] ?? '') === m[2];
          throw new Error('preview-engine: bad WHERE: ' + c);
        });
      }));
    },
    _order(rows, spec) {
      if (!spec) return rows;
      const keys = spec.split(',').map(k => {
        const parts = k.trim().split(/\s+/);
        return { col: parts[0], desc: /desc/i.test(parts[1] || '') };
      });
      return rows.slice().sort((a, b) => {
        for (const k of keys) {
          const av = String(a[k.col] ?? ''), bv = String(b[k.col] ?? '');
          if (av !== bv) return (av < bv ? -1 : 1) * (k.desc ? -1 : 1);
        }
        return 0;
      });
    },
    query(isAll, sql, params) {
      const p = (params || []).slice();
      const m = String(sql).match(/SELECT\s+(.+?)\s+FROM\s+(\w+)(?:\s+WHERE\s+(.+?))?(?:\s+ORDER BY\s+(.+?))?(?:\s+LIMIT\s+(\?|\d+))?\s*$/i);
      if (!m) throw new Error('preview-engine: bad SELECT: ' + String(sql).slice(0, 60));
      const t = this.tables[m[2]] || { cols: [], rows: [] };
      let rows = m[3] ? this._where(t, m[3], p) : t.rows.slice();
      rows = this._order(rows, m[4]);
      if (m[5]) {
        const n = m[5] === '?' ? p[p.length - 1] : parseInt(m[5]);
        rows = rows.slice(0, n);
      }
      const cols = m[1].trim();
      if (/^COUNT\(\*\)/i.test(cols)) {
        const alias = (cols.match(/AS\s+(\w+)/i) || [])[1] || 'c';
        return isAll ? [{ [alias]: rows.length }] : { [alias]: rows.length };
      }
      const out = rows.map(r => {
        if (cols === '*') { const o = {}; t.cols.forEach(c => { o[c] = r[c] === undefined ? null : r[c]; }); return o; }
        const o = {};
        cols.split(',').forEach(c => { const k = c.trim().split(/\s+/)[0]; o[k] = r[k] === undefined ? null : r[k]; });
        return o;
      });
      return isAll ? out : out[0];
    },
    get(sql, params) { return Promise.resolve(this.query(false, sql, params)); },
    all(sql, params) { return Promise.resolve(this.query(true, sql, params)); }
  };
}
async function makeCapacitorDriver() {
  const eng = makePreviewTables();
  return {
    exec: (sql) => { eng.exec(sql); return Promise.resolve({}); },
    run: (sql, p) => Promise.resolve(eng.run(sql, p)),
    get: (sql, p) => eng.get(sql, p),
    all: (sql, p) => eng.all(sql, p)
  };
}
