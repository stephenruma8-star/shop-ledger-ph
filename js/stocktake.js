async function viewStockTake(root) {
  await dbLoad('inventory');
  root.innerHTML = `
    <div class="space-y-4 fade-in">
      <div class="flex gap-2 flex-wrap items-center justify-between">
        <h3 class="font-bold text-lg">Stock Take</h3>
        <div class="flex gap-2">
          <button onclick="startStockTake()" class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">+ New Count</button>
          <button onclick="clearStockTake()" class="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700">Clear</button>
        </div>
      </div>
      <div id="st-counts" class="space-y-2"></div>
      <div id="st-results" class="hidden"></div>
    </div>`;
}

let stCounts = {};

function startStockTake() {
  stCounts = {};
  const inv = state.inventory;
  const el = document.getElementById('st-counts');
  el.innerHTML = `<div class="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm glass-card">
    <h4 class="font-bold text-sm mb-2">Enter Physical Counts</h4>
    <table class="w-full text-sm"><thead><tr class="bg-gray-50 dark:bg-gray-700 text-left"><th class="p-2">Item</th><th class="p-2 text-right">System</th><th class="p-2 text-right">Physical</th><th class="p-2 text-right">Variance</th></tr></thead>
    <tbody>${inv.map(i => {
      const sys = i.stock || 0;
      stCounts[i.id] = sys;
      return `<tr class="border-b dark:border-gray-700"><td class="p-2 font-medium">${escapeHtml(i.name)}</td><td class="p-2 text-right">${sys}</td><td class="p-2 text-right"><input type="number" value="${sys}" data-invid="${i.id}" onchange="stCounts[${i.id}]=parseInt(this.value)||0;stUpdateVariance(${i.id})" class="w-20 px-2 py-1 border dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-right text-sm" /></td><td class="p-2 text-right" id="st-var-${i.id}">0</td></tr>`;
    }).join('')}</tbody></table>
    <button onclick="applyStockTake()" class="mt-3 w-full py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-semibold">Apply Adjustments</button>
  </div>`;
}

function stUpdateVariance(id) {
  const el = document.getElementById('st-var-' + id);
  if (!el) return;
  const item = state.inventory.find(i => i.id === id);
  if (!item) return;
  const sys = item.stock || 0;
  const phys = stCounts[id] || 0;
  const varAmt = phys - sys;
  el.textContent = varAmt > 0 ? '+' + varAmt : String(varAmt);
  el.className = 'p-2 text-right font-bold ' + (varAmt === 0 ? '' : varAmt > 0 ? 'text-green-600' : 'text-red-600');
}

async function applyStockTake() {
  const diffs = [];
  for (const idStr of Object.keys(stCounts)) {
    const id = parseInt(idStr);
    const item = state.inventory.find(i => i.id === id);
    if (!item) continue;
    const sys = item.stock || 0;
    const phys = stCounts[id] || 0;
    if (sys !== phys) diffs.push({ item, sys, phys, diff: phys - sys });
  }
  if (diffs.length === 0) { toast('No adjustments needed', 'info'); return; }
  if (!await confirmModal(`Apply ${diffs.length} adjustment(s)? ${diffs.filter(d => d.diff < 0).length} items will decrease.`)) return;
  for (const d of diffs) {
    const inv = await dbGet('inventory', d.item.id);
    if (inv) {
      inv.stock = d.phys;
      await dbPut('inventory', inv);
      await logAudit('stocktake', `${d.item.name}: ${d.sys} → ${d.phys} (${d.diff > 0 ? '+' : ''}${d.diff})`);
    }
  }
  state.inventory = await dbAll('inventory');
  updateLowStockBadge();
  const resultEl = document.getElementById('st-results');
  resultEl.classList.remove('hidden');
  resultEl.innerHTML = `<div class="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl p-4 shadow-sm">
    <h4 class="font-bold text-sm text-green-800 dark:text-green-300 mb-2">✓ Adjustments Applied</h4>
    <table class="w-full text-xs"><thead><tr class="text-left text-green-700 dark:text-green-400"><th class="p-1">Item</th><th class="p-1 text-right">System</th><th class="p-1 text-right">Physical</th><th class="p-1 text-right">Change</th></tr></thead>
    <tbody>${diffs.map(d => `<tr class="border-b border-green-200 dark:border-green-800"><td class="p-1">${escapeHtml(d.item.name)}</td><td class="p-1 text-right">${d.sys}</td><td class="p-1 text-right font-bold">${d.phys}</td><td class="p-1 text-right font-bold ${d.diff >= 0 ? 'text-green-600' : 'text-red-600'}">${d.diff > 0 ? '+' : ''}${d.diff}</td></tr>`).join('')}</tbody></table>
  </div>`;
  toast(`${diffs.length} item(s) adjusted`, 'success');
}

async function clearStockTake() {
  if (Object.keys(stCounts).length && !await confirmModal('Clear all entered counts?')) return;
  stCounts = {};
  document.getElementById('st-counts').innerHTML = '<p class="text-gray-400 text-sm">Click "New Count" to start</p>';
  document.getElementById('st-results').classList.add('hidden');
}
