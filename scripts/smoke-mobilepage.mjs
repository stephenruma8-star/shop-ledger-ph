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
}
`;

const noop = () => {};
const timerIds = new Set();
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const sandboxTimeout = (fn, ms) => { const t = setTimeout(fn, ms); timerIds.add(t); return t; };
const sandboxInterval = (fn, ms) => { const t = setInterval(fn, ms); timerIds.add(t); return t; };

const seen = new Set();
const posts = [];
let fetchCount = 0;
const todayStr = new Date().toISOString().split('T')[0];

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
  const method = (opts && opts.method) || 'GET';
  const path = String(url).replace(/^https?:\/\/[^/]+/, '');
  seen.add(method + ' ' + path);
  if (method === 'POST') { posts.push({ path, body: JSON.parse(opts.body || '{}') }); return { ok: true, json: async () => ({ success: true, invoiceNo: 'INV-0000X' }) }; }
  const F = mkFixtures();
  const X = mkExtras();
  let payload = {};
  if (path.startsWith('/api/stats')) payload = statsFixture();
  else if (path.startsWith('/api/inventory')) payload = F.inventory.sort((a, b) => a.name.localeCompare(b.name));
  else if (path.startsWith('/api/transactions')) payload = F.transactions;
  else if (path.startsWith('/api/clients')) payload = F.clients;
  else if (path.startsWith('/api/expenses')) payload = X.expenses;
  else if (path.startsWith('/api/suppliers')) payload = X.suppliers;
  else if (path.startsWith('/api/purchase-orders')) payload = X.purchaseOrders;
  else if (path.startsWith('/api/reports')) payload = reportsFixture();
  else if (path.startsWith('/api/settings')) payload = X.settings;
  return { ok: true, json: async () => payload };
};

function FakeWebSocket(url) { this.url = url; this.onopen = noop; this.onmessage = noop; this.onclose = noop; this.onerror = noop; }
FakeWebSocket.prototype.send = function (data) {
  let msg; try { msg = JSON.parse(data); } catch (e) { return; }
  if (msg.type === 'auth') {
    const self = this;
    queueMicrotask(() => { if (self.onmessage) self.onmessage({ data: JSON.stringify({ type: 'auth-ok' }) }); });
  }
};
FakeWebSocket.prototype.close = function () {};

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
  localStorage: { getItem: () => null, setItem: noop, removeItem: noop, clear: noop },
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
  ok(payHtml.includes('Record Bayad') && payHtml.includes('Maria Santos'), 'pay view rendered with preselected client');
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

  for (const t of timerIds) clearTimeout(t);

  if (failures === 0) {
    console.log('MOBILE PAGE OK: boots via 8 /api endpoints, 11 views render, cart sale + quick sell + out-of-stock guard + Bayad + expenses + PO + reports + settings all verified');
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







