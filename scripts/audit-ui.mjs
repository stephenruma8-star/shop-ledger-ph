// Cross-checks the renderer and phone sources for references that would fail
// at runtime: inline handlers with no global, missing i18n keys, phone API
// calls with no route, and duplicate globals in the concatenated phone bundle.
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(resolve(root, rel), 'utf8');
const lineOf = (src, idx) => src.slice(0, idx).split('\n').length;

const problems = [];
const notes = [];
const add = (list, msg) => list.push(msg);

const KEYWORDS = new Set(['if', 'for', 'while', 'switch', 'catch', 'function', 'return', 'typeof', 'new', 'await', 'async', 'void', 'delete', 'in', 'of', 'do', 'else', 'try', 'finally', 'throw', 'case', 'yield', 'instanceof']);
const BUILTINS = new Set([
  'document', 'window', 'globalThis', 'event', 'localStorage', 'sessionStorage', 'navigator', 'location', 'history', 'screen',
  'console', 'alert', 'confirm', 'prompt', 'fetch', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval',
  'requestAnimationFrame', 'cancelAnimationFrame', 'queueMicrotask', 'structuredClone',
  'Number', 'String', 'Boolean', 'Array', 'Object', 'JSON', 'Math', 'Date', 'RegExp', 'Error', 'Promise', 'Map', 'Set',
  'parseInt', 'parseFloat', 'isNaN', 'isFinite', 'encodeURI', 'decodeURI', 'encodeURIComponent', 'decodeURIComponent',
  'btoa', 'atob', 'Intl', 'BigInt', 'Symbol', 'Proxy', 'Reflect', 'URL', 'URLSearchParams', 'Blob', 'File', 'FileReader',
  'Image', 'Audio', 'AbortController', 'TextEncoder', 'TextDecoder', 'MutationObserver', 'IntersectionObserver', 'ResizeObserver',
  'XLSX', 'Chart', 'JsBarcode', 'BarcodeDetector', 'Capacitor', 'QRCode', 'html2canvas', 'ChartDataLabels'
]);

function skipQuoted(s, i) {
  const q = s[i];
  i++;
  while (i < s.length && s[i] !== q) {
    if (s[i] === '\\') i++;
    i++;
  }
  return i + 1;
}

function regexStart(s, i) {
  let j = i - 1;
  while (j >= 0 && /\s/.test(s[j])) j--;
  if (j < 0) return true;
  if ('([{,;:=!&|?+-*%<>'.includes(s[j])) return true;
  let k = j;
  while (k >= 0 && /[A-Za-z_$]/.test(s[k])) k--;
  return /^(return|typeof|case|delete|void|in|of|instanceof|new|else|do|yield|await)$/.test(s.slice(k + 1, j + 1));
}

function skipRegex(s, i) {
  i++;
  let inClass = false;
  while (i < s.length) {
    const c = s[i];
    if (c === '\\') { i += 2; continue; }
    if (c === '[') { inClass = true; i++; continue; }
    if (c === ']') { inClass = false; i++; continue; }
    if (c === '/' && !inClass) {
      i++;
      while (i < s.length && /[a-z]/i.test(s[i])) i++;
      return i;
    }
    if (c === '\n') return i;
    i++;
  }
  return i;
}

function skipTemplate(s, i) {
  i++;
  while (i < s.length) {
    if (s[i] === '\\') { i += 2; continue; }
    if (s[i] === '`') return i + 1;
    if (s[i] === '$' && s[i + 1] === '{') {
      let depth = 0;
      while (i < s.length) {
        const c = s[i];
        if (c === '{') depth++;
        else if (c === '}') { depth--; if (!depth) { i++; break; } }
        else if (c === '"' || c === "'") { i = skipQuoted(s, i); continue; }
        else if (c === '`') { i = skipTemplate(s, i); continue; }
        else if (c === '/' && s[i + 1] === '/') { while (i < s.length && s[i] !== '\n') i++; continue; }
        else if (c === '/' && s[i + 1] === '*') { const e = s.indexOf('*/', i); i = e < 0 ? s.length : e + 2; continue; }
        else if (c === '/' && regexStart(s, i)) { i = skipRegex(s, i); continue; }
        i++;
      }
      continue;
    }
    i++;
  }
  return i;
}

