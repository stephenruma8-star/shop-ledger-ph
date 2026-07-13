function getQty(name) { const m = String(name||'1').match(/^[\d.]+/); return m ? parseFloat(m[0]) : 1; }
function lineSub(item) { return getQty(item.name) * (item.unitCost || 0); }
function lineInt(item) { return lineSub(item) * ((item.intRate||0) / 100); }
function lineAmt(item) { return lineSub(item) + lineInt(item); }

let txCart = [];
let txEditingId = null;

function updateCartRowAmt(i) {
  const el = document.getElementById('cart-amt-' + i);
  if (el) el.textContent = peso(lineAmt(txCart[i]));
}

var debouncedRenderTxTable = debounce(renderTxTable, 250);

async function viewTransactions(root) {
  await Promise.all([
    dbLoad('transactions'),
    dbLoad('clients'),
    dbLoad('quickItems'),
    dbLoad('inventory')
  ]);
  root.innerHTML = `
    <div class="space-y-4 fade-in">
      <div class="flex gap-2 flex-wrap items-center">
        <input id="txSearch" placeholder="Search transactions..." class="flex-1 min-w-[200px] px-4 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800" oninput="debouncedRenderTxTable()" />
        <input id="txDateFrom" type="date" class="w-36 px-3 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm" onchange="renderTxTable()" />
        <input id="txDateTo" type="date" class="w-36 px-3 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm" onchange="renderTxTable()" />
        <button onclick="document.getElementById('txDateFrom').value='';document.getElementById('txDateTo').value='';renderTxTable()" class="px-3 py-2 text-sm border dark:border-gray-700 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">Clear</button>
        <button onclick="openTransactionModal()" class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">+ New Sale</button>
      </div>
      <div class="bg-white dark:bg-gray-800 rounded-xl shadow-sm overflow-hidden glass-card">
        <div class="overflow-auto" id="txTable"></div>
      </div>
    </div>`;
  renderTxTable();
}

function renderTxTable() {
  const q = document.getElementById('txSearch')?.value || '';
  const dFrom = document.getElementById('txDateFrom')?.value || '';
  const dTo = document.getElementById('txDateTo')?.value || '';
  let filtered = searchData(state.transactions, q, ['invoiceNo','clientName','paymentMethod']);
  if (dFrom) filtered = filtered.filter(t => (t.date || '') >= dFrom);
  if (dTo) filtered = filtered.filter(t => (t.date || '') <= dTo);
  const sorted = [...filtered].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const container = document.getElementById('txTable');
  if (!container) return;
  if (sorted.length === 0) { container.innerHTML = '<div class="p-6 text-center text-gray-400">No transactions yet</div>'; return; }
  container.innerHTML = `<table class="w-full text-sm"><thead><tr class="bg-gray-50 dark:bg-gray-700 text-left"><th class="p-3">Invoice</th><th class="p-3">Date</th><th class="p-3">Client</th><th class="p-3">Items</th><th class="p-3 text-right">Total</th><th class="p-3">Method</th><th class="p-3 text-center">Actions</th></tr></thead>
    <tbody>${sorted.slice(0, 100).map(t => `<tr class="border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer" onclick="viewTransactionDetail(${t.id})">
      <td class="p-3 font-medium">${t.invoiceNo || 'N/A'}</td><td class="p-3 text-gray-500">${fmtDate(t.date)}</td>
      <td class="p-3">${escapeHtml(t.clientName || 'Walk-in')}</td><td class="p-3">${(t.items||[]).length}</td>
      <td class="p-3 text-right font-bold">${peso(t.grandTotal)}</td>
      <td class="p-3"><span class="px-2 py-0.5 rounded-full text-xs ${t.paymentMethod === 'Cash' ? 'bg-green-100 text-green-700 dark:bg-green-900/30' : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30'}">${escapeHtml(t.paymentMethod || 'Cash')}</span></td>
      <td class="p-3 text-center"><button onclick="event.stopPropagation();printReceipt(${t.id})" class="text-blue-600 hover:text-blue-800 text-xs underline">Print</button></td>
    </tr>`).join('')}</tbody></table>`;
}

function openTransactionModal() {
  txCart = [];
  txEditingId = null;
  renderTransactionModal(null);
}

