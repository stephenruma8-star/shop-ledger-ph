async function viewSettings(root) {
  await Promise.all([dbLoad('settings'), dbLoad('users'), dbLoad('quickItems')]);
  const settingsMap = {};
  state.settings.forEach(s => settingsMap[s.key] = s.value);
  root.innerHTML = `
    <div class="space-y-6 fade-in max-w-4xl">
      <div class="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm glass-card">
        <h3 class="font-bold text-lg mb-4">🏪 Business Information</h3>
        <div class="grid grid-cols-2 gap-3">
          <div><label class="text-xs text-gray-500 block">Shop Name</label><input id="set-shopName" value="${escapeHtml(settingsMap['shopName'] || '')}" class="w-full px-3 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800" /></div>
          <div><label class="text-xs text-gray-500 block">Contact Number</label><input id="set-shopContact" value="${escapeHtml(settingsMap['shopContact'] || '')}" class="w-full px-3 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800" /></div>
          <div class="col-span-2"><label class="text-xs text-gray-500 block">Address</label><input id="set-shopAddress" value="${escapeHtml(settingsMap['shopAddress'] || '')}" class="w-full px-3 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800" /></div>
        </div>
      </div>
      <div class="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm glass-card">
        <h3 class="font-bold text-lg mb-4">⚙️ Business Rules</h3>
        <div class="grid grid-cols-2 gap-3">
          <div><label class="text-xs text-gray-500 block">Loyalty Rate (%)</label><input id="set-loyaltyRate" type="number" step="0.1" value="${settingsMap['loyaltyRate'] || '0'}" class="w-full px-3 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800" /></div>
          <div><label class="text-xs text-gray-500 block">Currency</label><input value="PHP" disabled class="w-full px-3 py-2 border dark:border-gray-700 rounded-lg bg-gray-100 dark:bg-gray-700" /></div>
        </div>
      </div>
      <div class="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm glass-card">
        <h3 class="font-bold text-lg mb-4">🖼️ Receipt Branding</h3>
        <div class="space-y-3">
          <div><label class="text-xs text-gray-500 block">Shop Logo</label>
            <div class="flex items-center gap-3">
              <div class="w-16 h-16 border-2 border-dashed dark:border-gray-600 rounded-lg flex items-center justify-center overflow-hidden bg-gray-50 dark:bg-gray-700" id="logo-preview">${settingsMap['receiptLogo'] ? `<img src="${escapeHtml(settingsMap['receiptLogo'])}" class="w-full h-full object-contain" />` : '<span class="text-2xl text-gray-300">📷</span>'}</div>
              <label class="px-3 py-1.5 bg-gray-100 dark:bg-gray-700 rounded-lg text-sm cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-600">Choose File<input type="file" accept="image/*" class="hidden" onchange="uploadReceiptLogo(event)" /></label>
              ${settingsMap['receiptLogo'] ? `<button onclick="removeReceiptLogo()" class="text-xs text-red-500">Remove</button>` : ''}
            </div>
          </div>
          <div><label class="text-xs text-gray-500 block">Custom Header Text</label><textarea id="set-receiptHeaderText" rows="2" class="w-full px-3 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm">${escapeHtml(settingsMap['receiptHeaderText'] || '')}</textarea></div>
          <div><label class="text-xs text-gray-500 block">Receipt Footer Message</label><input id="set-receiptFooter" value="${escapeHtml(settingsMap['receiptFooter'] || 'Thank you for your patronage!')}" class="w-full px-3 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800" /></div>
        </div>
      </div>
      <div class="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm glass-card">
        <h3 class="font-bold text-lg mb-4">📱 SMS &amp; Email</h3>
        <div class="space-y-3">
          <div><label class="text-xs text-gray-500 block">Semaphore API Key</label><input id="set-smsApiKey" value="${escapeHtml(settingsMap['smsApiKey'] || '')}" class="w-full px-3 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800" placeholder="From semaphore.co" /></div>
          <div><label class="text-xs text-gray-500 block">Backup Email (recipient)</label><input id="set-backupEmail" value="${escapeHtml(settingsMap['backupEmail'] || '')}" class="w-full px-3 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800" /></div>
          <details class="text-sm"><summary class="cursor-pointer text-blue-600">SMTP Settings</summary>
            <div class="grid grid-cols-2 gap-2 mt-2 p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
              ${(() => {
                let smtp = { host: '', port: '587', user: '', pass: '', fromName: '' };
                try { if (settingsMap['smtpConfig']) smtp = JSON.parse(settingsMap['smtpConfig']); } catch(e) {}
                return Object.entries({host:'Host',port:'Port',user:'User',pass:'Password',fromName:'From Name'}).map(([k,label]) =>
                  `<div><label class="text-xs text-gray-500 block">${label}</label><input id="set-smtp-${k}" ${k==='pass'?'type="password"':'type="text"'} value="${escapeHtml(smtp[k]||'')}" class="w-full px-2 py-1.5 border dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-sm" /></div>`
                ).join('');
              })()}
            </div>
          </details>
        </div>
      </div>
      <div class="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm glass-card">
        <h3 class="font-bold text-lg mb-4">🤖 AI Assistant</h3>
        <div class="grid grid-cols-2 gap-3">
          <div><label class="text-xs text-gray-500 block">API Key <span class="text-gray-400 font-normal">(leave blank for local)</span></label><input id="set-aiApiKey" type="password" value="${escapeHtml(settingsMap['aiApiKey'] || '')}" class="w-full px-3 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 font-mono text-xs" placeholder="sk-... or empty for Ollama" /></div>
          <div><label class="text-xs text-gray-500 block">Provider</label><select id="set-aiModel" class="w-full px-3 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800"><option value="ollama" ${(settingsMap['aiModel']||'ollama') === 'ollama' ? 'selected' : ''}>Ollama (local, free)</option><option value="gpt-4o-mini" ${settingsMap['aiModel'] === 'gpt-4o-mini' ? 'selected' : ''}>OpenAI GPT-4o-mini</option><option value="gpt-4o" ${settingsMap['aiModel'] === 'gpt-4o' ? 'selected' : ''}>OpenAI GPT-4o</option></select></div>
        </div>
        <p class="text-xs text-gray-400 mt-2">No API key? Use <strong>Ollama</strong> — free local AI. <a href="#" onclick="require('electron').shell.openExternal('https://ollama.ai/download')" class="text-blue-500 hover:underline">Download Ollama</a>, run <code class="bg-gray-100 dark:bg-gray-700 px-1 rounded">ollama pull llama3.2</code>, then select "Ollama" above.</p>
      </div>
      <div class="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm glass-card">
        <h3 class="font-bold text-lg mb-4">📋 Quick Items</h3>
        <div class="space-y-2">
          ${state.quickItems.map(q => `<div class="flex items-center gap-2 text-sm"><input class="flex-1 px-2 py-1 border dark:border-gray-700 rounded bg-white dark:bg-gray-800" value="${escapeHtml(q.name)}" data-qi-id="${q.id}" data-field="name" /><input class="w-24 px-2 py-1 border dark:border-gray-700 rounded bg-white dark:bg-gray-800" type="number" step="0.01" value="${q.price}" data-qi-id="${q.id}" data-field="price" /><button onclick="deleteQuickItem(${q.id})" class="text-red-500 text-xs">Del</button></div>`).join('')}
          <div class="flex gap-2"><input id="new-qi-name" placeholder="Item name" class="flex-1 px-2 py-1.5 border dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-sm" /><input id="new-qi-price" type="number" step="0.01" placeholder="Price" class="w-24 px-2 py-1.5 border dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-sm" /><button onclick="addQuickItem()" class="px-3 py-1.5 bg-blue-600 text-white rounded text-sm">Add</button></div>
        </div>
      </div>
      <div class="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm glass-card">
        <h3 class="font-bold text-lg mb-4">👥 Users</h3>
        <div class="overflow-auto mb-3">${state.users.length > 0 ? `<table class="w-full text-sm"><thead><tr class="bg-gray-50 dark:bg-gray-700"><th class="p-2 text-left">Username</th><th class="p-2 text-left">Name</th><th class="p-2 text-left">Role</th><th class="p-2 text-center">Actions</th></tr></thead>
          <tbody>${state.users.map(u => `<tr class="border-b dark:border-gray-700"><td class="p-2">${escapeHtml(u.username)}</td><td class="p-2">${escapeHtml(u.name||'')}</td><td class="p-2"><span class="px-2 py-0.5 rounded-full text-xs ${u.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}">${escapeHtml(u.role)}</span></td>
          <td class="p-2 text-center"><button onclick="openUserModal(${u.id})" class="text-blue-600 text-xs">Edit</button></td></tr>`).join('')}</tbody></table>` : '<p class="text-gray-400 text-sm">No users</p>'}</div>
        <button onclick="openUserModal()" class="px-3 py-1.5 bg-blue-600 text-white rounded text-sm">+ Add User</button>
      </div>
      <button onclick="saveSettings()" class="w-full py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 font-semibold">Save All Settings</button>
    </div>`;
}

