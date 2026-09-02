import { viewCatalog } from './catalog.js'
import { viewClients } from './clients.js'
import { viewDashboard } from './dashboard.js'
import { dbAll } from './database.js'
import { viewExpenses } from './expenses.js'
import { applyDailyInterest, checkCloudBackupDue, checkSmsReminderDue, closeModal, focusPageSearch, populateYearSelector, saveCurrentModal, showShortcuts, toggleTheme, updateLowStockBadge, updateNotifications } from './helpers.js'
import { viewHelp } from './help.js'
import { viewInventory } from './inventory.js'
import { AppParticles } from './particles.js'
import { viewPayments } from './payments.js'
import { viewPurchaseOrders } from './purchaseOrders.js'
import { viewReports } from './reports.js'
import { viewSettings } from './settings.js'
import { state } from './state.js'
import { viewStockTake } from './stocktake.js'
import { viewSuppliers } from './suppliers.js'
import { viewTransactions } from './transactions.js'
import { viewUtang } from './utang.js'

export let _navToken = 0;
export async function navigate(route) {
  closeModal();
  const token = ++_navToken;
  state.currentRoute = route;
  const titles = {
    dashboard: 'Dashboard', clients: 'Clients', utang: 'Debts',
    transactions: 'Sales', catalog: 'Catalog', inventory: 'Inventory', stocktake: 'Stock Take', expenses: 'Expenses',
    suppliers: 'Suppliers', payments: 'Payments', 'purchase-orders': 'Purchase Orders',
    reports: 'Reports', settings: 'Settings', help: 'Help'
  };
  const pt = document.getElementById('page-title');
  if (pt) pt.textContent = titles[route] || 'Dashboard';
  document.querySelectorAll('.nav-btn').forEach(b => {
    const isActive = b.dataset.route === route;
    b.classList.toggle('bg-blue-50', isActive);
    b.classList.toggle('dark:bg-blue-900/20', isActive);
    b.classList.toggle('text-blue-600', isActive);
    b.classList.toggle('dark:text-blue-400', isActive);
    b.classList.toggle('active', isActive);
  });
  const root = document.getElementById('view');
  root.className = 'flex-1 overflow-auto p-6';
  root.style.opacity = '0';
  root.style.transform = 'translateY(8px)';
  root.innerHTML = '<div class="flex items-center justify-center py-20"><div class="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div></div>';
  await new Promise(r => setTimeout(r, 15));
  if (token !== _navToken) return;
  populateYearSelector();
  switch (route) {
    case 'dashboard': await viewDashboard(root); break;
    case 'clients': await viewClients(root); break;
    case 'utang': await viewUtang(root); break;
    case 'transactions': await viewTransactions(root); break;
    case 'catalog': await viewCatalog(root); break;
    case 'inventory': await viewInventory(root); break;
    case 'stocktake': await viewStockTake(root); break;
    case 'expenses': await viewExpenses(root); break;
    case 'suppliers': await viewSuppliers(root); break;
    case 'payments': await viewPayments(root); break;
    case 'purchase-orders': await viewPurchaseOrders(root); break;
    case 'reports': await viewReports(root); break;
    case 'settings': await viewSettings(root); break;
    case 'help': viewHelp(root); break;
    default: root.innerHTML = '<div class="text-center py-20 text-gray-500">Page not found</div>';
  }
  root.style.transition = 'opacity .25s ease-out, transform .25s ease-out';
  root.style.opacity = '1';
  root.style.transform = 'translateY(0)';
  root.querySelectorAll('.glass-card, .bg-white, [class*="rounded-xl"]').forEach((el, i) => {
    if (!el.classList.contains('card-enter')) { el.classList.add('card-enter'); el.style.animationDelay = (i * 0.04) + 's'; }
  });
  if (typeof AppParticles !== 'undefined') AppParticles.switchScene(route);
  const aside = document.querySelector('#app > aside');
  if (aside && aside.classList.contains('open')) { aside.classList.remove('open'); document.getElementById('sidebar-overlay')?.classList.remove('open'); }
}

export async function loadAll() {
  const stores = ['clients','transactions','payments','inventory','quickItems','settings','users','expenses','suppliers','purchaseOrders','supplierPayments','notifications','auditLogs'];
  const results = await Promise.all(stores.map(s => dbAll(s).catch(() => [])));
  stores.forEach((s, i) => { state[s] = results[i]; });
  const shop = state.settings.find(x => x.key === 'shopName');
  if (shop) document.getElementById('shop-name').textContent = shop.value;
  updateLowStockBadge();
  updateNotifications();
  await applyDailyInterest();
  await checkCloudBackupDue();
  checkSmsReminderDue();
  populateYearSelector();
}

