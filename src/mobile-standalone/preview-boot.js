// ---------- PREVIEW BOOT (browser demo only, never shipped) ----------
// Seeds a demo shop into the in-memory engine and opens the requested view
// (#/sale etc). Replaces standalone-app.js in the preview bundle.
async function seedDemoShop() {
  await localApi('POST', '/api/settings', { key: 'shopName', value: 'Demo Sari-Sari' }, 'PUT');
  await localApi('POST', '/api/settings', { key: 'thermalHost', value: '192.168.1.50' }, 'PUT');
  const c1 = await localApi('POST', '/api/clients', { name: 'Maria Clara', phone: '09171234567', address: 'Kanto St', dueDate: '2026-10-20' });
  const c2 = await localApi('POST', '/api/clients', { name: 'Jose Rizal', phone: '09181234567' });
  await localApi('POST', '/api/clients', { name: 'Andres Bonifacio' });
  const items = [
    { name: 'Rice 1kg', sellPrice: 52, costPrice: 44, stock: 48, sku: 'R1', barcode: '480001', variants: [{ name: '1kg', stock: 30 }, { name: '5kg', stock: 18 }] },
    { name: 'Cooking Oil 500ml', sellPrice: 68, costPrice: 55, stock: 24 },
    { name: 'Instant Noodles', sellPrice: 22, costPrice: 16, stock: 120, expiryDate: '2026-10-25' },
    { name: 'Coffee Sachet', sellPrice: 12, costPrice: 8, stock: 200 },
    { name: 'Canned Sardines', sellPrice: 28, costPrice: 21, stock: 0 },
    { name: 'Eggs (tray)', sellPrice: 190, costPrice: 165, stock: 12, expiryDate: '2026-10-12' },
    { name: 'Soft Drink 1.5L', sellPrice: 95, costPrice: 78, stock: 36 },
    { name: 'Detergent Bar', sellPrice: 35, costPrice: 27, stock: 3 }
  ];
  const ids = {};
  for (const it of items) {
    const r = await localApi('POST', '/api/inventory', it);
    ids[it.name] = r.id;
  }
  await localApi('POST', '/api/quick-items', { name: 'Rice 1kg', price: 52, invId: ids['Rice 1kg'] });
  await localApi('POST', '/api/quick-items', { name: 'Coffee Sachet', price: 12, invId: ids['Coffee Sachet'] });
  const s1 = await localApi('POST', '/api/sales', {
    clientId: c1.id,
    items: [
      { description: 'Rice 1kg', qty: 2, unitCost: 52, invId: ids['Rice 1kg'] },
      { description: 'Coffee Sachet', qty: 5, unitCost: 12, invId: ids['Coffee Sachet'] }
    ],
    paymentMethod: 'GCash', discount: 0
  });
  await localApi('POST', '/api/sales', {
    items: [{ description: 'Soft Drink 1.5L', qty: 2, unitCost: 95, invId: ids['Soft Drink 1.5L'] }],
    paymentMethod: 'Cash', discount: 5
  });
  await localApi('POST', '/api/payments', { clientId: c1.id, amount: 100, type: 'Partial', referenceNo: 'GCash 123456' });
  await localApi('POST', '/api/expenses', { description: 'Store rent', amount: 3000, category: 'Rent', payee: 'Landlord' });
  await localApi('POST', '/api/expenses', { description: 'Ice delivery', amount: 150, category: 'Supplies' });
  const sup = await localApi('POST', '/api/suppliers', { name: 'Acme Goods', contact: '0919' });
  await localApi('POST', '/api/purchase-orders', { supplierId: sup.id, items: [{ invId: ids['Coffee Sachet'], name: 'Coffee Sachet', price: 8, qty: 100 }] });
  return s1;
}
(async () => {
  try { localStorage.clear(); } catch (e) {}
  applyDisplayPrefs();
  applyStaticLang();
  setupPullRefresh();
  setupDiagHook();
  try {
    await initStore(await makeCapacitorDriver());
    await seedDemoShop();
  } catch (e) {
    document.body.insertAdjacentHTML('beforeend', '<pre style="color:red">' + String((e && e.message) || e) + '</pre>');
    return;
  }
  await loadAll();
  applyRoleGating();
  applyBrand();
  const ls = document.getElementById('loading-screen');
  if (ls) ls.classList.add('hidden');
  if (/[?&]audit=1/.test(window.location.search) && typeof runStandaloneAudit === 'function') {
    await runStandaloneAudit();
    return;
  }
  const m = (window.location.hash || '').match(/^#\/([a-z-]+)/);
  showView((m && m[1]) || 'home');
  document.title = 'preview:' + ((m && m[1]) || 'home');
})();