async function saveSettings() {
  const keys = ['shopName','shopContact','shopAddress','loyaltyRate','smsApiKey','backupEmail','aiApiKey','aiModel','receiptFooter','receiptHeaderText'];
  for (const key of keys) {
    const el = document.getElementById(`set-${key}`);
    if (el) {
      const existing = state.settings.find(s => s.key === key);
      if (existing) { existing.value = el.value; await dbPut('settings', existing); }
      else { await dbAdd('settings', { key, value: el.value }); }
    }
  }
  const smtp = { host: document.getElementById('set-smtp-host')?.value || '', port: document.getElementById('set-smtp-port')?.value || '587', user: document.getElementById('set-smtp-user')?.value || '', pass: document.getElementById('set-smtp-pass')?.value || '', fromName: document.getElementById('set-smtp-fromName')?.value || '' };
  const smtpExisting = state.settings.find(s => s.key === 'smtpConfig');
  if (smtpExisting) { smtpExisting.value = JSON.stringify(smtp); await dbPut('settings', smtpExisting); }
  else { await dbAdd('settings', { key: 'smtpConfig', value: JSON.stringify(smtp) }); }
  for (const el of document.querySelectorAll('[data-qi-id]')) await updateQuickItemField(el);
  state.settings = await dbAll('settings');
  const shop = state.settings.find(x => x.key === 'shopName');
  if (shop) document.getElementById('shop-name').textContent = shop.value;
  toast('Settings saved');
}

