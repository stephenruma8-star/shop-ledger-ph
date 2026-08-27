export function viewHelp(root) {
  root.innerHTML = `
    <div class="space-y-6 fade-in max-w-3xl">
      <div class="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm glass-card">
        <h3 class="font-bold text-lg mb-4 flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="shrink-0 text-blue-600"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          Help &amp; User Guide
        </h3>
        <p class="text-sm text-gray-600 dark:text-gray-300">Welcome to Shop Ledger PH! This guide covers the basics of running your sari-sari store.</p>
      </div>

      <div class="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm glass-card">
        <h3 class="font-bold text-lg mb-3 flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="shrink-0 text-green-600"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
          Getting Started
        </h3>
        <div class="space-y-2 text-sm text-gray-600 dark:text-gray-300">
          <p><strong>1. Set up your shop</strong> — Go to Settings and enter your shop name, contact number, and address.</p>
          <p><strong>2. Add inventory</strong> — Go to Inventory and add your products with prices and stock levels.</p>
          <p><strong>3. Add clients</strong> — Go to Clients and add customers who buy on credit (utang).</p>
          <p><strong>4. Start selling</strong> — Go to Sales (or Catalog for quick sell) and record transactions.</p>
        </div>
      </div>

      <div class="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm glass-card">
        <h3 class="font-bold text-lg mb-3 flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="shrink-0 text-blue-600"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
          Daily Workflow
        </h3>
        <div class="space-y-2 text-sm text-gray-600 dark:text-gray-300">
          <p><strong>Record sales</strong> — Each sale creates a transaction. Select items from inventory or use Quick Items for common products.</p>
          <p><strong>Track payments</strong> — When customers pay, record it under Payments. Supports partial and full payments.</p>
          <p><strong>Log expenses</strong> — Record business expenses under Expenses (rent, electricity, supplies, etc.).</p>
          <p><strong>Stock take</strong> — Periodically do a stock take to compare system counts vs physical counts.</p>
        </div>
      </div>

      <div class="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm glass-card">
        <h3 class="font-bold text-lg mb-3 flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="shrink-0 text-purple-600"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
          Managing Debts (Utang)
        </h3>
        <div class="space-y-2 text-sm text-gray-600 dark:text-gray-300">
          <p><strong>Credit sales</strong> — When recording a sale, select a client and choose "Credit" as payment type.</p>
          <p><strong>Collecting payments</strong> — Go to Payments to record debt payments (partial or full).</p>
          <p><strong>Interest</strong> — You can set interest rates per client. Interest accrues daily on outstanding balances.</p>
          <p><strong>SMS reminders</strong> — Send automated reminders via Semaphore (requires API key in Settings).</p>
          <p><strong>Print debt form</strong> — Print a formal debt acknowledgment form for your client.</p>
        </div>
      </div>

      <div class="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm glass-card">
        <h3 class="font-bold text-lg mb-3 flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="shrink-0 text-orange-600"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>
          Reports &amp; Analytics
        </h3>
        <div class="space-y-2 text-sm text-gray-600 dark:text-gray-300">
          <p><strong>Dashboard</strong> — Overview of today's sales, expenses, and key metrics.</p>
          <p><strong>Reports</strong> — Daily, monthly, and yearly sales reports. Export to Excel.</p>
          <p><strong>Business report</strong> — Full P&amp;L with sales, expenses, and net income.</p>
        </div>
      </div>

      <div class="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm glass-card">
        <h3 class="font-bold text-lg mb-3 flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="shrink-0 text-red-600"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          Backups &amp; Safety
        </h3>
        <div class="space-y-2 text-sm text-gray-600 dark:text-gray-300">
          <p><strong>Automatic backups</strong> — The app creates daily snapshots of your data.</p>
          <p><strong>Manual backup</strong> — Click Backups in the sidebar to create a backup anytime.</p>
          <p><strong>Cloud sync</strong> — Set up OneDrive folder in Settings to auto-sync backups to the cloud.</p>
          <p><strong>Restore</strong> — From the Backups modal, select a backup file to restore your data.</p>
        </div>
      </div>

      <div class="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm glass-card">
        <h3 class="font-bold text-lg mb-3 flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="shrink-0 text-cyan-600"><rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>
          Mobile Access
        </h3>
        <div class="space-y-2 text-sm text-gray-600 dark:text-gray-300">
          <p><strong>LAN access</strong> — Other devices on your WiFi can access the app via a web browser.</p>
          <p><strong>QR code</strong> — Click Mobile Access in the sidebar to see the QR code and connection URL.</p>
          <p><strong>What mobile can do</strong> — Record sales, view clients, check inventory.</p>
        </div>
      </div>

      <div class="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm glass-card">
        <h3 class="font-bold text-lg mb-3 flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="shrink-0 text-gray-600"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>
          Keyboard Shortcuts
        </h3>
        <div class="grid grid-cols-2 gap-2 text-sm text-gray-600 dark:text-gray-300">
          <div><kbd class="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 rounded text-xs">F1</kbd> Dashboard</div>
          <div><kbd class="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 rounded text-xs">F2</kbd> Sales</div>
          <div><kbd class="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 rounded text-xs">F3</kbd> Payments</div>
          <div><kbd class="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 rounded text-xs">F4</kbd> Clients</div>
          <div><kbd class="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 rounded text-xs">F5</kbd> Inventory</div>
          <div><kbd class="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 rounded text-xs">F6</kbd> Expenses</div>
          <div><kbd class="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 rounded text-xs">F7</kbd> Reports</div>
          <div><kbd class="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 rounded text-xs">F8</kbd> Settings</div>
          <div><kbd class="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 rounded text-xs">F9</kbd> Stock Take</div>
          <div><kbd class="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 rounded text-xs">F10</kbd> Suppliers</div>
          <div><kbd class="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 rounded text-xs">F11</kbd> POs</div>
          <div><kbd class="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 rounded text-xs">Ctrl+/</kbd> Shortcuts</div>
        </div>
      </div>
    </div>`;
}
