// Preview bundle for browser screenshots: same views + store as the APK,
// but with preview-engine.js (in-memory SQL) and preview-boot.js (demo data)
// instead of the native driver/boot. Output goes to a Temp dir (never
// committed, never shipped):
//   node scripts/build-preview.mjs [--view home]   (prints the file path)
import { readFileSync, writeFileSync, unlinkSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const mob = (...p) => resolve(root, 'src', 'mobile', ...p);
const sa = (...p) => resolve(root, 'src', 'mobile-standalone', ...p);

const MODULES = [
  ['sa', 'store.js'],
  ['sa', 'driver-capacitor.js'],
  ['sa', 'preview-engine.js'],
  ['sa', 'escpos.js'],
  ['sa', 'backup-crypto.js'],
  ['sa', 'backup-ui.js'],
  ['sa', 'standalone-core.js'],
  ['mob', 'pin.js'],
  ['mob', 'display.js'],
  ['mob', 'nav.js'],
  ['mob', 'lang.js'],
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
  ['sa', 'preview-audit.js'],
  ['sa', 'standalone-app.js'],
  ['sa', 'preview-boot.js'],
];

const top = readFileSync(mob('shell-top.html'), 'utf8');
const bottom = readFileSync(mob('shell-bottom.html'), 'utf8');
let js = '';
for (const [dir, f] of MODULES) {
  const src = readFileSync(dir === 'sa' ? sa(f) : mob(f), 'utf8');
  if (src.includes('</script')) throw new Error(f + ' contains a script-closing tag');
  js += '\n// ===== ' + f + ' =====\n' + src.replace(/\s+$/, '') + '\n';
}
const tmpCheck = join(tmpdir(), 'slp-preview-check-' + Date.now() + '.js');
try {
  writeFileSync(tmpCheck, js);
  execFileSync(process.execPath, ['--check', tmpCheck], { stdio: 'pipe' });
} catch (e) {
  try { unlinkSync(tmpCheck); } catch (_) {}
  console.error('preview build FAILED: ' + String((e && e.stderr) || e.message || e).split('\n').slice(0, 4).join('\n'));
  process.exit(1);
}
try { unlinkSync(tmpCheck); } catch (_) {}
const out = top.replace(/\s+$/, '') + '\n' + js + '</script>\n' + bottom.replace(/^\s+/, '');
const outDir = join(tmpdir(), 'opencode', 'slp-preview');
mkdirSync(outDir, { recursive: true });
mkdirSync(join(outDir, 'assets'), { recursive: true });
try {
  const css = readFileSync(resolve(root, 'mobile-app', 'www', 'assets', 'tailwind.css'));
  writeFileSync(join(outDir, 'assets', 'tailwind.css'), css);
} catch (e) { console.error('preview needs mobile-app/www/assets/tailwind.css'); process.exit(1); }
const target = join(outDir, 'preview.html');
writeFileSync(target, out);
console.log(target);