async function updateQuickItemField(el) {
  const id = parseInt(el.dataset.qiId);
  const field = el.dataset.field;
  const val = field === 'price' ? (parseFloat(el.value) || 0) : el.value.trim();
  const item = await dbGet('quickItems', id);
  if (item) { item[field] = val; await dbPut('quickItems', item); }
}

async function addQuickItem() {
  const name = document.getElementById('new-qi-name').value.trim();
  const price = parseFloat(document.getElementById('new-qi-price').value) || 0;
  if (!name) { toast('Enter item name', 'warning'); return; }
  await dbAdd('quickItems', { name, price });
  state.quickItems = await dbAll('quickItems');
  document.getElementById('new-qi-name').value = '';
  document.getElementById('new-qi-price').value = '';
  viewSettings(document.getElementById('view'));
  toast('Quick item added');
}

async function deleteQuickItem(id) {
  await dbDel('quickItems', id);
  state.quickItems = await dbAll('quickItems');
  viewSettings(document.getElementById('view'));
}

function uploadReceiptLogo(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async (ev) => {
    const dataUrl = ev.target.result;
    const existing = state.settings.find(s => s.key === 'receiptLogo');
    if (existing) { existing.value = dataUrl; await dbPut('settings', existing); }
    else { await dbAdd('settings', { key: 'receiptLogo', value: dataUrl }); }
    state.settings = await dbAll('settings');
    const preview = document.getElementById('logo-preview');
    if (preview) preview.innerHTML = `<img src="${escapeHtml(dataUrl)}" class="w-full h-full object-contain" />`;
    toast('Logo uploaded');
  };
  reader.readAsDataURL(file);
}

async function removeReceiptLogo() {
  const existing = state.settings.find(s => s.key === 'receiptLogo');
  if (existing) { await dbDel('settings', existing.id); }
  state.settings = await dbAll('settings');
  const preview = document.getElementById('logo-preview');
  if (preview) preview.innerHTML = '<span class="text-2xl text-gray-300">📷</span>';
  toast('Logo removed');
}

function openUserModal(id) {
  const isEdit = !!id;
  const u = isEdit ? state.users.find(x => x.id === id) : null;
  modal(`
    <div class="p-6">
      <div class="flex justify-between items-center mb-4"><h3 class="text-xl font-bold">${isEdit ? 'Edit' : 'New'} User</h3><button onclick="closeModal()" class="text-gray-400 text-2xl">&times;</button></div>
      <div class="space-y-3">
        <div><label class="text-xs text-gray-500 block">Username *</label><input id="uf-username" value="${isEdit ? escapeHtml(u.username||'') : ''}" ${isEdit ? 'disabled' : ''} class="w-full px-3 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800" /></div>
        <div><label class="text-xs text-gray-500 block">Name</label><input id="uf-name" value="${isEdit ? escapeHtml(u.name||'') : ''}" class="w-full px-3 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800" /></div>
        <div><label class="text-xs text-gray-500 block">Password *${isEdit ? ' (leave blank to keep)' : ''}</label><input id="uf-password" type="password" class="w-full px-3 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800" /></div>
        <div><label class="text-xs text-gray-500 block">Role</label><select id="uf-role" class="w-full px-3 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800"><option value="admin" ${isEdit && u.role === 'admin' ? 'selected' : ''}>Admin</option><option value="staff" ${isEdit && u.role === 'staff' ? 'selected' : ''}>Staff</option></select></div>
        <div class="flex gap-2 pt-2">
          <button onclick="saveUser(${isEdit ? id : 'null'})" class="flex-1 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">${isEdit ? 'Update' : 'Save'}</button>
          <button onclick="closeModal()" class="px-4 py-2 bg-gray-200 dark:bg-gray-700 rounded-lg">Cancel</button>
        </div>
      </div>
    </div>`);
}

async function saveUser(id) {
  const username = document.getElementById('uf-username').value.trim();
  const password = document.getElementById('uf-password').value;
  const name = document.getElementById('uf-name').value.trim();
  const role = document.getElementById('uf-role').value;
  if (!username) { toast('Username required', 'error'); return; }
  if (!id && !password) { toast('Password required', 'error'); return; }
  if (id) {
    const u = await dbGet('users', id);
    u.name = name; u.role = role;
    if (password) u.password = await hashPassword(password);
    await dbPut('users', u);
    toast('User updated');
  } else {
    await dbAdd('users', { username, password: await hashPassword(password), name, role });
    toast('User added');
  }
  closeModal();
  state.users = await dbAll('users');
  viewSettings(document.getElementById('view'));
}