function objectBlock(s, start) {
  let i = start, depth = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (!depth) return s.slice(start, i + 1); }
    else if (c === '"' || c === "'") { i = skipQuoted(s, i); continue; }
    else if (c === '`') { i = skipTemplate(s, i); continue; }
    else if (c === '/' && s[i + 1] === '/') { while (i < s.length && s[i] !== '\n') i++; continue; }
    else if (c === '/' && s[i + 1] === '*') { const e = s.indexOf('*/', i); i = e < 0 ? s.length : e + 2; continue; }
    else if (c === '/' && regexStart(s, i)) { i = skipRegex(s, i); continue; }
    i++;
  }
  return s.slice(start);
}

function subBlock(s, label) {
  const m = new RegExp('\\b' + label + '\\s*:\\s*\\{').exec(s);
  if (!m) return '';
  return objectBlock(s, s.indexOf('{', m.index));
}

function objectKeys(block) {
  const keys = new Set();
  let depth = 0;
  for (let i = 0; i < block.length; i++) {
    if (depth === 1) {
      const m = /^(?:'((?:\\.|[^'\\])*)'|"((?:\\.|[^"\\])*)"|([A-Za-z_$][\w$]*))\s*:/.exec(block.slice(i));
      if (m) {
        keys.add(m[1] ?? m[2] ?? m[3]);
        i += m[0].length - 1;
        continue;
      }
    }
    const c = block[i];
    if (c === '{') { depth++; continue; }
    if (c === '}') { depth--; continue; }
    if (c === '"' || c === "'") { i = skipQuoted(block, i) - 1; continue; }
    if (c === '`') { i = skipTemplate(block, i) - 1; continue; }
  }
  return keys;
}

function topLevelDeclarations(src) {
  const names = new Set();
  let depth = 0, i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === '"' || c === "'") { i = skipQuoted(src, i); continue; }
    if (c === '`') { i = skipTemplate(src, i); continue; }
    if (c === '/' && src[i + 1] === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
    if (c === '/' && src[i + 1] === '*') { const e = src.indexOf('*/', i); i = e < 0 ? src.length : e + 2; continue; }
    if (c === '/' && regexStart(src, i)) { i = skipRegex(src, i); continue; }
    if (c === '{') { depth++; i++; continue; }
    if (c === '}') { depth--; i++; continue; }
    if (depth === 0) {
      const rest = src.slice(i);
      let m = /^(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/.exec(rest);
      if (m) { names.add(m[1]); i += m[0].length; continue; }
      m = /^(?:export\s+)?(?:let|const|var)\s+([A-Za-z_$][\w$]*)\b/.exec(rest);
      if (m) { names.add(m[1]); i += m[0].length; continue; }
    }
    i++;
  }
  return names;
}

function templateRanges(src) {
  const ranges = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === '"' || c === "'") { i = skipQuoted(src, i); continue; }
    if (c === '/' && src[i + 1] === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
    if (c === '/' && src[i + 1] === '*') { const e = src.indexOf('*/', i); i = e < 0 ? src.length : e + 2; continue; }
    if (c === '/' && regexStart(src, i)) { i = skipRegex(src, i); continue; }
    if (c === '`') { const e = skipTemplate(src, i); ranges.push([i, e]); i = e; continue; }
    i++;
  }
  return ranges;
}

