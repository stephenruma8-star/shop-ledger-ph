// ---------- PAY ----------
async function renderPay(preselectedId) {
  const v = document.getElementById('view');
  v.innerHTML = skeleton(T('common.loading'));
  if (!data.clients.length) await loadClients();
  v.innerHTML = `
    <div class="max-w-md mx-auto glass-card rounded-2xl p-4 fade-in">
      <div class="space-y-3.5">
        <div>
          <label class="text-[11px] font-semibold uppercase tracking-wider text-gray-500 block mb-1.5">${T('sale.client')}</label>
          <select id="pay-client" class="inp">${data.clients.map(c => '<option value="' + c.id + '"' + (c.id === preselectedId ? ' selected' : '') + '>' + esc(c.name) + ' — ' + peso(c.balance) + '</option>').join('')}</select>
        </div>
        <div>
          <label class="text-[11px] font-semibold uppercase tracking-wider text-gray-500 block mb-1.5">${T('pay.amount')}</label>
          <input id="pay-amount" type="number" step="0.01" placeholder="0.00" inputmode="decimal" class="inp text-2xl font-bold text-center num" style="height:3.5rem" />
        </div>
        <div class="grid grid-cols-4 gap-2">
          <button onclick="setAmt(100)" class="btn btn-ghost btn-sm">+₱100</button>
          <button onclick="setAmt(500)" class="btn btn-ghost btn-sm">+₱500</button>
          <button onclick="setAmt(1000)" class="btn btn-ghost btn-sm">+₱1000</button>
          <button onclick="setAmt('full')" class="btn btn-sm" style="background:rgba(59,130,246,.18);color:#60a5fa;border:1px solid rgba(59,130,246,.35)">${T('pay.full')}</button>
        </div>
        <div>
          <label class="text-[11px] font-semibold uppercase tracking-wider text-gray-500 block mb-1.5">${T('pay.method')}</label>
          <select id="pay-type" class="inp"><option>Cash</option><option>GCash</option><option>Maya</option><option>Bank Transfer</option></select>
        </div>
        <div>
          <label class="text-[11px] font-semibold uppercase tracking-wider text-gray-500 block mb-1.5">Reference # (GCash/Maya/Bank, optional)</label>
          <input id="pay-ref" type="text" maxlength="40" placeholder="e.g. 1234 567 890" autocomplete="off" class="inp" />
        </div>
        <button onclick="submitPay()" class="btn btn-success btn-lg"><svg xmlns="http://www.w3.org/2000/svg" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="shrink-0"><polyline points="20 6 9 17 4 12"/></svg>${T('pay.record')}</button>
      </div>
    </div>`;
}
function setAmt(val) {
  const input = document.getElementById('pay-amount');
  if (!input) return;
  if (val === 'full') { const id = parseInt(document.getElementById('pay-client').value); const c = data.clients.find(x => x.id === id); input.value = c ? (c.balance || 0).toFixed(2) : ''; }
  else input.value = ((parseFloat(input.value) || 0) + val).toFixed(2);
}
async function submitPay() {
  const clientId = parseInt(document.getElementById('pay-client').value);
  const amount = parseFloat(document.getElementById('pay-amount').value);
  const type = document.getElementById('pay-type').value;
  const referenceNo = ((document.getElementById('pay-ref') || {}).value || '').trim().slice(0, 40);
  if (!clientId || !amount) return toast(T('pay.fill'), 'err');
  if (!takeSubmitLock('pay')) return;
  try {
    const r = await apiPost('/api/payments', { clientId, amount, type, referenceNo, date: new Date().toISOString().split('T')[0] });
    if (r.queued) toast(T('pay.queued'), 'ok');
    else toast(T('pay.ok'), 'ok');
    showView('home'); await refreshAll();
  } catch (e) { toast(T('pay.failed', { msg: e.message }), 'err'); }
  finally { releaseSubmitLock('pay'); }
}


