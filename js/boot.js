if (window.electronAPI) {
  window.getDBDump = async () => {
    const stores = ['clients','transactions','payments','inventory','quickItems','settings','users','expenses','suppliers','purchaseOrders','loyaltyPoints','notifications','auditLogs'];
    const results = await Promise.all(stores.map(s => dbAll(s).catch(() => [])));
    const dump = {};
    stores.forEach((s, i) => {
      if (s === 'users') dump[s] = results[i].map(u => { const { password, ...rest } = u; return rest; });
      else dump[s] = results[i];
    });
    return dump;
  };
  window.electronAPI.onShortcut((action) => {
    if (action === 'new-sale') navigate('transactions');
    else if (action === 'new-payment') navigate('payments');
    else if (action === 'file-backup') { if (typeof fileBackupFlow === 'function') fileBackupFlow(); }
    else if (action === 'email-backup') { if (typeof emailBackupFlow === 'function') emailBackupFlow(); }
  });
  window.electronAPI.onUpdateAvailable((info) => {
    if (document.getElementById('app').classList.contains('hidden')) return;
    const version = info.version || info.name || 'new version';
    modal(`
      <div class="p-6">
        <div class="flex justify-between items-center mb-4"><h3 class="text-xl font-bold">Update Available</h3><button onclick="closeModal()" class="text-gray-400 text-2xl">&times;</button></div>
        <p class="text-gray-600 dark:text-gray-300 mb-4">Version <strong>${version}</strong> is ready to download.</p>
        <div class="flex gap-2">
          <button onclick="window.electronAPI.downloadUpdate();closeModal()" class="flex-1 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold">Download Update</button>
          <button onclick="closeModal()" class="px-4 py-2 bg-gray-200 dark:bg-gray-700 rounded-lg">Later</button>
        </div>
      </div>`);
  });
  window.electronAPI.onUpdateDownloaded((info) => {
    const version = info.version || info.name || 'new version';
    modal(`
      <div class="p-6">
        <div class="flex justify-between items-center mb-4"><h3 class="text-xl font-bold">Update Ready</h3><button onclick="closeModal()" class="text-gray-400 text-2xl">&times;</button></div>
        <p class="text-gray-600 dark:text-gray-300 mb-4">Version <strong>${version}</strong> downloaded. Restart to apply?</p>
        <div class="flex gap-2">
          <button onclick="window.electronAPI.installUpdate()" class="flex-1 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-semibold">Restart Now</button>
          <button onclick="closeModal()" class="px-4 py-2 bg-gray-200 dark:bg-gray-700 rounded-lg">Later</button>
        </div>
      </div>`);
  });
  window.electronAPI.onLanUpdateSignal((info) => {
    modal(`
      <div class="p-6">
        <div class="flex justify-between items-center mb-4"><h3 class="text-xl font-bold">LAN Update Signal</h3><button onclick="closeModal()" class="text-gray-400 text-2xl">&times;</button></div>
        <p class="text-gray-600 dark:text-gray-300 mb-4">Update signaled by <strong>${escapeHtml(info.from)}</strong>${info.version ? ' (v'+escapeHtml(info.version)+')' : ''}. Check for updates now?</p>
        <div class="flex gap-2">
          <button onclick="window.electronAPI.downloadUpdate();closeModal()" class="flex-1 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold">Download Update</button>
          <button onclick="closeModal()" class="px-4 py-2 bg-gray-200 dark:bg-gray-700 rounded-lg">Later</button>
        </div>
      </div>`);
  });
}

