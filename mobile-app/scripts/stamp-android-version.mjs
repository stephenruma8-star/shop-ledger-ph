// Stamps the native build with this project's version so the in-app updater
// (and Android itself) can tell releases apart. Run after `npx cap add
// android` and on every version bump:
//   node mobile-app/scripts/stamp-android-version.mjs
// versionCode packs semver as major*1000000 + minor*1000 + patch.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
// Test seams: STAMP_GRADLE points at a scratch build.gradle, STAMP_VERSION
// overrides the package version (used by smoke-mobile-connect.mjs).
const gradle = process.env.STAMP_GRADLE || resolve(root, 'mobile-app', 'android', 'app', 'build.gradle');
if (!existsSync(gradle)) {
  console.log('stamp skipped: no android/ platform yet (run npx cap add android first)');
  process.exit(0);
}
const pkg = process.env.STAMP_VERSION
  ? { version: process.env.STAMP_VERSION }
  : JSON.parse(readFileSync(resolve(root, 'mobile-app', 'package.json'), 'utf8'));
const m = String(pkg.version || '').match(/^(\d+)\.(\d+)\.(\d+)/);
if (!m) throw new Error('bad mobile-app version: ' + pkg.version);
const code = Number(m[1]) * 1000000 + Number(m[2]) * 1000 + Number(m[3]);
let s = readFileSync(gradle, 'utf8');
const before = s;
s = s.replace(/versionCode \d+/, 'versionCode ' + code);
s = s.replace(/versionName "[^"]*"/, 'versionName "' + pkg.version + '"');
if (s === before && !s.includes('versionCode ' + code)) throw new Error('version fields not found in build.gradle');
if (s !== before) writeFileSync(gradle, s);
console.log('android build stamped: versionCode ' + code + ', versionName ' + pkg.version);
