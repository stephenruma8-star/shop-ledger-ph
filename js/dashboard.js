async function viewDashboard(root) {
  state.clients = await dbAll('clients');
  state.transactions = await dbAll('transactions');
  state.expenses = await dbAll('expenses');
  state.payments = await dbAll('payments');
  state.inventory = await dbAll('inventory');
  const todayStr = today();
  const todayTx = state.transactions.filter(t => t.date === todayStr);
  const todayExp = state.expenses.filter(e => e.date === todayStr);
  const todayPay = state.payments.filter(p => p.date === todayStr);
  const todaySales = todayTx.reduce((s, t) => s + (t.grandTotal || 0), 0);
  const todayExpTotal = todayExp.reduce((s, e) => s + (e.amount || 0), 0);
  const todayPayTotal = todayPay.reduce((s, p) => s + (p.amount || 0), 0);
  const totalUtang = state.clients.reduce((s, c) => s + (c.balance || 0), 0);
  const totalSales = state.transactions.reduce((s, t) => s + (t.grandTotal || 0), 0);
  const totalPaid = state.payments.reduce((s, p) => s + (p.amount || 0), 0);
  const totalExpensesAll = state.expenses.reduce((s, e) => s + (e.amount || 0), 0);
  const netProfit = totalSales - totalExpensesAll;
  const lowStock = state.inventory.filter(i => (i.stock || 0) <= (i.minStock || 5));
  const topUtang = [...state.clients].filter(c => (c.balance || 0) > 0).sort((a, b) => (b.balance || 0) - (a.balance || 0)).slice(0, 5);
  const todayProfit = todaySales - todayExpTotal;
  const profitMargin = todaySales > 0 ? ((todayProfit / todaySales) * 100).toFixed(1) : 0;

  root.innerHTML = `
    <div class="space-y-6 fade-in">
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div class="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm border-l-4 border-green-500">
          <p class="text-xs text-gray-500 uppercase tracking-wide">Today Sales</p>
          <p class="text-2xl font-bold text-green-600">${peso(todaySales)}</p>
          <p class="text-xs text-gray-400">${todayTx.length} transactions</p>
        </div>
        <div class="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm border-l-4 border-red-500">
          <p class="text-xs text-gray-500 uppercase tracking-wide">Today Expenses</p>
          <p class="text-2xl font-bold text-red-600">${peso(todayExpTotal)}</p>
        </div>
        <div class="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm border-l-4 border-orange-500">
          <p class="text-xs text-gray-500 uppercase tracking-wide">Total Utang</p>
          <p class="text-2xl font-bold text-orange-600">${peso(totalUtang)}</p>
          <p class="text-xs text-gray-400">${state.clients.filter(c => (c.balance||0) > 0).length} clients</p>
        </div>
        <div class="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm border-l-4 border-blue-500">
          <p class="text-xs text-gray-500 uppercase tracking-wide">Today Collections</p>
          <p class="text-2xl font-bold text-blue-600">${peso(todayPayTotal)}</p>
        </div>
      </div>
      <div class="bg-gradient-to-r from-blue-600 to-indigo-700 rounded-xl p-6 text-white shadow-lg">
        <div class="flex justify-between items-center">
          <div><p class="text-sm opacity-80">Today's Profit</p><p class="text-3xl font-bold">${peso(todayProfit)}</p></div>
          <div class="text-right"><p class="text-sm opacity-80">Margin</p><p class="text-2xl font-bold">${profitMargin}%</p></div>
        </div>
        <div class="mt-2 bg-white/20 rounded-full h-2"><div class="bg-white rounded-full h-2 transition-all" style="width:${Math.min(profitMargin, 100)}%"></div></div>
      </div>
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div class="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm">
          <h3 class="font-bold mb-3">Sales (7 Days)</h3>
          <canvas id="salesChart" height="200"></canvas>
        </div>
        <div class="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm">
          <h3 class="font-bold mb-3">Payment Methods</h3>
          <canvas id="paymentChart" height="200"></canvas>
        </div>
      </div>
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div class="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm">
          <h3 class="font-bold mb-3">Top Utang</h3>
          ${topUtang.length === 0 ? '<p class="text-gray-400 text-sm">No utang records</p>' : topUtang.map(c => `
            <div class="flex justify-between py-2 border-b dark:border-gray-700 last:border-0">
              <span>${c.name}</span><span class="font-semibold text-orange-600">${peso(c.balance)}</span>
            </div>`).join('')}
        </div>
        <div class="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm">
          <h3 class="font-bold mb-3 text-red-600">Low Stock Alerts</h3>
          ${lowStock.length === 0 ? '<p class="text-gray-400 text-sm">All items stocked</p>' : lowStock.map(i => `
            <div class="flex justify-between py-2 border-b dark:border-gray-700 last:border-0">
              <span>${i.name}</span><span class="font-semibold text-red-600">${i.stock || 0} / ${i.minStock || 5}</span>
            </div>`).join('')}
        </div>
      </div>
    </div>`;

  drawSalesChart();
  drawPaymentChart();
}

function drawSalesChart() {
  if (chartInstances.sales) chartInstances.sales.destroy();
  const labels = [];
  const data = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const ds = d.toISOString().split('T')[0];
    labels.push(d.toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric' }));
    const dayTx = state.transactions.filter(t => t.date === ds);
    data.push(dayTx.reduce((s, t) => s + (t.grandTotal || 0), 0));
  }
  const ctx = document.getElementById('salesChart');
  if (!ctx) return;
  chartInstances.sales = new Chart(ctx, {
    type: 'bar',
    data: { labels, datasets: [{ label: 'Sales', data, backgroundColor: '#3b82f6', borderRadius: 4 }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, ticks: { callback: v => '₱' + v.toLocaleString() } } } }
  });
}

function drawPaymentChart() {
  if (chartInstances.payment) chartInstances.payment.destroy();
  const methods = {};
  state.transactions.forEach(t => {
    const m = t.paymentMethod || 'Cash';
    methods[m] = (methods[m] || 0) + (t.grandTotal || 0);
  });
  const labels = Object.keys(methods);
  const data = Object.values(methods);
  const colors = ['#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6'];
  const ctx = document.getElementById('paymentChart');
  if (!ctx) return;
  chartInstances.payment = new Chart(ctx, {
    type: 'doughnut',
    data: { labels, datasets: [{ data, backgroundColor: colors.slice(0, labels.length) }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }
  });
}
