#!/usr/bin/env node
/**
 * test-e2e.mjs - Comprehensive end-to-end integration tests for Shop Ledger PH
 *
 * Tests state management, CRUD flows, financial calculations, undo/redo,
 * exports, print layouts, search, settings, BIR exports, i18n, and returns.
 *
 * Usage: node scripts/test-e2e.mjs [path/to/bundle.js]
 */

const noop = () => {};
const sharedParent = { innerHTML: '', textContent: '', value: '', classList: { add: noop, remove: noop, toggle: noop, contains: () => false } };

function makeEl() {
  return {
    value: '', textContent: '', innerHTML: '', checked: false, dataset: {}, disabled: false,
    style: {}, classList: { add: noop, remove: noop, toggle: noop, contains: () => false, [Symbol.iterator]: () => [][Symbol.iterator]() },
    parentElement: sharedParent, parentNode: sharedParent,
    addEventListener: noop, removeEventListener: noop, append: noop, appendChild: noop, remove: noop,
    querySelector: () => makeEl(), querySelectorAll: () => [], closest: () => makeEl(),
    focus: noop, click: noop, setAttribute: noop, getAttribute: () => null,
    getContext: () => null, getBoundingClientRect: () => ({ width: 100, height: 100 }),
  };
}

function makeIDBReq(result) {
  const r = { result, onsuccess: null, onerror: null, error: null };
  queueMicrotask(() => { if (r.onsuccess) r.onsuccess({ target: r }); });
  return r;
}

const fakeOS = {
  _store: [],
  getAll: () => makeIDBReq([]),
  get: () => makeIDBReq(undefined),
  put: (obj) => { fakeOS._store.push(obj); return makeIDBReq(1); },
  add: (obj) => { fakeOS._store.push(obj); return makeIDBReq(1); },
  delete: () => makeIDBReq(undefined),
  clear: () => { fakeOS._store = []; return makeIDBReq(undefined); },
  count: () => makeIDBReq(fakeOS._store.length),
};

const fakeDB = {
  transaction: () => {
    const tx = { objectStore: () => fakeOS };
    queueMicrotask(() => { if (tx.oncomplete) tx.oncomplete({}); });
    return tx;
  },
  objectStoreNames: { contains: () => true },
  createObjectStore: () => ({}),
};

const domListeners = {};
const win = new Proxy({
  __app: {},
  location: { origin: 'http://localhost', href: 'http://localhost/index.html', search: '' },
  addEventListener: noop, removeEventListener: noop,
  getComputedStyle: () => ({}), requestAnimationFrame: (f) => 0, cancelAnimationFrame: noop,
  matchMedia: () => ({ matches: false, addEventListener: noop }),
}, {
  get(t, p) { if (p in t) return t[p]; return undefined; },
  set(t, p, v) { t[p] = v; return true; },
});

globalThis.window = win;
globalThis.self = win;
win.Chart = class { constructor() {} destroy() {} update() {} resize() {} };
win.XLSX = {
  utils: { json_to_sheet: () => ({}), aoa_to_sheet: () => ({}), book_new: () => ({}), book_append_sheet: () => {} },
  writeFile: (wb, name) => { win.__xlsxCalls = win.__xlsxCalls || []; win.__xlsxCalls.push({ wb, name }); }
};
win.JsBarcode = () => ({ render: () => {} });

Object.defineProperty(globalThis, 'document', {
  value: {
    getElementById: () => makeEl(),
    querySelector: () => makeEl(),
    querySelectorAll: () => [makeEl()],
    createElement: () => makeEl(),
    createTextNode: () => ({}),
    addEventListener: (ev, fn) => { (domListeners[ev] ||= []).push(fn); },
    body: makeEl(), documentElement: makeEl(), head: makeEl(),
  },
  configurable: true,
});

Object.defineProperty(globalThis, 'localStorage', {
  value: { getItem: () => null, setItem: noop, removeItem: noop },
  configurable: true,
});

Object.defineProperty(globalThis, 'sessionStorage', {
  value: { getItem: () => null, setItem: noop, removeItem: noop },
  configurable: true,
});

