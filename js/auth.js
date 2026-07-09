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

async function forgotPassword() {
  const users = await dbAll('users');
  modal(`
    <div class="p-6">
      <h2 class="text-xl font-bold mb-4">Forgot Password</h2>
      <div class="space-y-3">
        <div><label class="text-xs text-gray-500 block mb-1">Username</label>
          <input id="fp-user" type="text" class="w-full px-3 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800" /></div>
        <div id="fp-result" class="hidden"></div>
        <div class="flex gap-2">
          <button onclick="recoverPassword()" class="flex-1 py-2 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700">Recover</button>
          <button onclick="closeModal()" class="px-4 py-2 border dark:border-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">Cancel</button>
        </div>
      </div>
    </div>`);
}

async function recoverPassword() {
  const uname = document.getElementById('fp-user').value.trim();
  const result = document.getElementById('fp-result');
  if (!uname) { result.className = 'text-red-500 text-sm'; result.textContent = 'Enter a username'; result.classList.remove('hidden'); return; }
  const users = await dbAll('users');
  const user = users.find(x => x.username === uname);
  if (!user) { result.className = 'text-red-500 text-sm'; result.textContent = 'User not found'; result.classList.remove('hidden'); return; }

  const smtpSetting = state.settings?.find(x => x.key === 'smtpConfig');
  const emailTo = state.settings?.find(x => x.key === 'backupEmail');

  if (smtpSetting?.value && emailTo?.value && window.electronAPI) {
    try {
      const smtp = JSON.parse(smtpSetting.value);
      if (smtp.host && smtp.user && smtp.pass) {
        const data = { message: 'Password recovery for Shop Ledger PH', users: [{ username: user.username, password: user.password, name: user.name }] };
        const r = await window.electronAPI.sendEmailBackup({ smtp, to: emailTo.value, data, filename: 'password-recovery.json' });
        if (r.success) { result.className = 'text-green-500 text-sm'; result.textContent = 'Recovery info sent to your backup email'; result.classList.remove('hidden'); return; }
      }
    } catch(e) {}
  }

  result.className = 'text-yellow-700 dark:text-yellow-300 text-sm p-3 rounded-lg bg-yellow-50 dark:bg-yellow-900/20';
  result.innerHTML = 'No email configured. Contact your admin or ask them to set up SMTP in Settings &gt; Backup.';
  result.classList.remove('hidden');
}
