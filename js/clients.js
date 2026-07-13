async function viewClients(root) {
  state.clients = await dbAll('clients');
  root.innerHTML = `
    <div class="space-y-4 fade-in">
      <div class="flex gap-2 flex-wrap">
        <input id="clientSearch" placeholder="Search clients..." class="flex-1 px-4 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800" oninput="debouncedRenderClientGrid()" />
        <button onclick="openClientModal()" class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">+ New Client</button>
        <button onclick="importClients()" class="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700">Import CSV</button>
      </div>
      <div id="clientGrid" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"></div>
    </div>`;
  renderClientGrid();
}

var debouncedRenderClientGrid = debounce(renderClientGrid, 250);
function renderClientGrid() {
  const q = document.getElementById('clientSearch')?.value || '';
  const filtered = searchData(state.clients, q, ['name','phone','address']);
  const grid = document.getElementById('clientGrid');
  if (!grid) return;
  if (filtered.length === 0) {
    grid.innerHTML = '<div class="col-span-full text-center py-10 text-gray-400">No clients found</div>'; return;
  }
  grid.innerHTML = filtered.map(c => {
    const bal = c.balance || 0;
    const balColor = bal > 0 ? 'text-red-600' : bal < 0 ? 'text-green-600' : 'text-gray-500';
    return `<div class="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border hover:shadow-md transition-shadow cursor-pointer glass-card" onclick="viewClientHistory(${c.id})">
      <div class="flex items-center gap-3 mb-2"><div class="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center text-blue-600 font-bold flex-shrink-0">${c.name?.charAt(0)||'?'}</div>
        <div class="flex-1 min-w-0"><p class="font-semibold truncate">${escapeHtml(c.name)}</p><p class="text-xs text-gray-500">${escapeHtml(c.phone || 'No phone')}</p></div>
        <button onclick="event.stopPropagation();recordClientPayment(${c.id})" class="text-green-500 hover:text-green-700 text-sm px-1 font-bold" title="Bayad">+</button>
        <button onclick="event.stopPropagation();printClientInfo(${c.id})" class="text-gray-400 hover:text-blue-600 text-lg px-1" title="Print">&vellip;</button></div>
      <div class="flex justify-between items-center"><span class="text-xs text-gray-400">Balance:</span><span class="font-bold ${balColor}">${peso(bal)}</span></div>
      <p class="text-xs text-gray-400 mt-1 truncate">${escapeHtml(c.address || '')}</p>
    </div>`;
  }).join('');
}

let cfCart = [];

