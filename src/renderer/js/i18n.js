const translations = {
  en: {
    dashboard: 'Dashboard', clients: 'Clients', debts: 'Debts', sales: 'Sales',
    catalog: 'Catalog', inventory: 'Inventory', stocktake: 'Stock Take',
    expenses: 'Expenses', suppliers: 'Suppliers', payments: 'Payments',
    'purchase-orders': 'Purchase Orders', reports: 'Reports', settings: 'Settings',
    search: 'Search everything...', 'sign-in': 'Sign In', username: 'Username',
    password: 'Password', total: 'Total', subtotal: 'Subtotal',
    discount: 'Discount', quantity: 'Quantity', price: 'Price',
    save: 'Save', cancel: 'Cancel', delete: 'Delete', edit: 'Edit',
    add: 'Add', confirm: 'Confirm', export: 'Export', import: 'Import',
    today: 'Today', month: 'Month', year: 'Year', all: 'All',
    'no-data': 'No data available', loading: 'Loading...',
    'low-stock': 'Low Stock', outOfStock: 'Out of Stock',
    'confirm-delete': 'Are you sure you want to delete this?',
    undo: 'Undo', redo: 'Redo',
    theme: 'Theme', backups: 'Backups', 'quick-items': 'Quick Items',
    'sync-cloud': 'Sync Cloud Backups', 'mobile-access': 'Mobile Access',
    shortcuts: 'Shortcuts', help: 'Help', 'change-password': 'Change Password',
    logout: 'Logout', 'signin-sub': 'Sign in to your store',
    'forgot-password': 'Forgot Password?', 'toggle-theme': 'Toggle Theme',
  },
  fil: {
    dashboard: 'Dashboard', clients: 'Mga Kliyente', debts: 'Mga Utang',
    sales: 'Mga Benta', catalog: 'Katalogo', inventory: 'Imbentaryo',
    stocktake: 'Stock Take', expenses: 'Mga Gastos', suppliers: 'Mga Supplier',
    payments: 'Mga Bayad', 'purchase-orders': 'Mga PO', reports: 'Mga Ulat',
    settings: 'Mga Setting', search: 'Maghanap ng lahat...', 'sign-in': 'Mag-sign In',
    username: 'Username', password: 'Password', total: 'Kabuuan',
    subtotal: 'Subtotal', discount: 'Diskwento', quantity: 'Dami',
    price: 'Presyo', save: 'I-save', cancel: 'Kanselahin',
    delete: 'Tanggalin', edit: 'I-edit', add: 'Magdagdag',
    confirm: 'Kumpirmahin', export: 'I-export', import: 'I-import',
    today: 'Ngayon', month: 'Buwan', year: 'Taon', all: 'Lahat',
    'no-data': 'Walang data', loading: 'Naglo-load...',
    'low-stock': 'Mababa ang Stock', outOfStock: 'Ubos na',
    'confirm-delete': 'Sigurado ka bang gusto mong tanggalin ito?',
    undo: 'I-undo', redo: 'I-redo',
    theme: 'Tema', backups: 'Mga Backup', 'quick-items': 'Quick Items',
    'sync-cloud': 'I-sync ang Backup', 'mobile-access': 'Mobile Access',
    shortcuts: 'Mga Shortcut', help: 'Tulong', 'change-password': 'Palitan ang Password',
    logout: 'Mag-logout', 'signin-sub': 'Mag-sign in sa iyong tindahan',
    'forgot-password': 'Nakalimutan ang Password?', 'toggle-theme': 'Palitan ang Tema',
  }
};

let currentLang = localStorage.getItem('lang') || 'en';

export function t(key) {
  return (translations[currentLang] && translations[currentLang][key]) || translations.en[key] || key;
}

export function setLang(lang) {
  if (translations[lang]) {
    currentLang = lang;
    localStorage.setItem('lang', lang);
    try { document.documentElement.lang = lang === 'fil' ? 'fil' : 'en'; } catch (e) {}
    const label = document.getElementById('lang-label');
    if (label) label.textContent = lang === 'fil' ? 'English' : 'Filipino';
    applyI18n();
    try { window.dispatchEvent(new Event('langchange')); } catch (e) {}
  }
}

// Translates static shell chrome (sidebar, login, search) marked with
// data-i18n / data-i18n-ph attributes. View content stays in English for now.
export function applyI18n() {
  try {
    document.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
    document.querySelectorAll('[data-i18n-ph]').forEach(el => { el.placeholder = t(el.dataset.i18nPh) + (el.dataset.i18nSuffix || ''); });
  } catch (e) {}
}

export function getLang() { return currentLang; }
export function toggleLang() { setLang(currentLang === 'en' ? 'fil' : 'en'); }

window.t = t;
window.setLang = setLang;
window.getLang = getLang;
window.toggleLang = toggleLang;
window.applyI18n = applyI18n;

// Set initial lang label on load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    const label = document.getElementById('lang-label');
    if (label) label.textContent = currentLang === 'fil' ? 'English' : 'Filipino';
    applyI18n();
  });
} else {
  const label = document.getElementById('lang-label');
  if (label) label.textContent = currentLang === 'fil' ? 'English' : 'Filipino';
  applyI18n();
}
