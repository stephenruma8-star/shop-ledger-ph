import { dbAdd, dbAll, dbDel, dbGet, dbPut } from './database.js'
import { calcInterest, closeModal, confetti, confirmModal, debounce, escapeHtml, filterByYear, modal, parseCSVLine, playSound, searchData, toast, validatePhone } from './helpers.js'
import { escHtml, openPrintWindow } from './printLayout.js'
import { fmtDate, fmtDateTime, now, peso, state, today } from './state.js'
import { getQty } from './transactions.js'

export async function viewClients(root) {
  state.clients = await dbAll('clients');
  root.innerHTML = `
    <div class="space-y-4 fade-in">
      <div class="flex gap-2 flex-wrap">
        <input id="clientSearch" placeholder="Search clients..." class="flex-1 px-4 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800" oninput="debouncedRenderClientGrid()" />
        <button onclick="openClientModal()" class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="inline-block mr-1 -mt-0.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>New Client</button>
        <button onclick="importClients()" class="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="inline-block mr-1 -mt-0.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>Import CSV</button>
        <button onclick="exportAllClientsCSV()" class="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="inline-block mr-1 -mt-0.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>Export CSV</button>
      </div>
      <div id="clientGrid" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"></div>
    </div>`;
  renderClientGrid();
}

export let _clientFiltered = [];
export let _clientPage = 0;
export const CLIENT_PAGE_SIZE = 20;

export let debouncedRenderClientGrid = debounce(() => { _clientPage = 0; renderClientGrid(); }, 250);
export function renderClientGrid() {
  const q = document.getElementById('clientSearch')?.value || '';
  _clientFiltered = searchData(state.clients, q, ['name','phone','address']);
  const grid = document.getElementById('clientGrid');
  if (!grid) return;
  if (_clientFiltered.length === 0) {
    grid.innerHTML = '<div class="col-span-full text-center py-10 text-gray-400">No clients found</div>'; return;
  }
  const page = _clientFiltered.slice(0, (_clientPage + 1) * CLIENT_PAGE_SIZE);
  grid.innerHTML = page.map(c => {
    const bal = c.balance || 0;
    const balColor = bal > 0 ? 'text-red-600' : bal < 0 ? 'text-green-600' : 'text-gray-500';
    return `<div class="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border hover:shadow-md transition-shadow cursor-pointer glass-card" onclick="viewClientHistory(${c.id})">
      <div class="flex items-center gap-3 mb-2"><div class="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center text-blue-600 font-bold flex-shrink-0">${c.name?.charAt(0)||'?'}</div>
        <div class="flex-1 min-w-0"><p class="font-semibold truncate">${escapeHtml(c.name)}</p><p class="text-xs text-gray-500">${escapeHtml(c.phone || 'No phone')}</p></div>
        <button onclick="event.stopPropagation();recordClientPayment(${c.id})" class="text-green-500 hover:text-green-700 px-1" title="Bayad"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v20M6 7h9a4 4 0 0 1 0 8H6"/><line x1="4" y1="11" x2="17" y2="11"/></svg></button>
        <button onclick="event.stopPropagation();printClientInfo(${c.id})" class="text-gray-400 hover:text-blue-600 px-1" title="Print"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg></button>
        <button onclick="event.stopPropagation();deleteClient(${c.id})" class="text-gray-400 hover:text-red-600 px-1" title="Delete"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button></div>
      <div class="flex justify-between items-center"><span class="text-xs text-gray-400">Balance:</span><span class="font-bold ${balColor}">${peso(bal)}</span></div>
      <p class="text-xs text-gray-400 mt-1 truncate">${escapeHtml(c.address || '')}</p>
    </div>`;
  }).join('') + (page.length < _clientFiltered.length ? `<div class="col-span-full text-center pt-2"><button onclick="_clientPage++;renderClientGrid()" class="px-4 py-2 bg-gray-100 dark:bg-gray-700 rounded-lg text-sm hover:bg-gray-200 dark:hover:bg-gray-600"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="inline-block mr-1 -mt-0.5"><polyline points="6 9 12 15 18 9"/></svg>Load More (${_clientFiltered.length - page.length} left)</button></div>` : '');
}

window.__app = window.__app || {};
window.__app.cfCart = [];
export let cfCart = window.__app.cfCart;

export function cfLineSub(item) { return getQty(item.name) * (item.unitCost || 0); }
export function cfLineInt(item) {
  const sub = cfLineSub(item);
  if ((item.intRate || 0) === 0 || sub === 0) return 0;
  const itemDate = item.date || today();
  const days = Math.max(1, Math.floor((new Date(today()) - new Date(itemDate)) / 86400000));
  return calcInterest(sub, item.intRate, days);
}
export function cfLineAmt(item) { return cfLineSub(item) + cfLineInt(item); }

