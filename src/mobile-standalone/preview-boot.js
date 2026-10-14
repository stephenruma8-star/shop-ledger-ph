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
      { description: 'Coffee Sachet', qty: 5, unitCost: 12, intRate: 10, invId: ids['Coffee Sachet'] }
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
  if (/[?&]noanim=1/.test(window.location.search)) {
    try {
      const st = document.createElement('style');
      st.textContent = '*,*::before,*::after{animation:none!important;transition:none!important}';
      document.head.appendChild(st);
    } catch (e) {}
  }
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
  if (/[?&]cartdemo=1/.test(window.location.search)) {
    const r1 = (data.inventory || []).find(i => i.name === 'Rice 1kg');
    const r2 = (data.inventory || []).find(i => i.name === 'Coffee Sachet');
    if (r1) cart.push({ invId: r1.id, name: r1.name, qty: 2, price: r1.price || 0, intRate: 10 });
    if (r2) cart.push({ invId: r2.id, name: r2.name, qty: 3, price: r2.price || 0, intRate: 0 });
    updateCartUI();
    showView('sale');
  }
  document.title = 'preview:' + ((m && m[1]) || 'home');
  // Dev-only deep link for screenshots: #/call/fnName/arg
  const mc = (window.location.hash || '').match(/^#\/call\/([A-Za-z_$][\w$]*)(?:\/(.*))?$/);
  if (mc && typeof window[mc[1]] === 'function') {
    try {
      const r = window[mc[1]](mc[2] === undefined ? undefined : decodeURIComponent(mc[2]));
      if (r && typeof r.then === 'function') await r.catch(() => {});
  if (/[?&](dbgmodal|cartdemo)=1/.test(window.location.search)) {
    const de = document.documentElement;
    let widest = '';
    try {
      document.querySelectorAll('#view *').forEach(el => {
        try {
          const r = el.getBoundingClientRect();
          if (r.right > window.innerWidth + 1 && r.width > 50) widest += (el.id || el.className.toString().slice(0, 40)) + '@' + Math.round(r.right) + ' ';
        } catch (e) {}
      });
    } catch (e) {}
        const has = (document.getElementById('modal-root') || {}).childElementCount;
        document.title += ' callok=' + mc[1] + ' kids=' + has;
      }
    } catch (e) {
      if (/[?&]dbgmodal=1/.test(window.location.search)) document.title += ' callerr=' + String((e && e.message) || e).slice(0, 120);
    }
  }
  if (/[?&](dbgmodal|cartdemo)=1/.test(window.location.search)) {
    const m = document.querySelector('#modal-root > div');
    const r = m ? m.getBoundingClientRect().toJSON() : null;
    const cs = m ? getComputedStyle(m) : null;
    const x = document.querySelector('#modal-root button[aria-label="Close"]');
    const xr = x ? x.getBoundingClientRect().toJSON() : null;
    const xcs = x ? getComputedStyle(x) : null;
    const de = document.documentElement;
    let widest = '';
    try {
      document.querySelectorAll('#view *').forEach(el => {
        try {
          const b = el.getBoundingClientRect();
          if (b.right > window.innerWidth + 1 && b.width > 50) {
            widest += (el.id || String(el.className || '').slice(0, 30)).replace(/\s+/g, '.') + '@' + Math.round(b.right) + ' ';
            el.style.outline = '3px solid red';
          }
          const p = el.parentElement;
          if (p && el.tagName !== 'BODY' && el.tagName !== 'HTML') {
            const pb = p.getBoundingClientRect();
            if (b.width > pb.width + 2 && b.width > 80) {
              widest += 'KID>' + (p.id || String(p.className || '').slice(0, 24)).replace(/\s+/g, '.') + ':' + (el.tagName || '') + '.' + String(el.className || '').slice(0, 24).replace(/\s+/g, '.') + '@' + Math.round(b.width) + 'v' + Math.round(pb.width) + ' ';
              el.style.outline = '3px solid yellow';
            }
          }
        } catch (e) {}
      });
    } catch (e) {}
    document.title += ' modal=' + JSON.stringify(r) + ' display=' + (cs && cs.display) + ' xbtn=' + JSON.stringify(xr) + ' xvis=' + (xcs && xcs.visibility) + ' xop=' + (xcs && xcs.opacity) + ' docW=' + de.scrollWidth + ' winW=' + window.innerWidth + ' wide=[' + widest.slice(0, 220) + ']';
  }
})();
