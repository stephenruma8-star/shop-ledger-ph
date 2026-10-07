// Assembles the STANDALONE phone app into mobile-app/www/app/index.html.
// Same single-file approach as build-mobile.mjs, but the bundle is fully
// local-first: store.js (on-device SQLite) + standalone-core.js (local API
// shim) replace the LAN client (core/pair/pwa/ptr/offline/update/app).
// Edit sources in src/mobile/ (views) or src/mobile-standalone/, then run:
//   node scripts/build-standalone.mjs [--check]
import { readFileSync, writeFileSync, unlinkSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const mob = (...p) => resolve(root, 'src', 'mobile', ...p);
const sa = (...p) => resolve(root, 'src', 'mobile-standalone', ...p);
const CHECK = process.argv.includes('--check');

const STANDALONE_MODULES = [
  ['sa', 'store.js'],
  ['sa', 'driver-capacitor.js'],
  ['sa', 'escpos.js'],
  ['sa', 'backup-crypto.js'],
  ['sa', 'backup-ui.js'],
  ['sa', 'standalone-core.js'],
  ['mob', 'pin.js'],
  ['mob', 'display.js'],
  ['mob', 'nav.js'],
  ['mob', 'lang.js'],
  ['mob', 'weather.js'],
  ['mob', 'debt-form.js'],
  ['mob', 'view-home.js'],
  ['mob', 'view-clients.js'],
  ['mob', 'view-catalog.js'],
  ['mob', 'view-quick.js'],
  ['mob', 'view-sale.js'],
  ['mob', 'view-pay.js'],
  ['mob', 'view-inventory.js'],
  ['mob', 'view-transactions.js'],
  ['mob', 'view-expenses.js'],
  ['mob', 'view-suppliers.js'],
  ['mob', 'view-po.js'],
  ['mob', 'view-reports.js'],
  ['mob', 'view-settings.js'],
  ['mob', 'view-stocktake.js'],
  ['mob', 'view-audit.js'],
  ['mob', 'view-help.js'],
  ['mob', 'view-debts.js'],
  ['sa', 'standalone-app.js'],
];

const top = readFileSync(mob('shell-top.html'), 'utf8');
const bottom = readFileSync(mob('shell-bottom.html'), 'utf8');
if ((top.match(/<script>/g) || []).length !== 1) throw new Error('shell-top must end with exactly one <script>');
if (bottom.includes('<script')) throw new Error('shell-bottom must not contain scripts');

let js = '';
for (const [dir, f] of STANDALONE_MODULES) {
  const src = readFileSync(dir === 'sa' ? sa(f) : mob(f), 'utf8');
  if (src.includes('</script')) throw new Error(f + ' contains a script-closing tag');
  if (/^\s*(import|export)\s/m.test(src)) throw new Error(f + ' must be concatenation-safe (no import/export)');
  js += '\n// ===== ' + (dir === 'sa' ? 'src/mobile-standalone/' : 'src/mobile/') + f + ' =====\n' + src.replace(/\s+$/, '') + '\n';
}
const tmpCheck = tmpdir() + '/slp-standalone-check-' + Date.now() + '.js';
try {
  writeFileSync(tmpCheck, js);
  execFileSync(process.execPath, ['--check', tmpCheck], { stdio: 'pipe' });
} catch (e) {
  try { unlinkSync(tmpCheck); } catch (_) {}
  console.error('standalone build FAILED: JS syntax error');
  console.error(String((e && e.stderr) || e.message || e).split('\n').slice(0, 6).join('\n'));
  process.exit(1);
}
try { unlinkSync(tmpCheck); } catch (_) {}
const out = top.replace(/\s+$/, '') + '\n' + js + '</script>\n' + bottom.replace(/^\s+/, '');
const target = resolve(root, 'mobile-app', 'www', 'app', 'index.html');
const prev = readFileSync(target, 'utf8');
const redirect = '<!DOCTYPE html><html><head><meta charset="UTF-8" /><meta http-equiv="refresh" content="0; url=app/" /><title>Shop Ledger PH</title></head><body><script>window.location.replace("app/");</script></body></html>';
const wwwIndex = resolve(root, 'mobile-app', 'www', 'index.html');
const prevIdx = readFileSync(wwwIndex, 'utf8');
if (prev === out && prevIdx === redirect) {
  console.log('standalone build: up to date');
  process.exit(0);
}
if (CHECK) {
  console.error('standalone build STALE: run node scripts/build-standalone.mjs');
  process.exit(1);
}
mkdirSync(resolve(root, 'mobile-app', 'www', 'app'), { recursive: true });
writeFileSync(target, out);
writeFileSync(wwwIndex, redirect);
console.log('standalone build: assembled ' + STANDALONE_MODULES.length + ' modules -> mobile-app/www/app/index.html');