export function saveClientDraft() {
  const f = (id) => document.getElementById(id);
  if (!f('cf-name')) return;
  sessionStorage.setItem('clientFormDraft', JSON.stringify({
    name: f('cf-name').value,
    phone: f('cf-phone').value,
    address: f('cf-address').value,
    dueDate: f('cf-dueDate').value,
    ledgerYear: f('cf-ledgerYear')?.value || ''
  }));
}
export function openClientModal(c) {
  if (typeof c === 'number') c = state.clients.find(x => x.id === c);
  const isEdit = !!c;
  cfCart = [];
  const qItems = state.quickItems || [];
  const inv = (state.inventory || []).filter(i => (i.stock || 0) > 0);
  const draft = (!isEdit) ? JSON.parse(sessionStorage.getItem('clientFormDraft') || 'null') || {} : {};
  modal(`
    <div class="p-6 flex flex-col h-full" style="min-height:70vh">
      <div class="flex justify-between items-center mb-4 shrink-0"><h3 class="text-xl font-bold">${isEdit ? 'Edit' : 'New'} Client</h3><button onclick="saveClientDraft();closeModal()" class="text-gray-400 hover:text-gray-600"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button></div>
      <div class="grid grid-cols-1 lg:grid-cols-5 gap-4 flex-1 min-h-0">
        <div class="lg:col-span-2 space-y-3">
          <div><label class="text-xs text-gray-500 block mb-1">Name *</label><input id="cf-name" value="${isEdit ? escapeHtml(c.name||'') : escapeHtml(draft.name||'')}" class="w-full px-3 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800" oninput="saveClientDraft()" /></div>
          <div class="grid grid-cols-2 gap-2">
            <div><label class="text-xs text-gray-500 block mb-1">Phone</label><input id="cf-phone" value="${isEdit ? escapeHtml(c.phone||'') : escapeHtml(draft.phone||'')}" class="w-full px-3 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800" oninput="saveClientDraft()" /></div>
            <div><label class="text-xs text-gray-500 block mb-1">Balance</label><input id="cf-balance" type="number" step="0.01" value="${c?.balance||0}" class="w-full px-3 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800" /></div>
          </div>
          <div><label class="text-xs text-gray-500 block mb-1">Address</label><input id="cf-address" value="${isEdit ? escapeHtml(c.address||'') : escapeHtml(draft.address||'')}" class="w-full px-3 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800" oninput="saveClientDraft()" /></div>
          <div><label class="text-xs text-gray-500 block mb-1">Due Date</label><input id="cf-dueDate" type="date" value="${isEdit ? (c.dueDate||'') : (draft.dueDate||'')}" class="w-full px-3 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800" onchange="saveClientDraft()" /></div>
          <div><label class="text-xs text-gray-500 block mb-1">Ledger Year</label><select id="cf-ledgerYear" onchange="saveClientDraft()" class="w-full px-3 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm">${(() => { const cy=new Date().getFullYear();const lv=isEdit?(c.ledgerYear||''):(draft.ledgerYear||'');let r='<option value="">—</option>';for(let y=cy;y>=2010;y--)r+='<option value="'+y+'"'+(lv==y?' selected':'')+'>'+y+'</option>';return r;})()}</select></div>
          <div class="pt-2"><h4 class="font-semibold text-sm mb-1">Quick Items (add to cart)</h4>
            <div class="flex gap-2 mb-2"><select id="cf-item-select" class="flex-1 px-3 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm"><option value="">Inventory...</option>${inv.map(i => `<option value="${escapeHtml(i.name)}" data-price="${i.sellPrice||i.price||0}">${escapeHtml(i.name)} - ${peso(i.sellPrice||i.price||0)}</option>`).join('')}</select>
            <input id="cf-qty" type="number" value="1" min="1" class="w-14 px-2 py-2 border dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-sm text-center" />
            <button onclick="cfAddInvItem()" class="px-3 py-2 bg-blue-600 text-white rounded-lg text-sm whitespace-nowrap"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="inline-block mr-0.5 -mt-0.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>Add</button></div>
            ${qItems.length > 0 ? `<div class="flex flex-wrap gap-1">${qItems.map(q => `<button data-qiname="${escapeHtml(q.name)}" data-qiprice="${q.price}" onclick="cfCart.push({date:today(),description:this.dataset.qiname,name:'1',unitCost:parseFloat(this.dataset.qiprice),intRate:0,invId:null});cfRenderCart()" class="px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded text-xs hover:bg-gray-200">${escapeHtml(q.name)} ${peso(q.price)}</button>`).join('')}</div>` : ''}
            <div class="flex justify-between items-center mt-2"><button onclick="cfCart.push({date:today(),description:'',name:'1',unitCost:0,intRate:0,invId:null});cfRenderCart()" class="px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs hover:bg-green-700"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="inline-block mr-0.5 -mt-0.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>Add Blank Row</button></div>
          </div>
        </div>
        <div class="lg:col-span-3 flex flex-col min-h-0">
          <h4 class="font-semibold text-sm mb-1 shrink-0">Cart Items</h4>
          <div id="cf-cart" class="flex-1 overflow-auto border dark:border-gray-700 rounded-lg mb-2 min-h-0"></div>
          <div id="cf-totals" class="space-y-1 text-sm shrink-0"></div>
          <div class="shrink-0 flex items-center gap-2"><label class="text-xs text-gray-500">Payment:</label><select id="cf-payment" class="px-2 py-1 border dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-xs"><option>Cash</option><option>GCash</option><option>Maya</option><option>Bank Transfer</option></select></div>
        </div>
      </div>
      <div class="flex gap-2 pt-3 shrink-0"><button onclick="saveClient(${isEdit ? c.id : 'null'})" class="flex-1 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="inline-block mr-1 -mt-0.5"><polyline points="20 6 9 17 4 12"/></svg>${isEdit ? 'Update' : 'Save & Create Sale'}</button><button onclick="saveClientDraft();closeModal()" class="px-4 py-2 bg-gray-200 dark:bg-gray-700 rounded-lg"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="inline-block mr-1 -mt-0.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>Cancel</button></div>
    </div>`);
  cfRenderCart();
}

export function cfAddInvItem() {
  const sel = document.getElementById('cf-item-select');
  const opt = sel.options[sel.selectedIndex];
  if (!opt || !opt.value) { toast('Select an item', 'warning'); return; }
  const name = opt.value;
  const price = parseFloat(opt.dataset.price);
  const qty = parseInt(document.getElementById('cf-qty').value) || 1;
  cfCart.push({ date: today(), description: name, name: String(qty), unitCost: price, intRate: 0, invId: null });
  cfRenderCart();
}

