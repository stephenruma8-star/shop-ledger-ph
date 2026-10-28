// Guards against the "dead button" class of bug: an inline event handler whose
// value is built with JSON.stringify. JSON.stringify emits double quotes, which
// close a double-quoted onclick early (onclick="fn("INV-1")" -> onclick="fn("),
// so the handler is truncated and the button silently does nothing. Handlers must
// use jsArg() (HTML-safe JSON) instead. Also flags tabs/newlines smuggled into an
// attribute, which browsers treat the same way as a broken handler.
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const jsDir = (...p) => resolve(root, ...p);
const listJs = (dir) => readdirSync(jsDir(dir)).filter(f => f.endsWith('.js')).map(f => join(dir, f));

const files = [
  ...listJs('src/renderer/js'),
  'src/renderer/index.html',
  ...listJs('src/mobile'),
  'src/mobile/shell-top.html',
  'src/mobile/shell-bottom.html',
  ...listJs('src/mobile-standalone'),
];

const ATTRIBUTE = /\son[a-z]+\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
const problems = [];
for (const rel of files) {
  let src;
  try { src = readFileSync(jsDir(rel), 'utf8'); } catch (e) { continue; }
  for (const m of src.matchAll(ATTRIBUTE)) {
    const value = m[1] != null ? m[1] : m[2];
    const line = src.slice(0, m.index).split('\n').length;
    if (value.includes('JSON.stringify(')) {
      problems.push(`${rel}:${line} inline handler builds its argument with JSON.stringify (use jsArg) :: ${value.slice(0, 70)}`);
    }
    if (/\n|\t/.test(value)) {
      problems.push(`${rel}:${line} inline handler contains a raw newline/tab :: ${value.slice(0, 70)}`);
    }
  }
}

if (problems.length) {
  console.error('INLINE HANDLER CHECK FAILED (' + problems.length + '):');
  for (const p of problems) console.error('  - ' + p);
  process.exit(1);
}
console.log('inline handler check OK (' + files.length + ' files)');
