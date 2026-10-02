// ---------- display prefs (day mode + text size) ----------
function phoneTheme() { try { return localStorage.getItem('slpTheme') || 'dark'; } catch (e) { return 'dark'; } }
function phoneTextSize() { try { return localStorage.getItem('slpText') || 'normal'; } catch (e) { return 'normal'; } }
function applyDisplayPrefs() {
  try {
    document.body.classList.toggle('day', phoneTheme() === 'day');
    document.body.classList.toggle('big-text', phoneTextSize() === 'large');
  } catch (e) {}
  // Native status bar follows the theme so the chrome never clashes.
  try {
    const S = nativePlugin('StatusBar');
    if (S && typeof S.setBackgroundColor === 'function') {
      S.setBackgroundColor({ color: phoneTheme() === 'day' ? '#e8edf3' : '#0f172a' }).catch(() => {});
    }
  } catch (e) {}
}
function setPhoneTheme(v) {
  try { localStorage.setItem('slpTheme', v === 'day' ? 'day' : 'dark'); } catch (e) {}
  applyDisplayPrefs(); updateDisplayRow();
}
function setPhoneText(v) {
  try { localStorage.setItem('slpText', v === 'large' ? 'large' : 'normal'); } catch (e) {}
  applyDisplayPrefs(); updateDisplayRow();
}
function updateDisplayRow() {
  const box = document.getElementById('display-row');
  if (!box) return;
  const theme = phoneTheme(), text = phoneTextSize();
  const seg = (cur, a, b, fn, labels) => `
    <div class="flex rounded-xl overflow-hidden" style="border:1px solid rgba(125,125,125,.25)">
      <button onclick="${fn}('${a}')" class="flex-1 py-2 text-sm font-semibold" style="${cur === a ? 'background:#2563eb;color:#fff' : 'opacity:.65'}">${labels[a]}</button>
      <button onclick="${fn}('${b}')" class="flex-1 py-2 text-sm font-semibold" style="${cur === b ? 'background:#2563eb;color:#fff' : 'opacity:.65'}">${labels[b]}</button>
    </div>`;
  const themeLabels = { dark: T('set.dark'), day: T('set.day') };
  const textLabels = { normal: T('set.normal'), large: T('set.large') };
  box.innerHTML = `
    <div class="text-[11px] text-gray-500 mb-1">${T('set.theme_label')}</div>
    ${seg(theme, 'dark', 'day', 'setPhoneTheme', themeLabels)}
    <div class="text-[11px] text-gray-500 mt-2 mb-1">${T('set.text_label')}</div>
    ${seg(text, 'normal', 'large', 'setPhoneText', textLabels)}
    <div class="text-[11px] text-gray-500 mt-2 mb-1">${T('set.lang_title')}</div>
    ${seg(phoneLang(), 'en', 'fil', 'setPhoneLang', { en: 'English', fil: 'Filipino' })}
    <p class="text-[11px] text-gray-500 mt-1">${T('set.lang_desc')}</p>`;
}
