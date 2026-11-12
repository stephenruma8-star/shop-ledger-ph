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
  supplierPayments: [],
  notifications: [],
  balanceSnapshots: [],
  user: null,
  currentRoute: 'dashboard',
  selectedYear: localStorage.getItem('selectedYear') || 'all'
};

export const peso = (n) => '₱' + (Math.round(Number(n || 0) * 100) / 100).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
// Negative balance = store holds a credit for the client; label it instead of
// showing a bare negative number.
export const pesoBal = (n) => { const v = Number(n || 0); return v < 0 ? peso(Math.abs(v)) + ' credit' : peso(v); };
export const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

export const VAT_RATE = 0.12;
// Settings store the VAT rate as a percentage ("12" = 12%), while older data may
// hold a fraction (0.12). Accept both so saving settings never silently changes
// the tax math (e.g. "12" must not be treated as 1200%).
export function vatRateFraction() {
  const raw = parseFloat((state.settings || []).find(s => s.key === 'vatRate')?.value);
  if (!Number.isFinite(raw) || raw <= 0) return VAT_RATE;
  return raw >= 1 ? raw / 100 : raw;
}
export const calcVAT = (amount) => Math.round((Number(amount) || 0) * VAT_RATE * 100) / 100;
export const calcVATinclusive = (amount) => Math.round((Number(amount) || 0) / (1 + VAT_RATE) * 100) / 100;
export const calcVATexclusive = (amount) => Math.round((Number(amount) || 0) * VAT_RATE * 100) / 100;

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

// Local calendar date (YYYY-MM-DD). Uses the machine's local time so a sale at
// 12:30 AM is counted on today's date, not the previous UTC day's.
export function today() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

export function now() { return new Date().toISOString(); }

window.__app = window.__app || {};
window.__app.chartInstances = {};


// expose top-level bindings as globals (inline onclick handlers and legacy code paths rely on them)
Object.defineProperties(window, {
  state: { get: () => state, configurable: true },
  peso: { get: () => peso, configurable: true },
  pesoBal: { get: () => pesoBal, configurable: true },
  fmtDate: { get: () => fmtDate, configurable: true },
  fmtDateTime: { get: () => fmtDateTime, configurable: true },
  today: { get: () => today, configurable: true },
  now: { get: () => now, configurable: true },
  VAT_RATE: { get: () => VAT_RATE, configurable: true },
  vatRateFraction: { get: () => vatRateFraction, configurable: true },
  calcVAT: { get: () => calcVAT, configurable: true },
  calcVATinclusive: { get: () => calcVATinclusive, configurable: true },
  calcVATexclusive: { get: () => calcVATexclusive, configurable: true }
});
