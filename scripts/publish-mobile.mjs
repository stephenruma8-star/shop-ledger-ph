// Publishes the standalone phone APK two places, every release:
//   1. releases/Shop-Ledger-Mobile-standalone.apk (committed: always latest)
//   2. GitHub prerelease tag mobile-vX.Y.Z (desktop updaters ignore it)
// Usage: GH_TOKEN=<token> node scripts/publish-mobile.mjs <version>
//   e.g. GH_TOKEN=... node scripts/publish-mobile.mjs 4.2.2
// Reads versionCode from mobile-app/android/app/build.gradle for the notes.
import { copyFileSync, readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const version = process.argv[2];
if (!/^(\d+)\.(\d+)\.(\d+)$/.test(version || '')) {
  console.error('usage: node scripts/publish-mobile.mjs <x.y.z>');
  process.exit(1);
}
if (!process.env.GH_TOKEN) {
  console.error('GH_TOKEN is required');
  process.exit(1);
}
const apkName = `Shop-Ledger-Mobile-${version}-standalone.apk`;
const src = resolve(root, 'build', 'mobile', apkName);
if (!existsSync(src)) {
  console.error('missing build artifact: build/mobile/' + apkName + ' — stage the signed APK there first');
  process.exit(1);
}
const dest = resolve(root, 'releases', 'Shop-Ledger-Mobile-standalone.apk');
copyFileSync(src, dest);
console.log('releases/ copy updated (commit it separately)');

const gradle = readFileSync(resolve(root, 'mobile-app', 'android', 'app', 'build.gradle'), 'utf8');
const code = (gradle.match(/versionCode (\d+)/) || [])[1] || '?';
const notes = [
  `Standalone phone POS ${version} (versionCode ${code}) — own on-device ledger, no desktop or Wi-Fi needed.`,
  '',
  'Install over the previous build (same signature: data and PIN carry over).',
  'Starts with an empty ledger; first launch forces a PIN; back up from Settings.',
  'Pre-release so desktop updaters ignore it.',
].join('\n');
const tag = `mobile-v${version}`;
try {
  execFileSync('gh', ['release', 'view', tag], { stdio: 'pipe', env: process.env });
  console.error(tag + ' already exists — upload with: gh release upload ' + tag + ' --clobber ' + src);
  process.exit(2);
} catch (e) { /* not found: create it */ }
execFileSync('gh', ['release', 'create', tag, '--title', `Phone App ${version} (standalone)`,
  '--notes', notes, '--prerelease', '--target', 'main', src],
  { stdio: 'inherit', env: process.env });
console.log('published ' + tag);
