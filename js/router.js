let _navToken = 0;
async function navigate(route) {
  const token = ++_navToken;
  state.currentRoute = route;
  const titles = {
    dashboard: 'Dashboard', clients: 'Clients', utang: 'Utang',
    transactions: 'Sales', inventory: 'Inventory', stocktake: 'Stock Take', expenses: 'Expenses',
    suppliers: 'Suppliers', payments: 'Payments', 'purchase-orders': 'Purchase Orders',
    reports: 'Reports', settings: 'Settings'
  };
  document.getElementById('page-title').textContent = titles[route] || 'Dashboard';
  document.querySelectorAll('.nav-btn').forEach(b => {
    const isActive = b.dataset.route === route;
    b.classList.toggle('bg-blue-50', isActive);
    b.classList.toggle('dark:bg-blue-900/20', isActive);
    b.classList.toggle('text-blue-600', isActive);
    b.classList.toggle('dark:text-blue-400', isActive);
    b.classList.toggle('active', isActive);
  });
  const root = document.getElementById('view');
  root.className = 'flex-1 overflow-auto p-6 slide-up';
  root.innerHTML = '<div class="flex items-center justify-center py-20"><div class="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div></div>';
  await new Promise(r => setTimeout(r, 20));
  if (token !== _navToken) return;
  switch (route) {
    case 'dashboard': await viewDashboard(root); break;
    case 'clients': await viewClients(root); break;
    case 'utang': await viewUtang(root); break;
    case 'transactions': await viewTransactions(root); break;
    case 'inventory': await viewInventory(root); break;
    case 'stocktake': await viewStockTake(root); break;
    case 'expenses': await viewExpenses(root); break;
    case 'suppliers': await viewSuppliers(root); break;
    case 'payments': await viewPayments(root); break;
    case 'purchase-orders': await viewPurchaseOrders(root); break;
    case 'reports': await viewReports(root); break;
    case 'settings': await viewSettings(root); break;
    default: root.innerHTML = '<div class="text-center py-20 text-gray-500">Page not found</div>';
  }
}

async function loadAll() {
  const stores = ['clients','transactions','payments','inventory','quickItems','settings','users','expenses','suppliers','purchaseOrders','notifications','auditLogs'];
  const results = await Promise.all(stores.map(s => dbAll(s).catch(() => [])));
  stores.forEach((s, i) => { state[s] = results[i]; });
  const shop = state.settings.find(x => x.key === 'shopName');
  if (shop) document.getElementById('shop-name').textContent = shop.value;
  updateLowStockBadge();
  updateNotifications();
}

function render() {
  navigate(state.currentRoute);
}

document.addEventListener('keydown', (e) => {
  const key = e.key;
  if (key === 'Escape') { closeModal(); return; }
  if (key === 'F1') { e.preventDefault(); navigate('dashboard'); }
  else if (key === 'F2') { e.preventDefault(); navigate('transactions'); }
  else if (key === 'F3') { e.preventDefault(); navigate('payments'); }
  else if (key === 'F4') { e.preventDefault(); navigate('clients'); }
  else if (key === 'F5') { e.preventDefault(); navigate('inventory'); }
  if ((e.ctrlKey || e.metaKey) && key === 'd') { e.preventDefault(); navigate('dashboard'); }
  if ((e.ctrlKey || e.metaKey) && key === 'u') { e.preventDefault(); navigate('utang'); }
  if ((e.ctrlKey || e.metaKey) && key === 't') { e.preventDefault(); navigate('transactions'); }
  if ((e.ctrlKey || e.metaKey) && key === 'i') { e.preventDefault(); navigate('inventory'); }
});

document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => navigate(btn.dataset.route));
});
