import { toast } from './helpers.js'
import { fmtDateTime, now, state, VAT_RATE } from './state.js'

export function printCss(pageSize) {
  const size = pageSize || 'A4';
  const m = {};
  if (typeof state !== 'undefined' && state.settings) state.settings.forEach(s => m[s.key] = s.value);
  const s1 = m['printStripeColor1'] || '#f8fafc';
  const s2 = m['printStripeColor2'] || '#ffffff';
  return `
@page{margin:15mm 12mm;size:${size}}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Segoe UI',Arial,sans-serif;font-size:12px;color:#1e293b;background:#e5e7eb;padding:20px}
.print-toolbar{display:flex;gap:8px;align-items:center;justify-content:center;margin-bottom:16px;flex-wrap:wrap}
.print-toolbar .sz-btn{padding:8px 16px;border:2px solid #d1d5db;background:#fff;border-radius:6px;cursor:pointer;font-size:13px;color:#374151}
.print-toolbar .sz-btn:hover{border-color:#93c5fd;background:#eff6ff}
.print-toolbar .sz-btn.active{border-color:#2563eb;background:#2563eb;color:#fff}
.print-toolbar .print-btn{padding:10px 28px;background:#2563eb;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:14px;font-weight:700}
.print-toolbar .print-btn:hover{background:#1d4ed8}
.print-toolbar .sep{width:1px;height:24px;background:#d1d5db;display:inline-block}
.print-preview{background:#fff;max-width:1000px;margin:0 auto;padding:36px 40px;box-shadow:0 4px 20px rgba(0,0,0,.12);border-radius:8px;min-height:1000px}
.print-header{text-align:center;margin-bottom:20px;padding-bottom:14px;border-bottom:3px double #1e293b}
.print-header .logo{max-height:64px;margin-bottom:8px}
.print-header h1{font-size:20px;font-weight:700;color:#0f172a;margin-bottom:2px}
.print-header p{font-size:11px;color:#64748b;margin:1px 0}
.print-header .print-date{font-size:10px;color:#94a3b8;margin-top:4px}
.print-footer{text-align:center;font-size:10px;color:#94a3b8;border-top:1px solid #e2e8f0;padding-top:10px;margin-top:16px}
.print-table{width:100%;border-collapse:collapse;font-size:10px;margin-bottom:16px}
.print-table caption{font-size:13px;font-weight:700;text-align:left;padding:8px 0 4px;color:#0f172a;caption-side:top}
.print-table thead th{background:#2563eb;color:#fff;border:1px solid #1e40af;padding:6px 8px;text-align:left;font-weight:600;font-size:10px;white-space:nowrap}
.print-table tbody td{border:1px solid #cbd5e1;padding:5px 8px;vertical-align:top}
.print-table tbody tr:nth-child(even){background:${s1}}
.print-table tbody tr:nth-child(odd){background:${s2}}
.print-table .num{text-align:right;font-variant-numeric:tabular-nums}
.print-table .ctr{text-align:center}
.print-summary{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:20px}
.print-summary .card{padding:12px 16px;border-radius:6px;flex:1;min-width:120px}
.print-summary .card .lbl{font-size:10px;text-transform:uppercase;color:#64748b}
.print-summary .card .val{font-size:16px;font-weight:700;display:block;margin-top:2px}
.print-summary .card.green{background:#ecfdf5;border-left:4px solid #10b981}
.print-summary .card.red{background:#fef2f2;border-left:4px solid #ef4444}
.print-summary .card.blue{background:#eff6ff;border-left:4px solid #3b82f6}
.print-summary .card.orange{background:#fff7ed;border-left:4px solid #f97316}
.receipt{max-width:300px;margin:0 auto;font-family:'Courier New',monospace;font-size:11px;line-height:1.4;color:#000}
.receipt .rct-header{text-align:center;border-bottom:2px solid #000;padding-bottom:10px;margin-bottom:10px}
.receipt .rct-header h2{font-size:16px;font-weight:700;margin:0 0 4px;letter-spacing:0.5px}
.receipt .rct-header p{font-size:9px;color:#444;margin:1px 0;line-height:1.3}
.receipt .rct-header .rct-subtitle{font-size:11px;font-weight:600;margin-top:6px;letter-spacing:1px;text-transform:uppercase}
.receipt .rct-items{margin:10px 0}
.receipt .rct-row{display:flex;justify-content:space-between;align-items:center;padding:3px 0;border-bottom:1px dotted #ccc}
.receipt .rct-row:last-child{border-bottom:none}
.receipt .rct-row .rct-name{flex:1;text-align:left;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.receipt .rct-row .rct-qty{width:30px;text-align:center;font-size:10px;color:#555}
.receipt .rct-row .rct-price{width:72px;text-align:right;font-variant-numeric:tabular-nums}
.receipt .rct-divider{border:none;border-top:1px dashed #000;margin:8px 0}
.receipt .rct-totals{border-top:2px solid #000;margin-top:8px;padding-top:8px}
.receipt .rct-totals .rct-row{border-bottom:none;padding:2px 0;font-weight:600}
.receipt .rct-totals .rct-row.grand{font-size:14px;border-top:2px solid #000;margin-top:6px;padding-top:6px;font-weight:800;letter-spacing:0.5px}
.receipt .rct-footer{text-align:center;border-top:2px solid #000;padding-top:10px;margin-top:10px;font-size:9px;color:#444;line-height:1.5}
.receipt .rct-footer .rct-thanks{font-size:11px;font-weight:600;margin-bottom:4px}
@media print{*{-webkit-print-color-adjust:exact;print-color-adjust:exact}body{background:#fff;padding:0}.print-preview{box-shadow:none;border-radius:0;padding:24px 32px;max-width:none;min-height:auto;margin:0}.print-toolbar{display:none}.receipt{max-width:none}}`;
}

