async function viewDashboard(root) {
  await Promise.all([dbLoad('clients'), dbLoad('transactions'), dbLoad('expenses'), dbLoad('payments'), dbLoad('inventory'), dbLoad('settings')]);
  const todayStr = today();
  const todayTx = state.transactions.filter(t => t.date === todayStr);
  const todayExp = state.expenses.filter(e => e.date === todayStr);
  const todayPay = state.payments.filter(p => p.date === todayStr);
  const todaySales = todayTx.reduce((s, t) => s + (t.grandTotal || 0), 0);
  const todayExpTotal = todayExp.reduce((s, e) => s + (e.amount || 0), 0);
  const todayPayTotal = todayPay.reduce((s, p) => s + (p.amount || 0), 0);
  const totalUtang = state.clients.reduce((s, c) => s + (c.balance || 0), 0);
  const lowStock = state.inventory.filter(i => (i.stock || 0) <= (i.minStock || 5));
  const topUtang = [...state.clients].filter(c => (c.balance || 0) > 0).sort((a, b) => (b.balance || 0) - (a.balance || 0)).slice(0, 5);
  const todayProfit = todaySales - todayExpTotal;
  const profitMargin = todaySales > 0 ? ((todayProfit / todaySales) * 100).toFixed(1) : 0;

  root.innerHTML = `
    <div class="space-y-2 fade-in">
      <div class="grid grid-cols-4 gap-2">
        <div class="bg-white dark:bg-gray-800 rounded-lg p-3 shadow-sm border-l-4 border-green-500">
          <p class="text-xs text-gray-500">Today Sales</p>
          <p class="text-lg font-bold text-green-600">${peso(todaySales)}</p>
          <p class="text-xs text-gray-400">${todayTx.length} txns</p>
        </div>
        <div class="bg-white dark:bg-gray-800 rounded-lg p-3 shadow-sm border-l-4 border-red-500">
          <p class="text-xs text-gray-500">Today Expenses</p>
          <p class="text-lg font-bold text-red-600">${peso(todayExpTotal)}</p>
        </div>
        <div class="bg-white dark:bg-gray-800 rounded-lg p-3 shadow-sm border-l-4 border-orange-500">
          <p class="text-xs text-gray-500">Total Utang</p>
          <p class="text-lg font-bold text-orange-600">${peso(totalUtang)}</p>
          <p class="text-xs text-gray-400">${state.clients.filter(c => (c.balance||0) > 0).length} clients</p>
        </div>
        <div class="bg-white dark:bg-gray-800 rounded-lg p-3 shadow-sm border-l-4 border-blue-500">
          <p class="text-xs text-gray-500">Today Collected</p>
          <p class="text-lg font-bold text-blue-600">${peso(todayPayTotal)}</p>
        </div>
      </div>
      <div class="bg-gradient-to-r from-blue-600 to-indigo-700 rounded-lg p-3 text-white shadow-sm">
        <div class="flex justify-between items-center">
          <div><p class="text-xs opacity-80">Today's Profit</p><p class="text-xl font-bold">${peso(todayProfit)}</p></div>
          <div class="text-right"><p class="text-xs opacity-80">Margin</p><p class="text-lg font-bold">${profitMargin}%</p></div>
        </div>
        <div class="mt-1 bg-white/20 rounded-full h-1.5"><div class="bg-white rounded-full h-1.5" style="width:${Math.min(profitMargin, 100)}%"></div></div>
      </div>
      <details open class="bg-white dark:bg-gray-800 rounded-lg shadow-sm" id="chart-section">
        <summary class="p-3 cursor-pointer font-bold text-sm flex items-center gap-2 hover:bg-gray-50 dark:hover:bg-gray-700/50 rounded-lg">📊 7-Day Trend <span id="chart-toggle" class="text-xs font-normal text-gray-400 ml-auto">Hide chart</span></summary>
        <div class="px-3 pb-3"><canvas id="dashChart" height="120"></canvas></div>
      </details>
      <div class="grid grid-cols-2 gap-2">
        <div class="bg-white dark:bg-gray-800 rounded-lg p-3 shadow-sm">
          <h3 class="font-bold text-xs mb-1">Top Utang</h3>
          ${topUtang.length === 0 ? '<p class="text-gray-400 text-xs">No utang</p>' : topUtang.map(c => `
            <div class="flex justify-between py-0.5 text-xs border-b dark:border-gray-700 last:border-0">
              <span>${escapeHtml(c.name)}</span><span class="font-semibold text-orange-600">${peso(c.balance)}</span>
            </div>`).join('')}
        </div>
        <div class="bg-white dark:bg-gray-800 rounded-lg p-3 shadow-sm">
          <h3 class="font-bold text-xs mb-1 text-red-600">Low Stock</h3>
          ${lowStock.length === 0 ? '<p class="text-gray-400 text-xs">Stocked</p>' : lowStock.map(i => `
            <div class="flex justify-between py-0.5 text-xs border-b dark:border-gray-700 last:border-0">
              <span>${escapeHtml(i.name)}</span><span class="font-semibold text-red-600">${i.stock || 0} / ${i.minStock || 5}</span>
            </div>`).join('')}
        </div>
      </div>
      <div class="bg-white dark:bg-gray-800 rounded-lg shadow-sm">
        <details id="ai-panel" class="group">
          <summary class="p-3 cursor-pointer font-bold text-sm flex items-center gap-2 hover:bg-gray-50 dark:hover:bg-gray-700/50 rounded-lg">🤖 AI Insights <span class="text-xs font-normal text-gray-400 ml-auto" id="ai-status">Ask about your business</span></summary>
          <div class="px-3 pb-3 space-y-2">
            <div id="ai-chat" class="max-h-32 overflow-auto space-y-1 text-xs border dark:border-gray-700 rounded p-2 bg-gray-50 dark:bg-gray-900 min-h-[60px]">
              <div class="text-gray-400 text-xs text-center py-2">Ask about sales, inventory, clients...</div>
            </div>
            <div class="flex gap-2">
              <input id="ai-input" type="text" placeholder="e.g. Top debtors?" class="flex-1 px-2 py-1.5 border dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-xs" onkeydown="if(event.key==='Enter')askAI()" />
              <button onclick="askAI()" class="px-3 py-1.5 bg-blue-600 text-white rounded text-xs font-semibold">Ask</button>
            </div>
          </div>
        </details>
      </div>
    </div>`;
  drawDashChart();
}

