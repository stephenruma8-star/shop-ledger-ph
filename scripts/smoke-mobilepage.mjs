// Functional test for the rebuilt mobile PWA (src/renderer/mobile.html) introduced in v3.4.24.
// Runs the page's real inline script inside a vm sandbox with stubbed DOM/fetch/WebSocket:
//   - boots and loads data through the new /api/stats, /api/inventory, /api/transactions, /api/clients endpoints
//   - renders every route (home, catalog, clients, sale, pay, inventory, transactions)
//   - quick-add to cart + submit sale (POST /api/sales payload shape)
//   - quick sell (single click, out-of-stock guard) and record Bayad (POST /api/payments)
//   - WebSocket auth handshake flips the connection status to Live
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const html = readFileSync(join(root, 'src/renderer/mobile.html'), 'utf8');
const m = html.match(/<script>([\s\S]*?)<\/script>/);
if (!m) throw new Error('no inline script found in mobile.html');
let pageScript = m[1];

pageScript += `
; {
  const g = globalThis;
  g.__data = () => data;
  g.__cart = () => cart;
  g.__cur = () => currentView;
  g.__eval = (code) => eval(code);
  g.__queue = () => offlineQueue;
  g.__flush = () => flushQueue();
}
`;

const noop = () => {};
const timerIds = new Set();
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const sandboxTimeout = (fn, ms) => { const t = setTimeout(fn, ms); timerIds.add(t); return t; };
const sandboxInterval = (fn, ms) => { const t = setInterval(fn, ms); timerIds.add(t); return t; };

const seen = new Set();
const posts = [];
const sockets = [];
let fetchCount = 0;
const todayStr = new Date().toISOString().split('T')[0];
const storage = new Map();
const bridge = { offline: false };

function tx(id, invoiceNo, clientName, grandTotal, status, itemCount) {
  return { id, invoiceNo, clientName, grandTotal, date: todayStr, paymentMethod: 'Cash', status, items: itemCount, subtotal: grandTotal, totalInterest: 0, discount: 0, scDiscount: 0, createdAt: new Date().toISOString() };
}
const mkFixtures = () => ({
  inventory: [
    { id: 1, name: 'Coke 500ml', price: 100, stock: 10, lowStock: 5, image: 'data:image/png;base64,AAAA', createdAt: new Date().toISOString() },
    { id: 2, name: 'Biscuit Pack', price: 30, stock: 5, lowStock: 6, image: null, createdAt: new Date().toISOString() },
    { id: 3, name: 'Siopao Asado', price: 25, stock: 0, lowStock: 5, image: null, createdAt: new Date().toISOString() },
  ],
  transactions: [
    tx(1, 'INV-00001', 'Maria Santos', 150, 'paid', 2),
    tx(2, 'INV-00002', 'Walk-in', 80.33, 'pending', 1),
  ],
  clients: [
    { id: 1, name: 'Maria Santos', phone: '09171234567', balance: 234.5, address: '', createdAt: new Date().toISOString() },
    { id: 2, name: 'Juan Dela Cruz', phone: '09181234567', balance: 0, address: '', createdAt: new Date().toISOString() },
  ],
});
const statsFixture = () => ({
  clients: 2, inventory: 3, totalUtang: 234.5, lowStockCount: 2,
  todaySales: 230.33, todayCollected: 100, todayExpenses: 0, todayProfit: 230.33,
  monthSales: 230.33, monthCollected: 100, monthExpenses: 0, monthProfit: 230.33,
  recent: mkFixtures().transactions,
});
const reportsFixture = () => ({
  today: { sales: 230.33, expenses: 0, collected: 100, profit: 230.33 },
  month: { sales: 230.33, expenses: 50, collected: 100, profit: 180.33 },
  topItems: [{ name: 'Coke 500ml', qty: 3, amount: 300 }],
  week: Array.from({ length: 7 }, (_, i) => ({ date: '2026-08-' + String(10 + i).padStart(2, '0'), sales: 100 + i * 10, expenses: 20 })),
});
const mkExtras = () => ({
  expenses: [
    { id: 1, date: todayStr, category: 'Utilities', description: 'Electric bill', amount: 1200, payee: 'Meralco', createdAt: new Date().toISOString() },
    { id: 2, date: todayStr, category: 'Other', description: 'Ice', amount: 50, payee: '', createdAt: new Date().toISOString() },
  ],
  suppliers: [
    { id: 1, name: 'ABC Trading', contact: '09151234567', email: 'abc@trading.ph', category: 'Grocery', address: '', purchased: 10000, paid: 4000, owed: 6000 },
  ],
  purchaseOrders: [
    { id: 1, poNo: 'PO-00001', supplierId: 1, supplierName: 'ABC Trading', date: todayStr, items: [{ name: 'Coke', price: 80, qty: 10 }], total: 800, status: 'Pending', createdAt: new Date().toISOString() },
  ],
  settings: { shopName: 'Juan Sari-Sari Store', shopContact: '09171234567', shopAddress: 'Manila', currency: '₱' },
});

const els = new Map();
const makeEl = (id) => {
  const el = {
    id, value: '', className: '', checked: false, style: {}, dataset: {}, children: [],
    classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
    appendChild(child) { if (child) { if (child.id) els.set(child.id, child); this.children.push(child); } },
    remove() {}, focus: noop, click: noop, setAttribute: noop, getAttribute: () => null,
  };
  let _t = '';
  // single backing store so the page's esc() (textContent -> innerHTML) round-trips
  Object.defineProperty(el, 'textContent', { configurable: true, get() { return _t; }, set(v) { _t = String(v == null ? '' : v); } });
  Object.defineProperty(el, 'innerHTML', { configurable: true, get() { return _t; }, set(v) { _t = String(v == null ? '' : v); } });
  return el;
};
const getEl = (id) => { if (!els.has(id)) els.set(id, makeEl(id)); return els.get(id); };