function openClientModal(c) {
  if (typeof c === 'number') c = state.clients.find(x => x.id === c);
  const isEdit = !!c;
  cfCart = [];
  const qItems = state.quickItems || [];
  const inv = (state.inventory || []).filter(i => (i.stock || 0) > 0);
  modal(`
    <div class="p-6 flex flex-col h-full" style="min-height:70vh">
      <div class="flex justify-between items-center mb-4 shrink-0"><h3 class="text-xl font-bold">${isEdit ? 'Edit' : 'New'} Client</h3><button onclick="closeModal()" class="text-gray-400 hover:text-gray-600 text-2xl">&times;</button></div>
      <div class="grid grid-cols-1 lg:grid-cols-5 gap-4 flex-1 min-h-0">
        <div class="lg:col-span-2 space-y-3">
          <div><label class="text-xs text-gray-500 block mb-1">Name *</label><input id="cf-name" value="${isEdit ? escapeHtml(c.name||'') : ''}" class="w-full px-3 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800" /></div>
          <div class="grid grid-cols-2 gap-2">
            <div><label class="text-xs text-gray-500 block mb-1">Phone</label><input id="cf-phone" value="${isEdit ? escapeHtml(c.phone||'') : ''}" class="w-full px-3 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800" /></div>
            <div><label class="text-xs text-gray-500 block mb-1">Balance</label><input id="cf-balance" type="number" step="0.01" value="${c?.balance||0}" class="w-full px-3 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800" /></div>
          </div>
          <div><label class="text-xs text-gray-500 block mb-1">Address</label><input id="cf-address" value="${isEdit ? escapeHtml(c.address||'') : ''}" class="w-full px-3 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800" /></div>
          <div><label class="text-xs text-gray-500 block mb-1">Due Date</label><input id="cf-dueDate" type="date" value="${c?.dueDate || ''}" class="w-full px-3 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800" /></div>
          <div class="pt-2"><h4 class="font-semibold text-sm mb-1">Quick Items (add to cart)</h4>
            <div class="flex gap-2 mb-2"><select id="cf-item-select" class="flex-1 px-3 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm"><option value="">Inventory...</option>${inv.map(i => `<option value="${escapeHtml(i.name)}" data-price="${i.sellPrice||i.price||0}">${escapeHtml(i.name)} - ${peso(i.sellPrice||i.price||0)}</option>`).join('')}</select>
            <input id="cf-qty" type="number" value="1" min="1" class="w-14 px-2 py-2 border dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-sm text-center" />
            <button onclick="cfAddInvItem()" class="px-3 py-2 bg-blue-600 text-white rounded-lg text-sm whitespace-nowrap">+ Add</button></div>
            ${qItems.length > 0 ? `<div class="flex flex-wrap gap-1">${qItems.map(q => `<button data-qiname="${escapeHtml(q.name)}" data-qiprice="${q.price}" onclick="cfCart.push({date:today(),description:this.dataset.qiname,name:'1',unitCost:parseFloat(this.dataset.qiprice),intRate:0,invId:null});cfRenderCart()" class="px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded text-xs hover:bg-gray-200">${escapeHtml(q.name)} ${peso(q.price)}</button>`).join('')}</div>` : ''}
            <div class="flex justify-between items-center mt-2"><button onclick="cfCart.push({date:today(),description:'',name:'1',unitCost:0,intRate:0,invId:null});cfRenderCart()" class="text-xs text-blue-600 hover:text-blue-800">+ Add Blank Row</button></div>
          </div>
        </div>
        <div class="lg:col-span-3 flex flex-col min-h-0">
          <h4 class="font-semibold text-sm mb-1 shrink-0">Cart Items</h4>
          <div id="cf-cart" class="flex-1 overflow-auto border dark:border-gray-700 rounded-lg mb-2 min-h-0"></div>
          <div id="cf-totals" class="space-y-1 text-sm shrink-0"></div>
        </div>
      </div>
      <div class="flex gap-2 pt-3 shrink-0"><button onclick="saveClient(${isEdit ? c.id : 'null'})" class="flex-1 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">${isEdit ? 'Update' : 'Save & Create Sale'}</button><button onclick="closeModal()" class="px-4 py-2 bg-gray-200 dark:bg-gray-700 rounded-lg">Cancel</button></div>
    </div>`);
  cfRenderCart();
}

function cfAddInvItem() {
  const sel = document.getElementById('cf-item-select');
  const opt = sel.options[sel.selectedIndex];
  if (!opt || !opt.value) { toast('Select an item', 'warning'); return; }
  const name = opt.value;
  const price = parseFloat(opt.dataset.price);
  const qty = parseInt(document.getElementById('cf-qty').value) || 1;
  cfCart.push({ date: today(), description: name, name: String(qty), unitCost: price, intRate: 0, invId: null });
  cfRenderCart();
}

function cfRenderCart() {
  const el = document.getElementById('cf-cart');
  if (!el) return;
  if (cfCart.length === 0) { el.innerHTML = '<p class="text-gray-400 text-xs p-2">No items — just creating client</p>'; cfUpdateTotals(); return; }
  el.innerHTML = `<table class="w-full text-xs"><thead><tr class="bg-gray-50 dark:bg-gray-700 sticky top-0"><th class="p-1 text-left">Date</th><th class="p-1 text-left">Description</th><th class="p-1 text-center">Name</th><th class="p-1 text-right">Unit Cost</th><th class="p-1 text-right">Int.</th><th class="p-1 text-right">Amount</th><th class="p-1"></th></tr></thead><tbody>${cfCart.map((item, i) => {
    const sub = getQty(item.name) * (item.unitCost || 0);
    const intr = sub * ((item.intRate||0) / 100);
    return `<tr class="border-b dark:border-gray-700">
      <td class="p-1"><input type="date" value="${item.date}" onchange="cfCart[${i}].date=this.value" class="w-24 px-1 py-1 border dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-xs" /></td>
      <td class="p-1"><input type="text" value="${escapeHtml(item.description)}" onchange="cfCart[${i}].description=this.value" class="w-28 px-1 py-1 border dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-xs" /></td>
      <td class="p-1"><input type="text" value="${escapeHtml(item.name)}" onchange="cfCart[${i}].name=this.value;cfRenderCart()" class="w-20 px-1 py-1 border dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-xs text-center" /></td>
      <td class="p-1"><input type="number" value="${item.unitCost}" step="0.01" onchange="cfCart[${i}].unitCost=Math.max(0,parseFloat(this.value)||0);cfRenderCart()" class="w-16 px-1 py-1 border dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-xs text-right" /></td>
      <td class="p-1"><input type="number" value="${item.intRate}" step="0.5" onchange="cfCart[${i}].intRate=Math.max(0,parseFloat(this.value)||0);cfRenderCart()" class="w-12 px-1 py-1 border dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-xs text-right" /></td>
      <td class="p-1 text-right font-medium">${peso(sub + intr)}</td>
      <td class="p-1"><button onclick="cfCart.splice(${i},1);cfRenderCart()" class="text-red-500 text-xs">&times;</button></td>
    </tr>`;
  }).join('')}</tbody></table>`;
  cfUpdateTotals();
}