function renderTransactionModal(editTxn) {
  const isEdit = !!editTxn;
  if (!isEdit) { txCart = []; txEditingId = null; }
  const clients = state.clients;
  const inv = state.inventory.filter(i => (i.stock || 0) > 0);
  const qItems = state.quickItems;
  const selClient = isEdit && editTxn.clientId ? editTxn.clientId : '';
  const selPay = isEdit ? editTxn.paymentMethod || 'Cash' : 'Cash';
  const selDisc = isEdit ? (editTxn.discount || 0) - (editTxn.scDiscount || 0) : 0;
  const selSC = isEdit && (editTxn.scDiscount || 0) > 0;
  modal(`
    <div class="p-6">
      <div class="flex justify-between items-center mb-4"><h3 class="text-xl font-bold">${isEdit ? 'Edit Sale' : 'New Sale'}</h3><button onclick="closeModal()" class="text-gray-400 text-2xl">&times;</button></div>
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div class="space-y-3">
          <div class="grid grid-cols-2 gap-2">
            <div><label class="text-xs text-gray-500 block">Client</label><select id="tm-client" class="w-full px-3 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm"><option value="">Walk-in</option>${clients.map(c => `<option value="${c.id}" ${c.id === selClient ? 'selected' : ''}>${escapeHtml(c.name)}</option>`).join('')}</select></div>
            <div><label class="text-xs text-gray-500 block">Payment</label><select id="tm-payment" class="w-full px-3 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm"><option ${selPay==='Cash'?'selected':''}>Cash</option><option ${selPay==='GCash'?'selected':''}>GCash</option><option ${selPay==='Maya'?'selected':''}>Maya</option><option ${selPay==='Bank Transfer'?'selected':''}>Bank Transfer</option></select></div>
          </div>
          <div class="grid grid-cols-2 gap-2">
            <div><label class="text-xs text-gray-500 block">Discount (₱)</label><input id="tm-discount" type="number" value="${selDisc}" min="0" step="0.01" class="w-full px-3 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm" oninput="updateTMTotals()" /></div>
            <div></div>
          </div>
          <div class="flex gap-2">
            <label class="flex items-center gap-1 text-sm"><input type="checkbox" id="tm-sc" onchange="toggleSC()" ${selSC ? 'checked' : ''} /> SC/PWD 20% Discount</label>
          </div>
          <div class="flex gap-2 flex-wrap">
            <select id="tm-item-select" class="flex-1 min-w-[140px] px-3 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm"><option value="">Inventory item...</option>${inv.map(i => `<option value="${i.id}" data-name="${escapeHtml(i.name)}" data-price="${i.sellPrice||i.price||0}">${escapeHtml(i.name)} - ${peso(i.sellPrice||i.price||0)}</option>`).join('')}</select>
            <input id="tm-qty" type="number" value="1" min="1" class="w-14 px-2 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm text-center" />
            <button onclick="addToCart()" class="px-3 py-2 bg-blue-600 text-white rounded-lg text-sm whitespace-nowrap">+ Add Item</button>
          </div>
          ${qItems.length > 0 ? `<div><label class="text-xs text-gray-500 block">Quick Items (click to add row)</label><div class="flex flex-wrap gap-1">${qItems.map(q => `<button data-qiname="${escapeHtml(q.name)}" data-qiprice="${q.price}" onclick="quickAddToCart(this.dataset.qiname, parseFloat(this.dataset.qiprice))" class="px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded text-xs hover:bg-gray-200 dark:hover:bg-gray-600">${escapeHtml(q.name)} ${peso(q.price)}</button>`).join('')}</div></div>` : ''}
        </div>
        <div>
          <div class="flex justify-between items-center mb-2"><h4 class="font-semibold text-sm">Items</h4><button onclick="txCart.push({date:today(),description:'',name:'1',unitCost:0,intRate:0,invId:null});renderTMCart();updateTMTotals()" class="text-xs text-blue-600 hover:text-blue-800">+ Add Blank Row</button></div>
          <div id="tm-cart" class="max-h-72 overflow-auto border dark:border-gray-700 rounded-lg mb-2"></div>
          <div id="tm-totals" class="space-y-1 text-sm"></div>
          <button onclick="saveTransaction()" class="w-full mt-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-semibold">${isEdit ? 'Update Sale' : 'Complete Sale'}</button>
          ${isEdit ? `<p class="text-xs text-gray-400 mt-1 text-center">Editing ${editTxn.invoiceNo} — old data will be replaced</p>` : ''}
        </div>
      </div>
    </div>`);
  renderTMCart();
  updateTMTotals();
}