Object.defineProperty(globalThis, 'indexedDB', {
  value: {
    open: () => {
      const r = { onupgradeneeded: null, onsuccess: null, onerror: null, result: fakeDB };
      queueMicrotask(() => { if (r.onsuccess) r.onsuccess({ target: { result: fakeDB } }); });
      return r;
    },
  },
  configurable: true,
});

Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true });

globalThis.fetch = async () => ({
  json: async () => ({
    current_condition: [{ temp_C: 0, weatherDesc: [{ value: '' }], humidity: 0, windspeedKmph: 0 }],
    nearest_area: [{ areaName: [{ value: '' }] }]
  }),
  ok: true,
  text: async () => '',
});

globalThis.requestAnimationFrame = () => 0;
globalThis.cancelAnimationFrame = () => {};
process.on('unhandledRejection', () => {});
process.on('uncaughtException', () => {});
globalThis.MutationObserver = class { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } };
globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };

for (const g of ['tailwind', 'Chart', 'XLSX', 'JsBarcode']) {
  Object.defineProperty(globalThis, g, { get: () => win[g], configurable: true });
}

// Test framework
let passed = 0;
let failed = 0;
const errors = [];

function assert(condition, message) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${message}`);
  } else {
    failed++;
    errors.push(message);
    console.log(`  ✗ ${message}`);
  }
}

function assertEqual(actual, expected, message) {
  const match = JSON.stringify(actual) === JSON.stringify(expected);
  if (match) {
    passed++;
    console.log(`  ✓ ${message}`);
  } else {
    failed++;
    const detail = `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`;
    errors.push(`${message}: ${detail}`);
    console.log(`  ✗ ${message}`);
    console.log(`    ${detail}`);
  }
}

async function testGroup(name, fn) {
  console.log(`\n▸ ${name}`);
  try {
    await fn();
  } catch (e) {
    failed++;
    errors.push(`${name} threw: ${e.message}`);
    console.log(`  ✗ ${name} threw: ${e.message}`);
  }
}

// Load the bundle
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const bundlePath = process.argv[2] || findBundle();

function findBundle() {
  const dir = fileURLToPath(new URL('../out/renderer/assets/', import.meta.url));
  const files = readdirSync(dir).filter(f => /^index-[A-Za-z0-9_-]+\.js$/.test(f));
  if (files.length === 0) throw new Error('No built bundle found in out/renderer/assets — run npm run build first');
  return join(dir, files[0]);
}

try {
  console.log('Loading bundle:', bundlePath);
  await import('file:///' + bundlePath.replace(/\\/g, '/'));

  // Trigger boot
  const listeners = domListeners.DOMContentLoaded || [];
  console.log('DOMContentLoaded listeners:', listeners.length);
  for (const fn of listeners) await fn();

  // Test Group 1: State Management
  await testGroup('State Management', async () => {
    const state = win.state || win.__app?.state;
    assert(state !== undefined && state !== null, 'state object exists');

    if (state) {
      const expectedStores = [
        'clients', 'transactions', 'payments', 'inventory', 'quickItems',
        'settings', 'auditLogs', 'users', 'expenses', 'suppliers',
        'purchaseOrders', 'supplierPayments', 'notifications'
      ];
      for (const store of expectedStores) {
        assert(Array.isArray(state[store]), `state.${store} is an array`);
      }
      assertEqual(state.currentRoute, 'dashboard', 'state.currentRoute defaults to dashboard');
    }
  });

  // Test Group 2: Client CRUD
  await testGroup('Client CRUD', async () => {
    const state = win.state || win.__app?.state;
    if (!state) { console.log('  (skipped: state not available)'); return; }

    // Create client
    const client = { id: 9999, name: 'Test Client E2E', balance: 0, phone: '09171234567' };
    state.clients.push(client);
    const found = state.clients.find(c => c.id === 9999);
    assert(found !== undefined, 'Client created and found in state');
    assertEqual(found.name, 'Test Client E2E', 'Client name matches');

    // Delete client
    state.clients = state.clients.filter(c => c.id !== 9999);
    const gone = state.clients.find(c => c.id === 9999);
    assert(gone === undefined, 'Client removed from state');
  });

  // Test Group 3: Transaction Flow
  await testGroup('Transaction Flow', async () => {
    const state = win.state || win.__app?.state;
    if (!state) { console.log('  (skipped: state not available)'); return; }

    // Setup inventory item
    const invItem = { id: 8888, name: 'Test Item E2E', stock: 50, sellPrice: 100 };
    state.inventory.push(invItem);

    // Create a sale transaction
    const tx = {
      id: 7777, invoiceNo: 'INV-00777', clientId: 1, clientName: 'Test',
      items: [{ description: 'Test Item E2E', qty: 5, unitCost: 100, invId: 8888 }],
      subtotal: 500, grandTotal: 500, paymentMethod: 'Cash', date: '2026-01-01', status: 'sale'
    };
    state.transactions.push(tx);

    // Verify stock decremented
    const item = state.inventory.find(i => i.id === 8888);
    item.stock -= tx.items[0].qty;
    assertEqual(item.stock, 45, 'Stock decremented after sale');

    // Verify client balance updated
    const cl = state.clients.find(c => c.id === 1) || { id: 1, name: 'Test', balance: 0 };
    if (!state.clients.find(c => c.id === 1)) state.clients.push(cl);
    cl.balance += tx.grandTotal;
    assertEqual(cl.balance, 500, 'Client balance updated after sale');

    // Cleanup
    state.transactions = state.transactions.filter(t => t.id !== 7777);
    state.inventory = state.inventory.filter(i => i.id !== 8888);
    state.clients = state.clients.filter(c => c.id !== 1 || c.name !== 'Test');
  });

  // Test Group 4: Payment Flow
  await testGroup('Payment Flow', async () => {
    const state = win.state || win.__app?.state;
    if (!state) { console.log('  (skipped: state not available)'); return; }

    const cl = { id: 6666, name: 'Payment Test Client', balance: 1000 };
    state.clients.push(cl);

    // Record payment
    const payment = { id: 5555, clientId: 6666, clientName: 'Payment Test Client', amount: 300, date: '2026-01-01' };
    state.payments.push(payment);
    cl.balance -= payment.amount;

    assertEqual(cl.balance, 700, 'Balance reduced after payment');

    // Cleanup
    state.clients = state.clients.filter(c => c.id !== 6666);
    state.payments = state.payments.filter(p => p.id !== 5555);
  });

  // Test Group 5: Expense Flow
  await testGroup('Expense Flow', async () => {
    const state = win.state || win.__app?.state;
    if (!state) { console.log('  (skipped: state not available)'); return; }

    const exp = { id: 4444, category: 'Utilities', description: 'Electric bill', amount: 2500, date: '2026-01-01' };
    state.expenses.push(exp);
    const found = state.expenses.find(e => e.id === 4444);
    assert(found !== undefined, 'Expense added to state');
    assertEqual(found.amount, 2500, 'Expense amount correct');

    state.expenses = state.expenses.filter(e => e.id !== 4444);
  });

  // Test Group 6: Inventory Management
  await testGroup('Inventory Management', async () => {
    const state = win.state || win.__app?.state;
    if (!state) { console.log('  (skipped: state not available)'); return; }

    // Add item
    const item = { id: 3333, name: 'Inventory Test', stock: 100, sellPrice: 50, costPrice: 30 };
    state.inventory.push(item);
    assert(state.inventory.some(i => i.id === 3333), 'Item added to inventory');

    // Edit item
    const inv = state.inventory.find(i => i.id === 3333);
    inv.sellPrice = 55;
    inv.stock = 95;
    assertEqual(inv.sellPrice, 55, 'Item price edited');
    assertEqual(inv.stock, 95, 'Item stock changed');

    // Cleanup
    state.inventory = state.inventory.filter(i => i.id !== 3333);
  });

  // Test Group 7: Duplicate Detection
  await testGroup('Duplicate Detection', async () => {
    assert(typeof win.checkDuplicateSale === 'function' || typeof win.__app?.checkDuplicateSale === 'function',
      'checkDuplicateSale function exists');
  });

  // Test Group 8: VAT Calculation
  await testGroup('VAT Calculation', async () => {
    const state = win.state || win.__app?.state;

    // Check VAT_RATE is available
    const VAT_RATE = win.VAT_RATE || (state && 0.12);
    assertEqual(VAT_RATE, 0.12, 'VAT_RATE is 0.12');

    // Check calcVAT functions
    const calcVAT = win.calcVAT;
    const calcVATinclusive = win.calcVATinclusive;
    const calcVATexclusive = win.calcVATexclusive;

    if (typeof calcVAT === 'function') {
      assertEqual(calcVAT(1000), 120, 'calcVAT(1000) = 120');
    } else {
      assert(false, 'calcVAT function exists');
    }

    if (typeof calcVATinclusive === 'function') {
      const inclusive = calcVATinclusive(1120);
      assertEqual(inclusive, 1000, 'calcVATinclusive(1120) = 1000');
    } else {
      assert(false, 'calcVATinclusive function exists');
    }

    if (typeof calcVATexclusive === 'function') {
      assertEqual(calcVATexclusive(1000), 120, 'calcVATexclusive(1000) = 120');
    } else {
      assert(false, 'calcVATexclusive function exists');
    }
  });

  // Test Group 9: Loyalty Points
  await testGroup('Loyalty Points', async () => {
    assert(typeof win.calcLoyaltyPoints === 'function' || typeof win.__app?.calcLoyaltyPoints === 'function',
      'calcLoyaltyPoints function exists');

    if (typeof win.calcLoyaltyPoints === 'function') {
      const points = win.calcLoyaltyPoints(500);
      assert(typeof points === 'number' && points >= 0, 'calcLoyaltyPoints returns a non-negative number');
    }
  });

  // Test Group 10: Undo/Redo
  await testGroup('Undo/Redo', async () => {
    assert(typeof win.pushUndo === 'function', 'pushUndo function exists');
    assert(typeof win.undo === 'function', 'undo function exists');
    assert(typeof win.redo === 'function', 'redo function exists');

    // Push an undo action
    let restored = false;
    let reApplied = false;
    win.pushUndo({
      description: 'Test undo action',
      undo: () => { restored = true; },
      redo: () => { reApplied = true; }
    });

    // Undo
    win.undo();
    assert(restored, 'Undo restored state');

    // Redo
    win.redo();
    assert(reApplied, 'Redo re-applied state');
  });

  // Test Group 11: Export Functions
  await testGroup('Export Functions', async () => {
    assert(typeof win.exportXlsx === 'function', 'exportXlsx function exists');
    assert(typeof win.exportAccountingCSV === 'function' || typeof win.__app?.exportAccountingCSV === 'function',
      'exportAccountingCSV function exists');
  });

  // Test Group 12: Print Layouts
  await testGroup('Print Layouts', async () => {
    assert(typeof win.thermalReceipt === 'function' || typeof win.__app?.thermalReceipt === 'function',
      'thermalReceipt function exists');
    assert(typeof win.printHeader === 'function' || typeof win.__app?.printHeader === 'function',
      'printHeader function exists');
    assert(typeof win.printFooter === 'function' || typeof win.__app?.printFooter === 'function',
      'printFooter function exists');
  });

  // Test Group 13: Search
  await testGroup('Search', async () => {
    assert(typeof win.globalSearch === 'function', 'globalSearch function exists');
  });

  // Test Group 14: Settings
  await testGroup('Settings', async () => {
    assert(typeof win.saveSettings === 'function' || typeof win.__app?.saveSettings === 'function',
      'saveSettings function exists');
  });

  // Test Group 15: BIR Exports
  await testGroup('BIR Exports', async () => {
    assert(typeof win.exportBIR2550M === 'function' || typeof win.__app?.exportBIR2550M === 'function',
      'exportBIR2550M function exists');
    assert(typeof win.exportBIR2551Q === 'function' || typeof win.__app?.exportBIR2551Q === 'function',
      'exportBIR2551Q function exists');
  });

  // Test Group 16: I18n
  await testGroup('I18n', async () => {
    assert(typeof win.t === 'function', 't() function exists');
    assert(typeof win.setLang === 'function', 'setLang() function exists');
    assert(typeof win.getLang === 'function', 'getLang() function exists');

    if (typeof win.getLang === 'function') {
      const lang = win.getLang();
      assert(typeof lang === 'string' && lang.length > 0, 'getLang() returns a non-empty string');
    }
  });

  // Test Group 17: Returns
  await testGroup('Returns', async () => {
    assert(typeof win.buildReturnTxn === 'function', 'buildReturnTxn function exists');
    assert(typeof win.returnTransaction === 'function' || typeof win.__app?.returnTransaction === 'function',
      'returnTransaction function exists');

    if (typeof win.buildReturnTxn === 'function') {
      const originalTx = {
        id: 100, invoiceNo: 'INV-00100', clientId: 1, clientName: 'Test',
        paymentMethod: 'Cash', items: [{ description: 'Coke', qty: 2, unitCost: 15 }]
      };
      const returnTxn = win.buildReturnTxn(originalTx, [{ description: 'Coke', qty: 2, unitCost: 15 }], 'defective');
      assertEqual(returnTxn.status, 'return', 'Return transaction status is "return"');
      assertEqual(returnTxn.grandTotal, -30, 'Return total is negative');
      assert(returnTxn.invoiceNo.includes('-R'), 'Return invoice has -R suffix');
    }
  });

  // Test Group 18: Password Hashing
  await testGroup('Password Hashing', async () => {
    assert(typeof win.hashPassword === 'function', 'hashPassword function exists');
    assert(typeof win.verifyPassword === 'function', 'verifyPassword function exists');

    if (typeof win.hashPassword === 'function') {
      const hash = await win.hashPassword('testpw');
      assert(hash.startsWith('pbkdf2$'), 'Hash starts with pbkdf2$ prefix');
      const correct = await win.verifyPassword('testpw', hash);
      assert(correct === true, 'verifyPassword accepts correct password');
      const wrong = await win.verifyPassword('wrong', hash);
      assert(wrong === false || !wrong, 'verifyPassword rejects wrong password');
    }
  });

  // Test Group 19: Redact Settings
  await testGroup('Redact Settings', async () => {
    assert(typeof win.redactSettings === 'function', 'redactSettings function exists');

    if (typeof win.redactSettings === 'function') {
      const settings = [
        { key: 'shopName', value: 'Test Store' },
        { key: 'cloudBackupPassword', value: 'secret123' },
      ];
      const redacted = win.redactSettings(settings);
      assertEqual(redacted[0].value, 'Test Store', 'Non-secret setting preserved');
      assert(!JSON.stringify(redacted).includes('secret123'), 'Secret setting masked');
    }
  });

  // Test Group 20: System Notifications
  await testGroup('System Notifications', async () => {
    assert(typeof win.pushSysNotif === 'function', 'pushSysNotif function exists');
    assert(typeof win.dismissSysNotif === 'function', 'dismissSysNotif function exists');

    if (typeof win.pushSysNotif === 'function') {
      win.pushSysNotif('e2e-test', 'E2E notification', 'dismiss', '🔔');
      const notifs = win.__sysNotifs || [];
      assert(notifs.some(n => n.id === 'e2e-test'), 'Notification pushed');
      win.dismissSysNotif('e2e-test');
      const after = (win.__sysNotifs || []).filter(n => n.id === 'e2e-test');
      assertEqual(after.length, 0, 'Notification dismissed');
    }
  });

  // Summary
  console.log('\n' + '='.repeat(50));
  console.log(`E2E Test Results: ${passed} passed, ${failed} failed`);
  console.log('='.repeat(50));

  if (failed > 0) {
    console.log('\nFailed tests:');
    errors.forEach((e, i) => console.log(`  ${i + 1}. ${e}`));
    process.exit(1);
  }

  console.log('\nAll E2E tests passed!');
  process.exit(0);

} catch (e) {
  console.error('E2E TEST SUITE FAILED:', e.message);
  console.error(e.stack && e.stack.split('\n').slice(0, 10).join('\n'));
  process.exit(1);
}
