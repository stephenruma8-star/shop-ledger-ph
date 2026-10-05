// Syncs the legacy LAN phone UI snapshot (src/renderer/mobile.html) under
// mobile-app/www/lan/ for reference. The shipped APK bundle lives at
// mobile-app/www/app/ and is owned by scripts/build-standalone.mjs —
// this script must not touch it.
//   node mobile-app/scripts/sync-phone-ui.mjs [--check]
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const CHECK = process.argv.includes('--check');
const app = (...p) => resolve(root, 'mobile-app', 'www', 'lan', ...p);

const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
const files = [
  ['src/renderer/mobile.html', 'index.html'],
  ['src/renderer/manifest.webmanifest', 'manifest.webmanifest'],
  ['src/renderer/assets/tailwind.css', 'assets/tailwind.css'],
  ['src/renderer/assets/icon.png', 'assets/icon.png'],
];
// The phone page also references these by absolute path (/manifest…,
// /assets/…) which resolves to www/ root in the native shell — mirror them.
const rootMirrors = [
  ['src/renderer/manifest.webmanifest', 'manifest.webmanifest'],
  ['src/renderer/assets/tailwind.css', 'assets/tailwind.css'],
  ['src/renderer/assets/icon.png', 'assets/icon.png'],
  ['src/renderer/assets/pwa-192.png', 'assets/pwa-192.png'],
  ['src/renderer/assets/pwa-512.png', 'assets/pwa-512.png'],
];
const version = { desktopVersion: pkg.version, syncedAt: new Date().toISOString() };

let stale = false;
mkdirSync(app('assets'), { recursive: true });
const www = (...p) => resolve(root, 'mobile-app', 'www', ...p);
mkdirSync(www('assets'), { recursive: true });
function syncFile(from, dest) {
  const src = readFileSync(resolve(root, from));
  if (!existsSync(dest) || !readFileSync(dest).equals(src)) {
    stale = true;
    if (!CHECK) writeFileSync(dest, src);
  }
}
for (const [from, to] of files) syncFile(from, app(to));
for (const [from, to] of rootMirrors) syncFile(from, www(to));
const versionPath = app('version.json');
const versionJson = JSON.stringify(version, null, 2) + '\n';
// syncedAt moves every run by design — staleness is about the desktop
// version the snapshot was taken from, not the timestamp.
let versionStale = true;
try {
  const prev = JSON.parse(readFileSync(versionPath, 'utf8'));
  if (prev && prev.desktopVersion === version.desktopVersion) versionStale = false;
} catch (e) {}
if (versionStale) {
  stale = true;
  if (!CHECK) writeFileSync(versionPath, versionJson);
} else if (!CHECK) {
  writeFileSync(versionPath, versionJson);
}
if (stale && CHECK) {
  console.error('phone UI snapshot STALE: run node mobile-app/scripts/sync-phone-ui.mjs');
  process.exit(1);
}
// Self-guard: every absolute /assets/* or /manifest* reference in the bundled
// page must resolve inside www/, or the native shell serves 404s.
try {
  const page = readFileSync(app('index.html'), 'utf8');
  const missing = [];
  for (const m of page.matchAll(/(?:href|src)="(\/(?:assets\/[^"]+|manifest[^"]*))"/g)) {
    if (!existsSync(www(m[1].slice(1))) && !missing.includes(m[1])) missing.push(m[1]);
  }
  if (missing.length) {
    console.error('snapshot has unresolvable refs in native shell: ' + missing.join(', '));
    process.exit(1);
  }
} catch (e) {
  if (e && e.code === 'ENOENT') { console.error('snapshot incomplete, re-run sync'); process.exit(1); }
  throw e;
}
console.log(stale ? 'phone UI snapshot synced (desktop v' + pkg.version + ')' : 'phone UI snapshot up to date');
