// Packaging smoke: every relative require() in the built main/preload output must
// resolve to a shipped file, and every src/main/*.js module must be present in
// out/main/. Catches forgotten files in electron.vite.config.mjs copy lists
// (which crash the installed app at launch with MODULE_NOT_FOUND).
// Usage: node scripts/smoke-packaging.mjs   (run `npm run build` first)
import { readdirSync, existsSync, readFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';

const root = resolve(import.meta.dirname ?? process.cwd(), '..');
let failures = 0;
function ok(cond, msg) {
  if (cond) console.log('PASS - ' + msg);
  else { failures++; console.error('FAIL - ' + msg); }
}

const outMain = join(root, 'out', 'main');
const outPreload = join(root, 'out', 'preload');
const srcMain = join(root, 'src', 'main');

// 1 every src/main module ships
for (const f of readdirSync(srcMain).filter(f => f.endsWith('.js'))) {
  ok(existsSync(join(outMain, f)), 'ships out/main/' + f);
}

// 2 every relative require in built output resolves
for (const dir of [outMain, outPreload]) {
  let files = [];
  try { files = readdirSync(dir).filter(f => f.endsWith('.js')); } catch (e) {}
  for (const f of files) {
    const src = readFileSync(join(dir, f), 'utf8');
    const re = /require\(['"](\.[^'"]+)['"]\)/g;
    let m;
    const seen = new Set();
    while ((m = re.exec(src))) {
      const req = m[1];
      if (seen.has(req)) continue;
      seen.add(req);
      const candidates = [resolve(dirname(join(dir, f)), req), resolve(dirname(join(dir, f)), req + '.js')];
      ok(candidates.some(p => existsSync(p)), f + ' require(' + req + ') resolves');
    }
  }
}

if (failures === 0) {
  console.log('PACKAGING OK: all main/preload requires resolve, all modules ship');
  process.exit(0);
} else {
  console.error('PACKAGING FAILED: ' + failures + ' unresolved require(s)');
  process.exit(1);
}
