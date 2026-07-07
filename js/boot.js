if (window.electronAPI) {
  window.getDBDump = async () => {
    const stores = ['clients','transactions','payments','inventory','quickItems','settings','users','expenses','suppliers','purchaseOrders','loyaltyPoints','notifications','auditLogs'];
    const dump = {};
    for (const s of stores) { dump[s] = await dbAll(s); }
    return dump;
  };
  window.electronAPI.onShortcut((action) => {
    if (action === 'new-sale') navigate('transactions');
    else if (action === 'new-payment') navigate('payments');
    else if (action === 'file-backup') { if (typeof fileBackupFlow === 'function') fileBackupFlow(); }
    else if (action === 'email-backup') { if (typeof emailBackupFlow === 'function') emailBackupFlow(); }
  });
}

async function seedIfEmpty() {
  const users = await dbAll('users');
  if (users.length === 0) {
    await dbAdd('users', { username: 'admin', password: 'admin123', name: 'Administrator', role: 'admin' });
  }
  const clients = await dbAll('clients');
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
  const inventory = await dbAll('inventory');
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
  const quickItems = await dbAll('quickItems');
  if (quickItems.length === 0) {
    await dbAdd('quickItems', { name: 'Mineral Water', price: 10 });
    await dbAdd('quickItems', { name: 'Yosi Loose', price: 5 });
    await dbAdd('quickItems', { name: 'Kape', price: 10 });
    await dbAdd('quickItems', { name: 'Cell Load 10', price: 12 });
    await dbAdd('quickItems', { name: 'Cell Load 20', price: 22 });
    await dbAdd('quickItems', { name: 'Itlog', price: 10 });
  }
  const settings = await dbAll('settings');
  if (settings.length === 0) {
    await dbAdd('settings', { key: 'shopName', value: 'My Sari-Sari Store' });
    await dbAdd('settings', { key: 'shopAddress', value: 'Philippines' });
    await dbAdd('settings', { key: 'taxRate', value: '0' });
    await dbAdd('settings', { key: 'loyaltyRate', value: '1' });
  }
}

async function boot() {
  try {
    await openDB();
    await loadAll();
    await seedIfEmpty();
    const savedUser = sessionStorage.getItem('shopUser');
    if (savedUser) {
      state.user = JSON.parse(savedUser);
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

document.addEventListener('DOMContentLoaded', boot);