function stripInterpolations(s) {
  let out = '', i = 0;
  while (i < s.length) {
    if (s[i] === '$' && s[i + 1] === '{') {
      let depth = 0;
      i++;
      while (i < s.length) {
        const c = s[i];
        if (c === '{') depth++;
        else if (c === '}') { depth--; if (!depth) { i++; break; } }
        else if (c === '"' || c === "'") { i = skipQuoted(s, i); continue; }
        else if (c === '`') { i = skipTemplate(s, i); continue; }
        else if (c === '/' && s[i + 1] === '/') { while (i < s.length && s[i] !== '\n') i++; continue; }
        else if (c === '/' && s[i + 1] === '*') { const e = s.indexOf('*/', i); i = e < 0 ? s.length : e + 2; continue; }
        else if (c === '/' && regexStart(s, i)) { i = skipRegex(s, i); continue; }
        i++;
      }
      out += ' ';
      continue;
    }
    out += s[i++];
  }
  return out;
}

function stripStrings(s) {
  let out = '', i = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === '"' || c === "'" || c === '`') { i = c === '`' ? skipTemplate(s, i) : skipQuoted(s, i); out += ' '; continue; }
    out += c;
    i++;
  }
  return out;
}

function calledNames(expr) {
  const code = stripStrings(stripInterpolations(expr));
  const names = new Set();
  for (const m of code.matchAll(/([A-Za-z_$][\w$]*)\s*\(/g)) {
    const before = code.slice(0, m.index).trimEnd();
    if (before.endsWith('.') || before.endsWith('?.')) continue;
    if (!KEYWORDS.has(m[1]) && !BUILTINS.has(m[1])) names.add(m[1]);
  }
  return names;
}

function handlerRefs(src) {
  const refs = [];
  for (const m of src.matchAll(/\son[a-z]+\s*=\s*"([^"]*)"/g)) {
    refs.push({ expr: m[1], idx: m.index, names: calledNames(m[1]) });
  }
  return refs;
}