async function askAI() {
  const input = document.getElementById('ai-input');
  const chat = document.getElementById('ai-chat');
  const q = input.value.trim();
  if (!q) return;
  const settingsMap = {};
  state.settings.forEach(s => settingsMap[s.key] = s.value);
  const apiKey = settingsMap['aiApiKey'] || '';
  const provider = settingsMap['aiModel'] || 'ollama';
  if (!apiKey && provider !== 'ollama') { toast('Set your AI API key in Settings first, or switch to Ollama', 'warning'); document.getElementById('ai-panel').open = true; return; }
  input.value = '';
  chat.innerHTML += `<div class="flex justify-end"><div class="bg-blue-600 text-white px-3 py-2 rounded-2xl rounded-br-sm max-w-[80%]">${escapeHtml(q)}</div></div>`;
  chat.innerHTML += `<div class="flex justify-start" id="ai-loading"><div class="bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 px-3 py-2 rounded-2xl rounded-bl-sm max-w-[80%] text-xs italic">Thinking...</div></div>`;
  chat.scrollTop = chat.scrollHeight;
  document.getElementById('ai-status').textContent = 'Thinking...';
  try {
    const topClients = [...state.clients].filter(c => (c.balance||0) > 0).sort((a,b) => (b.balance||0)-(a.balance||0)).slice(0, 20);
    const recentTx = [...state.transactions].sort((a,b) => new Date(b.createdAt)-new Date(a.createdAt)).slice(0, 30);
    const lowStock = state.inventory.filter(i => (i.stock||0) <= (i.minStock||5));
    const todaySales = state.transactions.filter(t => t.date === today()).reduce((s,t) => s+(t.grandTotal||0), 0);
    const totalUtang = state.clients.reduce((s,c) => s+(c.balance||0), 0);
    let baseUrl, model, headers;
    if (provider === 'ollama') {
      baseUrl = 'http://localhost:11434/v1';
      model = 'llama3.2';
      headers = { 'Content-Type': 'application/json' };
    } else {
      baseUrl = 'https://api.openai.com/v1';
      model = provider;
      headers = { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey };
    }
    const context = `Ikaw ay isang business analyst para sa isang Philippine sari-sari store / maliit na tindahan na gumagamit ng "Shop Ledger PH". Sumagot nang maikli sa Tagalog o Taglish. Gumamit ng ₱ para sa pera.

Shop Data Snapshot:
- Total clients: ${state.clients.length}
- Total transactions: ${state.transactions.length}
- Total sales (all time): ₱${state.transactions.reduce((s,t) => s+(t.grandTotal||0), 0).toFixed(2)}
- Total expenses: ₱${state.expenses.reduce((s,e) => s+(e.amount||0), 0).toFixed(2)}
- Today's sales: ₱${todaySales.toFixed(2)}
- Total utang (outstanding balance): ₱${totalUtang.toFixed(2)}
- Total payments collected: ₱${state.payments.reduce((s,p) => s+(p.amount||0), 0).toFixed(2)}
- Inventory items: ${state.inventory.length}
- Low stock items: ${lowStock.map(i => i.name + '(' + (i.stock||0) + '/' + (i.minStock||5) + ')').join(', ') || 'None'}

Top debtors: ${topClients.map(c => c.name + '(₱' + (c.balance||0).toFixed(2) + ')').join(', ') || 'None'}

Recent transactions: ${recentTx.map(t => t.invoiceNo + ' ₱' + (t.grandTotal||0).toFixed(2) + ' ' + (t.paymentMethod||'')).join(' | ') || 'None'}

User question: ${q}`;
    const res = await fetch(baseUrl + '/chat/completions', {
      method: 'POST', headers,
      body: JSON.stringify({ model, messages: [{ role: 'user', content: context }], temperature: 0.3, stream: false })
    });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(res.status === 404 ? 'Model not found. Run: ollama pull llama3.2' : (errText || res.statusText));
    }
    const data = await res.json();
    const answer = data.choices?.[0]?.message?.content || 'No response';
    document.getElementById('ai-loading').outerHTML = `<div class="flex justify-start"><div class="bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 px-3 py-2 rounded-2xl rounded-bl-sm max-w-[80%]">${escapeHtml(answer)}</div></div>`;
    document.getElementById('ai-status').textContent = 'Answered';
  } catch (err) {
    document.getElementById('ai-loading').outerHTML = `<div class="flex justify-start"><div class="bg-red-100 dark:bg-red-900/30 text-red-600 px-3 py-2 rounded-2xl rounded-bl-sm max-w-[80%]">Error: ${escapeHtml(err.message)}</div></div>`;
    document.getElementById('ai-status').textContent = 'Error';
  }
  chat.scrollTop = chat.scrollHeight;
}