export function cfUpdateRowAmt(i) {
  const el = document.getElementById('cf-amt-' + i);
  if (el) el.textContent = peso(cfLineAmt(cfCart[i]));
}

export function cfRenderCart() {
  const el = document.getElementById('cf-cart');
  if (!el) return;
  if (cfCart.length === 0) { el.innerHTML = '<p class="text-gray-400 text-xs p-2">No items — just creating client</p>'; cfUpdateTotals(); return; }
  el.innerHTML = `<table class="w-full text-xs"><thead><tr class="bg-gray-50 dark:bg-gray-700 sticky top-0"><th class="p-1 text-left">Date</th><th class="p-1 text-left">Description</th><th class="p-1 text-center">Qty/Name</th><th class="p-1 text-right">Unit Cost</th><th class="p-1 text-right">Int.</th><th class="p-1 text-right">Amount</th><th class="p-1"></th></tr></thead><tbody>${cfCart.map((item, i) => {
    return `<tr class="border-b dark:border-gray-700">
      <td class="p-1 whitespace-nowrap text-center"><input type="date" value="${item.date || ''}" class="w-32 px-1 py-1 border dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-xs" onchange="cfCart[${i}].date=this.value;cfUpdateRowAmt(${i});cfUpdateTotals()" /></td>
      <td class="p-1"><input type="text" id="cf-desc-${i}" value="${escapeHtml(item.description)}" placeholder="Item..." oninput="cfCart[${i}].description=this.value;showItemSuggestions(this,'cf',${i})" class="w-full px-1 py-1 border dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-xs" /></td>
      <td class="p-1 text-center"><input type="text" id="cf-qty-${i}" value="${escapeHtml(item.name)}" placeholder="Qty" oninput="cfCart[${i}].name=this.value;cfUpdateRowAmt(${i});cfUpdateTotals()" class="w-14 px-1 py-1 border dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-xs text-center" /></td>
      <td class="p-1 text-right"><input type="number" id="cf-cost-${i}" value="${item.unitCost}" step="0.01" oninput="cfCart[${i}].unitCost=Math.max(0,parseFloat(this.value)||0);cfUpdateRowAmt(${i});cfUpdateTotals()" class="w-16 px-1 py-1 border dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-xs text-right" /></td>
      <td class="p-1 text-right"><select onchange="cfCart[${i}].intRate=Math.max(0,parseFloat(this.value)||0);cfUpdateRowAmt(${i});cfUpdateTotals()" class="w-14 px-1 py-1 border dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-xs text-right">${intRateOptions(item.intRate)}</select></td>
      <td class="p-1 text-right font-medium" id="cf-amt-${i}">${peso(cfLineAmt(item))}</td>
      <td class="p-1"><button onclick="cfCart.splice(${i},1);cfRenderCart()" class="text-red-500 hover:text-red-700" title="Remove"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button></td>
    </tr>`;
  }).join('')}</tbody></table>`;
  cfUpdateTotals();
}

export function cfUpdateTotals() {
  const el = document.getElementById('cf-totals');
  if (!el) return;
  const subtotal = cfCart.reduce((s, i) => s + cfLineSub(i), 0);
  const totalInt = cfCart.reduce((s, i) => s + cfLineInt(i), 0);
  const grand = subtotal + totalInt;
  el.innerHTML = `
    <div class="flex justify-between"><span>Subtotal</span><span>${peso(subtotal)}</span></div>
    ${totalInt > 0 ? `<div class="flex justify-between text-amber-600"><span>Interest</span><span>${peso(totalInt)}</span></div>` : ''}
    <div class="flex justify-between font-bold"><span>Total</span><span class="text-green-600">${peso(grand)}</span></div>`;
}

