async function navigate(route) {
  state.currentRoute = route;
  const titles = {
    dashboard: 'Dashboard', clients: 'Clients', utang: 'Utang',
    transactions: 'Sales', inventory: 'Inventory', expenses: 'Expenses',
    suppliers: 'Suppliers', payments: 'Payments', 'purchase-orders': 'Purchase Orders',
    loyalty: 'Loyalty', reports: 'Reports', settings: 'Settings'
  };
  document.getElementById('page-title').textContent = titles[route] || 'Dashboard';
  document.querySelectorAll('.nav-btn').forEach(b => {
    b.classList.toggle('bg-blue-50', b.dataset.route === route);
    b.classList.toggle('dark:bg-blue-900/20', b.dataset.route === route);
    b.classList.toggle('text-blue-600', b.dataset.route === route);
    b.classList.toggle('dark:text-blue-400', b.dataset.route === route);
  });
  const root = document.getElementById('view');
  root.innerHTML = '<div class="flex items-center justify-center py-20"><div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>';
  await new Promise(r => setTimeout(r, 50));
  switch (route) {
    case 'dashboard': await viewDashboard(root); break;
    case 'clients': await viewClients(root); break;
    case 'utang': await viewUtang(root); break;
    case 'transactions': await viewTransactions(root); break;
    case 'inventory': await viewInventory(root); break;
    case 'expenses': await viewExpenses(root); break;
    case 'suppliers': await viewSuppliers(root); break;
    case 'payments': await viewPayments(root); break;
    case 'purchase-orders': await viewPurchaseOrders(root); break;
    case 'loyalty': await viewLoyalty(root); break;
    case 'reports': await viewReports(root); break;
    case 'settings': await viewSettings(root); break;
    default: root.innerHTML = '<div class="text-center py-20 text-gray-500">Page not found</div>';
  }
}

async function loadAll() {
  const stores = ['clients','transactions','payments','inventory','quickItems','settings','users','expenses','suppliers','purchaseOrders','loyaltyPoints','notifications','auditLogs'];
  for (const s of stores) {
    try { state[s] = await dbAll(s); } catch (e) { state[s] = []; }
  }
  const shop = state.settings.find(x => x.key === 'shopName');
  if (shop) document.getElementById('shop-name').textContent = shop.value;
}

function render() {
  navigate(state.currentRoute);
}

document.addEventListener('keydown', (e) => {
  const key = e.key;
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
