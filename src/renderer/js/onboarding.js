import { logAudit } from './auth.js'
import { dbAdd, dbAll, dbPut } from './database.js'
import { closeModal, escapeHtml, modal, toast } from './helpers.js'
import { state } from './state.js'

let _obStep = 1;
const _ONB_DEFAULT_FOOTER = 'Thank you for your purchase!';

function setSettingKV(key, value) {
  const existing = state.settings.find(s => s.key === key);
  if (existing) { existing.value = value; return dbPut('settings', existing); }
  return dbAdd('settings', { key, value });
}

export function maybeOnboard() {
  if (!state.user || state.user.role !== 'admin') return;
  const settingsMap = {};
  state.settings.forEach(s => settingsMap[s.key] = s.value);
  if (settingsMap['onboardingDone'] === 'true') return;
  if (settingsMap['shopName'] && settingsMap['shopName'] !== 'My Sari-Sari Store') return;
  return showOnboarding();
}

export function showOnboarding() {
  _obStep = 1;
  renderOnb();
}

function renderOnb() {
  const settingsMap = {};
  state.settings.forEach(s => settingsMap[s.key] = s.value);
  const step1 = `
    <div class="p-6">
      <div class="flex justify-between items-center mb-4">
        <h3 class="text-xl font-bold">👋 Welcome! Set up your store</h3>
        <button onclick="closeModal()" class="text-gray-400 hover:text-gray-600" aria-label="Close"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
      </div>
      <p class="text-sm text-gray-500 mb-4">These details appear on receipts and in reports. You can change them anytime in Settings.</p>
      <div class="space-y-3">
        <div><label class="text-xs text-gray-500 block mb-1">Store name *</label><input id="onb-name" value="${escapeHtml(settingsMap['shopName'] || '')}" class="w-full px-3 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800" placeholder="e.g. Aling Nena's Store" /></div>
        <div><label class="text-xs text-gray-500 block mb-1">Contact number</label><input id="onb-contact" value="${escapeHtml(settingsMap['shopContact'] || '')}" class="w-full px-3 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800" placeholder="e.g. 0917 123 4567" /></div>
        <div><label class="text-xs text-gray-500 block mb-1">Address</label><input id="onb-address" value="${escapeHtml(settingsMap['shopAddress'] || '')}" class="w-full px-3 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800" placeholder="e.g. Poblacion, Manila" /></div>
      </div>
      <div class="flex gap-2 pt-4">
        <div class="flex-1 text-xs text-gray-400 self-center">Step 1 of 2 — Store details</div>
        <button onclick="closeModal()" class="px-4 py-2 border dark:border-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">Skip</button>
        <button onclick="onbNext()" class="px-5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold">Next →</button>
      </div>
    </div>`;
  const step2 = `
    <div class="p-6">
      <div class="flex justify-between items-center mb-4">
        <h3 class="text-xl font-bold">Receipt footer</h3>
        <button onclick="closeModal()" class="text-gray-400 hover:text-gray-600" aria-label="Close"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
      </div>
      <p class="text-sm text-gray-500 mb-4">A short thank-you message printed at the bottom of every receipt.</p>
      <div><label class="text-xs text-gray-500 block mb-1">Footer text</label><input id="onb-footer" value="${escapeHtml(settingsMap['receiptFooter'] || _ONB_DEFAULT_FOOTER)}" class="w-full px-3 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800" placeholder="Salamat po sa pagbili!" /></div>
      <div class="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-sm text-blue-700 dark:text-blue-300">💡 Everything else — quick items, low-stock alerts, cloud backup, SMS reminders — can be set up later in Settings.</div>
      <div class="flex gap-2 pt-4">
        <button onclick="onbBack()" class="px-4 py-2 border dark:border-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">← Back</button>
        <div class="flex-1 text-xs text-gray-400 self-center">Step 2 of 2 — Receipts</div>
        <button onclick="onbFinish()" class="px-5 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-semibold">✓ Finish setup</button>
      </div>
    </div>`;
  modal(`<div class="w-[420px] max-w-full">${_obStep === 1 ? step1 : step2}</div>`);
}

export async function onbNext() {
  const name = (document.getElementById('onb-name').value || '').trim();
  if (!name) { toast('Enter your store name', 'warning'); return; }
  await setSettingKV('shopName', name);
  await setSettingKV('shopContact', (document.getElementById('onb-contact').value || '').trim());
  await setSettingKV('shopAddress', (document.getElementById('onb-address').value || '').trim());
  _obStep = 2;
  renderOnb();
}

export function onbBack() { _obStep = 1; renderOnb(); }

export async function onbFinish() {
  await setSettingKV('receiptFooter', (document.getElementById('onb-footer').value || '').trim() || _ONB_DEFAULT_FOOTER);
  await setSettingKV('onboardingDone', 'true');
  state.settings = await dbAll('settings');
  const shop = state.settings.find(x => x.key === 'shopName');
  const nameEl = document.getElementById('shop-name');
  if (shop && nameEl) nameEl.textContent = shop.value;
  closeModal();
  await logAudit('setup', `Store setup completed (${shop ? shop.value : ''})`);
  toast('Store setup complete', 'success');
}

Object.defineProperties(window, {
  maybeOnboard: { get: () => maybeOnboard, configurable: true },
  showOnboarding: { get: () => showOnboarding, configurable: true },
  onbNext: { get: () => onbNext, configurable: true },
  onbBack: { get: () => onbBack, configurable: true },
  onbFinish: { get: () => onbFinish, configurable: true }
});