export function render() {
  navigate(state.currentRoute);
}

document.addEventListener('keydown', (e) => {
  const key = e.key;
  const isInput = e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable;
  if (key === 'Escape') { closeModal(); return; }
  if (key === 'Enter' && e.target.tagName !== 'TEXTAREA' && document.getElementById('modal-root').children.length > 0) { e.preventDefault(); saveCurrentModal(); return; }
  const cartMatch = e.target.id?.match(/^(tx|cf)-(desc|qty|cost)-(\d+)$/);
  if (cartMatch && (key === 'ArrowDown' || key === 'ArrowUp')) {
    const prefix = cartMatch[1], field = cartMatch[2], row = parseInt(cartMatch[3]);
    const nextRow = key === 'ArrowDown' ? row + 1 : row - 1;
    const nextEl = document.getElementById(`${prefix}-${field}-${nextRow}`);
    if (nextEl) { e.preventDefault(); nextEl.focus(); nextEl.select(); }
    return;
  }
  if (!isInput) {
    if (key === 'F1') { e.preventDefault(); navigate('dashboard'); }
    else if (key === 'F2') { e.preventDefault(); navigate('transactions'); }
    else if (key === 'F3') { e.preventDefault(); navigate('payments'); }
    else if (key === 'F4') { e.preventDefault(); navigate('clients'); }
    else if (key === 'F5') { e.preventDefault(); navigate('inventory'); }
    else if (key === 'F6') { e.preventDefault(); navigate('expenses'); }
    else if (key === 'F7') { e.preventDefault(); navigate('reports'); }
    else if (key === 'F8') { e.preventDefault(); navigate('settings'); }
    else if (key === 'F9') { e.preventDefault(); navigate('stocktake'); }
    else if (key === 'F10') { e.preventDefault(); navigate('suppliers'); }
    else if (key === 'F11') { e.preventDefault(); navigate('purchase-orders'); }
    if ((e.ctrlKey || e.metaKey) && key === 'd') { e.preventDefault(); navigate('dashboard'); }
    if ((e.ctrlKey || e.metaKey) && key === 'u') { e.preventDefault(); navigate('utang'); }
    if ((e.ctrlKey || e.metaKey) && key === 't') { e.preventDefault(); navigate('transactions'); }
    if ((e.ctrlKey || e.metaKey) && key === 'i') { e.preventDefault(); navigate('inventory'); }
    if ((e.ctrlKey || e.metaKey) && key === 'e') { e.preventDefault(); navigate('expenses'); }
    if ((e.ctrlKey || e.metaKey) && key === 'r') { e.preventDefault(); navigate('reports'); }
    if ((e.ctrlKey || e.metaKey) && key === '/') { e.preventDefault(); showShortcuts(); }
    if ((e.ctrlKey || e.metaKey) && key === 'f') { e.preventDefault(); focusPageSearch(); }
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && key === 'P') { e.preventDefault(); navigate('payments'); }
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && key === 'C') { e.preventDefault(); navigate('clients'); }
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && key === 'S') { e.preventDefault(); navigate('settings'); }
    const routes = ['dashboard','clients','utang','transactions','catalog','inventory','stocktake','expenses','suppliers','payments','purchase-orders','reports','settings'];
    const idx = routes.indexOf(state.currentRoute);
    if (key === 'ArrowDown' || key === 'ArrowRight') { if (idx < routes.length - 1) { e.preventDefault(); navigate(routes[idx + 1]); } }
    else if (key === 'ArrowUp' || key === 'ArrowLeft') { if (idx > 0) { e.preventDefault(); navigate(routes[idx - 1]); } }
  }
  if ((e.ctrlKey || e.metaKey) && key === 'Enter') { e.preventDefault(); saveCurrentModal(); }
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && key === 'T') { e.preventDefault(); toggleTheme(); }
});

document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => navigate(btn.dataset.route));
});


// expose top-level bindings as globals (inline onclick handlers and legacy code paths rely on them)
Object.defineProperties(window, {
  _navToken: { get: () => _navToken, set: (v) => { _navToken = v; }, configurable: true },
  navigate: { get: () => navigate, configurable: true },
  loadAll: { get: () => loadAll, configurable: true },
  render: { get: () => render, configurable: true }
});
