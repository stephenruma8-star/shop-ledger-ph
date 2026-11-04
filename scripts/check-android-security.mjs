// Release security gate for the Android APK.
//   - verifies the APK is signed (apksigner) when the SDK is available
//   - fails if the APK declares a permission outside the reviewed allow-list
//   - prints an npm audit summary (informational)
// Skips cleanly (exit 0) when there is no APK or no Android SDK, so it can sit
// in `npm test` and in CI without a toolchain.
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const ALLOW = new Set([
  'android.permission.INTERNET',
  'android.permission.CAMERA',
  'android.permission.FLASHLIGHT',
  'android.permission.ACCESS_COARSE_LOCATION',
  'android.permission.ACCESS_FINE_LOCATION',
  'android.permission.REQUEST_INSTALL_PACKAGES',
  'android.permission.VIBRATE',
  'android.permission.RECEIVE_BOOT_COMPLETED',
  'android.permission.WAKE_LOCK',
  'android.permission.POST_NOTIFICATIONS',
  'android.permission.SCHEDULE_EXACT_ALARM',
  'android.permission.USE_BIOMETRIC',
  'android.permission.USE_FINGERPRINT',
  'android.permission.ACCESS_NETWORK_STATE',
  'ph.shopledger.mobile.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION'
]);

function findApk() {
  if (process.env.APK_PATH && existsSync(process.env.APK_PATH)) return process.env.APK_PATH;
  const candidates = [];
  const bm = resolve(root, 'build', 'mobile');
  if (existsSync(bm)) for (const f of readdirSync(bm)) if (/\.apk$/i.test(f)) candidates.push(join(bm, f));
  const rel = resolve(root, 'mobile-app', 'android', 'app', 'build', 'outputs', 'apk', 'release');
  if (existsSync(rel)) for (const f of readdirSync(rel)) if (/\.apk$/i.test(f)) candidates.push(join(rel, f));
  candidates.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  return candidates[0] || '';
}

function findBuildTool(name) {
  const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
  if (!sdk) return '';
  const bt = join(sdk, 'build-tools');
  if (!existsSync(bt)) return '';
  const vers = readdirSync(bt).sort().reverse();
  for (const v of vers) {
    const p = join(bt, v, name);
    if (existsSync(p)) return p;
  }
  return '';
}
function sh(cmd, args) {
  try {
    return { ok: true, out: execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], shell: process.platform === 'win32' }) };
  } catch (e) {
    return { ok: false, out: (e.stdout || '') + (e.stderr || '') };
  }
}

let failed = false;
const apk = findApk();
if (!apk) {
  console.log('android security: no APK found - skipping (build one to enable this gate)');
} else {
  console.log('android security: checking ' + apk);
  const aapt = findBuildTool(process.platform === 'win32' ? 'aapt.exe' : 'aapt');
  const apksigner = findBuildTool(process.platform === 'win32' ? 'apksigner.bat' : 'apksigner');
  if (!aapt || !apksigner) {
    console.log('android security: Android build-tools not found - skipping signature/permission checks');
  } else {
    // Pass/fail on exit code + a parsed signer certificate; scheme list is best-effort.
    const vc = sh(apksigner, ['verify', '--print-certs', apk]);
    const dn = (vc.out.match(/Signer #1 certificate DN:\s*(.+)/) || [])[1];
    if (!vc.ok || !dn) {
      console.error('FAIL - APK signature did not verify');
      console.error(vc.out.trim());
      failed = true;
    } else {
      const schemes = (sh(apksigner, ['verify', '--verbose', apk]).out.match(/Verified using[^\n]*: true/g) || [])
        .map(s => s.replace(/\s*Verified using /, '').trim());
      console.log('  OK  signed by: ' + dn.trim() + (schemes.length ? ' (' + schemes.join(' | ') + ')' : ''));
    }
    const badging = sh(aapt, ['dump', 'badging', apk]);
    const perms = (badging.out.match(/uses-permission: name='([^']+)'/g) || [])
      .map(l => l.replace(/.*name='/, '').replace(/'$/, ''));
    const unexpected = perms.filter(p => !ALLOW.has(p));
    if (unexpected.length) {
      console.error('FAIL - unexpected permission(s): ' + unexpected.join(', '));
      failed = true;
    } else {
      console.log('  OK  permissions: ' + perms.length + ' declared, all allow-listed');
    }
  }
}

// Informational: dependency advisories (build + runtime).
try {
  const audit = sh(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['audit', '--omit=dev', '--json']);
  const j = JSON.parse(audit.out || '{}');
  const v = (j.metadata && j.metadata.vulnerabilities) || {};
  console.log('  npm audit (prod): ' + JSON.stringify(v));
} catch (e) {
  console.log('  npm audit: skipped');
}

if (failed) { console.error('ANDROID SECURITY: FAILED'); process.exit(1); }
console.log('ANDROID SECURITY: OK');
