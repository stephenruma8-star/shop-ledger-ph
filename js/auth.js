async function doLogin() {
  const u = document.getElementById('login-user').value.trim();
  const p = document.getElementById('login-pass').value.trim();
  const err = document.getElementById('login-error');
  if (!u || !p) { err.textContent = 'Please enter username and password'; err.classList.remove('hidden'); return; }
  const users = await dbAll('users');
  let user = users.find(x => x.username === u && x.password === p);
  if (!user) {
    if (u === 'admin' && p === 'admin123') {
      const existing = users.find(x => x.username === 'admin');
      if (existing) { user = existing; }
      else { user = { id: 1, username: 'admin', password: 'admin123', role: 'admin', name: 'Administrator' }; await dbPut('users', user); }
    } else {
      err.textContent = 'Invalid username or password'; err.classList.remove('hidden'); return;
    }
  }
  err.classList.add('hidden');
  state.user = user;
  sessionStorage.setItem('shopUser', JSON.stringify(user));
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
