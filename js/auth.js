async function doLogin() {
  const u = document.getElementById('login-user').value.trim();
  const p = document.getElementById('login-pass').value.trim();
  const err = document.getElementById('login-error');
  if (!u || !p) { err.textContent = 'Please enter username and password'; err.classList.remove('hidden'); return; }
  const users = await dbAll('users');
  const pHash = await hashPassword(p);
  let user = users.find(x => x.username === u && x.password === pHash);
  if (!user) {
    const legacy = users.find(x => x.username === u && x.password === p);
    if (legacy) { user = legacy; user.password = pHash; await dbPut('users', user); }
    else {
      if (u === 'admin' && p === 'admin123') {
        const existing = users.find(x => x.username === 'admin');
        if (existing) { user = existing; user.password = pHash; await dbPut('users', user); }
        else { user = { id: 1, username: 'admin', password: pHash, role: 'admin', name: 'Administrator' }; await dbPut('users', user); }
      } else {
        err.textContent = 'Invalid username or password'; err.classList.remove('hidden'); return;
      }
    }
  }
  err.classList.add('hidden');
  state.user = user;
  const safe = { ...user, password: undefined };
  sessionStorage.setItem('shopUser', JSON.stringify(safe));
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  document.getElementById('user-info').textContent = `${user.name} (${user.role})`;
  applyPermissions();
  await logAudit('login', `User ${user.username} logged in`);
  navigate(state.currentRoute || 'dashboard');
}

function doLogout() {
  if (state.user) logAudit('logout', `User ${state.user.username} logged out`);
  state.user = null;
  sessionStorage.removeItem('shopUser');
  document.getElementById('login-screen').classList.remove('hidden');
  document.getElementById('app').classList.add('hidden');
  document.getElementById('login-user').value = '';
  document.getElementById('login-pass').value = '';
}

function applyPermissions() {
  if (!state.user) return;
  const role = state.user.role;
  const restricted = role === 'staff' ? ['settings','reports','suppliers','purchase-orders'] : [];
  document.querySelectorAll('[data-route]').forEach(btn => {
    const r = btn.dataset.route;
    btn.style.display = restricted.includes(r) ? 'none' : '';
  });
}

async function logAudit(action, details) {
  try {
    await dbAdd('auditLogs', {
      action, details, user: state.user?.username || 'system',
      createdAt: now(), date: today()
    });
  } catch (e) { console.error('Audit log error:', e); }
}

async function addNotification(msg, type = 'info') {
  await dbAdd('notifications', { message: msg, type, read: false, createdAt: now(), date: today() });
}

function togglePass() {
  const inp = document.getElementById('login-pass');
  const btn = document.getElementById('passToggle');
  if (inp.type === 'password') { inp.type = 'text'; btn.textContent = '🙈'; }
  else { inp.type = 'password'; btn.textContent = '👁️'; }
}

function changePassword() {
  modal(`
    <div class="p-6">
      <div class="flex justify-between items-center mb-4"><h3 class="text-xl font-bold">🔑 Change Password</h3><button onclick="closeModal()" class="text-gray-400 text-2xl">&times;</button></div>
      <div class="space-y-3">
        <div><label class="text-xs text-gray-500 block mb-1">Current Password</label><input id="cp-current" type="password" class="w-full px-3 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800" /></div>
        <div><label class="text-xs text-gray-500 block mb-1">New Password</label><input id="cp-new" type="password" class="w-full px-3 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800" /></div>
        <div><label class="text-xs text-gray-500 block mb-1">Confirm New Password</label><input id="cp-confirm" type="password" class="w-full px-3 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800" /></div>
        <p id="cp-error" class="text-red-500 text-sm hidden"></p>
        <div class="flex gap-2 pt-2">
          <button onclick="doChangePassword()" class="flex-1 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">Change Password</button>
          <button onclick="closeModal()" class="px-4 py-2 bg-gray-200 dark:bg-gray-700 rounded-lg">Cancel</button>
        </div>
      </div>
    </div>`);
}

async function doChangePassword() {
  const current = document.getElementById('cp-current').value;
  const newPw = document.getElementById('cp-new').value;
  const confirm = document.getElementById('cp-confirm').value;
  const err = document.getElementById('cp-error');
  if (!current || !newPw || !confirm) { err.textContent = 'All fields required'; err.classList.remove('hidden'); return; }
  if (newPw !== confirm) { err.textContent = 'New passwords do not match'; err.classList.remove('hidden'); return; }
  if (newPw.length < 4) { err.textContent = 'Password must be at least 4 characters'; err.classList.remove('hidden'); return; }
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

async function forgotPassword() {
  document.getElementById('login-form').classList.add('hidden');
  const rf = document.getElementById('recovery-form');
  rf.innerHTML = `
    <div class="space-y-3">
      <div><label class="text-xs text-gray-500 block mb-1">Username</label>
        <input id="fp-user" type="text" class="w-full px-3 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800" onkeydown="if(event.key==='Enter')recoverPassword()" /></div>
      <div id="fp-result" class="hidden"></div>
      <button onclick="recoverPassword()" class="w-full py-2 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700">Recover</button>
      <div class="text-center"><button onclick="cancelRecovery()" class="text-xs text-gray-500 hover:text-gray-700">← Back to Login</button></div>
    </div>`;
  rf.classList.remove('hidden');
}

function cancelRecovery() {
  document.getElementById('recovery-form').classList.add('hidden');
  document.getElementById('login-form').classList.remove('hidden');
  document.getElementById('login-user').value = '';
  document.getElementById('login-pass').value = '';
  document.getElementById('login-user').focus();
}

async function recoverPassword() {
  const uname = document.getElementById('fp-user').value.trim();
  const result = document.getElementById('fp-result');
  if (!uname) { result.className = 'text-red-500 text-sm'; result.textContent = 'Enter a username'; result.classList.remove('hidden'); return; }
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

async function resetPasswordFromRecover(id) {
  const p1 = document.getElementById('fp-newpass').value;
  const p2 = document.getElementById('fp-newpass2').value;
  if (!p1 || p1.length < 4) { toast('Password must be at least 4 characters', 'error'); return; }
  if (p1 !== p2) { toast('Passwords do not match', 'error'); return; }
  const user = await dbGet('users', id);
  if (!user) { toast('User not found', 'error'); return; }
  user.password = await hashPassword(p1);
  await dbPut('users', user);
  toast('Password reset! You can now sign in.', 'success');
  cancelRecovery();
  document.getElementById('login-error').textContent = 'Password reset successfully. Sign in with your new password.';
  document.getElementById('login-error').className = 'text-green-500 text-sm text-center';
}
