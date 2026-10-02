// ---------- HELP & GUIDE (works for every role) ----------
async function renderHelp() {
  const v = document.getElementById('view');
  const sec = (titleKey, bodyKey) => `
    <section class="glass-card rounded-2xl p-4 mb-2.5 fade-in">
      <h3 class="card-title mb-2">${T(titleKey)}</h3>
      <div class="text-xs text-gray-300 space-y-1.5 leading-relaxed">${T(bodyKey)}</div>
    </section>`;
  v.innerHTML = `
    <h2 class="card-title text-base mb-3 fade-in"><span class="icon-tile bg-cyan-500/15 text-cyan-400"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg></span>${T('view.help.title')}</h2>
    ${sec('help.s1t', 'help.s1b')}
    ${sec('help.s2t', 'help.s2b')}
    ${sec('help.s3t', 'help.s3b')}
    ${sec('help.s4t', 'help.s4b')}
    ${sec('help.s5t', 'help.s5b')}
    ${sec('help.s6t', 'help.s6b')}`;
}