function addToCart() {
  const sel = document.getElementById('tm-item-select');
  const opt = sel.options[sel.selectedIndex];
  if (!opt || !opt.value) { toast('Select an item', 'warning'); return; }
  const id = parseInt(opt.value);
  const name = opt.dataset.name;
  const price = parseFloat(opt.dataset.price);
  const qty = parseInt(document.getElementById('tm-qty').value) || 1;
  const invItem = state.inventory.find(i => i.id === id);
  if (invItem && (invItem.stock || 0) < qty) { toast('Not enough stock', 'error'); return; }
  txCart.push({ date: today(), description: name, name: String(qty), unitCost: price, intRate: 0, invId: id });
  renderTMCart();
  updateTMTotals();
}

function quickAddToCart(name, price) {
  txCart.push({ date: today(), description: name, name: '1', unitCost: price, intRate: 0, invId: null });
  renderTMCart();
  updateTMTotals();
}

function renderTMCart() {
  const el = document.getElementById('tm-cart');
  if (!el) return;
  if (txCart.length === 0) { el.innerHTML = '<p class="text-gray-400 text-xs p-2">No items added yet</p>'; return; }
  el.innerHTML = `<table class="w-full text-xs"><thead><tr class="bg-gray-50 dark:bg-gray-700 sticky top-0"><th class="p-1 text-left">Date</th><th class="p-1 text-left">Description</th><th class="p-1 text-center">Name</th><th class="p-1 text-right">Unit Cost</th><th class="p-1 text-right">Int. Rate</th><th class="p-1 text-right">Amount</th><th class="p-1"></th></tr></thead><tbody>${txCart.map((item, i) => {
    return `<tr class="border-b dark:border-gray-700">
      <td class="p-1"><input type="date" value="${item.date}" onchange="txCart[${i}].date=this.value" class="w-24 px-1 py-1 border dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-xs" /></td>
      <td class="p-1"><input type="text" value="${escapeHtml(item.description)}" placeholder="Item..." onchange="txCart[${i}].description=this.value" class="w-28 px-1 py-1 border dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-xs" /></td>
      <td class="p-1"><input type="text" value="${escapeHtml(item.name)}" placeholder="1 pc" onchange="txCart[${i}].name=this.value;updateCartRowAmt(${i});updateTMTotals()" class="w-20 px-1 py-1 border dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-xs text-center" /></td>
      <td class="p-1"><input type="number" value="${item.unitCost}" min="0" step="0.01" onchange="txCart[${i}].unitCost=Math.max(0,parseFloat(this.value)||0);updateCartRowAmt(${i});updateTMTotals()" class="w-16 px-1 py-1 border dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-xs text-right" /></td>
      <td class="p-1"><div class="flex items-center gap-0.5"><input type="number" value="${item.intRate}" min="0" step="0.5" onchange="txCart[${i}].intRate=Math.max(0,parseFloat(this.value)||0);updateCartRowAmt(${i});updateTMTotals()" class="w-12 px-1 py-1 border dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-xs text-right" /><span class="text-gray-400 text-xs">%</span></div></td>
      <td class="p-1 text-right font-medium whitespace-nowrap" id="cart-amt-${i}">${peso(lineAmt(item))}</td>
      <td class="p-1"><button onclick="removeCartItem(${i})" class="text-red-500 text-xs">&times;</button></td>
    </tr>`;
  }).join('')}</tbody></table>`;
}

function removeCartItem(i) { txCart.splice(i, 1); renderTMCart(); updateTMTotals(); }

function updateTMTotals() {
  const el = document.getElementById('tm-totals');
  if (!el) return;
  const subtotal = txCart.reduce((s, i) => s + lineSub(i), 0);
  const totalInterest = txCart.reduce((s, i) => s + lineInt(i), 0);
  const scCheck = document.getElementById('tm-sc');
  const scDiscount = scCheck && scCheck.checked ? subtotal * 0.2 : 0;
  const discount = parseFloat(document.getElementById('tm-discount')?.value || 0) + scDiscount;
  const grandTotal = Math.max(0, subtotal + totalInterest - discount);
  el.innerHTML = `
    <div class="flex justify-between"><span>Subtotal (goods)</span><span>${peso(subtotal)}</span></div>
    ${totalInterest > 0 ? `<div class="flex justify-between text-amber-600"><span>Total Interest</span><span>${peso(totalInterest)}</span></div>` : ''}
    ${scDiscount > 0 ? `<div class="flex justify-between text-green-600"><span>SC/PWD 20%</span><span>-${peso(scDiscount)}</span></div>` : ''}
    ${discount > 0 ? `<div class="flex justify-between text-orange-600"><span>Discount</span><span>-${peso(discount)}</span></div>` : ''}
    <div class="flex justify-between font-bold text-lg border-t dark:border-gray-700 pt-1"><span>Total</span><span class="text-green-600">${peso(grandTotal)}</span></div>`;
}