function cfUpdateTotals() {
  const el = document.getElementById('cf-totals');
  if (!el) return;
  const subtotal = cfCart.reduce((s, i) => s + getQty(i.name) * (i.unitCost || 0), 0);
  const totalInt = cfCart.reduce((s, i) => s + (getQty(i.name) * (i.unitCost || 0)) * ((i.intRate||0)/100), 0);
  const grand = subtotal + totalInt;
  el.innerHTML = `
    <div class="flex justify-between"><span>Subtotal</span><span>${peso(subtotal)}</span></div>
    ${totalInt > 0 ? `<div class="flex justify-between text-amber-600"><span>Interest</span><span>${peso(totalInt)}</span></div>` : ''}
    <div class="flex justify-between font-bold"><span>Total</span><span class="text-green-600">${peso(grand)}</span></div>`;
}

async function saveClient(id) {
  const name = document.getElementById('cf-name').value.trim();
  if (!name) { toast('Name is required', 'error'); return; }
  const phone = document.getElementById('cf-phone').value.trim();
  const address = document.getElementById('cf-address').value.trim();
  if (id) {
    const c = await dbGet('clients', id);
    c.name = name; c.phone = phone; c.address = address;
    c.balance = parseFloat(document.getElementById('cf-balance').value) || 0;
    c.dueDate = document.getElementById('cf-dueDate').value || '';
    await dbPut('clients', c);
    if (cfCart.length > 0) {
      const subtotal = cfCart.reduce((s, i) => s + getQty(i.name) * (i.unitCost || 0), 0);
      const totalInterest = cfCart.reduce((s, i) => s + (getQty(i.name) * (i.unitCost || 0)) * ((i.intRate||0)/100), 0);
      const grandTotal = subtotal + totalInterest;
      const invNos = state.transactions.filter(t => t.invoiceNo?.startsWith('INV-')).map(t => parseInt(t.invoiceNo.replace('INV-','')) || 0);
      const nextNo = invNos.length > 0 ? Math.max(...invNos) + 1 : 1;
      const invoiceNo = 'INV-' + String(nextNo).padStart(5,'0');
      const items = cfCart.map(i => ({ date: i.date, description: i.description, name: i.name, unitCost: i.unitCost, intRate: i.intRate, amount: getQty(i.name) * (i.unitCost || 0) + (getQty(i.name) * (i.unitCost || 0)) * ((i.intRate||0)/100), invId: null }));
      await dbAdd('transactions', { invoiceNo, clientId: id, clientName: name, date: today(), createdAt: now(), items, subtotal, totalInterest, discount: 0, scDiscount: 0, grandTotal, paymentMethod: 'Cash', status: grandTotal <= 0 ? 'paid' : 'pending' });
      c.balance = (c.balance || 0) + grandTotal;
      await dbPut('clients', c);
    }
    toast('Client updated');
  } else {
    const clientId = await dbAdd('clients', { name, phone, address, balance: 0, createdAt: now() });
    if (cfCart.length > 0) {
      const subtotal = cfCart.reduce((s, i) => s + getQty(i.name) * (i.unitCost || 0), 0);
      const totalInterest = cfCart.reduce((s, i) => s + (getQty(i.name) * (i.unitCost || 0)) * ((i.intRate||0)/100), 0);
      const grandTotal = subtotal + totalInterest;
      const invNos = state.transactions.filter(t => t.invoiceNo?.startsWith('INV-')).map(t => parseInt(t.invoiceNo.replace('INV-','')) || 0);
      const nextNo = invNos.length > 0 ? Math.max(...invNos) + 1 : 1;
      const invoiceNo = 'INV-' + String(nextNo).padStart(5,'0');
      const items = cfCart.map(i => ({ date: i.date, description: i.description, name: i.name, unitCost: i.unitCost, intRate: i.intRate, amount: getQty(i.name) * (i.unitCost || 0) + (getQty(i.name) * (i.unitCost || 0)) * ((i.intRate||0)/100), invId: null }));
      await dbAdd('transactions', { invoiceNo, clientId, clientName: name, date: today(), createdAt: now(), items, subtotal, totalInterest, discount: 0, scDiscount: 0, grandTotal, paymentMethod: 'Cash', status: grandTotal <= 0 ? 'paid' : 'pending' });
      const c = await dbGet('clients', clientId);
      if (c) { c.balance = (c.balance || 0) + grandTotal; await dbPut('clients', c); }
    }
    toast('Client added');
  }
  closeModal();
  state.clients = await dbAll('clients');
  state.transactions = await dbAll('transactions');
  renderClientGrid();
}

