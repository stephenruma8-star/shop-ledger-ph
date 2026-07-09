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
      <div class="flex items-center gap-3 mb-2"><div class="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center text-blue-600 font-bold">${c.name?.charAt(0)||'?'}</div>
        <div class="flex-1 min-w-0"><p class="font-semibold truncate">${escapeHtml(c.name)}</p><p class="text-xs text-gray-500">${escapeHtml(c.phone || 'No phone')}</p></div></div>
      <div class="flex justify-between items-center"><span class="text-xs text-gray-400">Balance:</span><span class="font-bold ${balColor}">${peso(bal)}</span></div>
      <p class="text-xs text-gray-400 mt-1 truncate">${escapeHtml(c.address || '')}</p>
    </div>`;
  }).join('');
}

function openClientModal(c) {
  const isEdit = !!c;
  modal(`
    <div class="p-6">
      <div class="flex justify-between items-center mb-4"><h3 class="text-xl font-bold">${isEdit ? 'Edit' : 'New'} Client</h3><button onclick="closeModal()" class="text-gray-400 hover:text-gray-600 text-2xl">&times;</button></div>
      <div class="space-y-3">
        <div><label class="text-xs text-gray-500 block mb-1">Name *</label><input id="cf-name" value="${isEdit ? escapeHtml(c.name||'') : ''}" class="w-full px-3 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800" /></div>
        <div><label class="text-xs text-gray-500 block mb-1">Phone</label><input id="cf-phone" value="${isEdit ? escapeHtml(c.phone||'') : ''}" class="w-full px-3 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800" /></div>
        <div><label class="text-xs text-gray-500 block mb-1">Address</label><input id="cf-address" value="${isEdit ? escapeHtml(c.address||'') : ''}" class="w-full px-3 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800" /></div>
        ${isEdit ? `<div><label class="text-xs text-gray-500 block mb-1">Balance</label><input id="cf-balance" type="number" step="0.01" value="${c.balance||0}" class="w-full px-3 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800" /></div>` : ''}
        <div class="flex gap-2 pt-2"><button onclick="saveClient(${isEdit ? c.id : 'null'})" class="flex-1 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">${isEdit ? 'Update' : 'Save'}</button><button onclick="closeModal()" class="px-4 py-2 bg-gray-200 dark:bg-gray-700 rounded-lg">Cancel</button></div>
      </div>
    </div>`);
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
    await dbPut('clients', c);
    toast('Client updated');
  } else {
    await dbAdd('clients', { name, phone, address, balance: 0, createdAt: now() });
    toast('Client added');
  }
  closeModal();
  state.clients = await dbAll('clients');
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
        <div class="flex gap-2"><button onclick="closeModal();openClientModal(${JSON.stringify(c).replace(/"/g,'&quot;')})" class="px-3 py-1 text-sm bg-blue-600 text-white rounded-lg">Edit</button><button onclick="closeModal();deleteClient(${c.id})" class="px-3 py-1 text-sm bg-red-600 text-white rounded-lg">Delete</button><button onclick="closeModal();printClientInfo(${c.id})" class="px-3 py-1 text-sm bg-gray-600 text-white rounded-lg">Print</button><button onclick="closeModal()" class="text-gray-400 text-2xl">&times;</button></div></div>
      <div class="grid grid-cols-3 gap-3 mb-4">
        <div class="bg-gray-50 dark:bg-gray-700 p-3 rounded-lg text-center"><p class="text-xs text-gray-500">Balance</p><p class="text-lg font-bold ${(c.balance||0)>0?'text-red-600':'text-green-600'}">${peso(c.balance)}</p></div>
        <div class="bg-gray-50 dark:bg-gray-700 p-3 rounded-lg text-center"><p class="text-xs text-gray-500">Purchases</p><p class="text-lg font-bold">${txns.length}</p></div>
        <div class="bg-gray-50 dark:bg-gray-700 p-3 rounded-lg text-center"><p class="text-xs text-gray-500">Payments</p><p class="text-lg font-bold">${pays.length}</p></div>
      </div>
      <div class="max-h-60 overflow-auto space-y-2">
        <h4 class="font-semibold text-sm">Recent Activity</h4>
        ${[...txns.slice(0,20).map(t => `<div class="flex justify-between text-sm py-1 border-b dark:border-gray-700"><span>${fmtDateTime(t.createdAt)} — Sale ${t.invoiceNo||''}</span><span class="text-blue-600">${peso(t.grandTotal)}</span></div>`),
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
  const shopTin = settingsMap['shopTin'] || '';
  const txns = state.transactions.filter(t => t.clientId === id).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const pays = state.payments.filter(p => p.clientId === id).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const lines = [];
  lines.push(' '.repeat(Math.max(0, Math.floor((32 - shopName.length) / 2))) + shopName);
  if (shopAddr) lines.push(' '.repeat(Math.max(0, Math.floor((32 - shopAddr.length) / 2))) + shopAddr);
  if (shopTin) lines.push('TIN: ' + shopTin);
  lines.push('='.repeat(32));
  lines.push(' '.repeat(Math.max(0, Math.floor((32 - 14) / 2))) + 'CLIENT SUMMARY');
  lines.push('-'.repeat(32));
  lines.push('Name:    ' + (c.name || ''));
  lines.push('Phone:   ' + (c.phone || 'N/A'));
  lines.push('Address: ' + (c.address || 'N/A'));
  lines.push('');
  lines.push('Balance: ' + peso(c.balance || 0));
  lines.push('Purchases: ' + txns.length + '  |  Payments: ' + pays.length);
  lines.push('='.repeat(32));

  if (txns.length > 0) {
    lines.push('');
    lines.push('RECENT SALES');
    lines.push('-'.repeat(32));
    txns.slice(0, 20).forEach(t => {
      lines.push(fmtDate(t.createdAt) + '  ' + (t.invoiceNo || '') + '  ' + peso(t.grandTotal));
    });
  }

  if (pays.length > 0) {
    lines.push('');
    lines.push('RECENT PAYMENTS');
    lines.push('-'.repeat(32));
    pays.slice(0, 20).forEach(p => {
      lines.push(fmtDate(p.createdAt) + '  ' + peso(p.amount));
    });
  }

  lines.push('');
  lines.push('Generated: ' + fmtDateTime(new Date().toISOString()));

  const text = lines.join('\n');
  const win = window.open('', '_blank', 'width=400,height=600');
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
<div class="preview"><pre>${escapeHtml(text)}</pre></div>
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
  const bal = c.balance || 0;
  const msg = bal > 0 ? `Client "${c.name}" has an outstanding balance of ${peso(bal)}. Deleting will lose this debt. Continue?` : `Delete client "${c.name}"?`;
  if (!await confirmModal(msg)) return;
  await dbDel('clients', id);
  state.clients = state.clients.filter(x => x.id !== id);
  renderClientGrid();
  toast('Client deleted');
}