function toggleSC() { updateTMTotals(); }

async function saveTransaction() {
  if (txCart.length === 0) { toast('Cart is empty', 'error'); return; }
  const subtotal = txCart.reduce((s, i) => s + lineSub(i), 0);
  const totalInterest = txCart.reduce((s, i) => s + lineInt(i), 0);
  const scCheck = document.getElementById('tm-sc');
  const scDiscount = scCheck && scCheck.checked ? subtotal * 0.2 : 0;
  const discount = parseFloat(document.getElementById('tm-discount')?.value || 0) + scDiscount;
  const grandTotal = Math.max(0, subtotal + totalInterest - discount);
  const clientSel = document.getElementById('tm-client');
  const clientId = clientSel.value ? parseInt(clientSel.value) : null;
  const clientName = clientSel.options[clientSel.selectedIndex]?.text || 'Walk-in';
  const paymentMethod = document.getElementById('tm-payment')?.value || 'Cash';

  if (txEditingId) {
    const oldTxn = await dbGet('transactions', txEditingId);
    if (!oldTxn) { toast('Original transaction not found', 'error'); return; }
    if (oldTxn.status === 'voided') { toast('Cannot edit a voided sale', 'error'); return; }
    for (const item of (oldTxn.items || [])) {
      if (item.invId) {
        const inv = await dbGet('inventory', item.invId);
        if (inv) { inv.stock = (inv.stock || 0) + getQty(item.name); await dbPut('inventory', inv); }
      }
    }
    if (oldTxn.clientId) {
      const oldC = await dbGet('clients', oldTxn.clientId);
      if (oldC) { oldC.balance = Math.max(0, (oldC.balance || 0) - (oldTxn.grandTotal || 0)); await dbPut('clients', oldC); }
    }
    const newItems = txCart.map(i => ({ date: i.date, description: i.description, name: i.name, unitCost: i.unitCost, intRate: i.intRate, amount: lineAmt(i), invId: i.invId }));
    for (const item of txCart) {
      if (item.invId) {
        const inv = await dbGet('inventory', item.invId);
        if (inv) { inv.stock = (inv.stock || 0) - getQty(item.name); await dbPut('inventory', inv); }
      }
    }
    if (clientId) {
      const c = await dbGet('clients', clientId);
      if (c) { c.balance = (c.balance || 0) + grandTotal; await dbPut('clients', c); }
    }
    const updated = { ...oldTxn, clientId, clientName, paymentMethod, items: newItems, subtotal, totalInterest, discount, scDiscount, grandTotal, editedAt: now() };
    await dbPut('transactions', updated);
    toast(`Sale ${oldTxn.invoiceNo} updated`, 'success');
    await logAudit('sale-edit', `Sale ${oldTxn.invoiceNo} updated: ${peso(oldTxn.grandTotal)} → ${peso(grandTotal)}`);
  } else {
    const invNos = state.transactions.filter(t => t.invoiceNo?.startsWith('INV-')).map(t => parseInt(t.invoiceNo.replace('INV-','')) || 0);
    const nextNo = invNos.length > 0 ? Math.max(...invNos) + 1 : 1;
    const invoiceNo = 'INV-' + String(nextNo).padStart(5,'0');
    const transaction = {
      invoiceNo, clientId, clientName, date: today(), createdAt: now(),
      items: txCart.map(i => ({ date: i.date, description: i.description, name: i.name, unitCost: i.unitCost, intRate: i.intRate, amount: lineAmt(i), invId: i.invId })),
      subtotal, totalInterest, discount, scDiscount, grandTotal,
      paymentMethod, status: grandTotal <= 0 ? 'paid' : 'pending'
    };
    const rollback = [];
    try {
      await dbAdd('transactions', transaction);
      for (const item of txCart) {
        if (item.invId) {
          const inv = await dbGet('inventory', item.invId);
          if (inv) {
            const dec = getQty(item.name);
            inv.stock = (inv.stock || 0) - dec;
            await dbPut('inventory', inv);
            rollback.push(() => dbGet('inventory', item.invId).then(i => { if (i) { i.stock = (i.stock || 0) + dec; return dbPut('inventory', i); } }));
          }
        }
      }
      if (clientId) {
        const c = await dbGet('clients', clientId);
        if (c) {
          c.balance = (c.balance || 0) + grandTotal;
          await dbPut('clients', c);
          rollback.push(() => dbGet('clients', clientId).then(cc => { if (cc) { cc.balance = (cc.balance || 0) - grandTotal; return dbPut('clients', cc); } }));
        }
      }
    } catch (err) {
      console.error('Sale failed, rolling back:', err);
      for (const fn of rollback.reverse()) await fn().catch(() => {});
      toast('Sale failed - rolled back: ' + err.message, 'error');
      return;
    }
    const settingsMap = {};
    state.settings.forEach(s => settingsMap[s.key] = s.value);
    const loyaltyRate = parseFloat(settingsMap['loyaltyRate']) || 0;
    if (clientId && loyaltyRate > 0 && grandTotal > 0) {
      const pts = Math.floor(grandTotal * (loyaltyRate / 100));
      if (pts > 0) {
        const existing = state.loyaltyPoints.find(l => l.clientId === clientId);
        if (existing) { existing.points = (existing.points || 0) + pts; existing.updatedAt = now(); await dbPut('loyaltyPoints', existing); }
        else { await dbAdd('loyaltyPoints', { clientId, clientName, points: pts, createdAt: now(), updatedAt: now() }); }
      }
    }
    toast(`Sale completed! Invoice: ${invoiceNo}`, 'success');
    await logAudit('sale', `Sale ${invoiceNo} - ${peso(grandTotal)}`);
  }
  [state.transactions, state.inventory, state.loyaltyPoints] = await Promise.all([
    dbAll('transactions'), dbAll('inventory'), dbAll('loyaltyPoints')
  ]);
  updateLowStockBadge();
  closeModal();
  renderTxTable();
}