export async function saveClient(id) {
  const nmEl = document.getElementById('cf-name');
  const phEl = document.getElementById('cf-phone');
  const adEl = document.getElementById('cf-address');
  const blEl = document.getElementById('cf-balance');
  const ddEl = document.getElementById('cf-dueDate');
  const lyEl = document.getElementById('cf-ledgerYear');
  if (!nmEl || !phEl || !adEl || !blEl || !ddEl) { toast('Form not ready', 'error'); return; }
  const name = nmEl.value.trim();
  const phone = phEl.value.trim();
  if (requireFields([{ el: nmEl, msg: 'Please fill out this field' }, { el: phEl, test: () => !phone || validatePhone(phone), msg: 'Invalid phone (PH format: +63 or 0 + 10-11 digits)' }])) return;
  const address = adEl.value.trim();
  if (id) {
    const c = await dbGet('clients', id);
    c.name = name; c.phone = phone; c.address = address;
    c.balance = parseFloat(blEl.value) || 0;
    c.dueDate = ddEl.value || '';
    c.ledgerYear = lyEl ? lyEl.value || '' : '';
    await dbPut('clients', c);
    if (cfCart.length > 0) {
      const existingTx = state.transactions.find(t => t.clientId === id && t.date === today() && t.status !== 'voided');
      const items = cfCart.map(i => ({ date: i.date, description: i.description, name: i.name, unitCost: i.unitCost, intRate: i.intRate, amount: cfLineAmt(i), invId: null }));
      const newSub = cfCart.reduce((s, i) => s + cfLineSub(i), 0);
      const newInt = cfCart.reduce((s, i) => s + cfLineInt(i), 0);
      const newGT = newSub + newInt;
      if (existingTx) {
        existingTx.items = [...(existingTx.items || []), ...items];
        existingTx.subtotal = (existingTx.subtotal || 0) + newSub;
        existingTx.totalInterest = (existingTx.totalInterest || 0) + newInt;
        existingTx.grandTotal = (existingTx.grandTotal || 0) + newGT;
        await dbPut('transactions', existingTx);
      } else {
        const invNos = state.transactions.filter(t => t.invoiceNo?.startsWith('INV-')).map(t => parseInt(t.invoiceNo.replace('INV-','')) || 0);
        const nextNo = invNos.length > 0 ? Math.max(...invNos) + 1 : 1;
        const invoiceNo = 'INV-' + String(nextNo).padStart(5,'0');
        const cfPay = document.getElementById('cf-payment')?.value || 'Cash';
        await dbAdd('transactions', { invoiceNo, clientId: id, clientName: name, date: today(), createdAt: now(), items, subtotal: newSub, totalInterest: newInt, discount: 0, scDiscount: 0, grandTotal: newGT, paymentMethod: cfPay, status: newGT <= 0 ? 'paid' : 'pending' });
      }
      c.balance = (c.balance || 0) + newGT;
      await dbPut('clients', c);
    }
    toast('Client updated');
    sessionStorage.removeItem('clientFormDraft');
  } else {
    const clientId = await dbAdd('clients', { name, phone, address, balance: 0, dueDate: ddEl.value || '', createdAt: now(), ledgerYear: lyEl ? lyEl.value || '' : '' });
    if (cfCart.length > 0) {
      const subtotal = cfCart.reduce((s, i) => s + cfLineSub(i), 0);
      const totalInterest = cfCart.reduce((s, i) => s + cfLineInt(i), 0);
      const grandTotal = subtotal + totalInterest;
      const invNos = state.transactions.filter(t => t.invoiceNo?.startsWith('INV-')).map(t => parseInt(t.invoiceNo.replace('INV-','')) || 0);
      const nextNo = invNos.length > 0 ? Math.max(...invNos) + 1 : 1;
      const invoiceNo = 'INV-' + String(nextNo).padStart(5,'0');
      const items = cfCart.map(i => ({ date: i.date, description: i.description, name: i.name, unitCost: i.unitCost, intRate: i.intRate, amount: cfLineAmt(i), invId: null }));
      const cfPay = document.getElementById('cf-payment')?.value || 'Cash';
      await dbAdd('transactions', { invoiceNo, clientId, clientName: name, date: today(), createdAt: now(), items, subtotal, totalInterest, discount: 0, scDiscount: 0, grandTotal, paymentMethod: cfPay, status: grandTotal <= 0 ? 'paid' : 'pending' });
      const c = await dbGet('clients', clientId);
      if (c) { c.balance = (c.balance || 0) + grandTotal; await dbPut('clients', c); }
    }
    toast('Client added');
  }
  sessionStorage.removeItem('clientFormDraft');
  closeModal();
  state.clients = await dbAll('clients');
  state.transactions = await dbAll('transactions');
  renderClientGrid();
}

