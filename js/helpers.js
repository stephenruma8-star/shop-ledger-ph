function toast(msg, type = 'info') {
  const colors = { info: 'bg-blue-600', success: 'bg-green-600', error: 'bg-red-600', warning: 'bg-yellow-600' };
  const c = document.getElementById('toasts');
  const el = document.createElement('div');
  el.className = `${colors[type] || colors.info} text-white px-4 py-3 rounded-lg shadow-lg slide-in text-sm max-w-sm`;
  el.textContent = msg;
  c.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; setTimeout(() => el.remove(), 300); }, 3500);
}

function modal(html) {
  const root = document.getElementById('modal-root');
  root.innerHTML = `<div class="fixed inset-0 bg-black/50 z-50 flex items-start justify-center pt-10 overflow-auto fade-in" onclick="if(event.target===this)closeModal()"><div class="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-2xl mx-4 mb-10 slide-in max-h-[85vh] overflow-auto" onclick="event.stopPropagation()">${html}</div></div>`;
}

function closeModal() {
  document.getElementById('modal-root').innerHTML = '';
}

function toggleTheme() {
  document.documentElement.classList.toggle('dark');
  localStorage.setItem('theme', document.documentElement.classList.contains('dark') ? 'dark' : 'light');
}

function showShortcuts() {
  modal(`
    <div class="p-6">
      <div class="flex justify-between items-center mb-4"><h3 class="text-xl font-bold">⌨️ Keyboard Shortcuts</h3><button onclick="closeModal()" class="text-gray-400 hover:text-gray-600 text-2xl">&times;</button></div>
      <div class="grid grid-cols-2 gap-2 text-sm">
        <div class="flex justify-between p-2 bg-gray-50 dark:bg-gray-700 rounded"><span>F1</span><span class="text-gray-500">Dashboard</span></div>
        <div class="flex justify-between p-2 bg-gray-50 dark:bg-gray-700 rounded"><span>F2</span><span class="text-gray-500">New Sale</span></div>
        <div class="flex justify-between p-2 bg-gray-50 dark:bg-gray-700 rounded"><span>F3</span><span class="text-gray-500">Record Payment</span></div>
        <div class="flex justify-between p-2 bg-gray-50 dark:bg-gray-700 rounded"><span>F4</span><span class="text-gray-500">Clients</span></div>
        <div class="flex justify-between p-2 bg-gray-50 dark:bg-gray-700 rounded"><span>F5</span><span class="text-gray-500">Inventory</span></div>
        <div class="flex justify-between p-2 bg-gray-50 dark:bg-gray-700 rounded"><span>Ctrl+D</span><span class="text-gray-500">Dashboard</span></div>
        <div class="flex justify-between p-2 bg-gray-50 dark:bg-gray-700 rounded"><span>Ctrl+T</span><span class="text-gray-500">New Transaction</span></div>
        <div class="flex justify-between p-2 bg-gray-50 dark:bg-gray-700 rounded"><span>Ctrl+U</span><span class="text-gray-500">Utang View</span></div>
        <div class="flex justify-between p-2 bg-gray-50 dark:bg-gray-700 rounded"><span>Ctrl+I</span><span class="text-gray-500">Inventory</span></div>
      </div>
    </div>`);
}

function validateNumber(v) { return !isNaN(parseFloat(v)) && isFinite(v) && parseFloat(v) >= 0; }

function validateRequired(v) { return v !== null && v !== undefined && String(v).trim() !== ''; }

function validatePhone(v) { return /^(\+63|0)?\d{10,11}$/.test(String(v).trim()); }

function searchData(arr, query, fields) {
  if (!query || !query.trim()) return arr;
  const q = query.toLowerCase().trim();
  return arr.filter(item => fields.some(f => String(item[f] || '').toLowerCase().includes(q)));
}
