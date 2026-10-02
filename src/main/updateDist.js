// LAN update distribution: after this PC downloads an update, the staged files
// are published under userData/update-dist/<version>/ and served to peer PCs over
// the existing LAN server (public release artifacts — no auth needed, same bytes
// as GitHub). Pure Node (no electron import) so it stays unit-testable.
const fs = require('fs');
const path = require('path');

const YML_NAME = 'lan-latest.yml';

function distRoot(userDataPath) { return path.join(userDataPath, 'update-dist'); }
function distDir(userDataPath, version) { return path.join(distRoot(userDataPath), String(version)); }

function logMsg(logger, level, msg) {
  try { if (logger && typeof logger[level] === 'function') logger[level](msg); } catch (e) {}
}

// Minimal YAML writer for the fixed lan-latest.yml shape (scalars only).
function ymlEscape(s) {
  s = String(s ?? '');
  if (/^[A-Za-z0-9._-]+$/.test(s)) return s;
  return "'" + s.replace(/'/g, "''") + "'";
}
function writeLanYml(dir, info) {
  const L = [];
  L.push(`version: ${ymlEscape(info.version)}`);
  L.push('files:');
  for (const f of info.files || []) {
    L.push(`  - url: ${ymlEscape(f.url)}`);
    L.push(`    sha512: ${ymlEscape(f.sha512)}`);
    L.push(`    size: ${Number(f.size) || 0}`);
  }
  L.push(`path: ${ymlEscape(info.path)}`);
  L.push(`sha512: ${ymlEscape(info.sha512)}`);
  L.push(`releaseDate: ${ymlEscape(info.releaseDate)}`);
  fs.writeFileSync(path.join(dir, YML_NAME), L.join('\n') + '\n');
}

// Strict semver-ish compare for update decisions. Exported: peers use it too.
function cmpVersions(a, b) {
  return cmpVer(a, b);
}
function cmpVer(a, b) {
  const pa = String(a).split('.').map(x => parseInt(x, 10) || 0);
  const pb = String(b).split('.').map(x => parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) < (pb[i] || 0) ? -1 : 1;
  }
  return 0;
}

// Publishes staged update files for LAN peers. stagedFiles: [{src, name}].
// Writes lan-latest.yml from info ({version, files, path, sha512, releaseDate}),
// prunes every other version dir. Never throws: returns {ok, ...} / {ok:false}.
function publishDist(userDataPath, version, stagedFiles, info, logger) {
  try {
    const dir = distDir(userDataPath, version);
    fs.mkdirSync(dir, { recursive: true });
    const names = [];
    for (const f of stagedFiles || []) {
      try {
        if (!f || !f.src || !f.name || !fs.existsSync(f.src)) { logMsg(logger, 'error', 'update-dist: staged file missing: ' + (f && f.name)); continue; }
        fs.copyFileSync(f.src, path.join(dir, path.basename(f.name)));
        names.push(path.basename(f.name));
      } catch (e) { logMsg(logger, 'error', 'update-dist copy failed: ' + e.message); }
    }
    if (!names.length) return { ok: false, error: 'No staged update files to publish' };
    writeLanYml(dir, {
      version,
      files: (info.files || []).filter(f => f && names.includes(f.url)).map(f => ({ url: f.url, sha512: f.sha512, size: f.size })),
      path: info.path,
      sha512: info.sha512,
      releaseDate: info.releaseDate
    });
    pruneDist(userDataPath, version, logger);
    return { ok: true, dir, files: names };
  } catch (e) { return { ok: false, error: e.message }; }
}

function pruneDist(userDataPath, keepVersion, logger) {
  try {
    const root = distRoot(userDataPath);
    if (!fs.existsSync(root)) return 0;
    const dirs = [];
    for (const e of fs.readdirSync(root, { withFileTypes: true })) {
      if (e.isDirectory()) dirs.push(e.name);
    }
    // Keep the published version plus the single newest other one: the
    // previous version stays on disk as a manual-reinstall fallback
    // (update rollback) until two newer updates supersede it.
    const keep = new Set([String(keepVersion)]);
    const others = dirs.filter(d => d !== String(keepVersion)).sort((a, b) => cmpVer(b, a));
    if (others.length) keep.add(others[0]);
    let n = 0;
    for (const name of dirs) {
      if (keep.has(name)) continue;
      try { fs.rmSync(path.join(root, name), { recursive: true, force: true }); n++; }
      catch (err) { logMsg(logger, 'error', 'update-dist prune failed: ' + err.message); }
    }
    return n;
  } catch (e) { return 0; }
}

// What (if anything) this PC can currently serve to peers.
function distInfo(userDataPath) {
  try {
    const root = distRoot(userDataPath);
    if (!fs.existsSync(root)) return { available: false };
    let best = null;
    for (const e of fs.readdirSync(root, { withFileTypes: true })) {
      if (!e.isDirectory()) continue;
      const yml = path.join(root, e.name, YML_NAME);
      if (!fs.existsSync(yml)) continue;
      const m = fs.readFileSync(yml, 'utf8').match(/^version:\s*(.+)$/m);
      const ver = m ? m[1].trim().replace(/^'|'$/g, '') : e.name;
      if (!best || cmpVer(ver, best.version) > 0) best = { version: ver, dir: path.join(root, e.name) };
    }
    if (!best) return { available: false };
    const files = fs.readdirSync(best.dir).filter(f => f !== YML_NAME);
    return { available: files.length > 0, version: best.version, files };
  } catch (e) { return { available: false, error: e.message }; }
}

// Resolves a peer-requested file inside the LATEST dist dir. Null unless the name
// is safe and the file exists — the LAN route serves only these paths.
function resolveDistFile(userDataPath, name) {
  try {
    if (!name || !/^[A-Za-z0-9._-]+$/.test(name)) return null;
    const info = distInfo(userDataPath);
    if (!info.available) return null;
    const fp = path.join(distDir(userDataPath, info.version), name);
    if (!fs.existsSync(fp)) return null;
    return fp;
  } catch (e) { return null; }
}

module.exports = { distRoot, distDir, publishDist, pruneDist, distInfo, writeLanYml, resolveDistFile, cmpVersions, YML_NAME };