export async function viewClientHistory(id) {
  const c = await dbGet('clients', id);
  if (!c) { toast('Client not found', 'error'); return; }
  const allTx = filterByYear(state.transactions.filter(t => t.clientId === id), 'date').sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const allPays = filterByYear(state.payments.filter(p => p.clientId === id), 'date').sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const totalSpent = allTx.reduce((s, t) => s + (t.grandTotal || 0), 0);
  const totalPaid = allPays.reduce((s, p) => s + (p.amount || 0), 0);
  let activeTab = 'all';
  const tabContent = (tab) => {
    const txns = tab === 'payments' ? [] : allTx;
    const pays = tab === 'sales' ? [] : allPays;
    const items = [...txns.map(t => ({ type: 'sale', sort: t.createdAt, t })), ...pays.map(p => ({ type: 'pay', sort: p.createdAt, p }))].sort((a, b) => new Date(b.sort) - new Date(a.sort));
    if (items.length === 0) return '<p class="text-gray-400 text-sm text-center py-4">No activity</p>';
    let runningBal = c.balance || 0;
    return items.slice(0, 50).map(item => {
      if (item.type === 'sale') {
        const t = item.t;
        const rb = runningBal;
        runningBal -= t.grandTotal || 0;
        return `<div class="border dark:border-gray-700 rounded-lg mb-2 overflow-hidden">
          <div class="flex justify-between items-center px-3 py-2 bg-gray-50 dark:bg-gray-700 cursor-pointer" onclick="this.nextElementSibling.classList.toggle('hidden')">
            <div><span class="text-sm font-medium">${escHtml(t.invoiceNo||'Sale')}</span><span class="text-xs text-gray-400 ml-2">${fmtDateTime(t.createdAt)}</span></div>
            <div class="flex items-center gap-2"><span class="text-sm font-semibold text-blue-600">${peso(t.grandTotal)}</span><span class="text-xs ${t.paymentMethod==='Cash'?'text-green-600':'text-orange-600'}">${escHtml(t.paymentMethod||'')}</span><span class="text-xs font-mono ${rb>0?'text-orange-600':'text-gray-500'}">Bal: ${peso(rb)}</span><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-gray-400"><polyline points="6 9 12 15 18 9"/></svg></div>
          </div>
          <div class="hidden px-3 pb-2">
            <table class="w-full text-xs mt-1"><thead><tr class="text-gray-500"><th class="p-1 text-left">Item</th><th class="p-1 text-center">Qty</th><th class="p-1 text-right">Price</th><th class="p-1 text-right">Int</th><th class="p-1 text-right">Amount</th></tr></thead><tbody>
            ${(t.items||[]).map(i => `<tr class="border-b dark:border-gray-700 last:border-0"><td class="p-1">${escHtml(i.description||'')}</td><td class="p-1 text-center">${escHtml(i.name||'1')}</td><td class="p-1 text-right">${peso(i.unitCost||0)}</td><td class="p-1 text-right">${i.intRate?i.intRate+'%':'-'}</td><td class="p-1 text-right font-medium">${peso((getQty(i.name||i.qty||1)*(i.unitCost||0)))}</td></tr>`).join('')}
            ${t.totalInterest > 0 || t.discount > 0 || t.scDiscount > 0 ? `<tr class="font-semibold"><td colspan="4" class="p-1 text-right text-xs">${t.totalInterest>0?'Interest: '+peso(t.totalInterest)+' ':''}${t.scDiscount>0?'SC/PWD: -'+peso(t.scDiscount)+' ':''}${t.discount>0?'Discount: -'+peso(t.discount):''}</td><td class="p-1 text-right font-bold">${peso(t.grandTotal)}</td></tr>` : ''}
            </tbody></table>
            <button onclick="deleteClientSale(${t.id},${c.id})" class="text-xs text-red-500 hover:text-red-700 mt-1">Delete this sale</button>
          </div>
        </div>`;
      } else {
        const p = item.p;
        const rb = runningBal;
        runningBal += p.amount || 0;
        return `<div class="flex justify-between items-center px-3 py-2 border dark:border-gray-700 rounded-lg mb-2">
          <div><span class="text-sm font-medium text-green-600">Payment</span><span class="text-xs text-gray-400 ml-2">${fmtDateTime(p.createdAt)}</span><span class="text-xs text-gray-400 ml-1">${escHtml(p.type||'')} ${p.notes ? '· '+escHtml(p.notes) : ''}</span></div>
          <div class="flex items-center gap-2"><span class="text-sm font-semibold text-green-600">-${peso(p.amount)}</span><span class="text-xs font-mono ${rb>0?'text-orange-600':'text-gray-500'}">Bal: ${peso(rb)}</span></div>
        </div>`;
      }
    }).join('');
  };
  modal(`<div class="p-4 flex flex-col" style="min-height:70vh">
    <div class="flex justify-between items-center mb-3 shrink-0">
      <div><h3 class="text-xl font-bold">${escHtml(c.name)}</h3><p class="text-xs text-gray-500">${escHtml(c.phone||'')}${c.address?' · '+escHtml(c.address):''}</p></div>
      <div class="flex gap-1 flex-wrap justify-end">
        <button onclick="closeModal();openClientModal(${c.id})" class="px-2 py-1 text-xs bg-blue-600 text-white rounded"><svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="inline-block mr-0.5 -mt-0.5"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>Edit</button>
        <button onclick="closeModal();recordClientPayment(${c.id})" class="px-2 py-1 text-xs bg-green-600 text-white rounded"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" class="inline-block mr-0.5 -mt-0.5"><path d="M12 2v20M6 7h9a4 4 0 0 1 0 8H6"/><line x1="4" y1="11" x2="17" y2="11"/></svg>Bayad</button>
        <button onclick="closeModal();printClientInfo(${c.id})" class="px-2 py-1 text-xs bg-gray-600 text-white rounded"><svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="inline-block mr-0.5 -mt-0.5"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>Print</button>
        <button onclick="closeModal();deleteClient(${c.id})" class="px-2 py-1 text-xs bg-red-600 text-white rounded"><svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="inline-block mr-0.5 -mt-0.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>Del</button>
      </div>
    </div>
    <div class="grid grid-cols-4 gap-2 mb-3 shrink-0">
      <div class="bg-gray-50 dark:bg-gray-700 p-2 rounded-lg text-center"><p class="text-xs text-gray-500">Balance</p><p class="text-lg font-bold ${(c.balance||0)>0?'text-red-600':'text-green-600'}">${peso(c.balance)}</p></div>
      <div class="bg-gray-50 dark:bg-gray-700 p-2 rounded-lg text-center"><p class="text-xs text-gray-500">Spent</p><p class="text-lg font-bold">${peso(totalSpent)}</p></div>
      <div class="bg-gray-50 dark:bg-gray-700 p-2 rounded-lg text-center"><p class="text-xs text-gray-500">Paid</p><p class="text-lg font-bold text-green-600">${peso(totalPaid)}</p></div>
      <div class="bg-gray-50 dark:bg-gray-700 p-2 rounded-lg text-center"><p class="text-xs text-gray-500">Due</p><p class="text-lg font-bold ${c.dueDate && c.dueDate < today() ? 'text-red-600' : 'text-gray-600'}">${c.dueDate ? fmtDate(c.dueDate) : '—'}</p></div>
    </div>
    <div class="flex gap-1 mb-2 shrink-0 border-b dark:border-gray-700">
      <button class="px-3 py-1.5 text-xs font-semibold rounded-t ${activeTab==='all'?'bg-white dark:bg-gray-700 border border-b-0 dark:border-gray-600':'text-gray-500 hover:text-gray-700'}" onclick="document.getElementById('cht-tab-all').classList.remove('hidden');document.getElementById('cht-tab-sales').classList.add('hidden');document.getElementById('cht-tab-payments').classList.add('hidden');this.classList.add('bg-white','dark:bg-gray-700','border','border-b-0');this.parentElement.querySelectorAll('button').forEach(b=>{if(b!==this){b.classList.remove('bg-white','dark:bg-gray-700','border','border-b-0');b.classList.add('text-gray-500')}})">All (${allTx.length + allPays.length})</button>
      <button class="px-3 py-1.5 text-xs font-semibold rounded-t text-gray-500 hover:text-gray-700" onclick="document.getElementById('cht-tab-all').classList.add('hidden');document.getElementById('cht-tab-sales').classList.remove('hidden');document.getElementById('cht-tab-payments').classList.add('hidden');this.classList.add('bg-white','dark:bg-gray-700','border','border-b-0');this.parentElement.querySelectorAll('button').forEach(b=>{if(b!==this){b.classList.remove('bg-white','dark:bg-gray-700','border','border-b-0');b.classList.add('text-gray-500')}})">Sales (${allTx.length})</button>
      <button class="px-3 py-1.5 text-xs font-semibold rounded-t text-gray-500 hover:text-gray-700" onclick="document.getElementById('cht-tab-all').classList.add('hidden');document.getElementById('cht-tab-sales').classList.add('hidden');document.getElementById('cht-tab-payments').classList.remove('hidden');this.classList.add('bg-white','dark:bg-gray-700','border','border-b-0');this.parentElement.querySelectorAll('button').forEach(b=>{if(b!==this){b.classList.remove('bg-white','dark:bg-gray-700','border','border-b-0');b.classList.add('text-gray-500')}})">Payments (${allPays.length})</button>
    </div>
    <div class="flex-1 overflow-auto min-h-0 space-y-1">
      <div id="cht-tab-all">${tabContent('all')}</div>
      <div id="cht-tab-sales" class="hidden">${tabContent('sales')}</div>
      <div id="cht-tab-payments" class="hidden">${tabContent('payments')}</div>
    </div>
    ${allTx.length > 50 || allPays.length > 50 ? '<p class="text-xs text-gray-400 text-center shrink-0 pt-1">Showing last 50 entries</p>' : ''}
  </div>`);
}

