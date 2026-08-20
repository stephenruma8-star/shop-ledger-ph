// Rotating file logger for the main process.
// Writes to <userData>/logs/shop-ledger.log and rotates at MAX_SIZE bytes per file,
// keeping LOG_KEEP rotated copies (shop-ledger.log.1, .2, ...). No-op until configure()
// is called with a userData path, so early startup frames are buffered.
const path = require('path');
const fs = require('fs');

const MAX_SIZE = 512 * 1024;
const LOG_KEEP = 3;
const LEVELS = { log: 0, info: 0, warn: 1, error: 2 };

let cfg = { dir: null, file: null, buffered: [] };

function lines(level, args) {
  const ts = new Date().toISOString().replace('T', ' ').slice(0, 23);
  return args.map(a => ts + ' [' + (LEVELS[level] >= 2 ? 'ERROR' : LEVELS[level] === 1 ? 'WARN' : 'INFO') + '] ' + str(a)).join('\n') + '\n';
}

function str(v) {
  if (typeof v === 'string') return v;
  try { return JSON.stringify(v); } catch (e) { return String(v); }
}

function write(text) {
  if (!cfg.file) { cfg.buffered.push(text); if (cfg.buffered.length > 200) cfg.buffered.shift(); return; }
  try { fs.appendFileSync(cfg.file, text); } catch (e) { /* disk full etc - never throw from logging */ }
  try {
    const st = fs.statSync(cfg.file);
    if (st.size >= MAX_SIZE) {
      for (let i = LOG_KEEP; i > 1; i--) {
        const from = cfg.file + '.' + (i - 1), to = cfg.file + '.' + i;
        if (fs.existsSync(from)) { try { fs.rmSync(to, { force: true }); fs.renameSync(from, to); } catch (e) {} }
      }
      try { fs.rmSync(cfg.file + '.1', { force: true }); fs.renameSync(cfg.file, cfg.file + '.1'); } catch (e) {}
    }
  } catch (e) {}
}

function configure(userDataPath) {
  if (!userDataPath) return;
  cfg.dir = path.join(userDataPath, 'logs');
  cfg.file = path.join(cfg.dir, 'shop-ledger.log');
  try { fs.mkdirSync(cfg.dir, { recursive: true }); } catch (e) {}
  const pending = cfg.buffered;
  cfg.buffered = [];
  for (const t of pending) write(t);
  write(lines('info', ['logger configured at ' + cfg.file.replace(/\\/g, '/')]));
}

function log(level, ...args) {
  const clean = LEVELS[level] != null ? level : 'info';
  write(lines(clean, args));
}
const info = (...a) => log('info', ...a);
const warn = (...a) => log('warn', ...a);
const error = (...a) => log('error', ...a);

function getLogInfo() {
  if (!cfg.file) return { enabled: false };
  let size = 0, errorCount = 0;
  try {
    size = fs.statSync(cfg.file).size;
    errorCount = fs.readFileSync(cfg.file, 'utf8').split('\n').filter(l => l.includes(' [ERROR]')).length;
  } catch (e) {}
  return { enabled: true, dir: cfg.dir, file: cfg.file, size, errorCount };
}

module.exports = { configure, log, info, warn, error, getLogInfo, MAX_SIZE, LOG_KEEP };