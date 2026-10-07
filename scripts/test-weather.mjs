// Weather/holidays unit tests: pure logic + offline paths with stubbed
// localStorage/fetch/DOM. No network is touched (fetch stub rejects).
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(resolve(root, 'src', 'mobile', 'weather.js'), 'utf8');

function makeSandbox(fetchImpl) {
  const store = {};
  const els = {};
  const sandbox = {
    console,
    localStorage: {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: (k) => { delete store[k]; }
    },
    fetch: fetchImpl || (() => Promise.reject(new Error('offline'))),
    document: { getElementById: (id) => (els[id] || (els[id] = { innerHTML: '' })) },
    navigator: {},
    nativePlugin: () => null,
    toast: () => {}
  };
  vm.createContext(sandbox);
  vm.runInContext('function esc(s){return String(s==null?"":s);}', sandbox);
  vm.runInContext(src, sandbox);
  return { sandbox, store, els };
}

let pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) pass++;
  else { fail++; console.error('FAIL - ' + name); }
}

{
  const { sandbox: s } = makeSandbox();
  ok(s.weatherEmoji(113) === '☀️', 'emoji sun');
  ok(s.weatherEmoji(118) === '⛅', 'emoji partly cloudy');
  ok(s.weatherEmoji(130) === '☁️', 'emoji overcast');
  ok(s.weatherEmoji(185) === '🌧️', 'emoji rain');
  ok(s.weatherEmoji(230) === '🌨️', 'emoji snow');
  ok(s.weatherEmoji(250) === '🌫️', 'emoji fog');
  ok(s.weatherEmoji(300) === '⛈️', 'emoji storm');
  ok(s.weatherEmoji(999) === '🌤️', 'emoji default');
  const list = [
    { date: '2026-10-01', localName: 'Past' },
    { date: '2026-12-25', localName: 'Christmas Day' },
    { date: '2026-11-30', localName: 'Bonifacio Day' }
  ];
  ok(s.nextHoliday(list, '2026-10-06').localName === 'Bonifacio Day', 'next upcoming picked');
  ok(s.nextHoliday(list, '2027-01-01') === null, 'null when none upcoming');
  ok(s.nextHoliday([], '2026-10-06') === null, 'null when empty');
  ok(s.holidayDaysAway('2026-10-06', '2026-10-06') === 0, 'days away today');
  ok(s.holidayDaysAway('2026-10-07', '2026-10-06') === 1, 'days away tomorrow');
  ok(s.holidayDaysAway('2026-12-25', '2026-10-06') === 80, 'days away span');
  const filled = s.fillFallbackHolidays(2026, [{ date: '2026-12-25', localName: 'X' }]);
  ok(filled.filter(h => h.date === '2026-12-25').length === 1, 'fallback does not duplicate');
  ok(filled.some(h => h.date === '2026-06-12'), 'fallback adds Independence Day');
}
{
  // offline: holidays fall back to built-in list, weather shows offline text
  const { sandbox: s, els } = makeSandbox();
  const years = await s.loadYearHolidays(2026);
  ok(Array.isArray(years) && years.some(h => h.date === '2026-12-25'), 'offline holiday fallback list');
  await s.loadPhoneWeather();
  ok(els['weather-display'].innerHTML.includes('needs internet'), 'offline weather message');
  await s.loadPhoneHolidays();
  ok(els['next-holiday'].innerHTML.includes('🎉') || els['next-holiday'].innerHTML.includes('No upcoming'), 'next holiday renders offline');
}
{
  // fresh cache renders with zero fetches
  let fetches = 0;
  const { sandbox: s, els, store } = makeSandbox(() => { fetches++; return Promise.reject(new Error('x')); });
  store.weatherCache = JSON.stringify({ temp: '30', desc: 'Sunny', hum: '60', wind: '5 km/h', ic: 113, city: 'Manila', ts: Date.now() });
  await s.loadPhoneWeather();
  ok(fetches === 0 && els['weather-display'].innerHTML.includes('30°C'), 'fresh cache, no fetch');
  // stale cache triggers exactly one fetch attempt
  store.weatherCache = JSON.stringify({ temp: '30', desc: 'Sunny', hum: '60', wind: '5 km/h', ic: 113, city: 'Manila', ts: Date.now() - 31 * 60000 });
  await s.loadPhoneWeather();
  ok(fetches === 1, 'stale cache refetches once');
}
{
  // live-shape fetch populates cache + view
  const { sandbox: s, els, store } = makeSandbox(() => Promise.resolve({
    ok: true,
    json: () => Promise.resolve({
      current_condition: [{ temp_C: '31', weatherDesc: [{ value: 'Partly cloudy' }], humidity: '70', wind_Kmph: '9', windDir: 'E', weatherCode: '116' }],
      nearest_area: [{ areaName: [{ value: 'Quezon City' }], region: [{ value: 'Metro Manila' }] }]
    })
  }));
  await s.loadPhoneWeather();
  ok(els['weather-display'].innerHTML.includes('31°C') && els['weather-display'].innerHTML.includes('Quezon City'), 'live fetch renders + names city');
  ok(JSON.parse(store.weatherCache).temp === '31', 'live fetch cached');
}
{
  // auto mode: manual city by default, GPS coords when enabled
  const { sandbox: s, store } = makeSandbox(() => Promise.reject(new Error('offline')));
  ok((await s.resolveWeatherLoc()).loc === 'Manila', 'manual mode defaults to Manila');
  let fixes = 0;
  s.navigator.geolocation = {
    getCurrentPosition: (okFn) => { fixes++; okFn({ coords: { latitude: 14.6, longitude: 120.98 } }); }
  };
  store.slpWeatherAuto = '1';
  const got = await s.resolveWeatherLoc();
  ok(got.auto === true && got.loc === '14.6,120.98', 'auto mode resolves GPS coords');
  await s.resolveWeatherLoc();
  ok(fixes === 1, 'GPS fix cached per session');
  // denied GPS falls back to city
  s.navigator.geolocation = { getCurrentPosition: (okFn, errFn) => errFn(new Error('denied')) };
  const got2 = await s.resolveWeatherLoc();
  ok(got2.auto === true && got2.loc === '14.6,120.98', 'denied GPS keeps session fix');
}
{
  // setWeatherAuto(false) needs no GPS; bad coords never reach fetch
  const seen = [];
  const { sandbox: s, store } = makeSandbox((url) => { seen.push(String(url)); return Promise.reject(new Error('offline')); });
  store.slpWeatherAuto = '1';
  await s.setWeatherAuto(false);
  ok(store.slpWeatherAuto === '0', 'auto toggle off persists');
  await s.loadPhoneWeather();
  ok(seen.some(u => u.includes('wttr.in/Manila')), 'manual city used in fetch URL');
}

console.log(`\nWEATHER SMOKE: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);