function buildReceiptHTML(t) {
  const settingsMap = {};
  state.settings.forEach(s => settingsMap[s.key] = s.value);
  const shopName = settingsMap['shopName'] || 'Shop Ledger PH';
  const shopAddr = settingsMap['shopAddress'] || '';
  const shopContact = settingsMap['shopContact'] || '';
  const headerText = settingsMap['receiptHeaderText'] || '';
  const logo = settingsMap['receiptLogo'] || '';
  const footerMsg = settingsMap['receiptFooter'] || 'Thank you for your patronage!';
  const lines = [];
  if (logo) lines.push('[LOGO]');
  lines.push(' '.repeat(Math.max(0, Math.floor((32 - shopName.length) / 2))) + shopName);
  if (shopAddr) lines.push(' '.repeat(Math.max(0, Math.floor((32 - shopAddr.length) / 2))) + shopAddr);
  if (shopContact) lines.push('Contact: ' + shopContact);
  if (headerText) { headerText.split('\n').filter(Boolean).forEach(l => lines.push(l)); }
  lines.push('='.repeat(32));
  lines.push(' '.repeat(Math.max(0, Math.floor((32 - 14) / 2))) + 'OFFICIAL RECEIPT');
  lines.push('Invoice: ' + (t.invoiceNo || 'N/A'));
  lines.push('Date: ' + fmtDateTime(t.createdAt));
  if (t.clientName && t.clientName !== 'Walk-in') lines.push('Client: ' + t.clientName);
  lines.push('-'.repeat(32));
  (t.items || []).forEach(item => {
    const qt = item.name || String(item.qty || 1);
    const rate = item.intRate != null ? item.intRate : (item.interest ? +((item.interest / (getQty(item.name) * (item.unitCost || 1)) * 100).toFixed(1)) : 0);
    const sub = getQty(item.name||item.qty) * (item.unitCost||item.price||0);
    const intr = sub * (rate / 100);
    lines.push((item.description || item.name || 'Item') + (rate > 0 ? ` (${rate}% int)` : ''));
    lines.push(`  ${qt} x ${peso(item.unitCost || item.price)}  ${peso(sub + intr)}`);
  });
  lines.push('-'.repeat(32));
  lines.push(`Subtotal:         ${peso(t.subtotal)}`);
  if (t.totalInterest > 0) lines.push(`Interest:         ${peso(t.totalInterest)}`);
  if (t.scDiscount > 0) lines.push(`SC/PWD 20%:       -${peso(t.scDiscount)}`);
  if (t.discount > 0) lines.push(`Discount:         -${peso(t.discount)}`);
  lines.push(`TOTAL:            ${peso(t.grandTotal)}`);
  lines.push('='.repeat(32));
  lines.push('Payment: ' + (t.paymentMethod || 'Cash'));
  lines.push('');
  lines.push(footerMsg);
  lines.push('');
  return lines.join('\n');
}