export function printToolbar(activeSize) {
  const sizes = ['A4','Letter','Legal'];
  const btns = sizes.map(s => `<button class="sz-btn${s===activeSize?' active':''}" onclick="setSize('${s}')" id="sz-${s.toLowerCase()}">${s}</button>`).join('');
  return `<div class="print-toolbar">
    <span style="font-size:13px;color:#64748b">Paper:</span>
    ${btns}
    <span class="sep"></span>
    <button class="print-btn" onclick="window.print()"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline;margin-right:6px;vertical-align:middle"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>Print / Save PDF</button>
  </div>`;
}

export function printHeader() {
  const m = {};
  state.settings.forEach(s => m[s.key] = s.value);
  const name = m['shopName'] || 'Shop Ledger PH';
  const addr = m['shopAddress'] || '';
  const contact = m['shopContact'] || '';
  const logo = m['receiptLogo'] || '';
  const hdr = m['receiptHeaderText'] || '';
  const vatRegNo = m['vatRegNo'] || '';
  const businessTin = m['businessTin'] || '';
  const logoHtml = logo ? `<img src="${logo.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}" class="logo" />` : '';
  const p = [addr, contact ? 'Tel: '+contact : ''].filter(Boolean).join(' | ');
  const vatInfo = vatRegNo ? `<p>VAT Reg No: ${escHtml(vatRegNo)}</p>` : '';
  const tinInfo = businessTin ? `<p>TIN: ${escHtml(businessTin)}</p>` : '';
  return `<div class="print-header">${logoHtml}<h1>${escHtml(name)}</h1>${p ? '<p>'+escHtml(p)+'</p>' : ''}${vatInfo}${tinInfo}${hdr ? '<p>'+hdr.split('\n').map(l=>escHtml(l)).join('<br>')+'</p>' : ''}<p class="print-date">Printed: ${fmtDateTime(now())}</p></div>`;
}

export function printFooter() {
  const m = {};
  state.settings.forEach(s => m[s.key] = s.value);
  const msg = m['receiptFooter'] || 'Thank you for your patronage!';
  return `<div class="print-footer">${escHtml(msg)}</div>`;
}

export function printScript() {
  return `function setSize(sz){document.querySelectorAll('.sz-btn').forEach(b=>b.classList.remove('active'));document.getElementById('sz-'+sz.toLowerCase()).classList.add('active');var s=document.getElementById('page-size')||document.createElement('style');s.id='page-size';s.textContent='@page{margin:15mm 12mm;size:'+sz+'}';document.head.appendChild(s);}`;
}

