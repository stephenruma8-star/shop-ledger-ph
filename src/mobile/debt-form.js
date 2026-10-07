// ---------- BLANK DEBT FORM ----------
// Paper debt ledger, like the desktop's: pick columns + row count, get a
// printable form. Phone path: in-app preview, then the system share sheet
// (save PDF, send to a printer app, Drive) via a Documents HTML file.
// No imports/exports: concatenated.
const DEBT_FORM_COLS = [
  { key: 'date', label: 'Date' },
  { key: 'item', label: 'Item/Description' },
  { key: 'qty', label: 'Qty/Name' },
  { key: 'amount', label: 'Amount' },
  { key: 'payment', label: 'Payment' },
  { key: 'interest', label: 'Interest' },
  { key: 'balance', label: 'Balance' },
  { key: 'remarks', label: 'Remarks' },
  { key: 'signature', label: 'Signature' }
];
function getDebtFormCols() {
  try {
    const v = JSON.parse(localStorage.getItem('debtFormCols') || 'null');
    if (Array.isArray(v) && v.length) return v.filter(k => DEBT_FORM_COLS.some(c => c.key === k));
  } catch (e) {}
  return DEBT_FORM_COLS.map(c => c.key);
}
function getDebtRowCount() {
  try {
    const n = parseInt(localStorage.getItem('debtRowCount')) || 10;
    return Math.max(1, Math.min(99, n));
  } catch (e) { return 10; }
}
function setDebtRowCount(n) {
  try { localStorage.setItem('debtRowCount', String(Math.max(1, Math.min(99, parseInt(n) || 10)))); } catch (e) {}
}
// Pure: full printable HTML document. Tested in Node (test-debtform).
function buildDebtFormHTML(shopName, cols, rowCount, orientation, dateStr) {
  const pick = (Array.isArray(cols) && cols.length ? cols : DEBT_FORM_COLS.map(c => c.key))
    .map(k => DEBT_FORM_COLS.find(c => c.key === k)).filter(Boolean);
  const rows = Math.max(1, Math.min(99, parseInt(rowCount) || 10));
  const land = orientation === 'landscape';
  const cell = (tag, c, inner) => {
    const align = c.key === 'qty' || c.key === 'signature' ? 'center' : (['amount', 'payment', 'interest', 'balance'].includes(c.key) ? 'right' : 'left');
    return `<${tag} style="border:1px solid #0f172a;padding:${tag === 'th' ? '4px 3px' : '0'};text-align:${align};${tag === 'th' ? 'background:#1e293b;color:#fff;font-size:8px;' : 'height:24px;'}">${inner}</${tag}>`;
  };
  const head = `<tr><th style="border:1px solid #0f172a;padding:4px 3px;background:#1e293b;color:#fff;width:20px;font-size:8px">#</th>`
    + pick.map(c => cell('th', c, c.label)).join('') + '</tr>';
  let body = '';
  for (let i = 0; i < rows; i++) {
    body += `<tr><td style="border:1px solid #0f172a;text-align:center;font-size:9px;color:#64748b;padding:3px">${i + 1}</td>`
      + pick.map(c => cell('td', c, '')).join('') + '</tr>';
  }
  return '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Debt Record Form</title>'
    + `<style>body{font-family:Arial,sans-serif;color:#0f172a;padding:16px;font-size:11px}table{width:100%;border-collapse:collapse;font-size:9px}tbody tr:nth-child(even) td{background:#f8fafc}@page{size:${land ? 'landscape' : 'portrait'};margin:10mm 12mm}</style></head><body>`
    + `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><h2 style="font-size:14px;margin:0">Debt Record Form — ${esc(shopName || 'Shop Ledger PH')}</h2><span style="font-size:11px;color:#475569">Date: _______________</span></div>`
    + `<div style="margin-bottom:8px;font-size:12px">Client Name: <span style="display:inline-block;width:250px;border-bottom:1px solid #94a3b8">&nbsp;</span></div>`
    + `<table><thead>${head}</thead><tbody>${body}</tbody></table>`
    + `<div style="margin-top:8px;font-size:10px;display:flex;justify-content:space-between;color:#475569"><span>Prepared by: _________________</span><span><b>Total Amount: P__________</b></span><span>Date: ${String(dateStr || '')}</span></div>`
    + '</body></html>';
}
function openDebtFormSetup() {
  const saved = getDebtFormCols();
  const rc = getDebtRowCount();
  document.getElementById('modal-root').innerHTML = `
    <div class="fixed inset-0 bg-black/70 z-[45] flex items-end sm:items-center justify-center fade-in" onclick="if(event.target===this)closeQuick()">
      <div class="w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-4 pb-6 slide-up glass-card" style="max-height:92dvh;overflow-y:auto" onclick="event.stopPropagation()">
        <div class="grabber mb-3" style="margin-bottom:.9rem"></div>
        <h3 class="font-bold text-gray-100 text-sm mb-3 flex items-center gap-2"><span class="icon-tile bg-orange-500/15 text-orange-400"><svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg></span>Blank debt form</h3>
        <p class="text-[11px] text-gray-500 mb-2">Columns to show:</p>
        <div class="grid grid-cols-2 gap-1 mb-3">
          ${DEBT_FORM_COLS.map(c => `<label class="flex items-center gap-2 text-sm p-1.5 rounded-xl cursor-pointer text-gray-300" style="background:rgba(255,255,255,.04)"><input type="checkbox" data-key="${c.key}" ${saved.includes(c.key) ? 'checked' : ''} onchange="debtFormColsChanged()" class="w-4 h-4" /><span>${c.label}</span></label>`).join('')}
        </div>
        <div class="flex items-center gap-2 mb-3">
          <span class="text-sm text-gray-400">Rows:</span>
          <button onclick="debtFormRows(-1)" class="w-10 h-10 rounded-xl text-xl font-bold text-gray-100" style="background:rgba(30,41,59,.6);border:1px solid rgba(255,255,255,.09)">−</button>
          <span id="debt-form-rc" class="w-10 text-center font-bold num">${rc}</span>
          <button onclick="debtFormRows(1)" class="w-10 h-10 rounded-xl text-xl font-bold text-gray-100" style="background:rgba(30,41,59,.6);border:1px solid rgba(255,255,255,.09)">+</button>
        </div>
        <div class="grid grid-cols-2 gap-2">
          <button onclick="previewDebtForm('portrait')" class="btn btn-primary">Portrait</button>
          <button onclick="previewDebtForm('landscape')" class="btn btn-primary">Landscape</button>
        </div>
        <button onclick="closeQuick()" class="btn btn-ghost w-full mt-2">Cancel</button>
      </div>
    </div>`;
}
function debtFormColsChanged() {
  try {
    const keys = [...document.querySelectorAll('#modal-root input[data-key]:checked')].map(cb => cb.dataset.key);
    localStorage.setItem('debtFormCols', JSON.stringify(keys.length ? keys : DEBT_FORM_COLS.map(c => c.key)));
  } catch (e) {}
}
function debtFormRows(d) {
  const cur = getDebtRowCount();
  setDebtRowCount(cur + d);
  const el = document.getElementById('debt-form-rc');
  if (el) el.textContent = getDebtRowCount();
}
function previewDebtForm(orientation) {
  const s = (typeof data !== 'undefined' && data.settings) || {};
  const d = new Date();
  const today = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const html = buildDebtFormHTML(s.shopName, getDebtFormCols(), getDebtRowCount(), orientation, today);
  window.__lastDebtForm = html;
  const frame = `<iframe title="Debt form preview" sandbox="" srcdoc="${html.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}" style="width:100%;height:52dvh;background:#fff;border-radius:.75rem;border:1px solid rgba(255,255,255,.1)"></iframe>`;
  document.getElementById('modal-root').innerHTML = `
    <div class="fixed inset-0 bg-black/70 z-[45] flex items-end sm:items-center justify-center fade-in" onclick="if(event.target===this)closeQuick()">
      <div class="w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-4 pb-6 slide-up glass-card" style="max-height:92dvh;overflow-y:auto" onclick="event.stopPropagation()">
        <div class="grabber mb-3" style="margin-bottom:.9rem"></div>
        <h3 class="font-bold text-gray-100 text-sm mb-3">Debt form (${orientation})</h3>
        ${frame}
        <div class="grid grid-cols-2 gap-2 mt-3">
          <button onclick="shareDebtForm()" class="btn btn-primary btn-sm">📤 Save / Print</button>
          <button onclick="openDebtFormSetup()" class="btn btn-ghost btn-sm">← Back</button>
        </div>
      </div>
    </div>`;
}
async function shareDebtForm() {
  const html = window.__lastDebtForm || '';
  if (!html) { toast('Nothing to share yet', 'err'); return; }
  const d = new Date();
  const name = 'debt-form-' + d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0') + '.html';
  try {
    const F = nativePlugin('Filesystem');
    if (!F || typeof F.writeFile !== 'function') throw new Error('no fs');
    const w = await F.writeFile({ path: 'ShopLedger/forms/' + name, data: html, directory: 'DOCUMENTS', encoding: 'utf8', recursive: true });
    const uri = (w && w.uri) || '';
    try {
      const S = nativePlugin('Share');
      if (uri && S && typeof S.share === 'function') {
        await S.share({ title: 'Debt record form', text: 'Blank debt form ' + name, files: [uri], dialogTitle: 'Save debt form' });
        toast('Form shared', 'ok');
        return;
      }
    } catch (e) {}
    toast('Form saved to Documents/ShopLedger/forms/' + name, 'ok');
  } catch (e) { feelErr(); toast('Share failed: ' + (e && e.message), 'err'); }
}
