// E2E: publish a fake update -> serve it through the REAL lanApi router ->
// fetch it as a LAN peer would (yml parse, version compare, byte integrity).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const express = require('express');
const dist = require('../src/main/updateDist.js');
const { createLanApiRouter } = require('../src/main/lanApi.js');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sim-dist-'));
const exeBytes = Buffer.from('sim-exe-bytes-' + Date.now());
const staged = path.join(tmp, 'staged.exe');
fs.writeFileSync(staged, exeBytes);
const pub = dist.publishDist(tmp, '9.9.9',
  [{ src: staged, name: 'Shop-Ledger-PH-Setup-9.9.9.exe' }],
  { version: '9.9.9', files: [{ url: 'Shop-Ledger-PH-Setup-9.9.9.exe', sha512: 's', size: exeBytes.length }], path: 'Shop-Ledger-PH-Setup-9.9.9.exe', sha512: 's', releaseDate: new Date().toISOString() });
if (!pub.ok) { console.error('FAIL publish'); process.exit(1); }

const quiet = { info() {}, warn() {}, error() {} };
const app = express();
app.use(createLanApiRouter({ logger: quiet, getUpdateDistFile: (n) => dist.resolveDistFile(tmp, n) }));
const server = app.listen(0, '127.0.0.1', async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  const get = (p) => fetch(base + p, { headers: { Connection: 'close' } });
  let fail = 0;
  const check = (n, c) => { console.log((c ? 'PASS' : 'FAIL') + ' ' + n); if (!c) fail++; };
  try {
    let r = await get('/update-dist/lan-latest.yml');
    check('yml 200', r.status === 200);
    const yml = await r.text();
    const m = yml.match(/^version:\s*(.+)$/m);
    const remote = m ? m[1].trim().replace(/^'|'$/g, '') : null;
    check('yml version 9.9.9', remote === '9.9.9');
    check('peer older -> would update', dist.cmpVersions(remote, '3.24.1') > 0);
    r = await get('/update-dist/Shop-Ledger-PH-Setup-9.9.9.exe');
    check('exe 200', r.status === 200);
    check('exe bytes intact', Buffer.from(await r.arrayBuffer()).equals(exeBytes));
    r = await get('/update-dist/nope.exe');
    check('missing 404', r.status === 404);
    r = await get('/update-dist/%2e%2e/package.json');
    check('traversal not served publicly', r.status !== 200);
    await r.text().catch(() => {});
    r = await get('/update-dist/sub%5c..%5cevil.exe');
    check('backslash traversal 404', r.status === 404);
    await r.text().catch(() => {});
  } catch (e) { console.error('FAIL threw: ' + e.message); fail++; }
  fs.rmSync(tmp, { recursive: true, force: true });
  process.exitCode = fail ? 1 : 0;
  if (!fail) console.log('smoke-lan-dist-e2e OK');
  server.close();
  setTimeout(() => {}, 500).unref();
});