export function openPrintWindow(title, w, h, contentHtml, opts) {
  const o = opts || {};
  const size = o.size || 'A4';
  const win = window.open('', '_blank', `width=${w},height=${h},scrollbars=yes`);
  if (!win) { toast('Popup blocked — allow popups for this site to print', 'error'); return null; }
  const doc = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${escHtml(title)}</title><style>${printCss(size)}${o.extraCss||''}</style></head><body>
${printToolbar(size)}
<div class="print-preview">${printHeader()}${contentHtml}${printFooter()}</div>
<script>${printScript()}${o.extraScript||''}</script></body></html>`;
  win.document.write(doc);
  win.document.close();
  return win;
}

export function escHtml(s) {
  return (''+(s||'')).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

export function thermalReceipt(tx) {
  const m = {};
  state.settings.forEach(s => m[s.key] = s.value);
  const name = m['shopName'] || 'Shop Ledger PH';
  const addr = m['shopAddress'] || '';
  const contact = m['shopContact'] || '';
  const hdr = m['receiptHeaderText'] || '';
  const msg = m['receiptFooter'] || 'Thank you for your purchase!';
  const vatRegNo = m['vatRegNo'] || '';
  const businessTin = m['businessTin'] || '';
  const registeredForVat = m['registeredForVat'] === 'true';
  const vatRate = parseFloat(m['vatRate']) || VAT_RATE;
  const cashierName = m['cashierName'] || '';

  const txnDate = tx.createdAt || tx.date;
  const dt = new Date(txnDate);
  const dateStr = dt.toLocaleDateString('en-PH', { year: 'numeric', month: '2-digit', day: '2-digit' });
  const timeStr = dt.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', hour12: true });
  const nowStr = new Date().toLocaleString('en-PH', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: true });

  let html = `<div class="receipt">`;
  html += `<div class="rct-header">`;
  html += `<h2>${escHtml(name)}</h2>`;
  if (addr) html += `<p>${escHtml(addr)}</p>`;
  if (contact) html += `<p>${escHtml(contact)}</p>`;
  const infoLine = [vatRegNo ? 'VAT Reg: ' + vatRegNo : '', businessTin ? 'TIN: ' + businessTin : ''].filter(Boolean).join('  |  ');
  if (infoLine) html += `<p>${escHtml(infoLine)}</p>`;
  if (hdr) html += `<p>${escHtml(hdr)}</p>`;
  html += `<div class="rct-subtitle">OFFICIAL RECEIPT</div>`;
  html += `</div>`;

  html += `<p style="text-align:left;margin:4px 0;font-size:10px">Invoice: <strong>${escHtml(tx.invoiceNo || 'N/A')}</strong></p>`;
  html += `<p style="text-align:left;margin:2px 0;font-size:10px">Date: ${dateStr} ${timeStr}</p>`;
  if (tx.clientName && tx.clientName !== 'Walk-in') html += `<p style="text-align:left;margin:2px 0;font-size:10px">Customer: ${escHtml(tx.clientName)}</p>`;
  html += `<hr class="rct-divider">`;

  html += `<div class="rct-items">`;
  (tx.items || []).forEach(item => {
    const qty = item.quantity || 1;
    const itemTotal = item.total || (item.unitCost || 0) * qty;
    html += `<div class="rct-row"><span class="rct-name">${escHtml(item.description || item.name || 'Item')}</span><span class="rct-qty">x${qty}</span><span class="rct-price">₱${itemTotal.toFixed(2)}</span></div>`;
  });
  html += `</div>`;

  html += `<hr class="rct-divider">`;
  html += `<div class="rct-totals">`;

  if (registeredForVat) {
    const subtotal = tx.subtotal || 0;
    const vatExclusive = Math.round(subtotal / (1 + vatRate) * 100) / 100;
    const vatAmount = Math.round(vatExclusive * vatRate * 100) / 100;

    html += `<div class="rct-row"><span>Subtotal (VAT Excl)</span><span>₱${vatExclusive.toFixed(2)}</span></div>`;
    html += `<div class="rct-row"><span>VAT (${(vatRate * 100).toFixed(0)}%)</span><span>₱${vatAmount.toFixed(2)}</span></div>`;
  } else {
    html += `<div class="rct-row"><span>SUBTOTAL</span><span>₱${(tx.subtotal || 0).toFixed(2)}</span></div>`;
  }

  if (tx.discount) html += `<div class="rct-row"><span>Discount</span><span>-₱${tx.discount.toFixed(2)}</span></div>`;
  if (tx.vat) html += `<div class="rct-row"><span>VAT</span><span>₱${tx.vat.toFixed(2)}</span></div>`;
  html += `<div class="rct-row grand"><span>TOTAL</span><span>₱${(tx.grandTotal || tx.total || 0).toFixed(2)}</span></div>`;
  if (tx.paymentMethod) html += `<div class="rct-row"><span>Payment</span><span>${escHtml(tx.paymentMethod)}</span></div>`;
  if (tx.amountPaid) html += `<div class="rct-row"><span>Amount Paid</span><span>₱${tx.amountPaid.toFixed(2)}</span></div>`;
  if (tx.change) html += `<div class="rct-row"><span>Change</span><span>₱${tx.change.toFixed(2)}</span></div>`;
  html += `</div>`;

  html += `<div class="rct-footer">`;
  html += `<div class="rct-thanks">${escHtml(msg)}</div>`;
  if (cashierName) html += `<p>Cashier: ${escHtml(cashierName)}</p>`;
  if (tx.id) html += `<p>Ref: ${tx.id.slice(-8).toUpperCase()}</p>`;
  html += `<p>Printed: ${nowStr}</p>`;
  html += `</div></div>`;
  return html;
}


// expose top-level bindings as globals (inline onclick handlers and legacy code paths rely on them)
Object.defineProperties(window, {
  printCss: { get: () => printCss, configurable: true },
  printToolbar: { get: () => printToolbar, configurable: true },
  printHeader: { get: () => printHeader, configurable: true },
  printFooter: { get: () => printFooter, configurable: true },
  printScript: { get: () => printScript, configurable: true },
  openPrintWindow: { get: () => openPrintWindow, configurable: true },
  escHtml: { get: () => escHtml, configurable: true },
  thermalReceipt: { get: () => thermalReceipt, configurable: true }
});
