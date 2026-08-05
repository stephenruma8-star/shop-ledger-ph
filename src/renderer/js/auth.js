import { dbAdd, dbAll, dbGet, dbPut } from './database.js'
import { closeModal, escapeHtml, hashPassword, modal, requireFields, setFieldError, startClock, toast } from './helpers.js'
import { navigate } from './router.js'
import { now, state, today } from './state.js'

export async function doLogin() {
  const uEl = document.getElementById('login-user');
  const pEl = document.getElementById('login-pass');
  const err = document.getElementById('login-error');
  if (!uEl || !pEl || !err) return;
  const u = uEl.value.trim();
  const p = pEl.value.trim();
  setFieldError(uEl, u ? null : 'Please fill out this field');
  setFieldError(pEl, p ? null : 'Please fill out this field');
  if (!u || !p) { err.classList.add('hidden'); return; }
  const users = await dbAll('users');
  const pHash = await hashPassword(p);
  let user = users.find(x => x.username === u && x.password === pHash);
  if (!user) {
    const legacy = users.find(x => x.username === u && x.password === p);
    if (legacy) { user = legacy; user.password = pHash; await dbPut('users', user); }
    else {
      err.textContent = 'Invalid username or password'; err.classList.remove('hidden'); return;
    }
  }
  err.classList.add('hidden');
  setFieldError(uEl, null);
  setFieldError(pEl, null);
  state.user = user;
  const safe = { ...user, password: undefined };
  sessionStorage.setItem('shopUser', JSON.stringify(safe));
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  document.getElementById('user-info').textContent = `${user.name} (${user.role})`;
  startClock();
  applyPermissions();
  await logAudit('login', `User ${user.username} logged in`);
  navigate(state.currentRoute || 'dashboard');
}

export async function doLogout() {
  if (state.user) await logAudit('logout', `User ${state.user.username} logged out`);
  state.user = null;
  sessionStorage.removeItem('shopUser');
  document.getElementById('login-screen')?.classList.remove('hidden');
  document.getElementById('app')?.classList.add('hidden');
  if (typeof resumeLoginParticles === 'function') resumeLoginParticles();
  const lu = document.getElementById('login-user');
  const lp = document.getElementById('login-pass');
  if (lu) lu.value = '';
  if (lp) lp.value = '';
}

export function applyPermissions() {
  if (!state.user) return;
  const role = state.user.role;
  const restricted = role === 'staff' ? ['settings','reports','suppliers','purchase-orders'] : [];
  document.querySelectorAll('[data-route]').forEach(btn => {
    const r = btn.dataset.route;
    btn.style.display = restricted.includes(r) ? 'none' : '';
  });
}

export async function logAudit(action, details) {
  try {
    await dbAdd('auditLogs', {
      action, details, user: state.user?.username || 'system',
      createdAt: now(), date: today()
    });
  } catch (e) { console.error('Audit log error:', e); }
}

export async function addNotification(msg, type = 'info') {
  await dbAdd('notifications', { message: msg, type, read: false, createdAt: now(), date: today() });
}

export function togglePass() {
  const inp = document.getElementById('login-pass');
  const btn = document.getElementById('passToggle');
  if (inp.type === 'password') {
    inp.type = 'text';
    btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';
  } else {
    inp.type = 'password';
    btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
  }
}

export function changePassword() {
  modal(`
    <div class="p-6">
      <div class="flex justify-between items-center mb-4"><h3 class="text-xl font-bold flex items-center gap-2"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="shrink-0"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>Change Password</h3><button onclick="closeModal()" class="text-gray-400 hover:text-gray-600"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button></div>
      <div class="space-y-3">
        <div><label class="text-xs text-gray-500 block mb-1">Current Password</label><input id="cp-current" type="password" class="w-full px-3 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800" /></div>
        <div><label class="text-xs text-gray-500 block mb-1">New Password</label><input id="cp-new" type="password" class="w-full px-3 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800" /></div>
        <div><label class="text-xs text-gray-500 block mb-1">Confirm New Password</label><input id="cp-confirm" type="password" class="w-full px-3 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800" /></div>
        <p id="cp-error" class="text-red-500 text-sm hidden"></p>
        <div class="flex gap-2 pt-2">
          <button onclick="doChangePassword()" class="flex-1 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="inline-block mr-1 -mt-0.5"><polyline points="20 6 9 17 4 12"/></svg>Change Password</button>
          <button onclick="closeModal()" class="px-4 py-2 bg-gray-200 dark:bg-gray-700 rounded-lg"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="inline-block mr-1 -mt-0.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>Cancel</button>
        </div>
      </div>
    </div>`);
}

export async function doChangePassword() {
  const curEl = document.getElementById('cp-current');
  const newEl = document.getElementById('cp-new');
  const confEl = document.getElementById('cp-confirm');
  const err = document.getElementById('cp-error');
  if (!curEl || !newEl || !confEl || !err) return;
  const current = curEl.value;
  const newPw = newEl.value;
  const confirm = confEl.value;
  if (requireFields([
    { el: curEl, msg: 'Please fill out this field' },
    { el: newEl, test: () => newPw.length >= 4, msg: 'Password must be at least 4 characters' },
    { el: confEl, test: () => confirm === newPw, msg: 'New passwords do not match' }
  ])) return;
  err.classList.add('hidden');
  const pHash = await hashPassword(current);
  if (state.user.password !== pHash) { err.textContent = 'Current password is incorrect'; err.classList.remove('hidden'); return; }
  const user = await dbGet('users', state.user.id);
  if (!user) { err.textContent = 'User not found'; err.classList.remove('hidden'); return; }
  user.password = await hashPassword(newPw);
  await dbPut('users', user);
  state.user.password = user.password;
  const safe = { ...state.user, password: undefined };
  sessionStorage.setItem('shopUser', JSON.stringify(safe));
  closeModal();
  toast('Password changed successfully', 'success');
  await logAudit('user', `User ${user.username} changed their password`);
}

