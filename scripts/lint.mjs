// Lint: syntax-checks all source JS and validates JSON files.
// Usage: node scripts/lint.mjs
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const srcDirs = ['src/renderer/js', 'src/main', 'src/preload'];
const jsonFiles = ['package.json', 'version.json'];

const jsFiles = srcDirs.flatMap(d => {
  const dir = join(root, d);
  if (!statSync(dir, { throwIfNoEntry: false })) return [];
  return readdirSync(dir).filter(f => f.endsWith('.js')).map(f => join(dir, f));
});

let failed = 0;
for (const f of jsFiles) {
  try {
    execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' });
  } catch (e) {
    failed++;
    console.error(`FAIL ${f}\n${e.stderr.toString().split('\n').slice(0, 4).join('\n')}`);
  }
}

for (const f of jsonFiles) {
  const p = join(root, f);
  try {
    const raw = readFileSync(p, 'utf8');
    if (raw.charCodeAt(0) === 0xFEFF) {
      console.error(`FAIL ${f}: UTF-8 BOM present (breaks PostCSS config read)`);
      failed++;
      continue;
    }
    JSON.parse(raw);
  } catch (e) {
    failed++;
    console.error(`FAIL ${f}: ${e.message}`);
  }
}

if (failed > 0) {
  console.error(`lint: ${failed} file(s) failed`);
  process.exit(1);
}
console.log(`lint: OK (${jsFiles.length} JS files, ${jsonFiles.length} JSON files checked)`);
