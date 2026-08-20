import { dbAdd, dbAll, dbDel, dbGet, dbPut } from './database.js'
import { closeModal, dbLoad, escapeHtml, hashPassword, modal, runCloudBackup, sendOverdueReminders, toast } from './helpers.js'
import { state } from './state.js'

export async function viewSettings(root) {
  await Promise.all([dbLoad('settings'), dbLoad('users'), dbLoad('quickItems')]);
  const settingsMap = {};
  state.settings.forEach(s => settingsMap[s.key] = s.value);
  let appPrefs = {};
  if (window.electronAPI?.getAppPreferences) {
    try { appPrefs = await window.electronAPI.getAppPreferences(); } catch (e) {}
  }
  let installedVersion = '';
  if (window.electronAPI?.getAppVersion) {
    try { installedVersion = await window.electronAPI.getAppVersion(); } catch (e) {}
  }
  root.innerHTML = `
    <div class="space-y-6 fade-in max-w-4xl">
      <div class="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm glass-card">
        <h3 class="font-bold text-lg mb-4 flex items-center gap-2"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="shrink-0"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>Business Information</h3>
        <div class="grid grid-cols-2 gap-3">
          <div><label class="text-xs text-gray-500 block">Shop Name</label><input id="set-shopName" value="${escapeHtml(settingsMap['shopName'] || '')}" class="w-full px-3 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800" /></div>
          <div><label class="text-xs text-gray-500 block">Contact Number</label><input id="set-shopContact" value="${escapeHtml(settingsMap['shopContact'] || '')}" class="w-full px-3 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800" /></div>
           <div class="col-span-2"><label class="text-xs text-gray-500 block">Address</label><input id="set-shopAddress" value="${escapeHtml(settingsMap['shopAddress'] || '')}" class="w-full px-3 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800" /></div>
           <div><label class="text-xs text-gray-500 block">Weather Location</label><input id="set-weatherLocation" value="${escapeHtml(settingsMap['weatherLocation'] || 'Manila')}" class="w-full px-3 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800" placeholder="e.g. Manila, Quezon City, Cebu" /></div>
         </div>
       </div>
      <div class="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm glass-card">
        <h3 class="font-bold text-lg mb-4 flex items-center gap-2"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="shrink-0"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>Receipt Branding</h3>
        <div class="space-y-3">
          <div><label class="text-xs text-gray-500 block">Shop Logo</label>
            <div class="flex items-center gap-3">
              <div class="w-16 h-16 border-2 border-dashed dark:border-gray-600 rounded-lg flex items-center justify-center overflow-hidden bg-gray-50 dark:bg-gray-700" id="logo-preview">${settingsMap['receiptLogo'] ? `<img src="${escapeHtml(settingsMap['receiptLogo'])}" class="w-full h-full object-contain" />` : '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="text-gray-300 mx-auto"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>'}</div>
              <label class="px-3 py-1.5 bg-gray-100 dark:bg-gray-700 rounded-lg text-sm cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-600"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="inline-block mr-1 -mt-0.5"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>Choose File<input type="file" accept="image/*" class="hidden" onchange="uploadReceiptLogo(event)" /></label>
              ${settingsMap['receiptLogo'] ? `<button onclick="removeReceiptLogo()" class="text-xs text-red-500"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="inline-block mr-1 -mt-0.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>Remove</button>` : ''}
            </div>
          </div>
          <div><label class="text-xs text-gray-500 block">Custom Header Text</label><textarea id="set-receiptHeaderText" rows="2" class="w-full px-3 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm">${escapeHtml(settingsMap['receiptHeaderText'] || '')}</textarea></div>
          <div><label class="text-xs text-gray-500 block">Receipt Footer Message</label><input id="set-receiptFooter" value="${escapeHtml(settingsMap['receiptFooter'] || 'Thank you for your patronage!')}" class="w-full px-3 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800" /></div>
        </div>
      </div>
      <div class="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm glass-card">
        <h3 class="font-bold text-lg mb-4 flex items-center gap-2"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="shrink-0"><rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>SMS &amp; Email</h3>
        <div class="space-y-3">
          <div><label class="text-xs text-gray-500 block">Semaphore API Key</label><input id="set-smsApiKey" value="${escapeHtml(settingsMap['smsApiKey'] || '')}" class="w-full px-3 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800" placeholder="From semaphore.co" /></div>
          <div><label class="text-xs text-gray-500 block">SMS Alert Number</label><input id="set-smsAlertNumber" value="${escapeHtml(settingsMap['smsAlertNumber'] || '')}" class="w-full px-3 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800" placeholder="09xxxxxxxxx (owner for low-stock alerts)" /></div>
          <div class="flex gap-2 items-center">
            <button onclick="sendTestSMS()" class="px-3 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">Send Test SMS</button>
            <span id="sms-test-status" class="text-xs text-gray-400"></span>
          </div>
          <div class="border-t dark:border-gray-700 pt-3 mt-1">
            <div class="flex items-center justify-between mb-1">
              <span class="text-sm font-semibold flex items-center gap-2"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="shrink-0"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>Auto Overdue Reminders</span>
              <label class="flex items-center gap-2 text-sm cursor-pointer"><input type="checkbox" id="set-smsAutoReminderEnabled" ${settingsMap['smsAutoReminderEnabled'] === 'true' ? 'checked' : ''} class="w-4 h-4 text-blue-600 rounded" /> Enabled</label>
            </div>
            <p class="text-xs text-gray-500 mb-2">Automatically SMS a balance reminder to clients with overdue balances (past due date + phone number). Sends when the app opens.</p>
            <div class="grid grid-cols-2 gap-2">
              <div><label class="text-xs text-gray-500 block">Frequency</label><select id="set-smsAutoReminderFreq" class="w-full px-3 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm"><option value="monthly" ${(settingsMap['smsAutoReminderFreq']||'monthly') === 'monthly' ? 'selected' : ''}>Monthly</option><option value="weekly" ${settingsMap['smsAutoReminderFreq'] === 'weekly' ? 'selected' : ''}>Weekly</option><option value="daily" ${settingsMap['smsAutoReminderFreq'] === 'daily' ? 'selected' : ''}>Daily</option></select></div>
              <div><label class="text-xs text-gray-500 block">Day of Month <span class="text-gray-400">(monthly)</span></label><input id="set-smsAutoReminderDay" type="number" min="1" max="28" value="${escapeHtml(settingsMap['smsAutoReminderDay'] || '1')}" class="w-full px-3 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm" /></div>
            </div>
            <div class="flex gap-2 items-center mt-2">
              <button onclick="sendRemindersNow()" class="px-3 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700">Send Reminders Now</button>
              <span id="sms-reminder-status" class="text-xs text-gray-400"></span>
            </div>
            <p class="text-xs text-gray-400 mt-2">Last sent: <span id="last-reminder-text">${settingsMap['lastSmsReminder'] ? new Date(settingsMap['lastSmsReminder']).toLocaleString() : 'Never'}</span></p>
          </div>
          <div><label class="text-xs text-gray-500 block">Backup Email (recipient)</label><input id="set-backupEmail" value="${escapeHtml(settingsMap['backupEmail'] || '')}" class="w-full px-3 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800" /></div>
          <details class="text-sm"><summary class="cursor-pointer text-blue-600">SMTP Settings</summary>
            <div class="grid grid-cols-2 gap-2 mt-2 p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
              ${(() => {
                let smtp = { host: '', port: '587', user: '', pass: '', fromName: '' };
                try { if (settingsMap['smtpConfig']) smtp = JSON.parse(settingsMap['smtpConfig']); } catch(e) {}
                return Object.entries({host:'Host',port:'Port',user:'User',pass:'Password',fromName:'From Name'}).map(([k,label]) =>
                  `<div><label class="text-xs text-gray-500 block">${label}</label><input id="set-smtp-${k}" ${k==='pass'?'type="password"':'type="text"'} value="${escapeHtml(smtp[k]||'')}" class="w-full px-2 py-1.5 border dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-sm" /></div>`
                ).join('');
              })()}
            </div>
          </details>
        </div>
      </div>
      <div class="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm glass-card">
        <h3 class="font-bold text-lg mb-4 flex items-center gap-2"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="shrink-0"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>Thermal Printer</h3>
        <div class="grid grid-cols-2 gap-3">
          <div><label class="text-xs text-gray-500 block">Printer IP / Host</label><input id="set-thermalHost" value="${escapeHtml(settingsMap['thermalHost'] || '')}" class="w-full px-3 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800" placeholder="192.168.1.100 (network ESC/POS)" /></div>
          <div><label class="text-xs text-gray-500 block">Port</label><input id="set-thermalPort" value="${escapeHtml(settingsMap['thermalPort'] || '9100')}" class="w-full px-3 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800" /></div>
        </div>
        <div class="flex gap-2 items-center mt-3">
          <button onclick="testThermalPrint()" class="px-3 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">Print Test Receipt</button>
          <span id="thermal-test-status" class="text-xs text-gray-400"></span>
        </div>
        <p class="text-xs text-gray-400 mt-2">For WiFi/Ethernet thermal receipt printers (ESC/POS). After saving, use the "Thermal" button in any sale's receipt view.</p>
      </div>
      <div class="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm glass-card">
        <h3 class="font-bold text-lg mb-4 flex items-center gap-2"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="shrink-0"><rect x="4" y="4" width="16" height="16" rx="2" ry="2"/><rect x="9" y="9" width="6" height="6"/><line x1="9" y1="1" x2="9" y2="4"/><line x1="15" y1="1" x2="15" y2="4"/><line x1="9" y1="20" x2="9" y2="23"/><line x1="15" y1="20" x2="15" y2="23"/><line x1="20" y1="9" x2="23" y2="9"/><line x1="20" y1="14" x2="23" y2="14"/><line x1="1" y1="9" x2="4" y2="9"/><line x1="1" y1="14" x2="4" y2="14"/></svg>AI Assistant</h3>
        <div class="grid grid-cols-2 gap-3">
          <div><label class="text-xs text-gray-500 block">API Key <span class="text-gray-400 font-normal">(leave blank for local)</span></label><input id="set-aiApiKey" type="password" value="${escapeHtml(settingsMap['aiApiKey'] || '')}" class="w-full px-3 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 font-mono text-xs" placeholder="sk-... or empty for Ollama" /></div>
          <div><label class="text-xs text-gray-500 block">Provider</label><select id="set-aiModel" class="w-full px-3 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800"><option value="ollama" ${(settingsMap['aiModel']||'ollama') === 'ollama' ? 'selected' : ''}>Ollama (local, free)</option><option value="gpt-4o-mini" ${settingsMap['aiModel'] === 'gpt-4o-mini' ? 'selected' : ''}>OpenAI GPT-4o-mini</option><option value="gpt-4o" ${settingsMap['aiModel'] === 'gpt-4o' ? 'selected' : ''}>OpenAI GPT-4o</option></select></div>
        </div>
        <p class="text-xs text-gray-400 mt-2">No API key? Use <strong>Ollama</strong> — free local AI. <a href="#" onclick="if(window.electronAPI)window.electronAPI.openExternal('https://ollama.ai/download')" class="text-blue-500 hover:underline">Download Ollama</a>, run <code class="bg-gray-100 dark:bg-gray-700 px-1 rounded">ollama pull llama3.2</code>, then select "Ollama" above.</p>
      </div>
      <div class="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm glass-card">
        <h3 class="font-bold text-lg mb-4 flex items-center gap-2"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="shrink-0"><path d="M21.5 17.5a5 5 0 0 0-4.7-7.5 7 7 0 0 0-13.1 2.5A5 5 0 0 0 6 21h12a4 4 0 0 0 3.5-3.5z"/></svg>Cloud Backup</h3>
        <div class="space-y-3">
          <label class="flex items-center gap-2 text-sm"><input type="checkbox" id="set-cloudBackupEnabled" ${settingsMap['cloudBackupEnabled'] === 'true' ? 'checked' : ''} /> Enable auto cloud backup</label>
          <div><label class="text-xs text-gray-500 block">Backup Folder <span class="text-gray-400">(OneDrive / Google Drive / Dropbox)</span></label>
            <div class="flex gap-2"><input id="set-cloudBackupFolder" value="${escapeHtml(settingsMap['cloudBackupFolder'] || '')}" class="flex-1 px-3 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm" placeholder="C:\Users\...\OneDrive\Shop Backups" /><button onclick="selectCloudFolder()" class="px-3 py-2 bg-gray-200 dark:bg-gray-700 rounded-lg text-sm hover:bg-gray-300 dark:hover:bg-gray-600"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="inline-block mr-1 -mt-0.5"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>Browse</button></div>
          </div>
          <div><label class="text-xs text-gray-500 block">Encryption Password</label><input id="set-cloudBackupPassword" type="password" value="${escapeHtml(settingsMap['cloudBackupPassword'] || '')}" class="w-full px-3 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm" placeholder="Password to protect your backup" /></div>
          <div><label class="text-xs text-gray-500 block">Backup Frequency</label><select id="set-cloudBackupInterval" class="w-full px-3 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm"><option value="daily" ${(settingsMap['cloudBackupInterval']||'daily') === 'daily' ? 'selected' : ''}>Daily</option><option value="weekly" ${settingsMap['cloudBackupInterval'] === 'weekly' ? 'selected' : ''}>Weekly</option><option value="monthly" ${settingsMap['cloudBackupInterval'] === 'monthly' ? 'selected' : ''}>Monthly</option></select></div>
          <div class="flex gap-2 items-center">
            <button onclick="runCloudBackupNow()" class="px-3 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700">Back Up Now</button>
            <span id="cloud-backup-status" class="text-xs text-gray-400"></span>
          </div>
          <p class="text-xs text-gray-400">Last backup: <span id="last-backup-text">${settingsMap['lastCloudBackup'] ? new Date(settingsMap['lastCloudBackup']).toLocaleString() : 'Never'}</span></p>
        </div>
      </div>
      <div class="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm glass-card">
        <h3 class="font-bold text-lg mb-4 flex items-center gap-2"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="shrink-0"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>Database</h3>
        <div class="grid grid-cols-2 gap-3 mb-3">
          <div>
            <label class="flex items-center gap-2 text-sm cursor-pointer"><input type="checkbox" id="set-autoSnapshotEnabled" ${settingsMap['autoSnapshotEnabled'] === 'true' ? 'checked' : ''} class="w-4 h-4 text-blue-600 rounded" /> Auto daily snapshot</label>
            <p class="text-xs text-gray-400 mt-1">Saves a local snapshot automatically once per day. Old auto snapshots are pruned past the keep count (manual backups are never removed).</p>
          </div>
          <div><label class="text-xs text-gray-500 block">Keep auto snapshots</label><input id="set-snapshotKeepCount" type="number" min="1" max="90" value="${escapeHtml(settingsMap['snapshotKeepCount'] || '14')}" class="w-full px-3 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm" /><p class="text-xs text-gray-400 mt-1">Default 14 days of automatic snapshots.</p></div>
        </div>
        <div class="grid grid-cols-2 gap-3 mb-3">
          <div><label class="text-xs text-gray-500 block">Keep manual backups</label><input id="set-keepManualBackups" type="number" min="0" max="90" value="${escapeHtml(settingsMap['keepManualBackups'] || '0')}" class="w-full px-3 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm" /><p class="text-xs text-gray-400 mt-1">Keep the newest N manual backups, prune the oldest. 0 = keep everything.</p></div>
          <div><label class="text-xs text-gray-500 block">Audit log retention (days)</label><input id="set-auditRetentionDays" type="number" min="0" max="3650" value="${escapeHtml(settingsMap['auditRetentionDays'] || '0')}" class="w-full px-3 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm" /><p class="text-xs text-gray-400 mt-1">Delete audit entries older than this many days (0 = keep everything).</p></div>
        </div>
        <div class="bg-gray-50 dark:bg-gray-900 rounded-lg p-3">
          <div class="flex items-center justify-between mb-2">
            <div>
              <p class="text-sm font-semibold">Health</p>
              <p class="text-xs text-gray-400">Backup type, file status and structure check on the live database.</p>
            </div>
            <div class="flex gap-2">
              <button onclick="dbMaintenance('integrity')" class="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700">Check Integrity</button>
              <button onclick="dbMaintenance('compact')" class="px-3 py-1.5 bg-gray-600 text-white rounded-lg text-sm hover:bg-gray-700">Compact</button>
            </div>
          </div>
          <div id="db-health-status" class="text-xs text-gray-400">Loading…</div>
        </div>
      </div>
      <div class="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm glass-card">
        <h3 class="font-bold text-lg mb-4 flex items-center gap-2"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="shrink-0"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>Logs</h3>
        <div class="bg-gray-50 dark:bg-gray-900 rounded-lg p-3">
          <div class="flex items-center justify-between mb-2">
            <div>
              <p class="text-sm font-semibold">App logs</p>
              <p class="text-xs text-gray-400">Rotating log file with app events, renderer errors and crashes.</p>
            </div>
            <div class="flex gap-2">
              <button onclick="openLogsFolder()" class="px-3 py-1.5 bg-gray-600 text-white rounded-lg text-sm hover:bg-gray-700"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="inline-block mr-1 -mt-0.5"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>Open Folder</button>
              <button onclick="loadLogsInfo()" class="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700">Refresh</button>
            </div>
          </div>
          <div id="logs-status" class="text-xs text-gray-400">Loading…</div>
        </div>
      </div>
      <div class="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm glass-card">
        <h3 class="font-bold text-lg mb-4 flex items-center gap-2"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="shrink-0"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg>Quick Items</h3>
        <div class="space-y-2">
          ${state.quickItems.map(q => `<div class="flex items-center gap-2 text-sm"><input class="flex-1 px-2 py-1 border dark:border-gray-700 rounded bg-white dark:bg-gray-800" value="${escapeHtml(q.name)}" data-qi-id="${q.id}" data-field="name" /><input class="w-24 px-2 py-1 border dark:border-gray-700 rounded bg-white dark:bg-gray-800" type="number" step="0.01" value="${q.price}" data-qi-id="${q.id}" data-field="price" /><button onclick="deleteQuickItem(${q.id})" class="text-red-500 text-xs"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="inline-block mr-1 -mt-0.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>Del</button></div>`).join('')}
          <div class="flex gap-2"><input id="new-qi-name" placeholder="Item name" class="flex-1 px-2 py-1.5 border dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-sm" onkeydown="if(event.key==='Enter')addQuickItem()" /><input id="new-qi-price" type="number" step="0.01" placeholder="Price" class="w-24 px-2 py-1.5 border dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-sm" onkeydown="if(event.key==='Enter')addQuickItem()" /><button onclick="addQuickItem()" class="px-3 py-1.5 bg-blue-600 text-white rounded text-sm"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="inline-block mr-1 -mt-0.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>Add</button></div>
        </div>
      </div>
      <div class="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm glass-card">
        <h3 class="font-bold text-lg mb-4 flex items-center gap-2"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="shrink-0"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>Users</h3>
        <div class="overflow-auto mb-3">${state.users.length > 0 ? `<table class="w-full text-sm"><thead><tr class="bg-gray-50 dark:bg-gray-700"><th class="p-2 text-left">Username</th><th class="p-2 text-left">Name</th><th class="p-2 text-left">Role</th><th class="p-2 text-center">Actions</th></tr></thead>
          <tbody>${state.users.map(u => `<tr class="border-b dark:border-gray-700"><td class="p-2">${escapeHtml(u.username)}</td><td class="p-2">${escapeHtml(u.name||'')}</td><td class="p-2"><span class="px-2 py-0.5 rounded-full text-xs ${u.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}">${escapeHtml(u.role)}</span></td>
          <td class="p-2 text-center"><button onclick="openUserModal(${u.id})" class="text-blue-600 text-xs"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="inline-block mr-1 -mt-0.5"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>Edit</button></td></tr>`).join('')}</tbody></table>` : '<p class="text-gray-400 text-sm">No users</p>'}</div>
        <button onclick="openUserModal()" class="px-3 py-1.5 bg-blue-600 text-white rounded text-sm"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="inline-block mr-1 -mt-0.5"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>Add User</button>
      </div>
      <div class="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm glass-card">
        <h3 class="font-bold text-lg mb-4 flex items-center gap-2"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="shrink-0"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>Print Appearance</h3>
        <div class="grid grid-cols-2 gap-3">
          <div><label class="text-xs text-gray-500 block">Stripe Color 1 (even rows)</label><input id="set-printStripeColor1" type="color" value="${settingsMap['printStripeColor1'] || '#f8fafc'}" class="w-full h-9 px-1 py-1 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 cursor-pointer" /></div>
          <div><label class="text-xs text-gray-500 block">Stripe Color 2 (odd rows)</label><input id="set-printStripeColor2" type="color" value="${settingsMap['printStripeColor2'] || '#ffffff'}" class="w-full h-9 px-1 py-1 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 cursor-pointer" /></div>
        </div>
        <p class="text-xs text-gray-400 mt-2">Used for alternating row colors on all printouts (client info, daily report, business report, debt forms).</p>
      </div>
      <div class="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm glass-card">
        <h3 class="font-bold text-lg mb-4 flex items-center gap-2"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="shrink-0"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>Startup &amp; Tray</h3>
        <div class="space-y-3">
          <label class="flex items-center gap-2 text-sm cursor-pointer"><input type="checkbox" id="set-launchAtStartup" ${appPrefs.launchAtStartup ? 'checked' : ''} class="w-4 h-4 text-blue-600 rounded" /> Start with Windows</label>
          <p class="text-xs text-gray-400 -mt-2">Launches the app in the background when the PC starts, so the LAN / mobile server is always available.</p>
          <label class="flex items-center gap-2 text-sm cursor-pointer"><input type="checkbox" id="set-closeToTray" ${appPrefs.closeToTray ? 'checked' : ''} class="w-4 h-4 text-blue-600 rounded" /> Close button hides to tray</label>
          <p class="text-xs text-gray-400 -mt-2">Clicking X keeps the app running in the system tray — mobile access keeps working. Use "Quit" in the tray menu (right-click the tray icon) to fully exit.</p>
        </div>
      </div>
      <div class="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm glass-card">
        <div class="flex items-center justify-between mb-3">
          <h3 class="font-bold text-lg">⚙️ App Version</h3>
          <span class="text-xs text-gray-500 bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded" id="app-version-label">v${installedVersion || settingsMap['lastBuildVersion'] || '3.4.6'}</span>
        </div>
        <p class="text-xs text-gray-400 mb-3">Built from source at <code class="text-blue-500">C:\Users\CDH\Desktop\shop-ledger-ph</code></p>
        <button id="btn-check-update" onclick="checkUpdates()" class="w-full py-3 bg-gradient-to-r from-blue-600 to-indigo-700 text-white rounded-xl hover:from-blue-700 hover:to-indigo-800 font-semibold flex items-center justify-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          <span id="check-update-text">Check for Updates</span>
        </button>
        <p id="update-status" class="text-xs text-gray-400 mt-2 text-center hidden"></p>
        <button id="btn-rebuild" onclick="rebuildApp()" class="w-full mt-2 py-2.5 border dark:border-gray-600 rounded-xl text-sm hover:bg-gray-100 dark:hover:bg-gray-700 font-semibold flex items-center justify-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
          <span id="rebuild-text">Rebuild Installer (from source)</span>
        </button>
        <p id="rebuild-status" class="text-xs text-gray-400 mt-2 text-center hidden"></p>
      </div>
      <div class="sticky bottom-0 bg-white dark:bg-gray-800 -mx-6 px-6 py-3 border-t dark:border-gray-700"><button onclick="saveSettings()" class="w-full py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 font-semibold"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="inline-block mr-1 -mt-0.5"><polyline points="20 6 9 17 4 12"/></svg>Save All Settings</button></div>
    </div>`;
  if (window.electronAPI?.runDbHealth) loadDbHealth();
  if (window.electronAPI?.getLogsInfo) loadLogsInfo();
}

async function loadDbHealth() {
  const holder = document.getElementById('db-health-status');
  if (!holder) return;
  holder.textContent = 'Loading…';
  try {
    const h = await window.electronAPI.runDbHealth('status');
    if (!h?.success) { holder.textContent = 'Backend unavailable: ' + (h?.error || 'unknown'); return; }
    const d = h.details || {};
    const line = v => `<div class="flex justify-between py-0.5"><span class="text-gray-500">${v[0]}</span><span class="font-mono">${v[1]}</span></div>`;
    holder.innerHTML = [
      ['Storage', d.backend === 'sqlite' ? 'SQLite' : (d.backend || 'Unknown')],
      ['Location', d.sqlitePath ? `<span title="${d.sqlitePath}">app data…</span>` : '—'],
      ['Size', d.dbSizeBytes != null ? formatDbBytes(d.dbSizeBytes) : '—'],
      ['Table count', d.tableCount != null ? d.tableCount : '—'],
      ['Schema', d.schemaVersion != null ? 'v' + d.schemaVersion : '—'],
      ['Integrity', d.integrityOk ? '<span class="text-green-600">OK</span>' : (d.integrityResult || 'Unknown')],
      ['Last snapshot', d.lastSnapshot ? d.lastSnapshot : 'None'],
      ['Snapshot count', d.snapshotCount != null ? d.snapshotCount : '—']
    ].map(line).join('');
  } catch (e) { holder.textContent = 'Failed to load: ' + e.message; }
}

export async function loadLogsInfo() {
  const holder = document.getElementById('logs-status');
  if (!holder) return;
  holder.textContent = 'Loading…';
  try {
    if (!window.electronAPI?.getLogsInfo) { holder.textContent = 'Desktop app only'; return; }
    const info = await window.electronAPI.getLogsInfo();
    if (!info || !info.enabled) { holder.innerHTML = 'Logging not configured yet — it activates at app startup.'; return; }
    const line = v => `<div class="flex justify-between py-0.5"><span class="text-gray-500">${v[0]}</span><span class="font-mono">${v[1]}</span></div>`;
    holder.innerHTML = [
      ['File', info.file ? `<span title="${info.file}">logs\shop-ledger.log</span>` : '—'],
      ['Size', info.size != null ? formatDbBytes(info.size) : '—'],
      ['Errors recorded', info.errorCount != null ? info.errorCount : '—']
    ].map(line).join('');
  } catch (e) { holder.textContent = 'Failed to load: ' + e.message; }
}

export async function openLogsFolder() {
  if (!window.electronAPI?.openLogsFolder) { toast('Desktop app only', 'warning'); return; }
  const r = await window.electronAPI.openLogsFolder();
  if (!r || !r.success) toast('Logs folder not available', 'error');
}

function formatDbBytes(n) {
  const v = Number(n) || 0;
  if (v <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(v) / Math.log(1024)), units.length - 1);
  return (v / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1) + ' ' + units[i];
}

export async function dbMaintenance(action) {
  if (!window.electronAPI?.runDbHealth) { toast('Desktop app only', 'warning'); return; }
  toast(action === 'compact' ? 'Compacting database… (may take a moment)' : 'Checking database integrity…', 'info');
  try {
    const r = await window.electronAPI.runDbHealth(action);
    if (r?.success) { toast(action === 'compact' ? 'Database compacted' : 'Integrity check passed', 'success'); }
    else toast((r?.error || 'Maintenance failed') + (r?.details ? ' — ' + (r.details.integrityResult || r.details.error || '') : ''), 'error');
  } catch (e) { toast('Maintenance failed: ' + e.message, 'error'); }
  loadDbHealth();
}

export async function saveSettings() {
  const keys = ['shopName','shopContact','shopAddress','weatherLocation','cloudBackupFolder','cloudBackupPassword','cloudBackupInterval','smsApiKey','smsAlertNumber','smsAutoReminderFreq','smsAutoReminderDay','backupEmail','aiApiKey','aiModel','receiptFooter','receiptHeaderText','printStripeColor1','printStripeColor2','thermalHost','thermalPort','snapshotKeepCount','keepManualBackups','auditRetentionDays'];
  for (const key of keys) {
    const el = document.getElementById(`set-${key}`);
    if (el) {
      const existing = state.settings.find(s => s.key === key);
      if (existing) { existing.value = el.value; await dbPut('settings', existing); }
      else { await dbAdd('settings', { key, value: el.value }); }
    }
  }
  const cb = document.getElementById('set-cloudBackupEnabled');
  if (cb) {
    const val = cb.checked ? 'true' : 'false';
    const existing = state.settings.find(s => s.key === 'cloudBackupEnabled');
    if (existing) { existing.value = val; await dbPut('settings', existing); }
    else { await dbAdd('settings', { key: 'cloudBackupEnabled', value: val }); }
  }
  const remindCb = document.getElementById('set-smsAutoReminderEnabled');
  if (remindCb) {
    const val = remindCb.checked ? 'true' : 'false';
    const existing = state.settings.find(s => s.key === 'smsAutoReminderEnabled');
    if (existing) { existing.value = val; await dbPut('settings', existing); }
    else { await dbAdd('settings', { key: 'smsAutoReminderEnabled', value: val }); }
  }
  const snapCb = document.getElementById('set-autoSnapshotEnabled');
  if (snapCb) {
    const val = snapCb.checked ? 'true' : 'false';
    const existing = state.settings.find(s => s.key === 'autoSnapshotEnabled');
    if (existing) { existing.value = val; await dbPut('settings', existing); }
    else { await dbAdd('settings', { key: 'autoSnapshotEnabled', value: val }); }
  }
  const smtp = { host: document.getElementById('set-smtp-host')?.value || '', port: document.getElementById('set-smtp-port')?.value || '587', user: document.getElementById('set-smtp-user')?.value || '', pass: document.getElementById('set-smtp-pass')?.value || '', fromName: document.getElementById('set-smtp-fromName')?.value || '' };
  const smtpExisting = state.settings.find(s => s.key === 'smtpConfig');
  if (smtpExisting) { smtpExisting.value = JSON.stringify(smtp); await dbPut('settings', smtpExisting); }
  else { await dbAdd('settings', { key: 'smtpConfig', value: JSON.stringify(smtp) }); }
  if (window.electronAPI?.setAppPreferences) {
    const closeEl = document.getElementById('set-closeToTray');
    const launchEl = document.getElementById('set-launchAtStartup');
    if (closeEl || launchEl) {
      await window.electronAPI.setAppPreferences({
        closeToTray: !!(closeEl && closeEl.checked),
        launchAtStartup: !!(launchEl && launchEl.checked)
      });
    }
  }
  for (const el of document.querySelectorAll('[data-qi-id]')) await updateQuickItemField(el);
  state.settings = await dbAll('settings');
  const shop = state.settings.find(x => x.key === 'shopName');
  if (shop) document.getElementById('shop-name').textContent = shop.value;
  toast('Settings saved');
}

export async function updateQuickItemField(el) {
  const id = parseInt(el.dataset.qiId);
  const field = el.dataset.field;
  const val = field === 'price' ? (parseFloat(el.value) || 0) : el.value.trim();
  const item = await dbGet('quickItems', id);
  if (item) { item[field] = val; await dbPut('quickItems', item); }
}

export async function addQuickItem() {
  const nmEl = document.getElementById('new-qi-name');
  const prEl = document.getElementById('new-qi-price');
  if (!nmEl || !prEl) { toast('Form not ready', 'warning'); return; }
  const name = nmEl.value.trim();
  const price = parseFloat(prEl.value) || 0;
  if (requireFields([{ el: nmEl, msg: 'Enter item name' }])) return;
  await dbAdd('quickItems', { name, price });
  state.quickItems = await dbAll('quickItems');
  nmEl.value = '';
  prEl.value = '';
  viewSettings(document.getElementById('view'));
  toast('Quick item added');
}

export async function deleteQuickItem(id) {
  await dbDel('quickItems', id);
  state.quickItems = await dbAll('quickItems');
  viewSettings(document.getElementById('view'));
}

export function uploadReceiptLogo(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async (ev) => {
    const dataUrl = ev.target.result;
    const existing = state.settings.find(s => s.key === 'receiptLogo');
    if (existing) { existing.value = dataUrl; await dbPut('settings', existing); }
    else { await dbAdd('settings', { key: 'receiptLogo', value: dataUrl }); }
    state.settings = await dbAll('settings');
    const preview = document.getElementById('logo-preview');
    if (preview) preview.innerHTML = `<img src="${escapeHtml(dataUrl)}" class="w-full h-full object-contain" />`;
    toast('Logo uploaded');
  };
  reader.readAsDataURL(file);
}

export async function removeReceiptLogo() {
  const existing = state.settings.find(s => s.key === 'receiptLogo');
  if (existing) { await dbDel('settings', existing.id); }
  state.settings = await dbAll('settings');
  const preview = document.getElementById('logo-preview');
  if (preview) preview.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="text-gray-300 mx-auto"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>';
  toast('Logo removed');
}

export async function selectCloudFolder() {
  if (!window.electronAPI) { toast('Folder selection only in desktop app', 'warning'); return; }
  const result = await window.electronAPI.selectFolder();
  if (result.success) {
    document.getElementById('set-cloudBackupFolder').value = result.path;
  }
}

export async function runCloudBackupNow() {
  const status = document.getElementById('cloud-backup-status');
  const setStatus = (msg, cls) => { if (status) { status.textContent = msg; status.className = 'text-xs ' + (cls || 'text-gray-400'); } };
  if (typeof runCloudBackup !== 'function') { setStatus('Not available in this app', 'text-red-500'); return; }
  await saveSettings();
  setStatus('Backing up...', 'text-yellow-500');
  try {
    await runCloudBackup();
    setStatus('Done', 'text-green-500');
    const lb = document.getElementById('last-backup-text');
    if (lb) lb.textContent = new Date().toLocaleString();
    viewSettings(document.getElementById('view'));
  } catch (err) {
    setStatus('Failed: ' + err.message, 'text-red-500');
  }
}

export async function sendTestSMS() {
  const status = document.getElementById('sms-test-status');
  const setStatus = (msg, cls) => { if (status) { status.textContent = msg; status.className = 'text-xs ' + (cls || 'text-gray-400'); } };
  if (!window.electronAPI?.sendSMS) { setStatus('SMS only in desktop app', 'text-red-500'); return; }
  const settingsMap = {};
  state.settings.forEach(s => settingsMap[s.key] = s.value);
  const apiKey = document.getElementById('set-smsApiKey')?.value || settingsMap['smsApiKey'] || '';
  const number = document.getElementById('set-smsAlertNumber')?.value || settingsMap['smsAlertNumber'] || '';
  if (!apiKey) { setStatus('Enter Semaphore API key first', 'text-red-500'); return; }
  if (!number) { setStatus('Enter SMS Alert Number first', 'text-red-500'); return; }
  setStatus('Sending...', 'text-yellow-500');
  const result = await window.electronAPI.sendSMS({ apiKey, number, message: 'Shop Ledger PH test message — your SMS alerts are working!' });
  if (result.success) setStatus('Sent!', 'text-green-500');
  else setStatus('Failed: ' + (result.error || 'Unknown error'), 'text-red-500');
}

export async function sendRemindersNow() {
  const status = document.getElementById('sms-reminder-status');
  const setStatus = (msg, cls) => { if (status) { status.textContent = msg; status.className = 'text-xs ' + (cls || 'text-gray-400'); } };
  if (!window.electronAPI?.sendSMS) { setStatus('SMS only in desktop app', 'text-red-500'); return; }
  await saveSettings();
  setStatus('Sending...', 'text-yellow-500');
  try {
    const res = await sendOverdueReminders();
    if (res.error) { setStatus(res.error, 'text-red-500'); return; }
    if (res.total === 0) setStatus('No overdue clients with phone numbers', 'text-gray-400');
    else if (res.failed > 0) setStatus(`Sent ${res.sent}/${res.total} · ${res.failed} failed`, 'text-yellow-500');
    else setStatus(`Sent to ${res.sent} client(s)!`, 'text-green-500');
    const lb = document.getElementById('last-reminder-text');
    if (lb) lb.textContent = new Date().toLocaleString();
  } catch (err) {
    setStatus('Failed: ' + err.message, 'text-red-500');
  }
}

export async function testThermalPrint() {
  const status = document.getElementById('thermal-test-status');
  const setStatus = (msg, cls) => { if (status) { status.textContent = msg; status.className = 'text-xs ' + (cls || 'text-gray-400'); } };
  if (!window.electronAPI?.printThermal) { setStatus('Thermal printing only in desktop app', 'text-red-500'); return; }
  const settingsMap = {};
  state.settings.forEach(s => settingsMap[s.key] = s.value);
  const host = document.getElementById('set-thermalHost')?.value || settingsMap['thermalHost'] || '';
  const port = document.getElementById('set-thermalPort')?.value || settingsMap['thermalPort'] || '9100';
  if (!host) { setStatus('Enter printer IP first', 'text-red-500'); return; }
  const shop = settingsMap['shopName'] || 'Shop Ledger PH';
  setStatus('Printing...', 'text-yellow-500');
  const result = await window.electronAPI.printThermal({
    host, port,
    lines: [
      { t: 'center', bold: true, size: 'double', text: shop },
      { t: 'center', text: 'TEST RECEIPT' },
      { t: 'divider' },
      { text: 'Date: ' + new Date().toLocaleString() },
      { t: 'divider' },
      { text: 'If you can read this, your' },
      { text: 'thermal printer is ready!' },
      { t: 'spacer' },
      { t: 'center', text: 'Thank you for your patronage!' },
      { t: 'spacer' }
    ]
  });
  if (result.success) setStatus('Printed!', 'text-green-500');
  else setStatus('Failed: ' + (result.error || 'Unknown error'), 'text-red-500');
}

export function openUserModal(id) {
  const isEdit = !!id;
  const u = isEdit ? state.users.find(x => x.id === id) : null;
  modal(`
    <div class="p-6">
      <div class="flex justify-between items-center mb-4"><h3 class="text-xl font-bold">${isEdit ? 'Edit' : 'New'} User</h3><button onclick="closeModal()" class="text-gray-400 hover:text-gray-600"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button></div>
      <div class="space-y-3">
        <div><label class="text-xs text-gray-500 block">Username *</label><input id="uf-username" value="${isEdit ? escapeHtml(u.username||'') : ''}" ${isEdit ? 'disabled' : ''} class="w-full px-3 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800" /></div>
        <div><label class="text-xs text-gray-500 block">Name</label><input id="uf-name" value="${isEdit ? escapeHtml(u.name||'') : ''}" class="w-full px-3 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800" /></div>
        <div><label class="text-xs text-gray-500 block">Password *${isEdit ? ' (leave blank to keep)' : ''}</label><input id="uf-password" type="password" class="w-full px-3 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800" /></div>
        <div><label class="text-xs text-gray-500 block">Role</label><select id="uf-role" class="w-full px-3 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800"><option value="admin" ${isEdit && u.role === 'admin' ? 'selected' : ''}>Admin</option><option value="staff" ${isEdit && u.role === 'staff' ? 'selected' : ''}>Staff</option></select></div>
        <div class="flex gap-2 pt-2">
          <button onclick="saveUser(${isEdit ? id : 'null'})" class="flex-1 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="inline-block mr-1 -mt-0.5"><polyline points="20 6 9 17 4 12"/></svg>${isEdit ? 'Update' : 'Save'}</button>
          <button onclick="closeModal()" class="px-4 py-2 bg-gray-200 dark:bg-gray-700 rounded-lg"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="inline-block mr-1 -mt-0.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>Cancel</button>
        </div>
      </div>
    </div>`);
}

export async function saveUser(id) {
  const unEl = document.getElementById('uf-username');
  const pwEl = document.getElementById('uf-password');
  const nmEl = document.getElementById('uf-name');
  const rlEl = document.getElementById('uf-role');
  if (!unEl || !pwEl || !nmEl || !rlEl) { toast('Form not ready', 'error'); return; }
  const username = unEl.value.trim();
  const password = pwEl.value;
  const name = nmEl.value.trim();
  const role = rlEl.value;
  if (requireFields([
    { el: unEl, msg: 'Please fill out this field' },
    { el: pwEl, test: () => !!(id || password), msg: 'Password required' }
  ])) return;
  if (id) {
    const u = await dbGet('users', id);
    u.name = name; u.role = role;
    if (password) u.password = await hashPassword(password);
    await dbPut('users', u);
    toast('User updated');
  } else {
    await dbAdd('users', { username, password: await hashPassword(password), name, role });
    toast('User added');
  }
  closeModal();
  state.users = await dbAll('users');
  viewSettings(document.getElementById('view'));
}

export async function checkUpdates() {
  const btn = document.getElementById('btn-check-update');
  const text = document.getElementById('check-update-text');
  const status = document.getElementById('update-status');
  if (!btn || !text || !status) return;
  if (!window.electronAPI?.checkUpdate) { status.textContent = 'Update check only available in the desktop app.'; status.className = 'text-xs text-yellow-500 mt-2 text-center'; status.classList.remove('hidden'); return; }
  btn.disabled = true;
  text.textContent = 'Checking...';
  status.className = 'text-xs text-gray-400 mt-2 text-center';
  status.textContent = 'Checking GitHub for the latest version...';
  status.classList.remove('hidden');
  try {
    const result = await window.electronAPI.checkUpdate();
    if (!result.success) {
      status.textContent = result.error || 'Update check unavailable';
      status.className = 'text-xs text-yellow-500 mt-2 text-center';
      toast(result.error || 'Update check unavailable', 'warning');
    }
  } catch (err) {
    status.textContent = 'Update check failed: ' + err.message;
    status.className = 'text-xs text-red-500 mt-2 text-center';
  }
  text.textContent = 'Check for Updates';
  btn.disabled = false;
}

export async function rebuildApp() {
  if (!window.electronAPI?.rebuildApp) { toast('Rebuild only available in desktop app', 'warning'); return; }
  const btn = document.getElementById('btn-rebuild');
  const text = document.getElementById('rebuild-text');
  const status = document.getElementById('rebuild-status');
  if (!btn || !text || !status) return;
  btn.disabled = true;
  text.textContent = 'Building...';
  status.className = 'text-xs text-yellow-500 mt-2 text-center';
  status.textContent = 'Running npm run build:win — this may take a minute...';
  status.classList.remove('hidden');
  try {
    const result = await window.electronAPI.rebuildApp();
    if (result.success) {
      let version = '3.4.8';
      const verRes = await fetch('version.json?' + Date.now());
      if (verRes.ok) { try { const v = await verRes.json(); if (v.version) { version = v.version; const s = state.settings.find(x => x.key === 'lastBuildVersion'); if (s) { s.value = v.version; await dbPut('settings', s); } else { await dbAdd('settings', { key: 'lastBuildVersion', value: v.version }); } } } catch(e) {} }
      status.className = 'text-xs text-green-500 mt-2 text-center';
      status.textContent = `Build complete! Installer at build/Shop-Ledger-PH-Setup-${version}.exe, portable at build/Shop-Ledger-PH-${version}-portable.exe`;
      text.textContent = 'Rebuild Complete ✓';
      btn.className = 'w-full py-3 bg-green-600 text-white rounded-xl font-semibold flex items-center justify-center gap-2';
      toast('Build successful — run the new .exe to update');
    } else {
      throw new Error(result.error);
    }
  } catch (err) {
    status.className = 'text-xs text-red-500 mt-2 text-center';
    status.textContent = 'Build failed: ' + err.message;
    text.textContent = 'Rebuild & Restart .exe';
    btn.disabled = false;
    btn.className = 'w-full py-3 bg-gradient-to-r from-blue-600 to-indigo-700 text-white rounded-xl hover:from-blue-700 hover:to-indigo-800 font-semibold flex items-center justify-center gap-2';
  }
}


// expose top-level bindings as globals (inline onclick handlers and legacy code paths rely on them)
Object.defineProperties(window, {
  viewSettings: { get: () => viewSettings, configurable: true },
  saveSettings: { get: () => saveSettings, configurable: true },
  updateQuickItemField: { get: () => updateQuickItemField, configurable: true },
  addQuickItem: { get: () => addQuickItem, configurable: true },
  deleteQuickItem: { get: () => deleteQuickItem, configurable: true },
  uploadReceiptLogo: { get: () => uploadReceiptLogo, configurable: true },
  removeReceiptLogo: { get: () => removeReceiptLogo, configurable: true },
  selectCloudFolder: { get: () => selectCloudFolder, configurable: true },
  runCloudBackupNow: { get: () => runCloudBackupNow, configurable: true },
  sendTestSMS: { get: () => sendTestSMS, configurable: true },
  sendRemindersNow: { get: () => sendRemindersNow, configurable: true },
  testThermalPrint: { get: () => testThermalPrint, configurable: true },
  openUserModal: { get: () => openUserModal, configurable: true },
  saveUser: { get: () => saveUser, configurable: true },
  dbMaintenance: { get: () => dbMaintenance, configurable: true },
  loadLogsInfo: { get: () => loadLogsInfo, configurable: true },
  openLogsFolder: { get: () => openLogsFolder, configurable: true },
  checkUpdates: { get: () => checkUpdates, configurable: true },
  rebuildApp: { get: () => rebuildApp, configurable: true }
});