async function viewClientHistory(id) {
  const c = await dbGet('clients', id);
  if (!c) { toast('Client not found', 'error'); return; }
  const txns = state.transactions.filter(t => t.clientId === id).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const pays = state.payments.filter(p => p.clientId === id).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  modal(`
    <div class="p-6">
      <div class="flex justify-between items-center mb-4"><div><h3 class="text-xl font-bold">${escapeHtml(c.name)}</h3><p class="text-sm text-gray-500">${escapeHtml(c.phone || '')} ${c.address ? '| '+escapeHtml(c.address) : ''}</p></div>
        <div class="flex gap-2"><button onclick="closeModal();openClientModal(${c.id})" class="px-3 py-1 text-sm bg-blue-600 text-white rounded-lg">Edit</button><button onclick="closeModal();recordClientPayment(${c.id})" class="px-3 py-1 text-sm bg-green-600 text-white rounded-lg">Bayad</button><button onclick="closeModal();exportClientHistory(${c.id})" class="px-3 py-1 text-sm bg-amber-600 text-white rounded-lg">Export</button><button onclick="closeModal();deleteClient(${c.id})" class="px-3 py-1 text-sm bg-red-600 text-white rounded-lg">Delete</button><button onclick="closeModal();printClientInfo(${c.id})" class="px-3 py-1 text-sm bg-gray-600 text-white rounded-lg">Print</button><button onclick="closeModal()" class="text-gray-400 text-2xl">&times;</button></div></div>
      <div class="grid grid-cols-4 gap-2 mb-4">
        <div class="bg-gray-50 dark:bg-gray-700 p-3 rounded-lg text-center"><p class="text-xs text-gray-500">Balance</p><p class="text-lg font-bold ${(c.balance||0)>0?'text-red-600':'text-green-600'}">${peso(c.balance)}</p></div>
        <div class="bg-gray-50 dark:bg-gray-700 p-3 rounded-lg text-center"><p class="text-xs text-gray-500">Purchases</p><p class="text-lg font-bold">${txns.length}</p></div>
        <div class="bg-gray-50 dark:bg-gray-700 p-3 rounded-lg text-center"><p class="text-xs text-gray-500">Payments</p><p class="text-lg font-bold">${pays.length}</p></div>
        <div class="bg-gray-50 dark:bg-gray-700 p-3 rounded-lg text-center"><p class="text-xs text-gray-500">Due Date</p><p class="text-lg font-bold ${c.dueDate && c.dueDate < today() ? 'text-red-600' : 'text-gray-600'}">${c.dueDate ? fmtDate(c.dueDate) : '—'}</p></div>
      </div>
      <div class="max-h-60 overflow-auto space-y-2">
        <h4 class="font-semibold text-sm">Recent Activity</h4>
        ${[...txns.slice(0,20).map(t => `<div class="flex justify-between text-sm py-1 border-b dark:border-gray-700 items-center"><span>${fmtDateTime(t.createdAt)} — Sale ${t.invoiceNo||''}</span><div class="flex items-center gap-2"><span class="text-blue-600">${peso(t.grandTotal)}</span><button onclick="event.stopPropagation();deleteClientSale(${t.id},${c.id})" class="text-red-400 hover:text-red-600 text-xs" title="Delete sale">&times;</button></div></div>`),
            ...pays.slice(0,20).map(p => `<div class="flex justify-between text-sm py-1 border-b dark:border-gray-700"><span>${fmtDateTime(p.createdAt)} — Payment</span><span class="text-green-600">-${peso(p.amount)}</span></div>`)].join('')}
        ${txns.length === 0 && pays.length === 0 ? '<p class="text-gray-400 text-sm">No activity</p>' : ''}
      </div>
    </div>`);
}

