async function viewLoyalty(root) {
  state.loyaltyPoints = await dbAll('loyaltyPoints');
  state.clients = await dbAll('clients');
  const totalPts = state.loyaltyPoints.reduce((s, l) => s + (l.points || 0), 0);
  const topEarners = [...state.loyaltyPoints].sort((a, b) => (b.points || 0) - (a.points || 0)).slice(0, 10);
  const activity = [...state.loyaltyPoints].filter(l => l.updatedAt).sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  root.innerHTML = `
    <div class="space-y-4 fade-in">
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div class="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm border-l-4 border-yellow-500">
          <p class="text-xs text-gray-500 uppercase">Total Points Issued</p>
          <p class="text-2xl font-bold text-yellow-600">${totalPts}</p>
        </div>
        <div class="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm border-l-4 border-blue-500">
          <p class="text-xs text-gray-500 uppercase">Members</p>
          <p class="text-2xl font-bold text-blue-600">${state.loyaltyPoints.length}</p>
        </div>
        <div class="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm border-l-4 border-green-500">
          <p class="text-xs text-gray-500 uppercase">Avg Points</p>
          <p class="text-2xl font-bold text-green-600">${state.loyaltyPoints.length > 0 ? Math.round(totalPts / state.loyaltyPoints.length) : 0}</p>
        </div>
      </div>
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div class="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm">
          <h3 class="font-bold mb-3">Top Point Earners</h3>
          ${topEarners.length === 0 ? '<p class="text-gray-400 text-sm">No data yet</p>' : topEarners.map((l, i) => `
            <div class="flex justify-between py-2 border-b dark:border-gray-700 last:border-0">
              <span><span class="text-gray-400 mr-2">#${i+1}</span>${l.clientName || 'Unknown'}</span><span class="font-semibold text-yellow-600">${l.points} pts</span>
            </div>`).join('')}
        </div>
        <div class="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm">
          <h3 class="font-bold mb-3">Point Activity</h3>
          ${activity.length === 0 ? '<p class="text-gray-400 text-sm">No activity</p>' : activity.slice(0, 20).map(l => `
            <div class="flex justify-between py-1 border-b dark:border-gray-700 last:border-0 text-sm">
              <span>${l.clientName || 'Unknown'}</span><div><span class="text-yellow-600 font-medium">+${l.points} pts</span><span class="text-gray-400 ml-2 text-xs">${fmtDateTime(l.updatedAt)}</span></div>
            </div>`).join('')}
        </div>
      </div>
    </div>`;
}