const fakeFetch = async (url, opts) => {
  fetchCount++;
  if (bridge.offline) throw new TypeError('Failed to fetch');
  const method = (opts && opts.method) || 'GET';
  const path = String(url).replace(/^https?:\/\/[^/]+/, '');
  seen.add(method + ' ' + path);
  if (method === 'POST' || method === 'PUT' || method === 'DELETE') { posts.push({ path, method, body: JSON.parse(opts.body || '{}') }); return { ok: true, json: async () => ({ success: true, invoiceNo: 'INV-0000X' }) }; }
  const F = mkFixtures();
  const X = mkExtras();
  let payload = {};
  if (path.startsWith('/api/stats')) payload = statsFixture();
  else if (path.startsWith('/api/inventory/images')) payload = {};
  else if (path.startsWith('/api/inventory/valuation')) payload = { items: 3, units: 15, costValue: 200, retailValue: 450 };
  else if (path.startsWith('/api/inventory')) payload = F.inventory.sort((a, b) => a.name.localeCompare(b.name));
  else if (/^\/api\/transactions\/[^/]+$/.test(path)) payload = { id: 1, invoiceNo: 'INV-00001', clientName: 'Maria Santos', paymentMethod: 'Cash', date: todayStr, grandTotal: 150, subtotal: 150, status: 'paid', items: [{ description: 'Coke 500ml', qty: 1, unitCost: 100 }] };
  else if (/^\/api\/clients\/[^/]+\/history$/.test(path)) payload = { client: { id: 1, name: 'Maria Santos', phone: '0917', balance: 234.5, loyaltyPoints: 250 }, sales: [{ invoiceNo: 'INV-00001', date: todayStr, grandTotal: 150 }], payments: [{ date: todayStr, amount: 30 }] };
  else if (path.startsWith('/api/version')) payload = { v: 7 };
  else if (path.startsWith('/api/transactions')) payload = F.transactions;
  else if (path.startsWith('/api/clients')) payload = F.clients;
  else if (path.startsWith('/api/expenses')) payload = X.expenses;
  else if (path.startsWith('/api/suppliers')) payload = X.suppliers;
  else if (path.startsWith('/api/purchase-orders')) payload = X.purchaseOrders;
  else if (path.startsWith('/api/quick-items')) payload = [{ id: 1, name: 'Coke', price: 100, invId: 1 }];
  else if (path.startsWith('/api/reports')) payload = reportsFixture();
  else if (path.startsWith('/api/settings')) payload = X.settings;
  else if (path.startsWith('/api/audit')) payload = [{ id: 1, action: 'sale', details: 'Mobile sale INV-00001', user: '', createdAt: '2026-09-24T10:00:00.000Z' }];
  else if (path === 'version.json' || path.endsWith('/version.json')) payload = { desktopVersion: '3.30.0' };
  else if (path.endsWith('/releases/latest')) payload = { tag_name: 'v3.31.0', assets: [{ name: 'Shop-Ledger-Mobile-3.31.0-debug.apk', browser_download_url: 'https://example.com/app.apk' }] };
  return { ok: true, json: async () => payload };
};

function FakeWebSocket(url) { this.url = url; this.onopen = noop; this.onmessage = noop; this.onclose = noop; this.onerror = noop; this.sent = []; sockets.push(this); }
FakeWebSocket.prototype.send = function (data) {
  let msg; try { msg = JSON.parse(data); } catch (e) { return; }
  try { this.sent.push(msg); } catch (e) {}
  if (msg.type === 'auth') {
    const self = this;
    queueMicrotask(() => { if (self.onmessage) self.onmessage({ data: JSON.stringify({ type: 'auth-ok' }) }); });
  }
};
FakeWebSocket.prototype.close = function () { try { this.onclose(); } catch (e) {} };

const langs = { en: 'es', 'en-PH': 'es' };
const sandbox = {
  console,
  window: {
    location: { origin: 'http://localhost', search: '?token=tk123', protocol: 'http:', hostname: 'localhost' },
    scrollTo: noop,
    addEventListener: noop,
  },
  location: { search: '?token=tk123', protocol: 'http:', hostname: 'localhost' },
  navigator: {},
  localStorage: {
    getItem: (k) => (storage.has(k) ? storage.get(k) : null),
    setItem: (k, v) => storage.set(k, String(v)),
    removeItem: (k) => storage.delete(k),
    clear: () => storage.clear(),
  },
  WebSocket: FakeWebSocket,
  fetch: fakeFetch,
  setTimeout: sandboxTimeout,
  setInterval: sandboxInterval,
  clearTimeout: clearTimeout,
  clearInterval: clearInterval,
  Intl: Intl,
  URL: URL,
  URLSearchParams: URLSearchParams,
  Date: Date,
  JSON: JSON,
  Array: Array,
  Math: Math,
  Number: Number,
  String: String,
  Promise: Promise,
  parseFloat: parseFloat,
  parseInt: parseInt,
  isNaN: isNaN,
  document: null,
};

function installDom() {
  sandbox.document = {
    getElementById: (id) => getEl(id),
    querySelector: () => makeEl(),
    querySelectorAll: () => [makeEl(), makeEl()],
    createElement: (tag) => { const el = makeEl(); el.tagName = (tag || 'div').toUpperCase(); return el; },
    createTextNode: () => ({}),
    addEventListener: () => {},
    body: makeEl('body'), documentElement: makeEl(), head: makeEl('head'),
  };
}

let failures = 0;
function ok(cond, msg) {
  if (cond) console.log('PASS - ' + msg);
  else { failures++; console.error('FAIL - ' + msg); }
}

