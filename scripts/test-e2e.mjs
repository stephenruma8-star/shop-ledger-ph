#!/usr/bin/env node
/**
 * test-e2e.mjs - End-to-end integration tests for Shop Ledger PH
 * 
 * Tests complete user flows by importing the built bundle with DOM stubs.
 * Similar to smoke.mjs but focuses on functional correctness of user workflows.
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

  // Test Group 1: Login Flow
  await testGroup('Login Flow', async () => {
    // Verify user state management
    const hasSetUser = typeof win.setUser === 'function' || typeof win.__app?.setUser === 'function';
    assert(typeof win.navigate === 'function', 'navigate function exists');

    // Try setting a test user
    if (typeof win.setUser === 'function') {
      const testUser = { id: 1, username: 'admin', role: 'admin' };
      win.setUser(testUser);
      assert(true, 'setUser called successfully');
    } else if (typeof win.__app?.setUser === 'function') {
      const testUser = { id: 1, username: 'admin', role: 'admin' };
      win.__app.setUser(testUser);
      assert(true, 'setUser called via __app');
    } else {
      console.log('  (skipped: setUser not exposed on window)');
    }
  });

  // Test Group 2: Inventory Management
  await testGroup('Inventory Management', async () => {
    assert(typeof win.addInventoryItem === 'function' || typeof win.__app?.addInventoryItem === 'function',
      'addInventoryItem function exists');

    // Check if we can access the inventory list
    const routes = ['inventory'];
    for (const r of routes) {
      await Promise.race([
        win.navigate(r),
        new Promise(res => setTimeout(res, 5000)).then(() => { throw new Error('TIMEOUT navigating route: ' + r); })
      ]);
      assert(true, `Navigate to ${r} route succeeded`);
    }
  });

  // Test Group 3: Transaction Flow
  await testGroup('Transaction Flow', async () => {
    assert(typeof win.buildReturnTxn === 'function', 'buildReturnTxn function exists');

    // Test building a return transaction
    const originalTx = {
      id: 100,
      invoiceNo: 'INV-00100',
      clientId: 1,
      clientName: 'Juan dela Cruz',
      paymentMethod: 'Cash',
    };

    const items = [
      { description: 'Coca-Cola 350ml', name: 'Coke', qty: 2, unitCost: 12 },
      { description: 'Pancit Canton', name: 'Lucky Me', qty: 1, unitCost: 8 },
    ];

    const returnTxn = win.buildReturnTxn(originalTx, items, 'defective');

    assertEqual(returnTxn.status, 'return', 'Return transaction has status "return"');
    assertEqual(returnTxn.refId, 100, 'Return transaction references original ID');
    assert(returnTxn.invoiceNo.includes('-R'), 'Return invoice has -R suffix');
    assertEqual(returnTxn.grandTotal, -32, 'Return total is negative sum of items');
    assertEqual(returnTxn.reason, 'defective', 'Return reason is preserved');
  });

  // Test Group 4: Settings & Redaction
  await testGroup('Settings & Redaction', async () => {
    assert(typeof win.redactSettings === 'function', 'redactSettings function exists');

    const settings = [
      { key: 'shopName', value: 'Test Store' },
      { key: 'cloudBackupPassword', value: 'secretpassword123' },
      { key: 'smtpConfig', value: JSON.stringify({ host: 'smtp.test.com', user: 'test@test.com', pass: 'emailpass' }) },
    ];

    const redacted = win.redactSettings(settings);
    const redactedStr = JSON.stringify(redacted);

    // Non-secret settings should remain unchanged
    assertEqual(redacted[0].value, 'Test Store', 'Non-secret setting preserved');

    // Secrets should be masked
    assert(!redactedStr.includes('secretpassword123'), 'cloudBackupPassword is masked');
    assert(!redactedStr.includes('emailpass'), 'SMTP password is masked');

    // SMTP config pass should be replaced with ***
    const smtpConfig = JSON.parse(redacted[2].value);
    assertEqual(smtpConfig.pass, '********', 'SMTP pass masked with asterisks');
  });

  // Test Group 5: Password Hashing
  await testGroup('Password Hashing', async () => {
    assert(typeof win.hashPassword === 'function', 'hashPassword function exists');
    assert(typeof win.verifyPassword === 'function', 'verifyPassword function exists');

    // Test password hashing
    const hash1 = await win.hashPassword('testpassword');
    assert(hash1.startsWith('pbkdf2$'), 'Hash starts with pbkdf2$ prefix');

    // Different calls should produce different hashes (salt)
    const hash2 = await win.hashPassword('testpassword');
    assert(hash1 !== hash2, 'Different hashes for same password (random salt)');

    // Verify correct password
    const correct = await win.verifyPassword('testpassword', hash1);
    assert(correct === true, 'verifyPassword accepts correct password');

    // Verify wrong password
    const wrong = await win.verifyPassword('wrongpassword', hash1);
    assert(wrong === false || !wrong, 'verifyPassword rejects wrong password');

    // Test legacy SHA-256 migration
    const { createHash } = await import('node:crypto');
    const legacyHash = createHash('sha256').update('legacy').digest('hex');
    const legacyOk = await win.verifyPassword('legacy', legacyHash);
    assert(legacyOk === true, 'verifyPassword accepts legacy SHA-256 hash');

    // Test plaintext migration
    const plainOk = await win.verifyPassword('plaintext', 'plaintext');
    assert(plainOk === true, 'verifyPassword accepts legacy plaintext password');
  });

  // Test Group 6: XLSX Export
  await testGroup('XLSX Export', async () => {
    assert(typeof win.exportXlsx === 'function', 'exportXlsx function exists');

    await win.exportXlsx();
    const xlsxCalls = win.__xlsxCalls || [];
    assertEqual(xlsxCalls.length, 1, 'exportXlsx writes exactly one file');
    assert(xlsxCalls[0].name.endsWith('.xlsx'), 'Output file has .xlsx extension');
  });

  // Test Group 7: System Notifications
  await testGroup('System Notifications', async () => {
    assert(typeof win.pushSysNotif === 'function', 'pushSysNotif function exists');
    assert(typeof win.dismissSysNotif === 'function', 'dismissSysNotif function exists');

    // Push notification
    win.pushSysNotif('test', 'Test message', 'action', '🔔');
    const notifs1 = win.__sysNotifs || [];
    assert(notifs1.length >= 1, 'Notification pushed');

    // Dedup by id
    win.pushSysNotif('test', 'Duplicate message', 'action', '🔔');
    const testNotifs = notifs1.filter(n => n.id === 'test');
    assertEqual(testNotifs.length, 1, 'Duplicate notifications deduped by id');

    // Dismiss
    win.dismissSysNotif('test');
    const notifsAfter = (win.__sysNotifs || []).filter(n => n.id === 'test');
    assertEqual(notifsAfter.length, 0, 'Notification dismissed successfully');
  });

  // Test Group 8: Route Navigation
  await testGroup('Route Navigation', async () => {
    const routes = [
      'dashboard', 'clients', 'utang', 'transactions', 'catalog',
      'inventory', 'stocktake', 'expenses', 'suppliers', 'payments',
      'purchase-orders', 'reports', 'settings'
    ];

    for (const route of routes) {
      await Promise.race([
        win.navigate(route),
        new Promise(res => setTimeout(res, 5000)).then(() => {
          throw new Error(`TIMEOUT navigating to ${route}`);
        })
      ]);
      assert(true, `Route "${route}" navigated successfully`);
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