export async function forgotPassword() {
  document.getElementById('login-form').classList.add('hidden');
  const rf = document.getElementById('recovery-form');
  rf.innerHTML = `
    <div class="space-y-3">
      <div class="relative"><span class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg></span>
        <input id="fp-user" type="text" placeholder="Username" class="w-full pl-10 pr-4 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800" onkeydown="if(event.key==='Enter')recoverPassword()" /></div>
      <div id="fp-result" class="hidden"></div>
      <button onclick="recoverPassword()" class="w-full py-2 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="inline-block mr-1 -mt-0.5"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>Recover</button>
      <div class="text-center"><button onclick="cancelRecovery()" class="text-xs text-gray-500 hover:text-gray-700">← Back to Login</button></div>
    </div>`;
  rf.classList.remove('hidden');
}

export function cancelRecovery() {
  document.getElementById('recovery-form')?.classList.add('hidden');
  document.getElementById('login-form')?.classList.remove('hidden');
  const lu = document.getElementById('login-user');
  const lp = document.getElementById('login-pass');
  if (lu) { lu.value = ''; lu.focus(); }
  if (lp) lp.value = '';
}

export async function recoverPassword() {
  const fuEl = document.getElementById('fp-user');
  const result = document.getElementById('fp-result');
  if (!fuEl || !result) return;
  const uname = fuEl.value.trim();
  if (!uname) { setFieldError(fuEl, 'Please fill out this field'); result.classList.add('hidden'); return; }
  setFieldError(fuEl, null);
  const users = await dbAll('users');
  const user = users.find(x => x.username === uname);
  if (!user) { result.className = 'text-red-500 text-sm'; result.textContent = 'User not found'; result.classList.remove('hidden'); return; }

  result.className = 'text-green-600 dark:text-green-400 text-sm p-3 rounded-lg bg-green-50 dark:bg-green-900/20';
  result.innerHTML = `
    <div class="text-center">User <strong>${escapeHtml(user.name || user.username)}</strong> found.</div>
    <div class="mt-3 space-y-2">
      <div><label class="text-xs text-gray-500 block">New Password</label><input id="fp-newpass" type="password" class="w-full px-3 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm" onkeydown="if(event.key==='Enter')document.getElementById('fp-newpass2').focus()" /></div>
      <div><label class="text-xs text-gray-500 block">Confirm Password</label><input id="fp-newpass2" type="password" class="w-full px-3 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm" onkeydown="if(event.key==='Enter')resetPasswordFromRecover(${user.id})" /></div>
      <button onclick="resetPasswordFromRecover(${user.id})" class="w-full py-2 bg-amber-600 text-white rounded-lg font-semibold hover:bg-amber-700 text-sm">Reset Password</button>
    </div>`;
  result.classList.remove('hidden');
}

export async function resetPasswordFromRecover(id) {
  const p1El = document.getElementById('fp-newpass');
  const p2El = document.getElementById('fp-newpass2');
  if (!p1El || !p2El) { toast('Form not ready', 'error'); return; }
  const p1 = p1El.value;
  const p2 = p2El.value;
  if (requireFields([
    { el: p1El, test: () => p1.length >= 4, msg: 'Password must be at least 4 characters' },
    { el: p2El, test: () => p2 === p1, msg: 'Passwords do not match' }
  ])) return;
  const user = await dbGet('users', id);
  if (!user) { toast('User not found', 'error'); return; }
  user.password = await hashPassword(p1);
  await dbPut('users', user);
  toast('Password reset! You can now sign in.', 'success');
  cancelRecovery();
  const le = document.getElementById('login-error');
  if (le) { le.textContent = 'Password reset successfully. Sign in with your new password.'; le.className = 'text-green-500 text-sm text-center'; }
}


// expose top-level bindings as globals (inline onclick handlers and legacy code paths rely on them)
Object.defineProperties(window, {
  doLogin: { get: () => doLogin, configurable: true },
  doLogout: { get: () => doLogout, configurable: true },
  applyPermissions: { get: () => applyPermissions, configurable: true },
  logAudit: { get: () => logAudit, configurable: true },
  addNotification: { get: () => addNotification, configurable: true },
  togglePass: { get: () => togglePass, configurable: true },
  changePassword: { get: () => changePassword, configurable: true },
  doChangePassword: { get: () => doChangePassword, configurable: true },
  forgotPassword: { get: () => forgotPassword, configurable: true },
  cancelRecovery: { get: () => cancelRecovery, configurable: true },
  recoverPassword: { get: () => recoverPassword, configurable: true },
  resetPasswordFromRecover: { get: () => resetPasswordFromRecover, configurable: true }
});
