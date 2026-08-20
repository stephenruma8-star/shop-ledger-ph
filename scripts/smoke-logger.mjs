// Smoke test for src/main/logger.js: buffered frames flush after configure(),
// lines land in <userData>/logs/shop-ledger.log, rotation kicks in past MAX_SIZE,
// and getLogInfo reports size/error counts. No Electron required.
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const logger = require('../src/main/logger.js');

let passed = 0, failed = 0;
const ok = (cond, name) => { if (cond) { passed++; console.log('  ok ' + name); } else { failed++; console.error('  FAIL ' + name); } };

const dir = mkdtempSync(join(tmpdir(), 'slp-logger-smoke-'));
logger.info('before-configure'); // must be buffered, not lost

ok(logger.getLogInfo().enabled === false, 'getLogInfo reports disabled before configure');

logger.configure(dir);
const file = join(dir, 'logs', 'shop-ledger.log');

ok(require('node:fs').existsSync(file), 'log file created after configure');
let text = readFileSync(file, 'utf8');
ok(text.includes('before-configure'), 'pre-configure frame flushed after configure');
ok(text.includes('logger configured'), 'configure() writes its own line');

logger.info('an info line');
logger.warn('a warn line');
logger.error('an error line');
logger.log('error', 'log() with explicit level');
text = readFileSync(file, 'utf8');
ok(text.includes('[INFO] an info line') && text.includes('[WARN] a warn line') && text.includes('[ERROR] an error line'), 'level tags written correctly');

const info = logger.getLogInfo();
ok(info.enabled === true && info.file === file && info.size > 0, 'getLogInfo reflects real file');
ok(info.errorCount >= 2, 'getLogInfo counts [ERROR] lines');

// rotation: pump enough data past MAX_SIZE (512KB) to force a rollover
const pad = 'x'.repeat(350);
for (let i = 0; i < 1800; i++) logger.info('padding line ' + i + ' ' + pad);
const rotatedExists = require('node:fs').existsSync(file + '.1');
ok(rotatedExists, 'log rotated past size cap (shop-ledger.log.1 exists)');
ok(statSync(file).size <= logger.MAX_SIZE, 'active log stays under MAX_SIZE after rotation');

rmSync(dir, { recursive: true, force: true });
console.log(`\nLogger smoke: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);