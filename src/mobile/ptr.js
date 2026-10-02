// ---------- pull to refresh ----------
// Drag down from the very top to re-sync. Chrome's native reload is disabled
// via overscroll-behavior (a reload would wipe the in-memory cart).
function setupPullRefresh() {
  let startY = null;
  try {
    window.addEventListener('touchstart', (e) => {
      try {
        if ((e.touches || []).length !== 1) { startY = null; return; }
        startY = e.touches[0].clientY;
      } catch (err) { startY = null; }
    }, { passive: true });
    window.addEventListener('touchmove', (e) => {
      try {
        if (startY === null || (e.touches || []).length !== 1) return;
        const dy = e.touches[0].clientY - startY;
        if (dy < 80) return;
        startY = null;
        if (!getToken() || (pinHashGet() && !pinSessionOk())) return;
        if (navModalOpen || document.getElementById('pin-lock')) return;
        try {
          const sc = document.getElementById('scan-overlay');
          if (sc && sc.style.display !== 'none') return;
        } catch (err) {}
        const ae = document.activeElement;
        if (ae && /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName || '')) return;
        if ((window.scrollY || 0) > 0) return;
        if (refreshBusy) return;
        const cs = document.getElementById('conn-status');
        if (cs) cs.textContent = T('common.refreshing');
        refreshAll();
      } catch (err) {}
    }, { passive: true });
    window.addEventListener('touchend', () => { startY = null; }, { passive: true });
  } catch (e) {}
}
function apiPostRaw(path, body, method) {
  return fetchTimeout(API + path, { method: method || 'POST', headers: { 'Content-Type': 'application/json', ...HDR() }, body: JSON.stringify(body) })
    .then(async (r) => {
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.success) throw new Error(j.error || 'HTTP ' + r.status);
      return j;
    });
}
async function apiPost(path, body, method) {
  try { return await apiPostRaw(path, body, method); }
  catch (e) {
    if (!e || (e.name !== 'TypeError' && e.name !== 'AbortError')) throw e;
    queueOp(path, body, method);
    return { success: true, queued: true };
  }
}