async function printClientInfo(id) {
  const c = await dbGet('clients', id);
  if (!c) { toast('Client not found', 'error'); return; }
  const settingsMap = {};
  state.settings.forEach(s => settingsMap[s.key] = s.value);
  const shopName = settingsMap['shopName'] || 'Shop Ledger PH';
  const shopAddr = settingsMap['shopAddress'] || '';
  const shopContact = settingsMap['shopContact'] || '';
  const headerText = settingsMap['receiptHeaderText'] || '';
  const logo = settingsMap['receiptLogo'] || '';
  const footerMsg = settingsMap['receiptFooter'] || 'Thank you for your patronage!';
  const txns = state.transactions.filter(t => t.clientId === id).sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  const pays = state.payments.filter(p => p.clientId === id).sort((a, b) => new Date(a.date || a.createdAt) - new Date(b.date || b.createdAt));

  function esc(s) { return (''+s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  function amt(n) { return (Number(n)||0).toFixed(2); }

  let html = '';

  // Header — shop info centered
  html += `<div style="text-align:center;margin-bottom:12px">`;
  if (logo) html += `<img src="${esc(logo)}" style="max-height:60px;margin-bottom:8px" />`;
  html += `<h2 style="margin:0;font-size:20px">${esc(shopName)}</h2>`;
  if (shopAddr) html += `<p style="margin:2px 0">${esc(shopAddr)}</p>`;
  if (shopContact) html += `<p style="margin:2px 0">Contact: ${esc(shopContact)}</p>`;
  if (headerText) html += headerText.split('\n').filter(Boolean).map(l => `<p style="margin:2px 0">${esc(l)}</p>`).join('');
  html += `</div>`;

  // Client info — left-aligned
  html += `<div style="margin-bottom:16px">`;
  html += `<h2 style="margin:0;font-size:18px">${esc(c.name)}</h2>`;
  if (c.address) html += `<p style="margin:2px 0">${esc(c.address)}</p>`;
  if (c.phone) html += `<p style="margin:2px 0">${esc(c.phone)}</p>`;
  html += `</div>`;

  // Transactions with items
  if (txns.length > 0) {
    txns.slice(0, 30).forEach(t => {
      html += `<div style="page-break-inside:avoid;margin-bottom:16px">`;
      html += `<h4 style="margin:0 0 4px;font-size:13px">${esc(t.invoiceNo||'Sale')} — ${esc(fmtDate(t.date||t.createdAt))} — ₱${amt(t.grandTotal)}</h4>`;
      html += `<table style="width:100%;border-collapse:collapse;font-size:11px">`;
      html += `<thead><tr style="background:#f3f4f6;font-weight:bold"><td style="border:1px solid #d1d5db;padding:4px 6px">Date</td><td style="border:1px solid #d1d5db;padding:4px 6px">Description</td><td style="border:1px solid #d1d5db;padding:4px 6px;text-align:center">Name/Qty</td><td style="border:1px solid #d1d5db;padding:4px 6px;text-align:right">Unit Cost</td><td style="border:1px solid #d1d5db;padding:4px 6px;text-align:right">Int%</td><td style="border:1px solid #d1d5db;padding:4px 6px;text-align:right">Amount</td></tr></thead>`;
      html += `<tbody>${(t.items||[]).map(item => {
        const sub = getQty(item.name||item.qty) * (item.unitCost||item.price||0);
        const intr = sub * ((item.intRate||0)/100);
        return `<tr><td style="border:1px solid #d1d5db;padding:3px 6px">${item.date ? esc(item.date) : esc(fmtDate(t.date||t.createdAt))}</td><td style="border:1px solid #d1d5db;padding:3px 6px">${esc(item.description||'')}</td><td style="border:1px solid #d1d5db;padding:3px 6px;text-align:center">${esc(item.name||item.qty||'1')}</td><td style="border:1px solid #d1d5db;padding:3px 6px;text-align:right">₱${amt(item.unitCost||item.price||0)}</td><td style="border:1px solid #d1d5db;padding:3px 6px;text-align:right">${item.intRate != null ? item.intRate+'%' : (item.interest ? '₱'+amt(item.interest) : '-')}</td><td style="border:1px solid #d1d5db;padding:3px 6px;text-align:right;font-weight:bold">₱${amt(item.amount || sub+intr)}</td></tr>`;
      }).join('')}</tbody>`;
      html += `</table>`;
      if (t.totalInterest > 0 || t.discount > 0 || t.scDiscount > 0) {
        html += `<div style="font-size:11px;text-align:right;padding:4px 0">`;
        if (t.totalInterest > 0) html += `<div>Interest: ₱${amt(t.totalInterest)}</div>`;
        if (t.scDiscount > 0) html += `<div>SC/PWD: -₱${amt(t.scDiscount)}</div>`;
        if (t.discount > 0) html += `<div>Discount: -₱${amt(t.discount)}</div>`;
        html += `</div>`;
      }
      html += `</div>`;
    });
  }

  // Payments
  if (pays.length > 0) {
    html += `<div style="page-break-inside:avoid;margin-bottom:16px">`;
    html += `<h4 style="margin:0 0 4px;font-size:13px">Payments</h4>`;
    html += `<table style="width:100%;border-collapse:collapse;font-size:11px">`;
    html += `<thead><tr style="background:#f3f4f6;font-weight:bold"><td style="border:1px solid #d1d5db;padding:4px 6px">Date</td><td style="border:1px solid #d1d5db;padding:4px 6px;text-align:right">Amount</td><td style="border:1px solid #d1d5db;padding:4px 6px">Type</td><td style="border:1px solid #d1d5db;padding:4px 6px">Notes</td></tr></thead>`;
    html += `<tbody>${pays.slice(0, 30).map(p => `<tr><td style="border:1px solid #d1d5db;padding:3px 6px">${esc(fmtDate(p.date||p.createdAt))}</td><td style="border:1px solid #d1d5db;padding:3px 6px;text-align:right;font-weight:bold;color:#16a34a">-₱${amt(p.amount)}</td><td style="border:1px solid #d1d5db;padding:3px 6px">${esc(p.type||'Partial')}</td><td style="border:1px solid #d1d5db;padding:3px 6px">${esc(p.notes||'')}</td></tr>`).join('')}</tbody>`;
    html += `</table></div>`;
  }

  // Footer
  html += `<div style="border-top:2px solid #000;padding-top:8px;margin-top:8px;text-align:center">`;
  html += `<h3 style="margin:0 0 4px;${(c.balance||0)>0?'color:#dc2626':'color:#16a34a'}">Remaining Balance: ₱${amt(c.balance)}</h3>`;
  if ((c.balance || 0) <= 0) html += `<p style="font-weight:bold;font-size:16px;margin:4px 0">✓ FULLY PAID</p>`;
  html += `<p style="font-size:10px;color:#666;margin:8px 0 0">Generated: ${esc(fmtDateTime(new Date().toISOString()))}</p>`;
  html += `<p style="font-size:11px;color:#666;margin:4px 0 0">${esc(footerMsg)}</p>`;
  html += `</div>`;

  const win = window.open('', '_blank', 'width=1200,height=800,scrollbars=yes');
  win.document.write(`<html><head><style>
@page{margin:20mm;size:A4}
body{margin:0;padding:24px;font-family:Arial,Helvetica,sans-serif;font-size:12px;background:#e5e7eb}
.preview{background:#fff;max-width:900px;margin:0 auto;padding:40px 48px;box-shadow:0 4px 16px rgba(0,0,0,.15);border-radius:6px;min-height:1100px}
.toolbar{display:flex;gap:8px;align-items:center;justify-content:center;margin-bottom:16px;flex-wrap:wrap}
.toolbar button{padding:8px 16px;border:2px solid #d1d5db;background:#fff;border-radius:6px;cursor:pointer;font-size:13px}
.toolbar button.active{border-color:#2563eb;background:#2563eb;color:#fff}
.toolbar .print-btn{padding:8px 24px;background:#2563eb;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:14px;font-weight:bold}
@media print{body{background:#fff;padding:0}.preview{box-shadow:none;border-radius:0;padding:30px 40px;max-width:none;min-height:auto;margin:0}.toolbar{display:none}}
</style></head><body>
<div class="toolbar">
  <span style="font-size:13px;color:#666">Paper:</span>
  <button onclick="setSize('A4')" class="active" id="sz-a4">A4</button>
  <button onclick="setSize('Letter')" id="sz-letter">Letter</button>
  <button onclick="setSize('Legal')" id="sz-legal">Legal</button>
  <span style="width:1px;height:24px;background:#d1d5db;display:inline-block"></span>
  <button class="print-btn" onclick="window.print()">🖨 Print</button>
</div>
<div class="preview">${html}</div>
<script>
function setSize(sz){document.querySelectorAll('.toolbar button[id^="sz-"]').forEach(b=>b.classList.remove('active'));
document.getElementById('sz-'+sz.toLowerCase()).classList.add('active');
var s=document.getElementById('page-size')||document.createElement('style');
s.id='page-size';s.textContent='@page{margin:20mm;size:'+sz+'}';
document.head.appendChild(s);}
document.title='Client - ${escapeHtml(c.name)}';
</script></body></html>`);
  win.document.close();
}

async function recordClientPayment(id) {
  const c = await dbGet('clients', id);
  if (!c) { toast('Client not found', 'error'); return; }
  modal(`
    <div class="p-6">
      <div class="flex justify-between items-center mb-4"><h3 class="text-xl font-bold">Bayad — ${escapeHtml(c.name)}</h3><button onclick="closeModal()" class="text-gray-400 text-2xl">&times;</button></div>
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
          <button onclick="saveClientPayment(${c.id})" class="flex-1 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-semibold">Record Payment</button>
          <button onclick="closeModal()" class="px-4 py-2 bg-gray-200 dark:bg-gray-700 rounded-lg">Cancel</button>
        </div>
      </div>
    </div>`);
}

async function saveClientPayment(id) {
  const amount = parseFloat(document.getElementById('cp-amount').value);
  if (!amount || amount <= 0) { toast('Valid amount required', 'error'); return; }
  const c = await dbGet('clients', id);
  if (!c) { toast('Client not found', 'error'); return; }
  const wasFullyPaid = (c.balance || 0) <= 0;
  c.balance = Math.max(0, (c.balance || 0) - amount);
  await dbPut('clients', c);
  await dbAdd('payments', { clientId: id, clientName: c.name, amount, date: document.getElementById('cp-date').value || today(), type: amount >= (c.balance + amount) ? 'Full' : 'Partial', notes: document.getElementById('cp-notes').value.trim(), createdAt: now() });
  state.payments = await dbAll('payments');
  state.clients = await dbAll('clients');
  closeModal();
  renderClientGrid();
  playSound('payment');
  if (!wasFullyPaid && c.balance <= 0) confetti();
  viewClientHistory(id);
  toast('Payment recorded', 'success');
}

async function deleteClientSale(txnId, clientId) {
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
  viewClientHistory(clientId);
  toast('Sale deleted, balance adjusted');
}

function importClients() {
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
      const parts = lines[i].split(',').map(s => s.trim().replace(/^"|"$/g, ''));
      if (parts[0]) {
        await dbAdd('clients', { name: parts[0], phone: parts[1] || '', address: parts[2] || '', balance: parseFloat(parts[3]) || 0, createdAt: now() });
        count++;
      }
    }
  await dbLoad('clients');
    renderClientGrid();
    toast(`Imported ${count} clients`);
  };
  input.click();
}

async function deleteClient(id) {
  const c = state.clients.find(x => x.id === id);
  if (!c) return;
  const txCount = state.transactions.filter(t => t.clientId === id).length;
  const payCount = state.payments.filter(p => p.clientId === id).length;
  let msg = `Delete client "${c.name}"?`;
  if (txCount > 0 || payCount > 0) msg = `"${c.name}" has ${txCount} sale(s) and ${payCount} payment(s). Deleting will remove all history. Continue?`;
  else if ((c.balance || 0) > 0) msg = `Client "${c.name}" has an outstanding balance of ${peso(c.balance)}. Deleting will lose this debt. Continue?`;
  if (!await confirmModal(msg)) return;
  await dbDel('clients', id);
  state.clients = state.clients.filter(x => x.id !== id);
  renderClientGrid();
  toast('Client deleted');
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