function viewTransactionDetail(id) {
  const t = state.transactions.find(x => x.id === id);
  if (!t) { toast('Transaction not found', 'error'); return; }
  modal(`
    <div class="p-6">
      <div class="flex justify-between items-center mb-4">
        <div><h3 class="text-xl font-bold">${t.invoiceNo || 'N/A'}</h3><p class="text-sm text-gray-500">${fmtDate(t.date)} &middot; ${escapeHtml(t.paymentMethod || 'Cash')}</p></div>
        <button onclick="closeModal()" class="text-gray-400 text-2xl">&times;</button>
      </div>
      <div class="text-sm mb-4">${escapeHtml(t.clientName || 'Walk-in')}${t.clientId ? ` &middot; <a href="#" onclick="closeModal();viewClientHistory(${t.clientId})" class="text-blue-600">View Client</a>` : ''}</div>
      <table class="w-full text-xs mb-3"><thead><tr class="bg-gray-50 dark:bg-gray-700"><th class="p-2 text-left">Date</th><th class="p-2 text-left">Description</th><th class="p-2 text-center">Name</th><th class="p-2 text-right">Unit Cost</th><th class="p-2 text-right">Int.</th><th class="p-2 text-right">Amount</th></tr></thead>
        <tbody>${(t.items||[]).map(item => `<tr class="border-b dark:border-gray-700"><td class="p-2">${fmtDate(item.date)}</td><td class="p-2">${escapeHtml(item.description || '-')}</td><td class="p-2 text-center">${escapeHtml(item.name || item.qty || '')}</td><td class="p-2 text-right">${peso(item.unitCost||item.price||0)}</td><td class="p-2 text-right">${item.intRate != null ? item.intRate + '%' : (item.interest ? '₱'+item.interest : '-')}</td><td class="p-2 text-right font-medium">${peso(item.amount || lineAmt(item))}</td></tr>`).join('')}</tbody>
      </table>
      <div class="border-t dark:border-gray-700 pt-2 space-y-1 text-sm">
        <div class="flex justify-between"><span>Subtotal</span><span>${peso(t.subtotal)}</span></div>
        ${t.totalInterest > 0 ? `<div class="flex justify-between text-amber-600"><span>Interest</span><span>${peso(t.totalInterest)}</span></div>` : ''}
        ${t.scDiscount > 0 ? `<div class="flex justify-between text-green-600"><span>SC/PWD 20%</span><span>-${peso(t.scDiscount)}</span></div>` : ''}
        ${t.discount > 0 ? `<div class="flex justify-between text-orange-600"><span>Discount</span><span>-${peso(t.discount)}</span></div>` : ''}
        <div class="flex justify-between font-bold text-lg border-t dark:border-gray-700 pt-1"><span>Total</span><span class="text-green-600">${peso(t.grandTotal)}</span></div>
      </div>
      <div class="flex gap-2 mt-4">
        <button onclick="closeModal();printReceipt(${t.id})" class="flex-1 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">Print Receipt</button>
        ${t.status !== 'voided' ? `<button onclick="closeModal();editTransaction(${t.id})" class="px-3 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 text-sm">Edit</button>` : ''}
        ${t.status !== 'voided' ? `<button onclick="closeModal();voidTransaction(${t.id})" class="px-3 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm">Void</button>` : ''}
        <button onclick="closeModal()" class="px-4 py-2 bg-gray-200 dark:bg-gray-700 rounded-lg">Close</button>
      </div>
      ${t.status === 'voided' ? '<p class="text-center text-red-500 font-bold text-sm mt-2">⚠️ VOIDED</p>' : ''}
    </div>`);
}

