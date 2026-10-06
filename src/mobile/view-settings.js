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
      ${phoneRole() === 'cashier' ? '' : `<button onclick="renderShopEdit()" class="btn btn-ghost btn-sm w-full mt-3"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="shrink-0"><path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z"/></svg>${T('set.edit_shop')}</button>`}
    </section>
    <section class="glass-card rounded-2xl p-4 mb-3 fade-in">
      <h3 class="card-title mb-1 flex items-center gap-2"><span class="icon-tile bg-blue-500/15 text-blue-400"><svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg></span>${T('set.install_title')}</h3>
      <p id="install-hint" class="text-[11px] text-gray-500 mb-2">${T('set.install_hint')}</p>
      <button id="install-app-btn" onclick="installApp()" class="hidden w-full py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-500 items-center justify-center gap-2"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="shrink-0"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>${T('set.install_btn')}</button>
    </section>
    <section class="glass-card rounded-2xl p-4 mb-3 fade-in">
      <h3 class="card-title mb-1 flex items-center gap-2"><span class="icon-tile bg-amber-500/15 text-amber-400"><svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg></span>${T('set.pin_title')}</h3>
      <p class="text-[11px] text-gray-500 mb-2">${T('set.pin_desc')}</p>
      <div id="pin-row"></div>
      <div id="bio-row"></div>
    </section>
    <section class="glass-card rounded-2xl p-4 mb-3 fade-in">
      <h3 class="card-title mb-1 flex items-center gap-2"><span class="icon-tile bg-indigo-500/15 text-indigo-400"><svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.2" y1="4.2" x2="5.6" y2="5.6"/><line x1="18.4" y1="18.4" x2="19.8" y2="19.8"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.2" y1="19.8" x2="5.6" y2="18.4"/><line x1="18.4" y1="5.6" x2="19.8" y2="4.2"/></svg></span>${T('set.display_title')}</h3>
      <p class="text-[11px] text-gray-500 mb-2">${T('set.display_desc')}</p>
      <div id="display-row"></div>
    </section>
    <div class="grid grid-cols-2 gap-2 mb-3 fade-in">
      ${phoneRole() === 'cashier' ? '' : `<button onclick="showView('audit')" class="btn btn-ghost"><svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="shrink-0"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>${T('set.audit_btn')}</button>`}
      <button onclick="showView('help')" class="btn btn-ghost"><svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="shrink-0"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>${T('set.help_btn')}</button>
    </div>
    <section class="glass-card rounded-2xl p-4 mb-3 fade-in">
      <h3 class="card-title mb-1 flex items-center gap-2"><span class="icon-tile bg-green-500/15 text-green-400"><svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg></span>${T('set.updates_title')}</h3>
      <div id="update-row"></div>
    </section>
    <section class="glass-card rounded-2xl p-4 mb-3 fade-in">
      <h3 class="card-title mb-1 flex items-center gap-2"><span class="icon-tile bg-purple-500/15 text-purple-400"><svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg></span>${T('diag.title')}</h3>
      <div id="diag-row"></div>
    </section>
    ${(typeof IS_STANDALONE !== 'undefined' && IS_STANDALONE) ? `<section class="glass-card rounded-2xl p-4 mb-3 fade-in">
      <h3 class="card-title mb-1 flex items-center gap-2"><span class="icon-tile bg-cyan-500/15 text-cyan-400"><svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg></span>Backup</h3>
      <div id="backup-row"></div>
    </section>` : ''}
    <p class="text-center text-[11px] text-gray-500 fade-in">${T('set.store_note')}</p>`;
  updateInstallRow();
  updatePinRow();
  updateDisplayRow();
  updateUpdateRow();
  updateBioRow();
  updateDiagRow();
  if (typeof updateBackupRow === 'function') updateBackupRow();
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
          ${(typeof IS_STANDALONE !== 'undefined' && IS_STANDALONE) ? `
          <div>
            <label class="text-[11px] font-semibold uppercase tracking-wider text-gray-500 block mb-1.5">Printer IP (Wi-Fi receipt printer)</label>
            <input id="se-thermal" type="text" maxlength="40" placeholder="192.168.1.50" value="${esc(s.thermalHost || '')}" class="inp" />
          </div>` : ''}
          <button onclick="submitShopEdit()" class="btn btn-primary btn-lg"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" class="shrink-0"><polyline points="20 6 9 17 4 12"/></svg>${T('set.save_shop')}</button>
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
  if (typeof IS_STANDALONE !== 'undefined' && IS_STANDALONE) {
    const th = document.getElementById('se-thermal');
    if (th) vals.thermalHost = (th.value || '').trim().slice(0, 40);
  }
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

