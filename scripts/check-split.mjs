// Split guard: view modules below load lazily via dynamic import in the router,
// so NO eager code may reference their functions (it would crash before the chunk
// loads). Fails the build if a lazy export is touched from eager files.
// Usage: node scripts/check-split.mjs
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname ?? process.cwd(), '..');
const jsDir = resolve(root, 'src', 'renderer', 'js');
const LAZY = ['dashboard', 'utang', 'catalog', 'stocktake', 'suppliers', 'purchaseOrders', 'settings', 'help'];

function exportsOf(mod) {
  const src = readFileSync(resolve(jsDir, mod + '.js'), 'utf8');
  const names = new Set();
  for (const m of src.matchAll(/^export\s+(?:async\s+)?function\s+([A-Za-z0-9_]+)/gm)) names.add(m[1]);
  for (const m of src.matchAll(/^export\s+(?:const|let)\s+([A-Za-z0-9_]+)/gm)) names.add(m[1]);
  for (const m of src.matchAll(/get:\s*\(\)\s*=>\s*([A-Za-z0-9_]+)/g)) names.add(m[1]);
  return [...names];
}

const eagerFiles = [
  ...readdirSync(jsDir).filter(f => f.endsWith('.js') && !LAZY.includes(f.replace(/\.js$/, ''))).map(f => resolve(jsDir, f)),
  resolve(root, 'src', 'renderer', 'index.html'),
];

const ALLOW = new Set([
  // file:export — reviewed dynamic-import bridges (module loaded on demand first)
  'reports.js:dailySalesReport',
]);
let failures = 0;
for (const mod of LAZY) {
  for (const name of exportsOf(mod)) {
    // Skip the module's own globals-block self-mentions by only scanning eager files.
    for (const file of eagerFiles) {
      const base = file.split(/[\\/]/).pop();
      if (ALLOW.has(base + ':' + name)) continue;
      const lines = readFileSync(file, 'utf8').split('\n');
      lines.forEach((ln, i) => {
        // Ignore import lines (static analysis only; dynamic imports reference files, not names).
        if (/^\s*import\b/.test(ln)) return;
        // Bare references crash (unloaded chunk) unless dotted (m.fn() runs on an
        // already-imported namespace) or quoted ('fn' map keys driving dynamic import).
        // Inline handlers live inside template strings: onclick="fn( must still count.
        const bare = new RegExp('(^|[^\\w$.\'\"`])' + name + '(?![\\w])');
        const handler = new RegExp('on(?:click|input|change|keydown|keyup|submit|focus|blur)=["\']' + name + '\\s*\\(');
        if (bare.test(ln) || handler.test(ln)) {
          failures++;
          console.error(`SPLIT VIOLATION: eager ${file.split(/[\\/]/).pop()}:${i + 1} references lazy ${mod}.${name}`);
        }
      });
    }
  }
}
if (failures === 0) console.log('SPLIT OK: no eager references into lazy view modules');
else console.error(`SPLIT FAILED: ${failures} violation(s)`);
process.exit(failures ? 1 : 0);