function drawDashChart() {
  if (typeof Chart === 'undefined') { setTimeout(drawDashChart, 200); return; }
  if (chartInstances.dash) chartInstances.dash.destroy();
  const labels = [];
  const sales = [], expenses = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const key = d.toISOString().split('T')[0];
    labels.push(d.toLocaleDateString('en-PH', { weekday: 'short' }));
    const dayTx = state.transactions.filter(t => t.date === key);
    const dayExp = state.expenses.filter(e => e.date === key);
    sales.push(dayTx.reduce((s, t) => s + (t.grandTotal || 0), 0));
    expenses.push(dayExp.reduce((s, e) => s + (e.amount || 0), 0));
  }
  const ctx = document.getElementById('dashChart');
  if (!ctx) return;
  chartInstances.dash = new Chart(ctx, {
    type: 'bar',
    data: { labels, datasets: [
      { label: 'Sales', data: sales, backgroundColor: '#3b82f6', borderRadius: 3 },
      { label: 'Expenses', data: expenses, backgroundColor: '#ef4444', borderRadius: 3 }
    ]},
    options: { responsive: true, maintainAspectRatio: true,
      scales: { y: { beginAtZero: true, ticks: { callback: v => '₱' + v.toLocaleString() } } },
      plugins: { legend: { display: false } }
    }
  });
}
