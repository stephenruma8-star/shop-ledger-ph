// ---------- PHONE WEATHER + HOLIDAYS ----------
// Same sources as the desktop dashboard (wttr.in + nager.at with a built-in
// fallback list), shrunk to a home-screen card. Phone-specific differences:
// location lives in localStorage (per phone, no server round-trip) and the
// holiday cache too. Everything fails soft to cache/offline text — weather
// is a convenience, never a blocker. No imports/exports: concatenated.
const PH_HOLIDAYS_FALLBACK = {
  '01-01': "New Year's Day",
  '02-25': 'EDSA People Power Revolution',
  '04-09': 'Day of Valor',
  '05-01': 'Labor Day',
  '06-12': 'Independence Day',
  '08-21': 'Ninoy Aquino Day',
  '08-28': 'National Heroes Day',
  '11-01': "All Saints' Day",
  '11-02': "All Souls' Day",
  '11-30': 'Bonifacio Day',
  '12-08': 'Feast of the Immaculate Conception',
  '12-24': 'Christmas Eve',
  '12-25': 'Christmas Day',
  '12-30': 'Rizal Day',
  '12-31': "New Year's Eve"
};
function weatherEmoji(code) {
  const n = parseInt(code);
  if (n === 113) return '☀️';
  if (n >= 116 && n <= 119) return '⛅';
  if (n >= 122 && n <= 143) return '☁️';
  if (n >= 176 && n <= 200) return '🌧️';
  if (n >= 227 && n <= 230) return '🌨️';
  if (n >= 248 && n <= 260) return '🌫️';
  if (n >= 263 && n <= 389) return '⛈️';
  return '🌤️';
}
function weatherLocGet() {
  try { return localStorage.getItem('slpWeatherLoc') || 'Manila'; } catch (e) { return 'Manila'; }
}
function weatherLocSet(v) {
  try { localStorage.setItem('slpWeatherLoc', String(v || '').trim().slice(0, 60) || 'Manila'); } catch (e) {}
}
function weatherCacheGet() {
  try { return JSON.parse(localStorage.getItem('weatherCache') || 'null'); } catch (e) { return null; }
}
function weatherHTML(c, staleMin) {
  return `<div class="flex items-center gap-2"><div class="text-2xl">${weatherEmoji(c.ic)}</div><div class="min-w-0">`
    + `<p class="text-lg font-bold leading-tight num">${c.temp}°C</p>`
    + `<p class="text-xs text-gray-500 truncate">${esc(c.desc || '')}</p>`
    + `<p class="text-[11px] text-gray-400 truncate">${esc(c.city || '')}${staleMin > 30 ? ' · ' + staleMin + 'm ago' : ''}</p>`
    + `</div></div>`;
}
async function loadPhoneWeather() {
  const el = document.getElementById('weather-display');
  if (!el) return;
  const cache = weatherCacheGet();
  const now = Date.now();
  if (cache && cache.temp != null) {
    const ago = Math.round((now - (cache.ts || 0)) / 60000);
    el.innerHTML = weatherHTML(cache, ago);
    if (ago < 30) return;
  } else {
    el.innerHTML = '<p class="text-gray-400 text-xs py-2">Loading weather…</p>';
  }
  try {
    const loc = weatherLocGet();
    const res = await fetch('https://wttr.in/' + encodeURIComponent(loc) + '?format=j1');
    if (!res.ok) throw new Error('weather fetch failed');
    const data = await res.json();
    const c = (data.current_condition || [])[0] || {};
    const area = (data.nearest_area || [])[0] || {};
    const city = [(area.areaName || [])[0], (area.region || [])[0]].map(x => (x && x.value) || '').filter(Boolean).join(', ') || loc;
    const fresh = {
      temp: c.temp_C, desc: ((c.weatherDesc || [])[0] || {}).value || '',
      hum: c.humidity, wind: (c.wind_Kmph || '') + ' km/h ' + (c.windDir || ''),
      ic: c.weatherCode, city, ts: now
    };
    try { localStorage.setItem('weatherCache', JSON.stringify(fresh)); } catch (e) {}
    const box = document.getElementById('weather-display');
    if (box) box.innerHTML = weatherHTML(fresh, 0);
  } catch (e) {
    if (!cache || cache.temp == null) {
      const box = document.getElementById('weather-display');
      if (box) box.innerHTML = '<p class="text-xs text-gray-400 py-1">🌤 Weather needs internet</p>';
    }
  }
}
// Pure: next upcoming holiday on/after `today` (YYYY-MM-DD) from a list.
function nextHoliday(holidays, today) {
  const up = (holidays || []).filter(h => h && h.date >= today)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
  return up[0] || null;
}
function holidayDaysAway(dateStr, today) {
  const ms = new Date(dateStr + 'T00:00:00').getTime() - new Date(today + 'T00:00:00').getTime();
  return Math.max(0, Math.round(ms / 86400000));
}
function fillFallbackHolidays(year, holidays) {
  const seen = new Set((holidays || []).map(h => h.date));
  const out = (holidays || []).slice();
  for (const mmdd of Object.keys(PH_HOLIDAYS_FALLBACK)) {
    const date = year + '-' + mmdd;
    if (!seen.has(date)) out.push({ date, localName: PH_HOLIDAYS_FALLBACK[mmdd], name: PH_HOLIDAYS_FALLBACK[mmdd] });
  }
  return out;
}
async function loadYearHolidays(year) {
  const key = 'slpHolidays_' + year;
  try {
    const kept = JSON.parse(localStorage.getItem(key) || 'null');
    if (Array.isArray(kept) && kept.length) return kept;
  } catch (e) {}
  try {
    const res = await fetch('https://date.nager.at/api/v3/publicholidays/' + year + '/PH');
    if (res.ok) {
      const list = fillFallbackHolidays(year, await res.json());
      try { localStorage.setItem(key, JSON.stringify(list)); } catch (e) {}
      return list;
    }
  } catch (e) {}
  return fillFallbackHolidays(year, []);
}
function localTodayStr() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
async function loadPhoneHolidays() {
  const el = document.getElementById('next-holiday');
  if (!el) return;
  try {
    const y = new Date().getFullYear();
    const years = [y].concat(new Date().getMonth() >= 9 ? [y + 1] : []);
    let all = [];
    for (const yy of years) all = all.concat(await loadYearHolidays(yy));
    const nx = nextHoliday(all, localTodayStr());
    if (!nx) { el.innerHTML = '<p class="text-[11px] text-gray-500">No upcoming holidays</p>'; return; }
    const days = holidayDaysAway(nx.date, localTodayStr());
    el.innerHTML = `<button onclick="showPhoneHolidays()" class="w-full text-left">`
      + `<p class="text-sm font-bold text-gray-200 truncate">🎉 ${esc(nx.localName || nx.name || 'Holiday')}</p>`
      + `<p class="text-[11px] text-gray-500">${esc(nx.date)}${days === 0 ? ' · today!' : days === 1 ? ' · tomorrow' : ' · in ' + days + ' days'}</p></button>`;
  } catch (e) {
    el.innerHTML = '<p class="text-[11px] text-gray-500">Holidays unavailable offline</p>';
  }
}
async function showPhoneHolidays() {
  const y = new Date().getFullYear();
  const years = [y].concat(new Date().getMonth() >= 9 ? [y + 1] : []);
  let all = [];
  for (const yy of years) all = all.concat(await loadYearHolidays(yy));
  const today = localTodayStr();
  all.sort((a, b) => String(a.date).localeCompare(String(b.date)));
  document.getElementById('modal-root').innerHTML = `
    <div class="fixed inset-0 bg-black/70 z-[45] flex items-end sm:items-center justify-center fade-in" onclick="if(event.target===this)closeQuick()">
      <div class="w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-4 pb-6 slide-up glass-card" style="max-height:92dvh;overflow-y:auto" onclick="event.stopPropagation()">
        <div class="grabber mb-3" style="margin-bottom:.9rem"></div>
        <h3 class="font-bold text-gray-100 text-sm mb-3 flex items-center gap-2"><span class="icon-tile bg-cyan-500/15 text-cyan-400"><svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg></span>🇵🇭 Philippine Holidays</h3>
        <div class="space-y-1.5">
          ${all.map(h => `
          <div class="flex justify-between text-sm gap-2 py-1 ${h.date < today ? 'opacity-45' : ''}">
            <span class="text-gray-200 truncate">${esc(h.localName || h.name || '')}</span>
            <span class="text-[11px] text-gray-500 shrink-0 num">${esc(h.date)}</span>
          </div>`).join('') || '<p class="text-sm text-gray-500 text-center py-4">No holidays found.</p>'}
        </div>
        <button onclick="closeQuick()" class="btn btn-ghost w-full mt-3">Close</button>
      </div>
    </div>`;
}
function updateWeatherRow() {
  const box = document.getElementById('weather-row');
  if (!box) return;
  box.innerHTML = `
    <div class="flex gap-2">
      <input id="wx-loc" type="text" maxlength="60" value="${esc(weatherLocGet())}" placeholder="City (e.g. Manila)" autocomplete="off" class="inp flex-1" />
      <button onclick="saveWeatherLoc()" class="btn btn-ghost btn-sm shrink-0">Set</button>
    </div>`;
}
function saveWeatherLoc() {
  const v = ((document.getElementById('wx-loc') || {}).value || '').trim();
  weatherLocSet(v || 'Manila');
  try { localStorage.removeItem('weatherCache'); } catch (e) {}
  toast('Weather location saved', 'ok');
  loadPhoneWeather();
}
