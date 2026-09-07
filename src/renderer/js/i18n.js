const translations = {
  en: {
    dashboard: 'Dashboard', clients: 'Clients', debts: 'Debts', sales: 'Sales',
    catalog: 'Catalog', inventory: 'Inventory', stocktake: 'Stock Take',
    expenses: 'Expenses', suppliers: 'Suppliers', payments: 'Payments',
    'purchase-orders': 'POs', reports: 'Reports', settings: 'Settings',
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
  }
};

let currentLang = localStorage.getItem('lang') || 'en';

function t(key) {
  return (translations[currentLang] && translations[currentLang][key]) || translations.en[key] || key;
}

function setLang(lang) {
  if (translations[lang]) {
    currentLang = lang;
    localStorage.setItem('lang', lang);
    document.documentElement.lang = lang === 'fil' ? 'fil' : 'en';
    const label = document.getElementById('lang-label');
    if (label) label.textContent = lang === 'fil' ? 'English' : 'Filipino';
  }
}

function getLang() { return currentLang; }
function toggleLang() { setLang(currentLang === 'en' ? 'fil' : 'en'); }

window.t = t;
window.setLang = setLang;
window.getLang = getLang;
window.toggleLang = toggleLang;

// Set initial lang label on load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    const label = document.getElementById('lang-label');
    if (label) label.textContent = currentLang === 'fil' ? 'English' : 'Filipino';
  });
} else {
  const label = document.getElementById('lang-label');
  if (label) label.textContent = currentLang === 'fil' ? 'English' : 'Filipino';
}