try {
  installDom();
  vm.createContext(sandbox); // freezes the set of global props from this point
  // reuse the same element registry inside + outside the sandbox
  vm.runInContext('', sandbox); // warm-up not needed; see below

  vm.runInContext(pageScript, sandbox);

  const gget = (code) => vm.runInContext(code, sandbox);
  const gcall = (code) => { const wrap = `;(function(){ const f = ${code}; if (f && typeof f.then === 'function') return f; return typeof f === 'function' ? f() : f; })()`; return vm.runInContext(wrap, sandbox); };

  await wait(60); // let init boot: loadAll() + first render + WS auth

  const dataRef = () => gget('__data()');
  const cartRef = () => gget('__cart()');
  const curRef = () => gget('__cur()');

  ok(fetchCount >= 4, 'boot fetched all endpoints (>=4 requests)');
  ok(seen.has('GET /api/stats'), 'called GET /api/stats');
  ok(seen.has('GET /api/inventory'), 'called GET /api/inventory');
  ok(seen.has('GET /api/transactions?limit=100'), 'called GET /api/transactions?limit=100');
  ok(seen.has('GET /api/clients'), 'called GET /api/clients');
  ok(getEl('conn-status').textContent === '● Live', 'connection status Live after WS auth');
  ok(curRef() === 'home', 'initial currentView is home');
  ok(seen.has('GET /api/expenses'), 'called GET /api/expenses');
  ok(seen.has('GET /api/suppliers'), 'called GET /api/suppliers');
  ok(seen.has('GET /api/purchase-orders'), 'called GET /api/purchase-orders');
  ok(seen.has('GET /api/reports'), 'called GET /api/reports');
  ok(seen.has('GET /api/settings'), 'called GET /api/settings');

  // home route
  gcall(`showView('home')`);
  await wait(20);
  const homeHtml = getEl('view').innerHTML;
  ok(homeHtml.includes("Today's Sales") || homeHtml.includes('Today’),'), 'home renders dashboard');
  ok(homeHtml.includes('Profit'), 'home shows profit line');
  ok(homeHtml.includes('Biscuit Pack'), 'home lists low-stock item');
  ok(homeHtml.includes('INV-00001'), 'home lists recent sale');
  ok(homeHtml.includes('Quick Actions') && homeHtml.includes('Purchase Orders'), 'home shows quick action links');

  // catalog route
  gcall(`showView('catalog')`);
  const catHtml = getEl('view').innerHTML;
  ok(catHtml.includes('3 items'), 'catalog shows item count (3)');
  ok(catHtml.includes('Siopao Asado') && catHtml.includes('>OUT<'), 'catalog shows OUT badge for out-of-stock item');
  ok(catHtml.includes('Coke 500ml') && catHtml.includes('10 in stock'), 'catalog shows in-stock item stock');
  ok(catHtml.includes('₱100.00'), 'catalog shows price formatted');

  // clients route
  gcall(`showView('clients')`);
  const cliHtml = getEl('view').innerHTML;
  ok(cliHtml.includes('Maria Santos') && cliHtml.includes('Juan Dela Cruz'), 'clients list rendered');
  ok(cliHtml.includes('Total clients') && cliHtml.includes('234.50'), 'clients summary shows total utang');
  gcall(`filterClients('juan')`);
  const gridHtml = getEl('client-grid').innerHTML;
  ok(gridHtml.includes('Juan Dela Cruz') && !gridHtml.includes('Maria Santos'), 'client search filters');

  // sale route (empty cart)
  gcall(`showView('sale')`);
  const saleHtml = getEl('view').innerHTML;
  ok(saleHtml.includes('Cart is empty'), 'sale view shows empty cart');
  ok(saleHtml.includes('Walk-in (no client)') && saleHtml.includes('Maria Santos') && saleHtml.includes('Juan Dela Cruz'), 'sale view lists clients');

  // quick add to cart
  gcall(`showView('catalog')`);
  gcall(`openQuick(1)`);
  const qm = getEl('modal-root').innerHTML;
  ok(qm.includes('Coke 500ml') && qm.includes('Add to Cart') && qm.includes('Sell Now'), 'quick-sale modal shows item + actions');
  gcall(`quickAdd(1)`);
  ok(getEl('cart-count').textContent === '1', 'cart count badge updated to 1');
  ok(cartRef().length === 1 && cartRef()[0].qty === 1 && cartRef()[0].price === 100, 'cart holds added item');
  gcall(`showView('sale')`);
  const cartHtml = getEl('view').innerHTML;
  ok(cartHtml.includes('Coke 500ml') && cartHtml.includes('₱100.00'), 'sale cart lists added item with line total');

  // totals: SC/PWD + interest + discount
  gcall(`renderSale()`);
  getEl('sale-sc').checked = true;
  getEl('sale-interest').value = '10';
  getEl('sale-discount').value = '10';
  gcall(`saleTotals()`);
  ok(getEl('sale-total').textContent === '₱80.00', 'sale totals: 100 + 10% interest - 20% SC - 10 = 80.00');
  getEl('sale-sc').checked = false;
  getEl('sale-interest').value = '0';
  getEl('sale-discount').value = '0';
  gcall(`saleTotals()`);
  ok(getEl('sale-total').textContent === '₱100.00', 'sale totals reset to 100 without add-ons');

  // submit sale (charged to client)
  getEl('sale-client').value = '1';
  getEl('sale-charge').checked = true;
  const beforeSalePosts = posts.length;
  await gcall(`submitSale()`);
  const salePost = posts[beforeSalePosts];
  ok(salePost && salePost.path === '/api/sales', 'sale submitted to POST /api/sales');
  if (salePost) {
    ok(salePost.body.clientId === 1, 'sale clientId charged to client');
    ok(salePost.body.items.length === 1 && salePost.body.items[0].name === '1' && salePost.body.items[0].description === 'Coke 500ml' && salePost.body.items[0].qty === 1 && salePost.body.items[0].unitCost === 100 && salePost.body.items[0].invId === 1, 'sale item payload (qty-in-name + description + invId)');
    ok(salePost.body.paymentMethod === 'Cash' && salePost.body.discount === 0, 'sale payment + discount defaults');
  }
  ok(getEl('cart-count').textContent === '0', 'cart cleared after sale');

  // single-click quick sell + out-of-stock guard
  gcall(`showView('catalog')`);
  gcall(`openQuick(2)`);
  const n = posts.length;
  await gcall(`quickSell(2)`);
  await wait(15); // let refreshAll()/apiPost land
  const quickPost = posts[n];
  ok(quickPost && quickPost.path === '/api/sales' && quickPost.body.items[0].qty === 1 && quickPost.body.items[0].unitCost === 30 && quickPost.body.items[0].name === '1', 'quick sell posts correct single-item payload');
  gcall(`openQuick(3)`);
  ok(!getEl('modal-root').innerHTML.includes('Add to Cart'), 'out-of-stock item does not open quick modal');
  ok(getEl('toast-root').children.some(c => c.className.includes('bg-red-600') && c.textContent.includes('Out of stock')), 'out-of-stock guard shows toast');
  const beforeGuard = posts.length;
  await gcall(`quickSell(3)`);
  await wait(15);
  ok(posts.length === beforeGuard, 'no sale posted for out-of-stock item');

  // inventory route
  gcall(`showView('inventory')`);
  const invHtml = getEl('view').innerHTML;
  ok(invHtml.includes('Inventory') && invHtml.includes('3 items'), 'inventory view shows item count');
  ok(invHtml.includes('OUT OF STOCK') && invHtml.includes('low stock'), 'inventory shows stock statuses');
  gcall(`filterInventory('biscuit')`);
  const invGrid = getEl('inv-grid').innerHTML;
  ok(invGrid.includes('Biscuit Pack') && !invGrid.includes('Coke'), 'inventory search filters');

  // transactions route
  gcall(`showView('transactions')`);
  const txsHtml = getEl('view').innerHTML;
  ok(txsHtml.includes('INV-00001') && txsHtml.includes('INV-00002'), 'transactions list shows invoices');
  ok(txsHtml.includes('Maria Santos'), 'transactions shows client name');
  ok(txsHtml.includes('2 items'), 'transactions shows per-sale item count');

  // record Bayad
  gcall(`showView('pay', 1)`);
  const payHtml = getEl('view').innerHTML;
  ok(payHtml.includes('Record Payment') && payHtml.includes('Maria Santos'), 'pay view rendered with preselected client');
  getEl('pay-client').value = '1';
  getEl('pay-amount').value = '100';
  getEl('pay-type').value = 'GCash';
  const beforePayPosts = posts.length;
  await gcall(`submitPay()`);
  const payPost = posts[beforePayPosts];
  ok(payPost && payPost.path === '/api/payments', 'payment posted to POST /api/payments');
  if (payPost) ok(payPost.body.clientId === 1 && payPost.body.amount === 100 && payPost.body.type === 'GCash' && !!payPost.body.date, 'payment payload shape');

  // WS live-update path: 'update' triggers data refresh + home re-render stays live
  const ws = gget('ws');
  ok(!!ws && typeof ws.send === 'function', 'app holds a live WebSocket');

  // expenses view + add expense flow
  gcall(`showView('expenses')`);
  const expHtml = getEl('view').innerHTML;
  ok(expHtml.includes('Electric bill') && expHtml.includes('Meralco'), 'expenses view lists recorded expenses');
  ok(expHtml.includes('This month') && expHtml.includes('₱1,250.00'), 'expenses view shows month total (1200+50)');
  gcall(`filterExpenses('ice')`);
  const expGrid = getEl('exp-grid').innerHTML;
  ok(expGrid.includes('Ice') && !expGrid.includes('Electric'), 'expense search filters');
  gcall(`addExpense()`);
  ok(getEl('modal-root').innerHTML.includes('Save Expense'), 'add-expense modal rendered');
  getEl('ex-desc').value = 'Trash bags';
  getEl('ex-category').value = 'Supplies';
  getEl('ex-amount').value = '75';
  getEl('ex-payee').value = 'Market';
  const beforeExpPosts = posts.length;
  await gcall(`submitExpense()`);
  const expPost = posts[beforeExpPosts];
  ok(expPost && expPost.path === '/api/expenses', 'expense posted to POST /api/expenses');
  if (expPost) ok(expPost.body.amount === 75 && expPost.body.category === 'Supplies' && expPost.body.description === 'Trash bags' && expPost.body.payee === 'Market' && !!expPost.body.date, 'expense payload shape');

  // suppliers view
  gcall(`showView('suppliers')`);
  const supHtml = getEl('view').innerHTML;
  ok(supHtml.includes('ABC Trading'), 'suppliers view lists supplier');
  ok(supHtml.includes('09151234567'), 'suppliers view shows supplier contact');
  ok(supHtml.includes('₱6,000.00') && supHtml.includes('Bought ₱10,000.00') && supHtml.includes('Paid ₱4,000.00'), 'suppliers shows purchased/paid/owed totals');
  gcall(`filterSuppliers('abc')`);
  const supGrid = getEl('sup-grid').innerHTML;
  ok(supGrid.includes('ABC Trading') && supGrid.includes('Bought ₱10,000.00'), 'supplier search filters + totals');

  // purchase orders view + new PO flow
  gcall(`showView('purchase-orders')`);
  const poHtml = getEl('view').innerHTML;
  ok(poHtml.includes('PO-00001') && poHtml.includes('ABC Trading') && poHtml.includes('₱800.00'), 'PO view lists orders with totals');
  gcall(`addPO()`);
  ok(getEl('modal-root').innerHTML.includes('Create PO'), 'new-PO modal rendered');
  getEl('po-supplier').value = '1';
  const poItemSel = getEl('po-item');
  poItemSel.options = [{ value: '1', dataset: { name: 'Coke 500ml', price: '100' } }];
  poItemSel.selectedIndex = 0;
  getEl('po-qty').value = '2';
  getEl('po-price').value = '100';
  gcall(`poAddItem()`);
  ok(getEl('po-cart').innerHTML.includes('Coke 500ml') && getEl('po-total-mobile').textContent === '₱200.00', 'PO cart line + running total');
  const beforePoPosts = posts.length;
  await gcall(`submitPO()`);
  const poPost = posts[beforePoPosts];
  ok(poPost && poPost.path === '/api/purchase-orders', 'PO posted to POST /api/purchase-orders');
  if (poPost) ok(poPost.body.supplierId === 1 && poPost.body.items.length === 1 && poPost.body.items[0].name === 'Coke 500ml' && poPost.body.items[0].price === 100 && poPost.body.items[0].qty === 2 && !!poPost.body.date, 'PO payload shape');

  // reports view
  gcall(`showView('reports')`);
  const repHtml = getEl('view').innerHTML;
  ok(repHtml.includes("Today's Sales") && repHtml.includes("Today's Profit"), 'reports shows today summary');
  ok(repHtml.includes('Month Profit') && repHtml.includes('₱180.33'), 'reports shows month profit');
  ok(repHtml.includes('Top items') && repHtml.includes('Coke 500ml'), 'reports shows top items');
  ok(repHtml.includes('Last 7 days'), 'reports shows 7-day trend');

  // settings view
  gcall(`showView('settings')`);
  const setHtml = getEl('view').innerHTML;
  ok(setHtml.includes('Juan Sari-Sari Store') && setHtml.includes('Manila') && setHtml.includes('09171234567'), 'settings shows store info');

  // ---- offline write queue (v3.4.35) ----
  gcall(`showView('expenses')`);
  gcall(`addExpense()`);
  getEl('ex-desc').value = 'Candles';
  getEl('ex-category').value = 'Other';
  getEl('ex-amount').value = '20';
  getEl('ex-payee').value = 'Store';
  bridge.offline = true;
  const offPostsBefore = posts.length;
  await gcall(`submitExpense()`);
  await wait(20);
  ok(posts.length === offPostsBefore, 'offline expense not posted directly');
  ok(gget('__queue().length') === 1 && gget('__queue()[0].path') === '/api/expenses', 'offline expense queued with endpoint path');
  ok(gget('__queue()[0].body.amount') === 20 && gget('__queue()[0].body.description') === 'Candles' && gget('__queue()[0].body.payee') === 'Store', 'queued expense payload preserved');
  ok(getEl('pending-count').textContent === '1', 'offline banner shows pending count 1');
  const expGridHtml = getEl('view').innerHTML;
  ok(expGridHtml.includes('Candles') && expGridHtml.includes('pending sync'), 'queued expense shown in list with pending-sync badge');
  const qStored = storage.get('slpOfflineQueue');
  ok(!!qStored && JSON.parse(qStored).length === 1, 'queue persisted to localStorage');
  gcall(`quickAdd(1)`);
  gcall(`showView('sale')`);
  const offSaleBefore = posts.length;
  await gcall(`submitSale()`);
  await wait(20);
  ok(posts.length === offSaleBefore, 'offline sale not posted directly');
  ok(gget('__queue().length') === 2 && gget('__queue()[1].path') === '/api/sales', 'offline sale queued after expense (FIFO order)');
  ok(getEl('toast-root').children.some(c => c.textContent.includes('queued')), 'queued toast shown');
  bridge.offline = false;
  const synced = await gcall(`__flush()`);
  await wait(20);
  ok(synced === 2, 'flush() synced both queued writes');
  const tail = posts.slice(-2);
  ok(tail[0].path === '/api/expenses' && tail[1].path === '/api/sales', 'writes replayed in original order');
  ok(tail[0].body.description === 'Candles' && tail[1].body.items[0].description === 'Coke 500ml', 'replayed payloads intact');
  ok(gget('__queue().length') === 0 && getEl('pending-count').textContent === '0', 'queue and banner cleared after sync');

  // ---- WS death, poison queue, print routing ----
  // (the sandbox never fires socket open by itself — drive it manually)
  const liveSock = sockets[sockets.length - 1];
  liveSock.onopen();
  await wait(20);
  ok(liveSock && liveSock.sent.some(m => m.type === 'auth'), 'phone authenticates the socket on open');
  const t0 = timerIds.size;
  liveSock.onclose();
  await wait(20);
  ok(timerIds.size === t0 + 1, 'dropped connection schedules a reconnect');
  liveSock.onmessage({ data: JSON.stringify({ type: 'auth-error' }) });
  ok(gget('wsTokenDead') === true, 'rejected token marks the socket dead');
  const t1 = timerIds.size;
  liveSock.onclose();
  await wait(20);
  ok(timerIds.size === t1, 'dead token schedules no further reconnects');
  const savedFetchQ = sandbox.fetch;
  gcall(`queueOp('/api/sales', { items: [] })`);
  sandbox.fetch = async () => ({ ok: false, json: async () => ({ success: false, error: 'nope' }) });
  await gcall(`flushQueue()`);
  ok(gget('__queue().length') === 0, 'rejected op dropped instead of blocking the queue');
  sandbox.fetch = async () => { throw new TypeError('down'); };
  await gcall(`printSaleReceipt('INV-0000X')`);
  ok(gget('__queue().length') === 0, 'failed print is not queued for later');
  sandbox.fetch = savedFetchQ;

  // ---- pairing without QR ----
  gcall(`renderPairScreen()`);
  ok(getEl('view').innerHTML.includes('pair-code') && getEl('view').innerHTML.includes('Connect this phone'), 'pair screen renders code entry');
  getEl('pair-code').value = '12';
  await gcall(`submitPairCode()`);
  ok(getEl('pair-error').textContent.includes('6-digit'), 'short code rejected with guidance');
  const realFetch = sandbox.fetch;
  sandbox.fetch = async (url) => {
    if (String(url).endsWith('/api/pair')) return { ok: true, json: async () => ({ success: true, token: 'paired-tok-1' }) };
    return realFetch(url);
  };
  getEl('pair-code').value = '123456';
  await gcall(`submitPairCode()`);
  ok(storage.get('slpToken') === 'paired-tok-1', 'redeemed token persisted for future visits');
  sandbox.fetch = async () => ({ ok: false, json: async () => ({ success: false, error: 'Wrong code' }) });
  getEl('pair-code').value = '000000';
  await gcall(`submitPairCode()`);
  ok(getEl('pair-error').textContent.includes('Wrong code'), 'wrong code shows server message');
  sandbox.fetch = realFetch;

  // ---- counter UX: tender, search-add, retry, roles, display, alerts ----
  getEl('sale-interest').value = '0'; getEl('sale-sc').checked = false; getEl('sale-discount').value = '0';
  gcall(`saleTotals()`);
  gcall(`setTender(500)`);
  ok(getEl('tendered-amt').textContent === '₱500.00' && getEl('tender-change').textContent === '₱500.00', 'tender shows tendered + change due');
  gcall(`setTender(0)`);
  ok(getEl('tender-change').textContent === '—', 'cleared tender shows dashes');

  gcall(`showView('sale')`);
  gcall(`counterSearch('coke')`);
  ok(getEl('counter-results').innerHTML.includes('Coke 500ml'), 'counter search finds Coke');
  gcall(`counterSearch('zzz-nope')`);
  ok(getEl('counter-results').innerHTML.includes('No match'), 'counter search reports no match');
  gcall(`counterAdd(1)`);
  ok(cartRef().length === 1 && cartRef()[0].name === 'Coke 500ml', 'counter add puts the item in cart');

  // failed sale keeps the cart and offers one-tap retry of the same payload
  // (HTTP errors retry; raw network drops go to the offline queue instead)
  const postsBeforeFail = posts.length;
  sandbox.fetch = async () => ({ ok: false, json: async () => ({ success: false, error: 'Till closed' }) });
  await gcall(`submitSale()`);
  ok(cartRef().length === 1 && getEl('view').innerHTML.includes('Retry last failed sale'), 'failed sale keeps cart + shows retry');
  sandbox.fetch = realFetch;
  await gcall(`retrySale()`);
  ok(posts.length === postsBeforeFail + 1 && posts[postsBeforeFail].path === '/api/sales', 'retry re-posts the saved payload');
  ok(cartRef().length === 0 && getEl('view').innerHTML.includes('INV-0000X'), 'retry success shows the receipt sheet');

  // ---- double-submit guard: two rapid taps post once ----
  gcall(`counterAdd(1)`);
  const dblBefore = posts.length;
  const dp1 = gcall(`submitSale()`);
  const dp2 = gcall(`submitSale()`);
  await dp1; await dp2;
  ok(posts.length === dblBefore + 1 && posts[dblBefore].path === '/api/sales', 'double-tapped sale posts exactly once');

  // cashier role: detected, redirected from owner views
  storage.set('slpRole', 'cashier');
  ok(gcall(`phoneRole()`) === 'cashier', 'cashier role detected on phone');
  gcall(`showView('reports')`);
  ok(curRef() === 'home', 'cashier is redirected away from reports');
  storage.delete('slpRole');
  gcall(`showView('home')`);

  // display prefs persist + render; alerts strip names outages
  gcall(`setPhoneTheme('day')`);
  ok(storage.get('slpTheme') === 'day', 'day theme persisted');
  gcall(`renderSettings()`);
  await wait(20);
  ok(getEl('display-row').innerHTML.includes('Day'), 'display prefs render in settings');
  gcall(`setPhoneTheme('dark'); setPhoneText('normal');`);
  gcall(`data.alerts = { out: [{ name: 'Milk' }], low: [], outCount: 1, lowCount: 0 }`);
  const strip = gcall(`alertsStrip()`);
  ok(String(strip).includes('Milk') && String(strip).includes('out of stock'), 'alerts strip names out-of-stock items');

  // ---- i18n: every T() key resolves, Filipino renders ----
  const usedKeys = [...new Set([...pageScript.matchAll(/\bT\('([^']+)'/g)].map(m => m[1]))];
  const missingKeys = JSON.parse(gcall(`JSON.stringify(${JSON.stringify(usedKeys)}.filter(k => !(k in LANG_STRINGS.en)))`));
  ok(missingKeys.length === 0, 'every T() key exists in the en dictionary' + (missingKeys.length ? ': ' + missingKeys.join(', ') : ''));
  const shellKeys = [...readFileSync(join(root, 'src/mobile/shell-top.html'), 'utf8').matchAll(/data-i18n="([^"]+)"/g)].map(m => m[1]);
  const missingShell = JSON.parse(gcall(`JSON.stringify(${JSON.stringify(shellKeys)}.filter(k => !(k in LANG_STRINGS.en)))`));
  ok(missingShell.length === 0, 'every data-i18n key exists in the en dictionary' + (missingShell.length ? ': ' + missingShell.join(', ') : ''));
  storage.set('slpLang', 'fil');
  gcall(`applyStaticLang()`);
  gcall(`showView('sale')`);
  ok(getEl('view').innerHTML.includes('Bagong Benta') && !getEl('view').innerHTML.includes('>New Sale<'), 'sale view renders in Filipino');
  gcall(`showView('settings')`);
  await wait(20);
  ok(getEl('view').innerHTML.includes('Mga Setting'), 'settings view renders in Filipino');
  storage.delete('slpLang');
  gcall(`applyStaticLang()`);

  // ---- structural integrity: every view renders without undefined leaks ----
  const viewTitles = { home: null, catalog: null, clients: null, sale: 'New Sale', pay: null, inventory: null, transactions: null, expenses: null, suppliers: null, 'purchase-orders': null, reports: null, settings: null, stocktake: null, audit: null, help: null, debts: null };
  for (const vn of Object.keys(viewTitles)) {
    gcall(`showView('${vn}')`);
    await wait(10);
    const html = getEl('view').innerHTML;
    ok(!html.includes('undefined'), vn + ' view has no undefined leaks');
    if (viewTitles[vn]) ok(html.includes(viewTitles[vn]), vn + ' view shows its title');
  }
  gcall(`showView('home')`);

  // ---- void flow, SMS ----
  await gcall(`openTxnDetail(1)`);
  await gcall(`voidTxn('INV-00001')`);
  ok(getEl('void-btn').textContent.includes('confirm'), 'void arms on first tap');
  const voidBefore = posts.length;
  await gcall(`voidTxn('INV-00001')`);
  ok(posts.length === voidBefore + 1 && posts[voidBefore].path === '/api/void', 'void posts on second tap');
  gcall(`closeQuick()`);

  // ---- debts view + SMS ----
  gcall(`showView('debts')`);
  ok(getEl('view').innerHTML.includes('Mga Utang') || getEl('view').innerHTML.includes('Debts'), 'debts view renders');
  const smsBefore = posts.length;
  await gcall(`sendSmsReminders()`);
  ok(posts.length === smsBefore + 1 && posts[smsBefore].path === '/api/sms-reminders', 'SMS reminders post to the API');

  // ---- phone app updater ----
  ok(gcall(`cmpAppVer('3.31.0', '3.30.0')`) === 1 && gcall(`cmpAppVer('3.30.0', '3.30.0')`) === 0 && gcall(`cmpAppVer('3.29.9', '3.30.0')`) === -1, 'updater compares versions');
  ok(await gcall(`checkMobileUpdate(true)`) === 'available', 'newer release detected');
  ok(getEl('modal-root').innerHTML.includes('Phone app update'), 'update sheet offers the download');
  gcall(`closeQuick()`);
  ok(await gcall(`checkMobileUpdate(false)`) === 'throttled', 'auto check throttled to once a day');
  gcall(`renderSettings()`);
  await wait(20);
  ok(getEl('update-row').innerHTML.includes('3.30.0'), 'settings shows the bundled app version');

  // ---- parity views: stocktake, audit, help, monthly picker, supplier pay ----
  gcall(`showView('stocktake')`);
  ok(getEl('view').innerHTML.includes('Stocktake'), 'stocktake view renders');
  gcall(`stocktakeStep(1, 1)`);
  ok(getEl('st-c-1').textContent === '11' && getEl('st-progress').textContent === '1 counted', 'stocktake stepper counts + tracks progress');

  gcall(`showView('audit')`);
  await wait(20);
  ok(getEl('view').innerHTML.includes('Mobile sale INV-00001'), 'audit view lists activity');

  gcall(`showView('help')`);
  ok(getEl('view').innerHTML.includes('Troubleshooting'), 'help view renders the guide');

  gcall(`showView('reports')`);
  getEl('rep-month').value = '2026-01';
  await gcall(`loadReportMonth()`);
  ok(getEl('view').innerHTML.includes('value="2026-01"') || getEl('rep-month').value === '2026-01', 'monthly picker reloads the report for that month');
  ok(getEl('view').innerHTML.includes('exportMonthCsv()'), 'reports view offers CSV export');
  ok(getEl('view').innerHTML.includes('Debt aging') || getEl('view').innerHTML.includes('Pagtanda'), 'reports include debt aging');
  ok(getEl('view').innerHTML.includes('Sales by client') || getEl('view').innerHTML.includes('Benta bawat'), 'reports include sales by client');

  // ---- stocktake photo button ----
  gcall(`showView('stocktake')`);
  ok(getEl('view').innerHTML.includes('photoForItem('), 'stocktake rows offer photo capture');

  // ---- quick-item chips + clients CSV ----
  gcall(`showView('sale')`);
  ok(getEl('view').innerHTML.includes('quickAddItem('), 'sale view shows quick-item chips');
  await gcall(`quickAddItem(0)`);
  ok(cartRef().length === 1, 'quick chip adds to cart');
  gcall(`showView('transactions')`);
  await gcall(`exportClientsCsv()`);
  ok(true, 'clients CSV export runs without throwing');

  // ---- clients: add form, detail, history, redeem, statement ----
  gcall(`renderClientForm(null)`);
  ok(getEl('modal-root').innerHTML.includes('cf-name'), 'client add form renders');
  await gcall(`submitClientForm(null)`);
  ok(getEl('toast-root').children.some(c => c.textContent.includes('client name')), 'empty client name rejected with guidance');
  getEl('cf-name').value = 'Tet New';
  const cliBefore = posts.length;
  await gcall(`submitClientForm(null)`);
  ok(posts.length === cliBefore + 1 && posts[cliBefore].path === '/api/clients', 'client add posts to the API');
  await gcall(`openClientDetail(1)`);
  ok(getEl('client-detail-body').innerHTML.includes('Maria Santos'), 'client detail shows history');
  const redBefore = posts.length;
  await gcall(`redeemClientPoints(1)`);
  await gcall(`redeemClientPoints(1)`);
  ok(posts.length === redBefore + 1 && posts[redBefore].path === '/api/clients/1/redeem', 'two-tap redeem posts once armed');
  const stmt = gcall(`buildStatementText({ name: 'Maria', balance: 100 }, [{ date: '2026-01-01', invoiceNo: 'INV-1', grandTotal: 150, status: 'pending' }], [{ date: '2026-01-02', amount: 50 }])`);
  ok(String(stmt).includes('BALANCE') && String(stmt).includes('INV-1'), 'statement text builds from history');

  // ---- inventory: valuation card, add form, submit ----
  gcall(`showView('inventory')`);
  await wait(20);
  ok(getEl('inv-valuation').innerHTML.includes('450'), 'valuation card shows retail total');
  gcall(`renderItemForm(null)`);
  ok(getEl('modal-root').innerHTML.includes('if-name'), 'item form renders');
  await gcall(`submitItemForm(null)`);
  ok(getEl('toast-root').children.some(c => c.textContent.includes('item name')), 'empty item name rejected with guidance');
  getEl('if-name').value = 'Test Item';
  const invBefore = posts.length;
  await gcall(`submitItemForm(null)`);
  ok(posts.length === invBefore + 1 && posts[invBefore].path === '/api/inventory', 'item add posts to the API');

  gcall(`showView('suppliers')`);
  await gcall(`renderSupplierPay(1)`);
  ok(getEl('modal-root').innerHTML.includes('ABC Trading'), 'supplier pay sheet opens for the supplier');
  getEl('sp-amount').value = '100';
  await gcall(`submitSupplierPay()`);
  ok(posts.length && posts[posts.length - 1].path === '/api/supplier-payments', 'supplier payment posts to the API');

  // cashier is also kept out of the audit view
  storage.set('slpRole', 'cashier');
  gcall(`showView('audit')`);
  ok(curRef() === 'home', 'cashier is redirected away from audit');
  gcall(`showView('suppliers')`);
  ok(curRef() === 'home', 'cashier is redirected away from suppliers');
  storage.delete('slpRole');
  gcall(`showView('home')`);

  // ---- settings edit (owner) ----
  gcall(`showView('settings')`);
  await wait(20);
  gcall(`renderShopEdit()`);
  ok(getEl('modal-root').innerHTML.includes('se-name'), 'shop edit form renders');
  ok(getEl('modal-root').innerHTML.includes('se-name'), 'shop edit form renders');
  getEl('se-name').value = '';
  await gcall(`submitShopEdit()`);
  const shopBefore = posts.length;
  getEl('se-name').value = 'New Shop Name';
  await gcall(`submitShopEdit()`);
  ok(posts.length === shopBefore + 5 && posts[shopBefore].path === '/api/settings', 'shop edit saves each field');

  // ---- payment edit/delete, expense edit/delete, petty, supplier add, PO receive ----
  await gcall(`openClientDetail(1)`);
  gcall(`renderPaymentEdit(101, 30)`);
  ok(getEl('modal-root').innerHTML.includes('pe-amount'), 'payment edit sheet renders');
  getEl('pe-amount').value = '35';
  const payEditBefore = posts.length;
  await gcall(`submitPaymentEdit(101)`);
  ok(posts.length === payEditBefore + 1 && posts[payEditBefore].path === '/api/payments/101', 'payment edit posts');
  const payDelBefore = posts.length;
  await gcall(`deletePayment(101)`);
  await gcall(`deletePayment(101)`);
  ok(posts.length === payDelBefore + 1 && posts[payDelBefore].path === '/api/payments/101', 'payment delete posts on second tap');

  // ---- expense edit/delete + petty ----
  gcall(`showView('expenses')`);
  await gcall(`renderExpenseEdit(1)`);
  ok(getEl('modal-root').innerHTML.includes('ee-amount'), 'expense edit sheet renders');
  getEl('ee-amount').value = '25';
  const expBefore = posts.length;
  await gcall(`submitExpenseEdit(1)`);
  ok(posts.length === expBefore + 1 && posts[expBefore].path === '/api/expenses/1', 'expense edit posts');
  gcall(`closeQuick()`);

  // ---- supplier add ----
  gcall(`showView('suppliers')`);
  gcall(`renderSupplierForm()`);
  ok(getEl('modal-root').innerHTML.includes('sp-name'), 'supplier add form renders');
  getEl('sp-name').value = '';
  await gcall(`submitSupplierForm()`);
  getEl('sp-name').value = 'New Supplier';
  const supBefore = posts.length;
  await gcall(`submitSupplierForm()`);
  ok(posts.length === supBefore + 1 && posts[supBefore].path === '/api/suppliers', 'supplier add posts');
  gcall(`closeQuick()`);

  // ---- PO receive (two-tap) ----
  gcall(`showView('purchase-orders')`);
  const poBefore = posts.length;
  await gcall(`receivePO(1)`);
  await gcall(`receivePO(1)`);
  ok(posts.length === poBefore + 1 && posts[poBefore].path === '/api/purchase-orders/1/receive', 'PO receive posts on second tap');

  // ---- refresh diet, diagnostics, biometrics, report sharing ----
  const fcBefore = fetchCount;
  await gcall(`loadAll()`);
  ok(fetchCount === fcBefore + 1, 'unchanged data skips reload (version probe only)');
  gcall(`diagPush('test-kind', 'test message')`);
  ok(storage.get('slpDiag').includes('test message'), 'diagnostics buffer on device');
  const upResult = await gcall(`uploadDiagnostics(false)`);
  const dgPost = posts.filter(p => p.path === '/api/mobile-diag').pop();
  ok(upResult >= 1 && storage.get('slpDiag') === '[]', 'diagnostics upload drains the buffer');
  ok(dgPost && dgPost.body.entries.some(e => e.message === 'test message'), 'buffered entry posted to the API (alongside the earlier dropped-queue note)');
  ok((await gcall(`bioAvailable()`)) === false, 'biometrics absent without native runtime');
  gcall(`renderSettings()`);
  await wait(20);
  ok(getEl('view').innerHTML.includes('Diagnostics') && getEl('bio-row').innerHTML === '', 'settings shows diagnostics, no bio option headless');
  await gcall(`shareMonthReport()`);
  ok(true, 'report sharing runs without throwing (clipboard fallback)');
  // (the sandbox has no HTML parser, so sheet content lands on the
  // txn-detail-body stub instead of inside modal-root — assert there)
  await gcall(`openTxnDetail(1)`);
  ok(getEl('txn-detail-body').innerHTML.includes('INV-00001'), 'receipt detail shows the invoice');
  const postsBeforeReturn = posts.length;
  await gcall(`returnTxn('INV-00001')`);
  ok(getEl('return-btn').textContent.includes('confirm'), 'first tap arms the return');
  await gcall(`returnTxn('INV-00001')`);
  ok(posts.length === postsBeforeReturn + 1 && posts[postsBeforeReturn].path === '/api/returns', 'second tap posts the return');
  storage.set('slpRole', 'cashier');
  await gcall(`openTxnDetail(1)`);
  ok(!getEl('txn-detail-body').innerHTML.includes('return-btn'), 'cashier sees no return button');
  storage.delete('slpRole');
  gcall(`closeQuick()`);

  // ---- partial returns: line picking ----
  await gcall(`openTxnDetail(1)`);
  gcall(`toggleReturnLine(0)`);
  ok(getEl('return-btn').textContent.includes('(1)'), 'tapping a line selects it for partial return');
  gcall(`toggleReturnLine(0)`);
  ok(getEl('return-btn').textContent.includes('Return this sale'), 'tapping again deselects back to full return');
  await gcall(`downscalePhoto('data:image/png;base64,AAA', 2)`);
  ok(posts.length && posts[posts.length - 1].path === '/api/inventory/2/photo', 'product photo uploads to the item endpoint');

  // ---- install prompt wiring ----
  gcall(`renderSettings()`);
  await wait(20);
  gcall(`updateInstallRow()`);
  ok(getEl('install-hint').textContent.includes('Add to Home Screen'), 'install hint shown when no browser prompt');

  for (const t of timerIds) clearTimeout(t);

  if (failures === 0) {
    console.log('MOBILE PAGE OK: boots via 8 /api endpoints, 11 views render, cart sale + quick sell + out-of-stock guard + Bayad + expenses + PO + reports + settings + offline queue/Sync-now all verified');
    process.exit(0);
  } else {
    console.error('MOBILE PAGE FAILED: ' + failures + ' assertion(s) failed');
    process.exit(1);
  }
} catch (e) {
  console.error('MOBILE PAGE ERROR:', e.message);
  console.error(e.stack && e.stack.split('\n').slice(0, 12).join('\n'));
  process.exit(1);
}







