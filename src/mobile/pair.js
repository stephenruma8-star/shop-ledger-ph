// ---------- pairing (connect without QR) ----------
function renderPairScreen(notice) {
  const ls = document.getElementById('loading-screen');
  if (ls) ls.classList.add('hidden');
  const v = document.getElementById('view');
  const claim = getClaim();
  v.innerHTML = `
    <div class="glass-card rounded-2xl p-6 mt-10 text-center fade-in">
      <div class="w-14 h-14 mx-auto rounded-2xl flex items-center justify-center text-white shadow-lg mb-3" style="background:linear-gradient(135deg,#2563eb,#1d4ed8)"><svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg></div>
      <h2 class="text-lg font-bold text-gray-100 mb-1">${T('pair.title')}</h2>
      <p class="text-xs text-gray-400 mb-4">${T('pair.instr')}</p>
      ${notice ? `<p class="text-xs text-amber-400 mb-3">${esc(notice)}</p>` : ''}
      <input id="pair-name" maxlength="24" placeholder="${esc(T('pair.name_ph'))}" class="w-56 mx-auto text-center text-sm px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-gray-100 outline-none focus:border-blue-500 mb-2" />
      ${claim
        ? `<p class="text-[11px] text-gray-500 mb-2">${T('pair.claim_note')}</p>`
        : `<input id="pair-code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="••••••" class="w-44 mx-auto text-center text-2xl font-mono font-bold tracking-[0.3em] px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-gray-100 outline-none focus:border-blue-500 mb-2" />`}
      <p id="pair-error" class="hidden text-xs text-red-400 mb-2"></p>
      <button onclick="submitPairCode()" class="w-full py-3 rounded-xl bg-blue-600 text-white font-semibold hover:bg-blue-500">${T('pair.connect')}</button>
      <p class="text-[11px] text-gray-500 mt-3">${esc(T('pair.foot', { host: window.location.host }))}</p>
    </div>`;
}
async function submitPairCode() {
  const err = document.getElementById('pair-error');
  const fail = (m) => { if (err) { err.textContent = m; err.classList.remove('hidden'); } };
  const nameEl = document.getElementById('pair-name');
  const name = ((nameEl && nameEl.value) || '').trim().slice(0, 24) || 'Phone';
  const claim = getClaim();
  let path, body;
  if (claim) {
    path = '/api/claim';
    body = { claim, name };
  } else {
    const inp = document.getElementById('pair-code');
    const code = ((inp && inp.value) || '').replace(/\D/g, '');
    if (code.length !== 6) { fail(T('pair.code_guide')); return; }
    path = '/api/pair';
    body = { code, name };
  }
  if (!takeSubmitLock('pair')) return;
  try {
    const r = await fetch(API + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.success || !j.token) throw new Error((j && j.error) || T('pair.rejected'));
    try {
      localStorage.setItem('slpToken', j.token);
      if (j.name) localStorage.setItem('slpDeviceName', j.name);
      if (j.role) localStorage.setItem('slpRole', j.role);
    } catch (e) {}
    // Burned claims must not linger in the URL: the stored token rules from here on.
    try {
      if (claim && window.history && history.replaceState) {
        const clean = window.location.search.replace(/claim=[^&]*&?/, '').replace(/[?&]$/, '');
        history.replaceState(null, '', window.location.pathname + clean + window.location.hash);
      }
    } catch (e) {}
    toast(T('pair.connected') + (j.name ? T('pair.connected_as', { name: j.name }) : ''), 'ok');
    feelOk();
    if (location.reload) location.reload();
  } catch (e) { fail(e.message || T('pair.failed')); }
  finally { releaseSubmitLock('pair'); }
}

