// Smoke: LAN-distributed update staging (src/main/updateDist.js).
// Covers: publish cycle, distInfo, traversal-safe resolve, prune, version compare.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const dist = require('../src/main/updateDist.js');

let failures = 0;
function check(name, cond) {
  console.log((cond ? 'PASS' : 'FAIL') + ' ' + name);
  if (!cond) failures++;
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'smoke-dist-'));
const fakeStaged = path.join(tmp, 'staged');
fs.mkdirSync(fakeStaged);
const exeBytes = Buffer.from('fake-setup-bytes-' + Date.now());
fs.writeFileSync(path.join(fakeStaged, 'Shop-Ledger-PH-Setup-9.9.9.exe'), exeBytes);

const staged = [{ src: path.join(fakeStaged, 'Shop-Ledger-PH-Setup-9.9.9.exe'), name: 'Shop-Ledger-PH-Setup-9.9.9.exe' }];
const info = {
  version: '9.9.9',
  files: [{ url: 'Shop-Ledger-PH-Setup-9.9.9.exe', sha512: 'abc', size: exeBytes.length }],
  path: 'Shop-Ledger-PH-Setup-9.9.9.exe',
  sha512: 'abc',
  releaseDate: new Date().toISOString()
};
const r = dist.publishDist(tmp, '9.9.9', staged, info);
check('publish ok', r.ok === true);

const di = dist.distInfo(tmp);
check('distInfo available+version', di.available === true && di.version === '9.9.9');
check('distInfo lists staged exe', Array.isArray(di.files) && di.files.includes('Shop-Ledger-PH-Setup-9.9.9.exe'));

const ymlPath = dist.resolveDistFile(tmp, 'lan-latest.yml');
check('resolve yml', typeof ymlPath === 'string' && fs.existsSync(ymlPath));
const yml = fs.readFileSync(ymlPath, 'utf8');
check('yml has version+files', yml.includes('version: 9.9.9') && yml.includes('Shop-Ledger-PH-Setup-9.9.9.exe'));
check('resolve exe copy matches bytes', (() => {
  const p = dist.resolveDistFile(tmp, 'Shop-Ledger-PH-Setup-9.9.9.exe');
  return p && fs.readFileSync(p).equals(exeBytes);
})());

// Traversal / validation
for (const bad of ['../evil.exe', '..\\evil.exe', '/abs.exe', 'sub/dir.exe', '', null, 'a'.repeat(300), 'Sub\\..\\evil.exe']) {
  check('reject ' + JSON.stringify(String(bad)).slice(0, 30), dist.resolveDistFile(tmp, bad) === null);
}
check('missing file null', dist.resolveDistFile(tmp, 'nope.exe') === null);

// Prune: keeps the published version plus the single newest other one as a
// manual-reinstall fallback (update rollback); older ones go.
fs.mkdirSync(path.join(tmp, 'update-dist', '9.9.8'), { recursive: true });
fs.writeFileSync(path.join(tmp, 'update-dist', '9.9.8', 'lan-latest.yml'), 'version: 9.9.8\n');
fs.mkdirSync(path.join(tmp, 'update-dist', '9.9.7'), { recursive: true });
fs.writeFileSync(path.join(tmp, 'update-dist', '9.9.7', 'lan-latest.yml'), 'version: 9.9.7\n');
const pruned = dist.pruneDist(tmp, '9.9.9');
check('prune drops older than previous', pruned === 1 && !fs.existsSync(path.join(tmp, 'update-dist', '9.9.7')));
check('prune keeps current + previous', fs.existsSync(path.join(tmp, 'update-dist', '9.9.9')) && fs.existsSync(path.join(tmp, 'update-dist', '9.9.8')));

// Version compare
check('cmp newer>older', dist.cmpVersions('3.25.0', '3.24.1') > 0);
check('cmp older<newer', dist.cmpVersions('3.24.1', '3.25.0') < 0);
check('cmp equal', dist.cmpVersions('3.24.1', '3.24.1') === 0);
check('cmp short vs long', dist.cmpVersions('3.24', '3.24.1') < 0);
check('cmp garbage safe', dist.cmpVersions('abc', '3.24.1') < 0);

// Bad publish inputs
const rt = dist.publishDist(tmp, '9.9.9', [{ src: staged[0].src, name: '../x.exe' }], info);
check('publish traversal name contained', rt.ok === true
  && !fs.existsSync(path.join(tmp, 'x.exe'))
  && fs.existsSync(path.join(tmp, 'update-dist', '9.9.9', 'x.exe')));
check('publish empty staged fails', dist.publishDist(tmp, '9.9.9', [], info).ok === false);

fs.rmSync(tmp, { recursive: true, force: true });
if (failures) { console.error(failures + ' FAILURES'); process.exit(1); }
console.log('smoke-update-dist OK');