function importedNames(src) {
  const names = new Set();
  for (const m of src.matchAll(/\bimport\s+([^;]+?)\s+from\s+['"]/g)) {
    const clause = m[1].trim();
    const braces = /\{([^}]*)\}/.exec(clause);
    if (braces) {
      for (const part of braces[1].split(',')) {
        const alias = /\bas\s+([A-Za-z_$][\w$]*)/.exec(part.trim());
        const name = alias ? alias[1] : part.trim().split(/\s+/)[0];
        if (name) names.add(name);
      }
    }
    const star = /\*\s+as\s+([A-Za-z_$][\w$]*)/.exec(clause);
    if (star) names.add(star[1]);
    else if (!clause.startsWith('{') && !clause.startsWith('*')) {
      const def = /^([A-Za-z_$][\w$]*)/.exec(clause);
      if (def) names.add(def[1]);
    }
  }
  return names;
}

function exposureRefs(src) {
  const refs = [];
  for (const m of src.matchAll(/Object\.(?:defineProperties|assign)\(\s*window\s*,\s*\{/g)) {
    const block = objectBlock(src, src.indexOf('{', m.index));
    for (const g of block.matchAll(/([A-Za-z_$][\w$]*)\s*:\s*\{\s*get\s*:\s*\(\s*\)\s*=>\s*([A-Za-z_$][\w$]*)/g)) refs.push([g[1], g[2]]);
  }
  return refs;
}

function exposureNames(src) {
  const names = new Set();
  for (const m of src.matchAll(/Object\.(?:defineProperties|assign)\(\s*window\s*,\s*\{/g)) {
    const block = objectBlock(src, src.indexOf('{', m.index));
    let depth = 0;
    for (let i = 0; i < block.length; i++) {
      const c = block[i];
      if (c === '{') depth++;
      else if (c === '}') depth--;
      else if (c === '"' || c === "'") { i = skipQuoted(block, i) - 1; continue; }
      else if (c === '`') { i = skipTemplate(block, i) - 1; continue; }
      else if (depth === 1 && /[A-Za-z_$]/.test(c)) {
        const rest = block.slice(i);
        const km = /^([A-Za-z_$][\w$]*)\s*(?::|\()/.exec(rest);
        if (km) {
          names.add(km[1]);
          i += km[1].length - 1;
        }
      }
    }
  }
  for (const m of src.matchAll(/\bwindow\.([A-Za-z_$][\w$]*)\s*=/g)) names.add(m[1]);
  return names;
}

function listFiles(rel, ext) {
  return readdirSync(resolve(root, rel)).filter(f => f.endsWith(ext)).sort().map(f => join(rel, f));
}

// ---------- desktop: inline handlers must resolve to an exposed global ----------
const rendererFiles = listFiles('src/renderer/js', '.js');
const desktopExposed = new Set();
const desktopSources = new Map();
for (const rel of [...rendererFiles, 'src/renderer/index.html']) {
  const src = read(rel);
  desktopSources.set(rel, src);
  if (rel.endsWith('.js')) for (const n of exposureNames(src)) desktopExposed.add(n);
}
for (const rel of rendererFiles) {
  const src = desktopSources.get(rel);
  const scope = topLevelDeclarations(src);
  for (const n of importedNames(src)) scope.add(n);
  for (const [alias, ident] of exposureRefs(src)) {
    if (!scope.has(ident) && !BUILTINS.has(ident)) add(problems, `desktop exposure ${rel} exposes ${alias} via undefined ${ident}`);
  }
}

for (const [rel, src] of desktopSources) {
  const ranges = templateRanges(src);
  const generated = new Set();
  for (const [a, b] of ranges) {
    for (const m of src.slice(a, b).matchAll(/(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/g)) generated.add(m[1]);
  }
  for (const h of handlerRefs(src)) {
    const inTemplate = ranges.some(([a, b]) => h.idx > a && h.idx < b);
    for (const name of h.names) {
      if (desktopExposed.has(name)) continue;
      if (inTemplate && generated.has(name)) continue;
      add(problems, `desktop handler ${rel}:${lineOf(src, h.idx)} calls ${name}() but nothing exposes window.${name}`);
    }
  }
}

// ---------- desktop i18n ----------
const i18nSrc = read('src/renderer/js/i18n.js');
const i18nEn = objectKeys(subBlock(i18nSrc, 'en'));
const i18nFil = objectKeys(subBlock(i18nSrc, 'fil'));
const i18nUsed = new Map();
for (const [rel, src] of desktopSources) {
  for (const m of src.matchAll(/data-i18n(?:-ph)?\s*=\s*"([^"]+)"/g)) {
    if (!i18nUsed.has(m[1])) i18nUsed.set(m[1], `${rel}:${lineOf(src, m.index)}`);
  }
  if (rel.endsWith('.js')) {
    for (const m of src.matchAll(/(?<![.\w$])t\(\s*'([^']+)'/g)) {
      if (!i18nUsed.has(m[1])) i18nUsed.set(m[1], `${rel}:${lineOf(src, m.index)}`);
    }
  }
}
for (const [key, where] of i18nUsed) {
  if (!i18nEn.has(key)) add(problems, `desktop i18n key "${key}" used at ${where} missing from en`);
  if (!i18nFil.has(key)) add(problems, `desktop i18n key "${key}" used at ${where} missing from fil`);
}

// ---------- phone: inline handlers, duplicate globals, i18n ----------
const mobileFiles = [...listFiles('src/mobile', '.js'), ...listFiles('src/mobile', '.html')];
const mobileDeclared = new Map();
for (const rel of mobileFiles) {
  if (!rel.endsWith('.js')) continue;
  for (const name of topLevelDeclarations(read(rel))) {
    if (mobileDeclared.has(name)) add(problems, `duplicate global ${name}() declared in ${rel} and ${mobileDeclared.get(name)}`);
    else mobileDeclared.set(name, rel);
  }
}
for (const rel of mobileFiles) {
  const src = read(rel);
  for (const h of handlerRefs(src)) {
    for (const name of h.names) {
      if (!mobileDeclared.has(name)) add(problems, `phone handler ${rel}:${lineOf(src, h.idx)} calls ${name}() but no module declares it`);
    }
  }
}
const navSrc = read('src/mobile/nav.js');
for (const m of navSrc.matchAll(/view === '([^']+)'\)\s*([A-Za-z_$][\w$]*)\(/g)) {
  if (!mobileDeclared.has(m[2])) add(problems, `phone view "${m[1]}" dispatches to undefined ${m[2]}()`);
}
for (const view of objectKeys(subBlock(navSrc, 'VIEW_META'))) {
  if (view !== 'home' && !new RegExp(`view === '${view}'`).test(navSrc)) add(problems, `phone VIEW_META entry "${view}" has no showView branch`);
}
const langSrc = read('src/mobile/lang.js');
const langEn = objectKeys(subBlock(langSrc, 'en'));
const langFil = objectKeys(subBlock(langSrc, 'fil'));
for (const rel of mobileFiles) {
  const src = read(rel);
  if (rel.endsWith('lang.js')) continue;
  for (const m of src.matchAll(/\bT\(\s*'([^']+)'/g)) {
    if (!langEn.has(m[1])) add(problems, `phone i18n key "${m[1]}" used at ${rel}:${lineOf(src, m.index)} missing from en`);
    if (!langFil.has(m[1])) add(problems, `phone i18n key "${m[1]}" used at ${rel}:${lineOf(src, m.index)} missing from fil`);
  }
  for (const m of src.matchAll(/\bT\(\s*`/g)) add(notes, `phone dynamic T() key at ${rel}:${lineOf(src, m.index)} (not audited)`);
}

// ---------- phone API calls vs LAN routes ----------
function splitArgs(src, start) {
  const args = [];
  let depth = 0, cur = '', i = start;
  while (i < src.length) {
    const c = src[i];
    if (c === '"' || c === "'") { const e = skipQuoted(src, i); cur += src.slice(i, e); i = e; continue; }
    if (c === '`') { const e = skipTemplate(src, i); cur += src.slice(i, e); i = e; continue; }
    if (c === '(' || c === '[' || c === '{') depth++;
    else if (c === ')' || c === ']' || c === '}') { if (depth === 0) break; depth--; }
    else if (c === ',' && depth === 0) { args.push(cur.trim()); cur = ''; i++; continue; }
    cur += c;
    i++;
  }
  if (cur.trim()) args.push(cur.trim());
  return args;
}

function unquote(lit) {
  return lit.slice(1, -1).replace(/\\(.)/g, (_, c) => ({ n: '\n', t: '\t', r: '\r' }[c] || c));
}

function pathPattern(expr) {
  let out = '';
  for (const part of expr.split(/\s*\+\s*/)) {
    const p = part.trim();
    if (/^'(?:\\.|[^'\\])*'$/.test(p) || /^"(?:\\.|[^"\\])*"$/.test(p)) out += unquote(p);
    else if (/^`/.test(p)) {
      const body = p.slice(1, -1);
      let i = 0, text = '';
      while (i < body.length) {
        if (body[i] === '\\') { text += body[i + 1]; i += 2; continue; }
        if (body[i] === '$' && body[i + 1] === '{') {
          let depth = 0;
          i++;
          while (i < body.length) {
            const c = body[i];
            if (c === '{') depth++;
            else if (c === '}') { depth--; if (!depth) { i++; break; } }
            else if (c === '"' || c === "'") { i = skipQuoted(body, i); continue; }
            i++;
          }
          text += ':dyn';
          continue;
        }
        text += body[i++];
      }
      out += text;
    } else out += ':dyn';
  }
  return out.split('?')[0];
}

const lanRoutes = [];
const lanSrc = read('src/main/lanApi.js');
for (const m of lanSrc.matchAll(/router\.(get|post|put|delete)\('([^']+)'/g)) {
  lanRoutes.push({ method: m[1].toUpperCase(), segs: m[2].replace(/^\/api\//, '').split('/').filter(Boolean) });
}

function matchesRoute(call, route) {
  if (call.method !== route.method || call.segs.length !== route.segs.length) return false;
  return route.segs.every((r, i) => {
    const c = call.segs[i];
    if (c === ':dyn') return r.startsWith(':');
    return r.startsWith(':') || r === c;
  });
}

const storeSrc = read('src/mobile-standalone/store.js');
const storeHeads = new Set();
for (const m of storeSrc.matchAll(/head\s*===\s*'([^']+)'/g)) storeHeads.add(m[1]);

const apiCalls = [];
for (const rel of mobileFiles) {
  if (!rel.endsWith('.js')) continue;
  const src = read(rel);
  for (const m of src.matchAll(/\bapi(Get|Post|PostRaw)\s*\(/g)) {
    const args = splitArgs(src, m.index + m[0].length);
    const path = pathPattern(args[0] || '');
    let method = m[1] === 'Get' ? 'GET' : 'POST';
    if (args[2] && /^['"]/.test(args[2])) method = unquote(args[2]).toUpperCase();
    if (path.startsWith('/api/')) {
      apiCalls.push({ file: rel, line: lineOf(src, m.index), method, path, segs: path.replace(/^\/api\//, '').split('/').filter(Boolean) });
    }
  }
}
// Endpoints whose UI is gated behind IS_STANDALONE, so the paired/LAN path
// never calls them. Kept explicit so a new unguarded call still fails the audit.
const STANDALONE_ONLY = [
  ['POST', '/api/backup/import'],
  ['POST', '/api/clients/import'],
  ['DELETE', '/api/clients/'],
  ['POST', '/api/interest/apply'],
  ['DELETE', '/api/inventory/'],
  ['PUT', '/api/purchase-orders/'],
  ['DELETE', '/api/purchase-orders/'],
  ['POST', '/api/quick-items'],
  ['DELETE', '/api/quick-items/'],
  ['DELETE', '/api/suppliers/'],
  ['GET', '/api/payments/export.csv'],
  ['GET', '/api/inventory/export.csv'],
];
const standaloneOnly = (c) => STANDALONE_ONLY.some(([m, p]) => c.method === m && c.path.startsWith(p));

for (const call of apiCalls) {
  if (!standaloneOnly(call) && !lanRoutes.some(r => matchesRoute(call, r))) {
    add(problems, `phone API ${call.method} ${call.path} (${call.file}:${call.line}) has no LAN route`);
  }
  const head = call.segs[0];
  if (head && !storeHeads.has(head)) {
    add(problems, `phone API ${call.method} ${call.path} (${call.file}:${call.line}) has no standalone store handler (head "${head}")`);
  }
}

// ---------- informational: resources the phone cannot reach offline ----------
const DESKTOP_ONLY_HEADS = new Set(['pair', 'claim', 'update-dist', 'mobile-diag', 'sqlite-status', 'sqlite', 'backups', 'offline-queue', 'auth', 'access-control']);
const lanHeads = new Set(lanRoutes.map(r => r.segs[0]).filter(Boolean));
for (const h of lanHeads) {
  if (!storeHeads.has(h) && !DESKTOP_ONLY_HEADS.has(h)) add(notes, `LAN resource "${h}" has no standalone store handler`);
}

// ---------- informational: placeholder markers ----------
for (const rel of [...rendererFiles, ...mobileFiles]) {
  const src = read(rel);
  for (const m of src.matchAll(/\b(TODO|FIXME|XXX|coming soon)\b/gi)) {
    add(notes, `placeholder "${m[1]}" at ${rel}:${lineOf(src, m.index)}`);
  }
}

// ---------- report ----------
const uniq = (arr) => [...new Set(arr)];
const p = uniq(problems);
const n = uniq(notes);
if (p.length) {
  console.log('PROBLEMS');
  for (const x of p) console.log('  - ' + x);
}
if (n.length) {
  console.log('NOTES');
  for (const x of n) console.log('  - ' + x);
}
console.log(`\n${p.length} problem(s), ${n.length} note(s)`);
process.exitCode = p.length ? 1 : 0;