async function voidTransaction(id) {
  if (!await confirmModal('Void this sale? This will restore inventory and adjust client balance.')) return;
  const t = await dbGet('transactions', id);
  if (!t) { toast('Transaction not found', 'error'); return; }
  if (t.status === 'voided') { toast('Already voided', 'warning'); return; }
  for (const item of (t.items || [])) {
    if (item.invId) {
      const inv = await dbGet('inventory', item.invId);
      if (inv) { inv.stock = (inv.stock || 0) + getQty(item.name); await dbPut('inventory', inv); }
    }
  }
  if (t.clientId) {
    const c = await dbGet('clients', t.clientId);
    if (c) { c.balance = Math.max(0, (c.balance || 0) - (t.grandTotal || 0)); await dbPut('clients', c); }
  }
  t.status = 'voided'; t.voidedAt = now();
  await dbPut('transactions', t);
  [state.transactions, state.inventory, state.clients] = await Promise.all([dbAll('transactions'), dbAll('inventory'), dbAll('clients')]);
  updateLowStockBadge();
  toast(`Sale ${t.invoiceNo} voided`, 'success');
  await logAudit('void', `Sale ${t.invoiceNo} voided - ${peso(t.grandTotal)}`);
  renderTxTable();
}

function editTransaction(id) {
  const t = state.transactions.find(x => x.id === id);
  if (!t) { toast('Transaction not found', 'error'); return; }
  txCart = (t.items || []).map(i => ({ date: i.date || today(), description: i.description || '', name: i.name || '1', unitCost: i.unitCost || 0, intRate: i.intRate || 0, invId: i.invId }));
  txEditingId = id;
  renderTMCart();
  renderTransactionModal(t);
}

async function printReceipt(id) {
  const t = await dbGet('transactions', id);
  if (!t) { toast('Transaction not found', 'error'); return; }
  const receiptText = buildReceiptHTML(t);
  const settingsMap = {};
  state.settings.forEach(s => settingsMap[s.key] = s.value);
  const logo = settingsMap['receiptLogo'] || '';
  const win = window.open('', '_blank', 'width=380,height=600');
  win.document.write(`<html><head><style>
body{margin:0;padding:20px;font-family:'Courier New',monospace;font-size:12px;background:#f0f0f0}
.preview{background:#fff;max-width:800px;margin:0 auto;padding:30px;box-shadow:0 2px 8px rgba(0,0,0,.1);border-radius:4px}
pre{white-space:pre;margin:0 auto;width:fit-content}
.toolbar{display:flex;gap:8px;align-items:center;justify-content:center;margin-bottom:16px;flex-wrap:wrap}
.toolbar button{padding:8px 16px;border:2px solid #d1d5db;background:#fff;border-radius:6px;cursor:pointer;font-size:13px}
.toolbar button.active{border-color:#2563eb;background:#2563eb;color:#fff}
.toolbar .print-btn{padding:8px 24px;background:#2563eb;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:14px;font-weight:bold}
@media print{body{background:#fff;padding:0}.preview{box-shadow:none;border-radius:0;padding:0;max-width:none}.toolbar{display:none}}
</style></head><body>
<div class="toolbar">
  <span style="font-size:13px;color:#666">Paper:</span>
  <button onclick="setSize('A4')" class="active" id="sz-a4">A4</button>
  <button onclick="setSize('Letter')" id="sz-letter">Letter</button>
  <button onclick="setSize('Legal')" id="sz-legal">Legal</button>
  <span style="width:1px;height:24px;background:#d1d5db;display:inline-block"></span>
  <button class="print-btn" onclick="window.print()">🖨 Print</button>
</div>
<div class="preview"><pre>${escapeHtml(receiptText)}</pre></div>${logo ? `<div style="display:none" id="logoData">${logo}</div>` : ''}
<script>
function setSize(sz){document.querySelectorAll('.toolbar button[id^="sz-"]').forEach(b=>b.classList.remove('active'));
document.getElementById('sz-'+sz.toLowerCase()).classList.add('active');
var s=document.getElementById('page-size')||document.createElement('style');
s.id='page-size';s.textContent='@page{margin:20mm;size:'+sz+'}';
document.head.appendChild(s);}
document.title='Receipt - ${t.invoiceNo || ''}';
</script></body></html>`);
  win.document.close();
}