export async function printClientInfo(id) {
  const c = await dbGet('clients', id);
  if (!c) { toast('Client not found', 'error'); return; }
  const txns = filterByYear(state.transactions.filter(t => t.clientId === id), 'date').sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  const pays = filterByYear(state.payments.filter(p => p.clientId === id), 'date').sort((a, b) => new Date(a.date || a.createdAt) - new Date(b.date || b.createdAt));

  function amt(n) { return (Number(n)||0).toFixed(2); }

  let html = '';

  html += `<div style="margin-bottom:16px"><h2 style="margin:0 0 4px;font-size:18px">${escHtml(c.name)}</h2>`;
  if (c.address) html += `<p style="margin:1px 0;color:#475569">${escHtml(c.address)}</p>`;
  if (c.phone) html += `<p style="margin:1px 0;color:#475569">${escHtml(c.phone)}</p>`;
  html += `</div>`;

  if (txns.length > 0) {
    let runningBal = 0;
    txns.forEach((t, ti) => {
      if (ti > 0) html += `<div style="page-break-before:always;margin-top:0;height:0"></div>`;
      runningBal += t.grandTotal || 0;
      html += `<div style="page-break-inside:avoid;margin-bottom:14px">`;
      html += `<h4 style="margin:0 0 4px;font-size:12px;color:#0f172a">${escHtml(t.invoiceNo||'Sale')} — ${escHtml(fmtDate(t.date||t.createdAt))} — ₱${amt(t.grandTotal)} <span style="color:#d97706;font-weight:600">Bal: ₱${amt(runningBal)}</span></h4>`;
      html += `<table class="print-table"><thead><tr><th>Date</th><th>Description</th><th class="ctr">Name/Qty</th><th class="num">Unit Cost</th><th class="num">Amount</th><th class="num">Interest</th><th class="num">Total</th></tr></thead><tbody>`;
      (t.items||[]).forEach(item => {
        const sub = getQty(item.name||item.qty) * (item.unitCost||item.price||0);
        const r = item.intRate || 0;
        const iDate = item.date || t.date;
        const days = r > 0 && sub > 0 ? Math.max(1, Math.floor((new Date(today()) - new Date(iDate)) / 86400000)) : 0;
        const intr = days > 0 ? calcInterest(sub, r, days) : 0;
        html += `<tr><td style="color:#000">${item.date ? escHtml(item.date) : escHtml(fmtDate(t.date||t.createdAt))}</td><td style="color:#000">${escHtml(item.description||'')}</td><td class="ctr" style="color:#000">${escHtml(item.name||item.qty||'1')}</td><td class="num" style="color:#000">₱${amt(item.unitCost||item.price||0)}</td><td class="num" style="color:#000">₱${amt(sub)}</td><td class="num" style="color:#000">${intr > 0 ? '₱'+amt(intr) : '-'}</td><td class="num" style="font-weight:600;color:#000">₱${amt(sub + intr)}</td></tr>`;
      });
      html += `</tbody></table>`;
      if (t.totalInterest > 0 || t.discount > 0 || t.scDiscount > 0) {
        html += `<div style="font-size:10px;text-align:right;padding:2px 0">`;
        if (t.totalInterest > 0) html += `<div>Interest: ₱${amt(t.totalInterest)}</div>`;
        if (t.scDiscount > 0) html += `<div>SC/PWD: -₱${amt(t.scDiscount)}</div>`;
        if (t.discount > 0) html += `<div>Discount: -₱${amt(t.discount)}</div>`;
        html += `</div>`;
      }
      html += `</div>`;
    });
  }

  if (pays.length > 0) {
    html += `<div style="page-break-inside:avoid;margin-bottom:14px">`;
    html += `<h4 style="margin:0 0 4px;font-size:12px;color:#0f172a">Payments</h4>`;
    html += `<table class="print-table"><thead><tr><th>Date</th><th class="num">Amount</th><th class="num">Bal.</th><th>Type</th><th>Notes</th></tr></thead><tbody>`;
    let runningBal = (c.balance || 0) + pays.reduce((s, p) => s + (p.amount||0), 0);
    pays.forEach(p => {
      runningBal -= p.amount || 0;
      html += `<tr><td>${escHtml(fmtDate(p.date||p.createdAt))}</td><td class="num" style="color:#059669;font-weight:600">-₱${amt(p.amount)}</td><td class="num" style="color:#d97706">₱${amt(runningBal)}</td><td>${escHtml(p.type||'Partial')}</td><td>${escHtml(p.notes||'')}</td></tr>`;
    });
    html += `</tbody></table></div>`;
  }

  html += `<div style="border-top:2px solid #1e293b;padding-top:10px;margin-top:6px;text-align:center">`;
  const balColor = (c.balance||0) > 0 ? '#dc2626' : '#059669';
  html += `<h3 style="margin:0 0 4px;color:${balColor}">Remaining Balance: ₱${amt(c.balance)}</h3>`;
  if ((c.balance || 0) <= 0) html += `<p style="font-weight:700;font-size:15px;margin:4px 0;color:#059669">FULLY PAID</p>`;
  html += `</div>`;

  openPrintWindow('Client - '+c.name, 1200, 800, html);
}

