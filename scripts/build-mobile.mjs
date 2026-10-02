// Assembles the phone app (src/mobile/*) into the single served file
// src/renderer/mobile.html. The phone stays ONE file on purpose: no bundler,
// no extra requests over shop Wi-Fi, same harness, same service worker.
// Edit sources in src/mobile/, then run: node scripts/build-mobile.mjs
// Usage: node scripts/build-mobile.mjs [--check]  (--check fails when stale,
// for CI / npm test)
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const mob = (...p) => resolve(root, 'src', 'mobile', ...p);
const CHECK = process.argv.includes('--check');

const MODULES = [
  'core.js', 'pair.js', 'pwa.js', 'pin.js', 'display.js', 'ptr.js',
  'offline.js', 'nav.js', 'lang.js', 'view-home.js', 'view-clients.js',
  'view-catalog.js', 'view-quick.js', 'view-sale.js', 'view-pay.js',
  'view-inventory.js', 'view-transactions.js', 'view-expenses.js',
  'view-suppliers.js',   'view-po.js', 'view-reports.js', 'view-settings.js', 'view-stocktake.js',
  'view-audit.js', 'view-help.js', 'view-debts.js', 'update.js', 'app.js',
];

const top = readFileSync(mob('shell-top.html'), 'utf8');
const bottom = readFileSync(mob('shell-bottom.html'), 'utf8');
if ((top.match(/<script>/g) || []).length !== 1) throw new Error('shell-top must end with exactly one <script>');
if (bottom.includes('<script')) throw new Error('shell-bottom must not contain scripts');

let js = '';
for (const f of MODULES) {
  const src = readFileSync(mob(f), 'utf8');
  if (src.includes('</script')) throw new Error(f + ' contains a script-closing tag');
  js += '\n// ===== src/mobile/' + f + ' =====\n' + src.replace(/\s+$/, '') + '\n';
}
// Syntax-gate the concatenation before it can ship to phones.
const tmpCheck = join(tmpdir(), 'slp-mobile-check-' + Date.now() + '.js');
try {
  writeFileSync(tmpCheck, js);
  execFileSync(process.execPath, ['--check', tmpCheck], { stdio: 'pipe' });
} catch (e) {
  try { unlinkSync(tmpCheck); } catch (_) {}
  console.error('mobile build FAILED: JS syntax error in src/mobile/*');
  console.error(String((e && e.stderr) || e.message || e).split('\n').slice(0, 6).join('\n'));
  process.exit(1);
}
try { unlinkSync(tmpCheck); } catch (_) {}
const out = top.replace(/\s+$/, '') + '\n' + js + '</script>\n' + bottom.replace(/^\s+/, '');
const target = resolve(root, 'src', 'renderer', 'mobile.html');
const prev = readFileSync(target, 'utf8');
if (prev === out) {
  console.log('mobile build: up to date');
  process.exit(0);
}
if (CHECK) {
  console.error('mobile build STALE: run node scripts/build-mobile.mjs');
  process.exit(1);
}
writeFileSync(target, out);
console.log('mobile build: assembled ' + MODULES.length + ' modules -> src/renderer/mobile.html');
