// Release automation: creates the GitHub release (if missing), uploads every
// artifact with retries, then VERIFIES all expected assets are present with
// nonzero sizes. An unverified release fails loudly instead of shipping an
// empty release that breaks every client's auto-updater (v3.22.2 incident).
//
// Usage:
//   node scripts/release.mjs [--dry-run] [--notes "text"] [--skip-existing]
// Reads version from package.json and notes from version.json. Artifacts come
// from build/ : Setup exe, portable exe, latest.yml and the Setup blockmap
// (differential updates). Requires `gh` authenticated.
import { execFileSync } from 'node:child_process';
import { existsSync, statSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname ?? process.cwd(), '..');
const args = process.argv.slice(2);
const DRY = args.includes('--dry-run');
const SKIP_EXISTING = !args.includes('--no-skip-existing');
const notesIdx = args.indexOf('--notes');
const notesOverride = notesIdx >= 0 ? args[notesIdx + 1] : null;

function sh(cmd, a, opts = {}) {
  try {
    const out = execFileSync(cmd, a, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts });
    return { ok: true, out: (out || '').trim() };
  } catch (e) {
    return { ok: false, error: (e.stderr || e.message || '').trim().slice(0, 300) };
  }
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
async function retry(fn, label, tries = 4) {
  const waits = [10000, 30000, 60000];
  let last = '';
  for (let i = 0; i < tries; i++) {
    const r = fn();
    if (r.ok) return r;
    last = r.error;
    console.log(`  retry ${i + 1}/${tries} failed for ${label}: ${last.slice(0, 120)}`);
    if (i < tries - 1) await sleep(waits[Math.min(i, waits.length - 1)]);
  }
  return { ok: false, error: last };
}

const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
const version = pkg.version;
let notes = notesOverride;
if (!notes) {
  try { notes = JSON.parse(readFileSync(resolve(root, 'version.json'), 'utf8')).notes || ''; }
  catch (e) { notes = ''; }
}
const tag = 'v' + version;
const files = [
  `Shop-Ledger-PH-Setup-${version}.exe`,
  `Shop-Ledger-PH-${version}-portable.exe`,
  'latest.yml',
  `Shop-Ledger-PH-Setup-${version}.exe.blockmap`,
];

console.log(`release ${tag} (dry-run: ${DRY ? 'yes' : 'no'})`);
const missing = files.filter(f => !existsSync(resolve(root, 'build', f)));
if (missing.length) {
  console.error('missing build artifacts: ' + missing.join(', ') + ' — run npm run build:win first');
  process.exit(1);
}
for (const f of files) {
  const size = statSync(resolve(root, 'build', f)).size;
  console.log(`  artifact: ${f} (${(size / 1048576).toFixed(1)} MB)`);
  if (size === 0) { console.error('empty artifact: ' + f); process.exit(1); }
}
if (DRY) { console.log('dry run ok — no changes made'); process.exit(0); }

// 1 create release if missing
let r = sh('gh', ['release', 'view', tag, '--json', 'name']);
if (!r.ok) {
  console.log('creating release ' + tag);
  r = await retry(() => sh('gh', ['release', 'create', tag, '--title', tag, '--notes', notes || tag]), 'create');
  if (!r.ok) { console.error('cannot create release: ' + r.error); process.exit(1); }
} else {
  console.log('release exists, reusing');
}

// 2 current assets
const listAssets = () => {
  const v = sh('gh', ['release', 'view', tag, '--json', 'assets', '--jq', '.assets[] | "\\(.name) \\(.size)"']);
  const map = {};
  if (v.ok) for (const line of v.out.split('\n')) {
    const m = line.match(/^(.*) (\d+)$/);
    if (m) map[m[1]] = parseInt(m[2], 10);
  }
  return map;
};

// 3 upload with retries, skip byte-identical assets already present
for (const f of files) {
  const localSize = statSync(resolve(root, 'build', f)).size;
  const remote = listAssets()[f];
  if (SKIP_EXISTING && remote === localSize) { console.log(`  skip ${f} (already uploaded, same size)`); continue; }
  console.log(`  upload ${f} ...`);
  const u = await retry(() => sh('gh', ['release', 'upload', tag, resolve(root, 'build', f), '--clobber']), 'upload ' + f, 5);
  if (!u.ok) { console.error('upload failed: ' + f + ' — ' + u.error); process.exit(1); }
  console.log(`  uploaded ${f}`);
}

// 4 verify every expected asset present with matching size
const final = listAssets();
const bad = files.filter(f => final[f] !== statSync(resolve(root, 'build', f)).size);
if (bad.length) {
  console.error('VERIFICATION FAILED, missing or size-mismatched: ' + bad.join(', '));
  process.exit(1);
}
console.log(`release ${tag} verified: ${files.length}/${files.length} assets present`);
