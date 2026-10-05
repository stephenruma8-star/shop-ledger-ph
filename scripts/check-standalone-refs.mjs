// Poor-man's linker for the standalone bundle: every called global must be
// declared somewhere in mobile-app/www/app/index.html (or be a known
// platform API). Catches dropped-module references without a device.
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(resolve(root, 'mobile-app', 'www', 'app', 'index.html'), 'utf8');

const KEYWORDS = new Set(['if', 'for', 'while', 'switch', 'catch', 'function', 'return', 'typeof', 'new', 'await', 'async', 'void', 'delete', 'in', 'of', 'do', 'else', 'try', 'finally', 'throw', 'with']);
const declared = new Set();
for (const m of src.matchAll(/(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/g)) declared.add(m[1]);
for (const m of src.matchAll(/(?:let|const|var)\s+([A-Za-z_$][\w$]*)\s*=/g)) declared.add(m[1]);
// object-literal / class method shorthand: name(...) { ... } (minus keywords)
for (const m of src.matchAll(/(?<![.\w$])([A-Za-z_$][\w$]*)\s*\([^()]*\)\s*\{/g)) {
  if (!KEYWORDS.has(m[1])) declared.add(m[1]);
}

// inline handlers resolve against globals too — scan the raw page first
// (skipping guards like onclick="if(...)")
const handlerCalls = new Set();
for (const m of src.matchAll(/on(?:click|input|change|submit)="([A-Za-z_$][\w$]*)\s*\(/g)) {
  if (!KEYWORDS.has(m[1])) handlerCalls.add(m[1]);
}

// then strip everything that is not code: style blocks, comments, quoted
// strings, and the static parts of template literals (their ${} holes are
// real code and are kept; nesting handled by the walker)
function blankTemplates(s) {
  let out = '', i = 0;
  while (i < s.length) {
    const b = s.indexOf('`', i);
    if (b < 0) { out += s.slice(i); break; }
    out += s.slice(i, b);
    out += walkTemplate(s, b);
    i = walkTemplateEnd(s, b);
  }
  return out;
}
function walkTemplateEnd(s, b) {
  let j = b + 1;
  while (j < s.length) {
    const c = s[j];
    if (c === '\\') { j += 2; continue; }
    if (c === '`') return j + 1;
    if (c === '$' && s[j + 1] === '{') j = skipBalanced(s, j + 1) + 1;
    else j++;
  }
  return j;
}
function walkTemplate(s, b) {
  let holes = '', j = b + 1;
  while (j < s.length) {
    const c = s[j];
    if (c === '\\') { j += 2; continue; }
    if (c === '`') break;
    if (c === '$' && s[j + 1] === '{') {
      const end = skipBalanced(s, j + 1);
      holes += ' ' + blankTemplates(s.slice(j + 2, end)) + ' ';
      j = end + 1;
    } else j++;
  }
  return holes;
}
function skipBalanced(s, k) {
  let depth = 0;
  while (k < s.length) {
    const c = s[k];
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return k; }
    else if (c === '"' || c === "'") {
      const q = c; k++;
      while (k < s.length && s[k] !== q) { if (s[k] === '\\') k++; k++; }
    } else if (c === '`') k = walkTemplateEnd(s, k) - 1;
    else if (c === '/' && s[k + 1] === '/') { while (k < s.length && s[k] !== '\n') k++; }
    k++;
  }
  return k;
}
let code = src.replace(/<style>[\s\S]*?<\/style>/g, ' ');
code = code.replace(/\/\*[\s\S]*?\*\//g, ' ');
code = code.replace(/(^|[^:]|^)\/\/[^\n]*/g, '$1 ');
code = code.replace(/'(?:\\.|[^'\\\n])*'/g, "''");
code = code.replace(/"(?:\\.|[^"\\\n])*"/g, '""');
code = blankTemplates(code);

const KNOWN = new Set(('document window navigator localStorage sessionStorage fetch ' +
  'setTimeout setInterval clearTimeout clearInterval requestAnimationFrame ' +
  'console JSON Math Date String Number Boolean parseInt parseFloat isNaN isFinite ' +
  'Array Object Promise TextEncoder TextDecoder btoa atob URL URLSearchParams Blob ' +
  'FileReader AbortController AudioContext alert confirm Intl RegExp Error Map Set WeakMap ' +
  'Uint8Array unescape BarcodeDetector ' +
  'encodeURIComponent decodeURIComponent Capacitor Intl NumberFormat').split(' '));
const called = new Set();
// JS calls not preceded by a dot (method calls resolve on objects, skip those)
for (const m of code.matchAll(/(?<![.\w$])([A-Za-z_$][\w$]*)\s*\(/g)) {
  if (!KEYWORDS.has(m[1])) called.add(m[1]);
}
for (const h of handlerCalls) called.add(h);

const missing = [...called].filter(c => !declared.has(c) && !KNOWN.has(c)).sort();
if (missing.length) {
  console.error('standalone refs MISSING: ' + missing.join(', '));
  process.exit(1);
}
console.log(`standalone refs OK (${declared.size} globals, ${called.size} call sites)`);
