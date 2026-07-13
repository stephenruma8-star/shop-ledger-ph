const state = {
  clients: [],
  transactions: [],
  payments: [],
  inventory: [],
  quickItems: [],
  settings: [],
  auditLogs: [],
  users: [],
  expenses: [],
  suppliers: [],
  purchaseOrders: [],
  notifications: [],
  user: null,
  currentRoute: 'dashboard'
};

const peso = (n) => '₱' + Number(n || 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

function fmtDate(d) {
  if (!d) return '';
  const dt = new Date(d);
  return dt.toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' });
}

function fmtDateTime(d) {
  if (!d) return '';
  const dt = new Date(d);
  return dt.toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function today() { return new Date().toISOString().split('T')[0]; }

function now() { return new Date().toISOString(); }

let chartInstances = {};