export async function recordClientPayment(id) {
  const c = await dbGet('clients', id);
  if (!c) { toast('Client not found', 'error'); return; }
  modal(`
    <div class="p-6">
      <div class="flex justify-between items-center mb-4"><h3 class="text-xl font-bold">Bayad — ${escapeHtml(c.name)}</h3><button onclick="closeModal()" class="text-gray-400 hover:text-gray-600"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button></div>
      <p class="text-sm text-gray-500 mb-3">Current balance: <strong class="${(c.balance||0)>0?'text-red-600':'text-green-600'}">${peso(c.balance)}</strong></p>
      <div class="space-y-3">
        <div class="grid grid-cols-2 gap-3">
          <div><label class="text-xs text-gray-500 block">Date</label><input id="cp-date" type="date" value="${today()}" class="w-full px-3 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800" /></div>
          <div><label class="text-xs text-gray-500 block">Amount *</label><input id="cp-amount" type="number" step="0.01" class="w-full px-3 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800" /></div>
        </div>
        <div class="flex gap-2">
          <button onclick="document.getElementById('cp-amount').value=${Math.min(100, c.balance||0).toFixed(2)}" class="flex-1 py-2 bg-gray-100 dark:bg-gray-700 rounded-lg text-sm hover:bg-gray-200">100</button>
          <button onclick="document.getElementById('cp-amount').value=${Math.min(500, c.balance||0).toFixed(2)}" class="flex-1 py-2 bg-gray-100 dark:bg-gray-700 rounded-lg text-sm hover:bg-gray-200">500</button>
          <button onclick="document.getElementById('cp-amount').value=${Math.min(1000, c.balance||0).toFixed(2)}" class="flex-1 py-2 bg-gray-100 dark:bg-gray-700 rounded-lg text-sm hover:bg-gray-200">1000</button>
          <button onclick="document.getElementById('cp-amount').value=${(c.balance||0).toFixed(2)}" class="flex-1 py-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg text-sm hover:bg-blue-200">Full</button>
        </div>
        <div><label class="text-xs text-gray-500 block">Notes</label><textarea id="cp-notes" rows="2" class="w-full px-3 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm"></textarea></div>
        <div class="flex gap-2 pt-2">
          <button onclick="saveClientPayment(${c.id})" class="flex-1 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-semibold"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="inline-block mr-1 -mt-0.5"><polyline points="20 6 9 17 4 12"/></svg>Record Payment</button>
          <button onclick="closeModal()" class="px-4 py-2 bg-gray-200 dark:bg-gray-700 rounded-lg"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="inline-block mr-1 -mt-0.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>Cancel</button>
        </div>
      </div>
    </div>`);
}

export async function saveClientPayment(id) {
  const amtEl = document.getElementById('cp-amount');
  const dtEl = document.getElementById('cp-date');
  const ntEl = document.getElementById('cp-notes');
  if (!amtEl || !dtEl || !ntEl) { toast('Form not ready', 'error'); return; }
  const amount = parseFloat(amtEl.value);
  if (!amount || amount <= 0) { toast('Valid amount required', 'error'); return; }
  const c = await dbGet('clients', id);
  if (!c) { toast('Client not found', 'error'); return; }
  const wasFullyPaid = (c.balance || 0) <= 0;
  c.balance = Math.max(0, (c.balance || 0) - amount);
  await dbPut('clients', c);
  await dbAdd('payments', { clientId: id, clientName: c.name, amount, date: dtEl.value || today(), type: amount >= (c.balance + amount) ? 'Full' : 'Partial', notes: ntEl.value.trim(), createdAt: now() });
  state.payments = await dbAll('payments');
  state.clients = await dbAll('clients');
  closeModal();
  renderClientGrid();
  playSound('payment');
  if (!wasFullyPaid && c.balance <= 0) confetti();
  await viewClientHistory(id);
  toast('Payment recorded', 'success');
}

export async function deleteClientSale(txnId, clientId) {
  if (!await confirmModal('Delete this sale? Client balance will be adjusted.')) return;
  const t = state.transactions.find(x => x.id === txnId);
  if (!t) { toast('Transaction not found', 'error'); return; }
  const c = await dbGet('clients', clientId);
  await dbDel('transactions', txnId);
  if (c) {
    c.balance = Math.max(0, (c.balance || 0) - (t.grandTotal || 0));
    await dbPut('clients', c);
  }
  state.transactions = await dbAll('transactions');
  state.clients = await dbAll('clients');
  closeModal();
  renderClientGrid();
  await viewClientHistory(clientId);
  toast('Sale deleted, balance adjusted');
}

