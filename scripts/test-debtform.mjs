// Blank debt form tests: pure HTML builder (no DOM needed beyond esc()).
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(resolve(root, 'src', 'mobile', 'debt-form.js'), 'utf8');
const sandbox = { console };
vm.createContext(sandbox);
vm.runInContext('function esc(s){return String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");}', sandbox);
vm.runInContext(src, sandbox);
const s = sandbox;

let pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) pass++;
  else { fail++; console.error('FAIL - ' + name); }
}
const count = (html, sub) => html.split(sub).length - 1;

{
  const h = s.buildDebtFormHTML('Demo Shop', null, 10, 'portrait', '2026-10-06');
  ok(h.includes('Debt Record Form — Demo Shop'), 'shop + title');
  ok(h.includes('2026-10-06'), 'date line');
  ok(count(h, '<tr>') === 11, 'header + 10 rows, got ' + count(h, '<tr>'));
  ok(h.includes('Signature') && h.includes('Balance'), 'all default columns');
  ok(h.includes('size:portrait'), 'portrait page');
  ok(!h.includes('</script'), 'no script breakout');
}
{
  const h = s.buildDebtFormHTML('S', ['date', 'amount', 'signature'], 3, 'landscape', '2026-01-01');
  ok(count(h, '<tr>') === 4, 'header + 3 rows');
  ok(h.includes('Amount') && h.includes('Signature') && !h.includes('Interest'), 'column subset honored');
  ok(h.includes('size:landscape'), 'landscape page');
}
{
  const h = s.buildDebtFormHTML('S', null, 500, 'portrait', '');
  ok(count(h, '<tr>') === 100, 'rows clamped to 99');
  const h0 = s.buildDebtFormHTML('S', [], 0, 'portrait', '');
  ok(count(h0, '<tr>') === 11, 'row count 0 falls back to 10 like desktop');
  const hx = s.buildDebtFormHTML('<b>X</b>', null, 1, 'portrait', '');
  ok(!hx.includes('<b>X</b>'), 'no raw HTML injection of shop name');
}

console.log(`\nDEBT FORM SMOKE: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