async function seedIfEmpty() {
  const [users, clients, inventory, quickItems, settings] = await Promise.all([
    dbAll('users'), dbAll('clients'), dbAll('inventory'), dbAll('quickItems'), dbAll('settings')
  ]);
  if (users.length === 0) {
    await dbAdd('users', { username: 'admin', password: await hashPassword('admin123'), name: 'Administrator', role: 'admin' });
  }
  if (clients.length === 0) {
    const demo = [
      { name: 'Juan dela Cruz', phone: '09171234567', address: '123 Rizal St, Manila', balance: 1500 },
      { name: 'Maria Santos', phone: '09189876543', address: '456 Mabini Ave, Quezon City', balance: 0 },
      { name: 'Pedro Reyes', phone: '09201112233', address: '789 Bonifacio Rd, Makati', balance: 2750 },
      { name: 'Ana Gonzales', phone: '09332221110', address: '321 Luna St, Pasig', balance: 0 },
      { name: 'Jose Rizal', phone: '09443332221', address: '555 Katipunan, Mandaluyong', balance: 800 }
    ];
    for (const c of demo) { await dbAdd('clients', { ...c, createdAt: now() }); }
  }
  if (inventory.length === 0) {
    const items = [
      { name: 'Coca-Cola 1.5L', sku: 'BEV001', category: 'Beverages', sellPrice: 55, costPrice: 42, stock: 50, minStock: 10 },
      { name: 'Piattos Sour Cream', sku: 'SNK001', category: 'Snacks', sellPrice: 25, costPrice: 18, stock: 40, minStock: 10 },
      { name: 'Nescafe 3-in-1', sku: 'COF001', category: 'Coffee', sellPrice: 8, costPrice: 5, stock: 100, minStock: 20 },
      { name: 'Lucky Me Beef', sku: 'NOD001', category: 'Noodles', sellPrice: 12, costPrice: 8, stock: 80, minStock: 20 },
      { name: 'Safeguard Soap', sku: 'PER001', category: 'Personal Care', sellPrice: 28, costPrice: 22, stock: 30, minStock: 10 },
      { name: 'Cigarette Marlboro Red', sku: 'TOB001', category: 'Tobacco', sellPrice: 105, costPrice: 95, stock: 20, minStock: 10 },
      { name: 'Rice 5kg', sku: 'GRN001', category: 'Groceries', sellPrice: 150, costPrice: 130, stock: 15, minStock: 5 },
      { name: 'Gatorade Blue', sku: 'BEV002', category: 'Beverages', sellPrice: 40, costPrice: 30, stock: 25, minStock: 10 }
    ];
    for (const i of items) { await dbAdd('inventory', { ...i, createdAt: now() }); }
  }
  if (quickItems.length === 0) {
    await dbAdd('quickItems', { name: 'Mineral Water', price: 10 });
    await dbAdd('quickItems', { name: 'Yosi Loose', price: 5 });
    await dbAdd('quickItems', { name: 'Kape', price: 10 });
    await dbAdd('quickItems', { name: 'Cell Load 10', price: 12 });
    await dbAdd('quickItems', { name: 'Cell Load 20', price: 22 });
    await dbAdd('quickItems', { name: 'Itlog', price: 10 });
  }
  if (settings.length === 0) {
    await dbAdd('settings', { key: 'shopName', value: 'My Sari-Sari Store' });
    await dbAdd('settings', { key: 'shopContact', value: '' });
    await dbAdd('settings', { key: 'shopAddress', value: 'Philippines' });
    await dbAdd('settings', { key: 'loyaltyRate', value: '1' });
  }
}

async function boot() {
  try {
    await openDB();
    await seedIfEmpty();
    await loadAll();
    const savedUser = sessionStorage.getItem('shopUser');
    if (savedUser) {
      try { state.user = JSON.parse(savedUser); } catch (e) { sessionStorage.removeItem('shopUser'); }
      document.getElementById('login-screen').classList.add('hidden');
      document.getElementById('app').classList.remove('hidden');
      document.getElementById('user-info').textContent = `${state.user.name} (${state.user.role})`;
      applyPermissions();
    }
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark') document.documentElement.classList.add('dark');
    navigate(state.currentRoute);
  } catch (e) {
    console.error('Boot error:', e);
    document.getElementById('view').innerHTML = `<div class="text-center py-20 text-red-600">Error loading application: ${e.message}</div>`;
  }
}

document.addEventListener('click', (e) => {
  const panel = document.getElementById('notif-panel');
  const container = document.getElementById('notif-container');
  if (panel && !panel.classList.contains('hidden') && container && !container.contains(e.target)) {
    panel.classList.add('hidden');
  }
});

document.addEventListener('DOMContentLoaded', boot);
