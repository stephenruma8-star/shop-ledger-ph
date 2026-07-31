export const state = {
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
  currentRoute: 'dashboard',
  selectedYear: localStorage.getItem('selectedYear') || 'all'
};

export const peso = (n) => '₱' + (Math.round(Number(n || 0) * 100) / 100).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

export function fmtDate(d) {
  if (!d) return '';
  const dt = new Date(d);
  return dt.toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' });
}

export function fmtDateTime(d) {
  if (!d) return '';
  const dt = new Date(d);
  return dt.toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function today() { return new Date().toISOString().split('T')[0]; }

export function now() { return new Date().toISOString(); }

window.__app = window.__app || {};
window.__app.chartInstances = {};


// expose top-level bindings as globals (inline onclick handlers and legacy code paths rely on them)
Object.defineProperties(window, {
  state: { get: () => state, configurable: true },
  peso: { get: () => peso, configurable: true },
  fmtDate: { get: () => fmtDate, configurable: true },
  fmtDateTime: { get: () => fmtDateTime, configurable: true },
  today: { get: () => today, configurable: true },
  now: { get: () => now, configurable: true }
});
