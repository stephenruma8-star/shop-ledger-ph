// ---------- phone lock (PIN) ----------
// Optional device-local PIN: gates this phone behind a short code, auto-locks
// after 5 idle minutes. Honest scope: stops casual access (family, customers,
// finders) — NOT vault-grade, since the token lives in this browser's storage.
// Lost phone? Revoke it on the desktop (Sidebar → Mobile Access).
const PIN_AUTOLOCK_MS = 5 * 60 * 1000;
let pinTimer = null;
let pinWatchOn = false;
function pinHashGet() { try { return localStorage.getItem('slpPinHash') || ''; } catch (e) { return ''; } }
function pinSessionOk() { try { return sessionStorage.getItem('slpUnlocked') === '1'; } catch (e) { return false; } }
function pinSessionSet(v) { try { v ? sessionStorage.setItem('slpUnlocked', '1') : sessionStorage.removeItem('slpUnlocked'); } catch (e) {} }
function pinDeviceName() { try { return localStorage.getItem('slpDeviceName') || ''; } catch (e) { return ''; } }
function sha256fallback(bin) {
  // Compact SHA-256 for plain-http LAN where crypto.subtle is unavailable.
  // Input must be a binary string (caller UTF-8 encodes first).
  function rr(v, a) { return (v >>> a) | (v << (32 - a)); }
  const K = [0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
  let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a;
  let h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;
  const ml = bin.length * 8;
  bin += String.fromCharCode(0x80);
  while ((bin.length % 64) !== 56) bin += String.fromCharCode(0);
  const words = [];
  for (let i = 0; i < bin.length; i++) words[i >> 2] |= bin.charCodeAt(i) << ((3 - i % 4) * 8);
  words.push(Math.floor(ml / 0x100000000), ml >>> 0);
  const w = new Array(64);
  for (let j = 0; j < words.length; j += 16) {
    for (let i = 0; i < 16; i++) w[i] = words[j + i] | 0;
    for (let i = 16; i < 64; i++) {
      const s0 = rr(w[i - 15], 7) ^ rr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rr(w[i - 2], 17) ^ rr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
    }
    let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
    for (let i = 0; i < 64; i++) {
      const S1 = rr(e, 6) ^ rr(e, 11) ^ rr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + S1 + ch + K[i] + w[i]) | 0;
      const S0 = rr(a, 2) ^ rr(a, 13) ^ rr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) | 0;
      h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    h0 = (h0 + a) | 0; h1 = (h1 + b) | 0; h2 = (h2 + c) | 0; h3 = (h3 + d) | 0;
    h4 = (h4 + e) | 0; h5 = (h5 + f) | 0; h6 = (h6 + g) | 0; h7 = (h7 + h) | 0;
  }
  return [h0, h1, h2, h3, h4, h5, h6, h7].map(x => (x >>> 0).toString(16).padStart(8, '0')).join('');
}
async function sha256hex(text) {
  try {
    if (window.crypto && crypto.subtle && window.TextEncoder) {
      const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
      return Array.from(new Uint8Array(d)).map(b => b.toString(16).padStart(2, '0')).join('');
    }
  } catch (e) {}
  try { return sha256fallback(unescape(encodeURIComponent(text))); } catch (e) { return ''; }
}
function armAutoLock() {
  try {
    if (pinTimer) { clearTimeout(pinTimer); pinTimer = null; }
    if (!pinHashGet()) return;
    pinTimer = setTimeout(() => { lockPhoneNow(T('pin.autolock')); }, PIN_AUTOLOCK_MS);
  } catch (e) {}
}
function pokeAutoLock() { if (pinHashGet() && pinSessionOk()) armAutoLock(); }
function watchPinActivity() {
  if (pinWatchOn) return; pinWatchOn = true;
  try {
    ['pointerdown', 'keydown', 'touchstart'].forEach(ev => window.addEventListener(ev, pokeAutoLock, { passive: true }));
  } catch (e) {}
}
function lockPhoneNow(msg) {
  pinSessionSet(false);
  try { if (pinTimer) { clearTimeout(pinTimer); pinTimer = null; } } catch (e) {}
  try { if (typeof stopBarcodeScan === 'function') stopBarcodeScan(); } catch (e) {}
  renderPinLock(false, msg || '');
}
function renderPinLock(atBoot, notice) {
  try { const old = document.getElementById('pin-lock'); if (old) old.remove(); } catch (e) {}
  const ls = document.getElementById('loading-screen');
  if (ls) ls.classList.add('hidden');
  const ov = document.createElement('div');
  ov.id = 'pin-lock';
  ov.style.cssText = 'position:fixed;inset:0;z-index:60;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#0f172a,#1e3a5f 55%,#1d4ed8);padding:1rem;';
  ov.innerHTML = `
    <div class="glass-card rounded-2xl p-6 w-full max-w-xs text-center fade-in">
      <div class="text-lg font-bold text-gray-100 mb-1">${T('lock.title')}</div>
      ${notice ? `<p class="text-xs text-amber-400 mb-3">${esc(notice)}</p>` : `<p class="text-xs text-gray-400 mb-3">${T('lock.sub')}</p>`}
      <input id="pin-unlock" inputmode="numeric" autocomplete="off" maxlength="8" placeholder="••••" class="w-40 mx-auto text-center text-2xl font-mono font-bold tracking-[0.3em] px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-gray-100 outline-none focus:border-blue-500 mb-2" />
      <p id="pin-unlock-error" class="hidden text-xs text-red-400 mb-2"></p>
      <button onclick="unlockPhone(${atBoot ? 'true' : 'false'})" class="w-full py-3 rounded-xl bg-blue-600 text-white font-semibold hover:bg-blue-500">${T('lock.unlock')}</button>
      <div id="bio-unlock-slot"></div>
    </div>`;
  document.body.appendChild(ov);
  const inp = document.getElementById('pin-unlock');
  if (inp) {
    try { inp.focus(); } catch (e) {}
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') unlockPhone(atBoot); });
  }
  fillBioUnlock(atBoot);
}
// Fingerprint/face unlock: convenience layer over the PIN (which stays as
// the fallback). Only offered when enabled in Settings and the device
// actually supports it — otherwise this is a silent no-op.
let bioCache = null;
async function bioAvailable() {
  if (bioCache !== null) return bioCache;
  try {
    const B = nativePlugin('NativeBiometric');
    if (B && typeof B.isAvailable === 'function') {
      const r = await B.isAvailable();
      bioCache = !!((r && (r.isAvailable ?? r.available)) ?? false);
      return bioCache;
    }
  } catch (e) {}
  bioCache = false;
  return false;
}
function pinBioEnabled() {
  try { return !!pinHashGet() && localStorage.getItem('slpBio') === '1'; } catch (e) { return false; }
}
async function fillBioUnlock(atBoot) {
  try {
    if (!pinBioEnabled() || !(await bioAvailable())) return;
    const slot = document.getElementById('bio-unlock-slot');
    if (slot) slot.innerHTML = `<button onclick="unlockPhoneBio(${atBoot ? 'true' : 'false'})" class="w-full mt-2 py-2.5 rounded-xl text-sm font-semibold" style="background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.12);color:#e2e8f0">👆 ${T('lock.bio_btn')}</button>`;
  } catch (e) {}
}
async function unlockPhoneBio(atBoot) {
  try {
    const B = nativePlugin('NativeBiometric');
    if (!B || typeof B.verifyIdentity !== 'function') return;
    await B.verifyIdentity({ title: 'Shop Ledger PH' });
    finishPhoneUnlock(atBoot);
  } catch (e) { /* cancelled or failed: stay on the PIN screen */ }
}
function finishPhoneUnlock(atBoot) {
  pinSessionSet(true);
  try { const ov = document.getElementById('pin-lock'); if (ov) ov.remove(); } catch (e) {}
  feelOk();
  toast(T('lock.unlocked'), 'ok');
  watchPinActivity(); armAutoLock();
  if (atBoot) startApp();
}
async function unlockPhone(atBoot) {
  const inp = document.getElementById('pin-unlock');
  const err = document.getElementById('pin-unlock-error');
  const val = ((inp && inp.value) || '').replace(/\D/g, '');
  const h = await sha256hex('slp-pin:' + val);
  if (h && h === pinHashGet()) {
    finishPhoneUnlock(atBoot);
  } else if (err) { err.textContent = T('lock.wrong'); err.classList.remove('hidden'); }
}
function pinMsg(t, isErr) {
  const el = document.getElementById('pin-msg');
  if (el) {
    el.textContent = t;
    el.classList.remove('hidden');
    el.classList.toggle('text-red-400', !!isErr);
    el.classList.toggle('text-green-400', !isErr);
  } else toast(t, isErr ? 'err' : 'ok');
}
async function setupPhonePin() {
  const a = ((document.getElementById('pin-new') || {}).value || '').replace(/\D/g, '');
  const b = ((document.getElementById('pin-confirm') || {}).value || '').replace(/\D/g, '');
  if (a.length < 4) { pinMsg(T('pin.need4'), true); return; }
  if (a !== b) { pinMsg(T('pin.mismatch'), true); return; }
  const h = await sha256hex('slp-pin:' + a);
  if (!h) { pinMsg(T('pin.save_fail'), true); return; }
  try { localStorage.setItem('slpPinHash', h); } catch (e) { pinMsg(T('pin.save_fail'), true); return; }
  pinSessionSet(true); watchPinActivity(); armAutoLock();
  toast(T('pin.on'), 'ok');
  updatePinRow();
}
async function removePhonePin() {
  const cur = ((document.getElementById('pin-current') || {}).value || '').replace(/\D/g, '');
  if ((await sha256hex('slp-pin:' + cur)) !== pinHashGet()) { pinMsg(T('lock.wrong'), true); return; }
  try { localStorage.removeItem('slpPinHash'); } catch (e) {}
  pinSessionSet(false);
  try { if (pinTimer) { clearTimeout(pinTimer); pinTimer = null; } } catch (e) {}
  toast(T('pin.off'), 'ok');
  updatePinRow();
}
function disconnectPhone() {
  try { localStorage.removeItem('slpToken'); localStorage.removeItem('slpDeviceName'); localStorage.removeItem('slpRole'); } catch (e) {}
  pinSessionSet(false);
  try { if (ws) ws.close(); } catch (e) {}
  renderPairScreen(T('pair.disconnected'));
  try { window.scrollTo(0, 0); } catch (e) {}
}
function updatePinRow() {
  const box = document.getElementById('pin-row');
  if (!box) return;  const has = !!pinHashGet();
  const dev = pinDeviceName();
  box.innerHTML = has ? `
      <div class="text-[11px] text-gray-500 mb-2">${esc(T('set.pin_locked_head', { dev: dev ? ' (' + dev + ')' : '' }))}</div>
      <div class="flex gap-2">
        <button onclick="lockPhoneNow()" class="flex-1 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-500">${T('set.pin_locknow')}</button>
        ${(typeof IS_STANDALONE !== 'undefined' && IS_STANDALONE) ? '' : `<button onclick="disconnectPhone()" class="flex-1 py-2.5 rounded-xl bg-white/5 border border-white/10 text-gray-200 text-sm font-semibold">${T('set.pin_disconnect')}</button>`}
      </div>
      <div class="flex gap-2 mt-2">
        <input id="pin-current" inputmode="numeric" maxlength="8" placeholder="${esc(T('set.pin_current_ph'))}" class="flex-1 min-w-0 text-center text-sm px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-gray-100 outline-none focus:border-blue-500" />
        <button onclick="removePhonePin()" class="px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-gray-200 text-sm">${T('set.pin_remove')}</button>
      </div>
      <p id="pin-msg" class="hidden text-[11px] mt-2"></p>`
    : `
      <div class="text-[11px] text-gray-500 mb-2">${esc(T('set.pin_lock_this', { dev: dev ? ' (' + dev + ')' : '' }))}</div>
      <div class="flex gap-2">
        <input id="pin-new" inputmode="numeric" maxlength="8" placeholder="${esc(T('set.pin_new_ph'))}" class="flex-1 min-w-0 text-center text-sm px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-gray-100 outline-none focus:border-blue-500" />
        <input id="pin-confirm" inputmode="numeric" maxlength="8" placeholder="${esc(T('set.pin_confirm_ph'))}" class="flex-1 min-w-0 text-center text-sm px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-gray-100 outline-none focus:border-blue-500" />
      </div>
      <button onclick="setupPhonePin()" class="w-full mt-2 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-500">${T('set.pin_set')}</button>
      <p id="pin-msg" class="hidden text-[11px] mt-2"></p>
      ${(typeof IS_STANDALONE !== 'undefined' && IS_STANDALONE) ? '' : `<button onclick="disconnectPhone()" class="w-full mt-2 py-2 rounded-xl bg-white/5 border border-white/10 text-gray-300 text-xs">${T('set.pin_disconnect_phone')}</button>`}`;
}
async function setPhoneBio(on) {
  if (on) {
    if (!pinHashGet()) { toast(T('bio.need_pin'), 'err'); return; }
    if (!(await bioAvailable())) { toast(T('bio.unavailable'), 'err'); return; }
    try {
      await nativePlugin('NativeBiometric').verifyIdentity({ title: 'Shop Ledger PH' });
    } catch (e) { return; }
    try { localStorage.setItem('slpBio', '1'); } catch (e) {}
    toast(T('bio.on'), 'ok');
  } else {
    try { localStorage.removeItem('slpBio'); } catch (e) {}
    toast(T('bio.off'), 'ok');
  }
  updateBioRow();
}
async function updateBioRow() {
  const box = document.getElementById('bio-row');
  if (!box) return;
  if (!pinHashGet()) { box.innerHTML = ''; return; }
  const enabled = pinBioEnabled();
  let supported = false;
  try { supported = await bioAvailable(); } catch (e) {}
  if (!supported && !enabled) {
    box.innerHTML = `<p class="text-[11px] text-gray-500">${T('bio.unsupported')}</p>`;
    return;
  }
  box.innerHTML = `
    <div class="flex items-center justify-between gap-3 py-1">
      <span class="text-sm text-gray-300">${T('bio.title')}</span>
      <button onclick="setPhoneBio(${enabled ? 'false' : 'true'})" class="px-3 py-1.5 rounded-xl text-xs font-semibold ${enabled ? 'bg-green-600 text-white' : 'bg-white/5 border border-white/10 text-gray-200'}">${enabled ? T('bio.on_label') : T('bio.off_label')}</button>
    </div>`;
}
