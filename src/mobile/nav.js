// ---------- full-screen sheet navigation ----------
const VIEW_META = {
  catalog: { title: 'view.catalog.title', sub: 'view.catalog.sub' },
  clients: { title: 'view.clients.title', sub: 'view.clients.sub' },
  sale: { title: 'view.sale.title', sub: 'view.sale.sub' },
  pay: { title: 'view.pay.title', sub: 'view.pay.sub' },
  inventory: { title: 'view.inventory.title', sub: 'view.inventory.sub' },
  transactions: { title: 'view.transactions.title', sub: 'view.transactions.sub' },
  expenses: { title: 'view.expenses.title', sub: 'view.expenses.sub' },
  suppliers: { title: 'view.suppliers.title', sub: 'view.suppliers.sub' },
  'purchase-orders': { title: 'view.purchase-orders.title', sub: 'view.purchase-orders.sub' },
  reports: { title: 'view.reports.title', sub: 'view.reports.sub' },
  settings: { title: 'view.settings.title', sub: 'view.settings.sub' },
  stocktake: { title: 'view.stocktake.title', sub: 'view.stocktake.sub' },
  audit: { title: 'view.audit.title', sub: 'view.audit.sub' },
  help: { title: 'view.help.title', sub: 'view.help.sub' },
};
function markNavActive(view) {
  document.querySelectorAll('[data-nav]').forEach(b => b.classList.toggle('active', b.getAttribute('data-nav') === view));
}
function updateNavMeta(view) {
  const meta = VIEW_META[view] || { title: 'View', sub: '' };
  const t = document.getElementById('sheet-title'); if (t) t.textContent = T(meta.title);
  const st = document.getElementById('sheet-sub');
  if (st) {
    if (view === 'sale') {
      const n = cart.reduce((s, i) => s + i.qty, 0);
      st.textContent = n ? T('nav.cart_count', { n }) : T(meta.sub);
    } else st.textContent = T(meta.sub);
  }
}
function openNavModal(view) {
  navModalOpen = true;
  const m = document.getElementById('nav-modal'); if (m) m.style.display = 'flex';
  const sheetBody = document.getElementById('sheet-body');
  const v = document.getElementById('view');
  if (sheetBody && v && v.parentElement !== sheetBody) sheetBody.appendChild(v);
  try { document.body.style.overflow = 'hidden'; } catch (e) {}
  updateNavMeta(view);
  markNavActive(view);
}
function closeNavModal() {
  if (!navModalOpen) return;
  navModalOpen = false;
  const m = document.getElementById('nav-modal'); if (m) m.style.display = 'none';
  const slot = document.getElementById('main-slot');
  const v = document.getElementById('view');
  if (slot && v && v.parentElement !== slot) slot.appendChild(v);
  try { document.body.style.overflow = ''; } catch (e) {}
  currentView = 'home';
  markNavActive('home');
  renderHome();
}
function navTap(view) {
  if (view === 'home') {
    if (navModalOpen || currentView !== 'home') showView('home');
    return;
  }
  if (navModalOpen && currentView === view) { closeNavModal(); return; }
  showView(view);
}
function showView(view, arg) {
  currentView = view;
  // Cashier phones never render owner-only views (the server also 403s them).
  if (phoneRole() === 'cashier' && (view === 'reports' || view === 'expenses' || view === 'audit' || view === 'suppliers' || view === 'purchase-orders')) {
    toast(T('nav.owner_only'), 'err');
    view = 'home'; currentView = 'home';
  }
  if (view === 'home') {
    if (navModalOpen) { closeNavModal(); return; }
    markNavActive('home');
    renderHome();
  } else {
    if (!navModalOpen) openNavModal(view); else { updateNavMeta(view); markNavActive(view); }
    if (view === 'clients') renderClients();
    else if (view === 'catalog') renderCatalog(null);
    else if (view === 'sale') renderSale();
    else if (view === 'pay') renderPay(arg);
    else if (view === 'inventory') renderInventory();
    else if (view === 'transactions') renderTransactions();
    else if (view === 'expenses') renderExpenses();
    else if (view === 'suppliers') renderSuppliers();
    else if (view === 'purchase-orders') renderPOs();
    else if (view === 'reports') renderReports();
    else if (view === 'settings') renderSettings();
    else if (view === 'stocktake') renderStocktake();
    else if (view === 'audit') renderAudit();
    else if (view === 'help') renderHelp();
    else if (view === 'debts') renderDebts();
  }
  window.scrollTo(0, 0);
}
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { closeQuick(); if (navModalOpen) closeNavModal(); }
});

function skeleton(msg) {
  return '<div class="flex flex-col items-center justify-center py-20 fade-in"><div class="w-9 h-9 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mb-3"></div><div class="text-sm text-gray-500">' + (msg || T('common.loading')) + '</div></div>';
}