export function importClients() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.csv';
  input.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const text = await file.text();
    const lines = text.split('\n');
    let count = 0;
    for (let i = 1; i < lines.length; i++) {
      const parts = parseCSVLine(lines[i]);
      if (parts[0]) {
        await dbAdd('clients', { name: parts[0], phone: parts[1] || '', address: parts[2] || '', balance: parseFloat(parts[3]) || 0, createdAt: now() });
        count++;
      }
    }
  state.clients = await dbAll('clients');
    renderClientGrid();
    toast(`Imported ${count} clients`);
  };
  input.click();
}

export async function deleteClient(id) {
  const c = state.clients.find(x => x.id === id);
  if (!c) return;
  const txCount = state.transactions.filter(t => t.clientId === id).length;
  const payCount = state.payments.filter(p => p.clientId === id).length;
  let msg = `Delete client "${c.name}"?`;
  if (txCount > 0 || payCount > 0) msg = `"${c.name}" has ${txCount} sale(s) and ${payCount} payment(s). All history will be removed. Continue?`;
  else if ((c.balance || 0) > 0) msg = `"${c.name}" owes ${peso(c.balance)}. Deleting will lose this debt. Continue?`;
  if (!await confirmModal(msg)) return;
  await dbDel('clients', id);
  await Promise.all(state.transactions.filter(t => t.clientId === id).map(t => dbDel('transactions', t.id)));
  await Promise.all(state.payments.filter(p => p.clientId === id).map(p => dbDel('payments', p.id)));
  state.clients = state.clients.filter(x => x.id !== id);
  state.transactions = state.transactions.filter(t => t.clientId !== id);
  state.payments = state.payments.filter(p => p.clientId !== id);
  renderClientGrid();
  toast('Client and all associated records deleted');
}

export function exportAllClientsCSV() {
  if (!state.clients || !state.clients.length) { toast('No clients to export', 'info'); return; }
  const esc = s => (''+s).replace(/"/g,'""');
  let csv = 'Name,Phone,Address,Balance\n';
  state.clients.forEach(c => {
    csv += `"${esc(c.name)}","${esc(c.phone||'')}","${esc(c.address||'')}",${c.balance||0}\n`;
  });
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'all_clients.csv'; a.click();
  URL.revokeObjectURL(url);
  toast('All clients exported');
}

function exportClientHistory(id) {
  const c = state.clients.find(x => x.id === id);
  if (!c) { toast('Client not found', 'error'); return; }
  const txns = state.transactions.filter(t => t.clientId === id).sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  const pays = state.payments.filter(p => p.clientId === id).sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  const esc = s => (''+s).replace(/"/g,'""');
  let csv = 'Type,Date,Description,Amount\n';
  txns.forEach(t => { csv += `Sale,${t.date || t.createdAt},"${esc(t.invoiceNo||'')}",${t.grandTotal||0}\n`; });
  pays.forEach(p => { csv += `Payment,${p.date || p.createdAt},"${esc(p.notes||'')}",-${p.amount||0}\n`; });
  csv += `\nFinal Balance,${c.balance||0}\n`;
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `${c.name.replace(/[^a-zA-Z0-9]/g,'_')}_history.csv`; a.click();
  URL.revokeObjectURL(url);
  toast('CSV exported');
}


// expose top-level bindings as globals (inline onclick handlers and legacy code paths rely on them)
Object.defineProperties(window, {
  viewClients: { get: () => viewClients, configurable: true },
  _clientFiltered: { get: () => _clientFiltered, set: (v) => { _clientFiltered = v; }, configurable: true },
  _clientPage: { get: () => _clientPage, set: (v) => { _clientPage = v; }, configurable: true },
  CLIENT_PAGE_SIZE: { get: () => CLIENT_PAGE_SIZE, configurable: true },
  debouncedRenderClientGrid: { get: () => debouncedRenderClientGrid, configurable: true },
  renderClientGrid: { get: () => renderClientGrid, configurable: true },
  cfCart: { get: () => cfCart, set: (v) => { cfCart = v; }, configurable: true },
  cfLineSub: { get: () => cfLineSub, configurable: true },
  cfLineInt: { get: () => cfLineInt, configurable: true },
  cfLineAmt: { get: () => cfLineAmt, configurable: true },
  saveClientDraft: { get: () => saveClientDraft, configurable: true },
  openClientModal: { get: () => openClientModal, configurable: true },
  cfAddInvItem: { get: () => cfAddInvItem, configurable: true },
  cfUpdateRowAmt: { get: () => cfUpdateRowAmt, configurable: true },
  cfRenderCart: { get: () => cfRenderCart, configurable: true },
  cfUpdateTotals: { get: () => cfUpdateTotals, configurable: true },
  saveClient: { get: () => saveClient, configurable: true },
  viewClientHistory: { get: () => viewClientHistory, configurable: true },
  printClientInfo: { get: () => printClientInfo, configurable: true },
  recordClientPayment: { get: () => recordClientPayment, configurable: true },
  saveClientPayment: { get: () => saveClientPayment, configurable: true },
  deleteClientSale: { get: () => deleteClientSale, configurable: true },
  importClients: { get: () => importClients, configurable: true },
  deleteClient: { get: () => deleteClient, configurable: true },
  exportAllClientsCSV: { get: () => exportAllClientsCSV, configurable: true }
});
