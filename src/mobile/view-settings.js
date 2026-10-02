// ---------- SETTINGS ----------
async function renderSettings() {
  const v = document.getElementById('view');
  if (!data.settings || !Object.keys(data.settings).length) { v.innerHTML = skeleton(T('common.loading')); await loadAll(); }
  const s = data.settings || {};
  v.innerHTML = `
    <h2 class="card-title text-base mb-3 fade-in"><span class="icon-tile bg-gray-500/15 text-gray-300"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg></span>${T('view.settings.title')}</h2>
    <section class="glass-card rounded-2xl p-4 mb-3 fade-in">
      <div class="flex items-center gap-3">
        <div class="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 text-white shadow-lg" style="background:linear-gradient(135deg,#2563eb,#1d4ed8)"><svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg></div>
        <div class="min-w-0">
          <div class="font-bold text-gray-100 truncate">${esc(s.shopName || T('set.default_shop'))}</div>
          <div class="text-[11px] text-gray-500 truncate">${esc(s.shopAddress || T('set.default_addr'))}</div>
        </div>
      </div>
      <div class="grid grid-cols-1 gap-2 mt-3 text-sm">
        <div class="row py-1.5"><span class="text-gray-500 w-20 shrink-0">${T('set.shop_contact')}</span><span class="text-gray-200 truncate">${esc(s.shopContact || '—')}</span></div>
        <div class="row py-1.5"><span class="text-gray-500 w-20 shrink-0">${T('set.shop_currency')}</span><span class="text-gray-200">${esc(s.currency || '₱')} ${T('set.currency_ph')}</span></div>
      </div>
      ${phoneRole() === 'cashier' ? '' : `<button onclick="renderShopEdit()" class="btn btn-ghost btn-sm w-full mt-3">${T('set.edit_shop')}</button>`}
    </section>
    <section class="glass-card rounded-2xl p-4 mb-3 fade-in">
      <h3 class="card-title mb-1">${T('set.install_title')}</h3>
      <p id="install-hint" class="text-[11px] text-gray-500 mb-2">${T('set.install_hint')}</p>
      <button id="install-app-btn" onclick="installApp()" class="hidden w-full py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-500">${T('set.install_btn')}</button>
    </section>
    <section class="glass-card rounded-2xl p-4 mb-3 fade-in">
      <h3 class="card-title mb-1">${T('set.pin_title')}</h3>
      <p class="text-[11px] text-gray-500 mb-2">${T('set.pin_desc')}</p>
      <div id="pin-row"></div>
      <div id="bio-row"></div>
    </section>
    <section class="glass-card rounded-2xl p-4 mb-3 fade-in">
      <h3 class="card-title mb-1">${T('set.display_title')}</h3>
      <p class="text-[11px] text-gray-500 mb-2">${T('set.display_desc')}</p>
      <div id="display-row"></div>
    </section>
    <div class="grid grid-cols-2 gap-2 mb-3 fade-in">
      ${phoneRole() === 'cashier' ? '' : `<button onclick="showView('audit')" class="btn btn-ghost">${T('set.audit_btn')}</button>`}
      <button onclick="showView('help')" class="btn btn-ghost">${T('set.help_btn')}</button>
    </div>
    <section class="glass-card rounded-2xl p-4 mb-3 fade-in">
      <h3 class="card-title mb-1">${T('set.updates_title')}</h3>
      <div id="update-row"></div>
    </section>
    <section class="glass-card rounded-2xl p-4 mb-3 fade-in">
      <h3 class="card-title mb-1">${T('diag.title')}</h3>
      <div id="diag-row"></div>
    </section>
    <p class="text-center text-[11px] text-gray-500 fade-in">${T('set.store_note')}</p>`;
  updateInstallRow();
  updatePinRow();
  updateDisplayRow();
  updateUpdateRow();
  updateBioRow();
  updateDiagRow();
}
function renderShopEdit() {
  const s = data.settings || {};
  document.getElementById('modal-root').innerHTML = `
    <div class="fixed inset-0 bg-black/70 z-[45] flex items-end sm:items-center justify-center fade-in" onclick="if(event.target===this)closeQuick()">
      <div class="w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-4 pb-6 slide-up glass-card" style="max-height:92dvh;overflow-y:auto" onclick="event.stopPropagation()">
        <div class="grabber mb-3" style="margin-bottom:.9rem"></div>
        <h3 class="font-bold text-gray-100 text-sm mb-3">${T('set.edit_shop')}</h3>
        <div class="space-y-3">
          <div>
            <label class="text-[11px] font-semibold uppercase tracking-wider text-gray-500 block mb-1.5">${T('set.shop_name')}</label>
            <input id="se-name" type="text" maxlength="80" value="${esc(s.shopName || '')}" class="inp" />
          </div>
          <div>
            <label class="text-[11px] font-semibold uppercase tracking-wider text-gray-500 block mb-1.5">${T('set.shop_address')}</label>
            <input id="se-address" type="text" maxlength="200" value="${esc(s.shopAddress || '')}" class="inp" />
          </div>
          <div>
            <label class="text-[11px] font-semibold uppercase tracking-wider text-gray-500 block mb-1.5">${T('set.shop_contact')}</label>
            <input id="se-contact" type="text" maxlength="40" value="${esc(s.shopContact || '')}" class="inp" />
          </div>
          <div>
            <label class="text-[11px] font-semibold uppercase tracking-wider text-gray-500 block mb-1.5">${T('set.shop_receipt_footer')}</label>
            <input id="se-footer" type="text" maxlength="200" value="${esc(s.receiptFooter || '')}" class="inp" />
          </div>
          <button onclick="submitShopEdit()" class="btn btn-primary btn-lg">${T('set.save_shop')}</button>
        </div>
      </div>
    </div>`;
}
async function submitShopEdit() {
  const vals = {
    shopName: ((document.getElementById('se-name') || {}).value || '').trim(),
    shopAddress: ((document.getElementById('se-address') || {}).value || '').trim(),
    shopContact: ((document.getElementById('se-contact') || {}).value || '').trim(),
    receiptFooter: ((document.getElementById('se-footer') || {}).value || '').trim()
  };
  if (!vals.shopName) { toast(T('set.need_name'), 'err'); return; }
  if (!takeSubmitLock('shopedit')) return;
  try {
    for (const k of Object.keys(vals)) {
      await apiPost('/api/settings', { key: k, value: vals[k] }, 'PUT');
    }
    closeQuick();
    toast(T('set.shop_saved'), 'ok');
    await refreshAll();
  } catch (e) { toast(T('set.save_failed', { msg: e.message }), 'err'); }
  finally { releaseSubmitLock('shopedit'); }
}

