// Guards the shared icon set: the phone copy (src/mobile/icons.js) and the
// desktop copy (src/renderer/js/icons.js) must define an IDENTICAL SLP_ICONS,
// or the two apps could show different symbols again.
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
function block(s, name, file) {
  const m = s.match(new RegExp(name + '\\s*=\\s*\\{([\\s\\S]*?)\\n\\};'));
  if (!m) throw new Error(name + ' block not found in ' + file);
  return m[1].replace(/\s+/g, ' ').trim();
}
function icons(file) {
  const s = readFileSync(resolve(root, file), 'utf8');
  return block(s, 'SLP_ICONS', file) + '\n' + block(s, 'SLP_ICON_COLORS', file);
}
const a = icons('src/mobile/icons.js');
const b = icons('src/renderer/js/icons.js');
if (a !== b) {
  console.error('ICON SET DRIFT: src/mobile/icons.js and src/renderer/js/icons.js differ.');
  process.exit(1);
}
console.log('icon set + colours OK (mobile == desktop)');
