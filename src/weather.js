// Weather connector — Open-Meteo (free, no key). Geocodes a place name, returns current
// conditions + daily forecast, and a compact card the chat renders.
const CODES = {
  0: ['Clear', '☀️'], 1: ['Mostly clear', '🌤️'], 2: ['Partly cloudy', '⛅'], 3: ['Overcast', '☁️'],
  45: ['Fog', '🌫️'], 48: ['Freezing fog', '🌫️'],
  51: ['Light drizzle', '🌦️'], 53: ['Drizzle', '🌦️'], 55: ['Heavy drizzle', '🌧️'], 56: ['Freezing drizzle', '🌧️'], 57: ['Freezing drizzle', '🌧️'],
  61: ['Light rain', '🌦️'], 63: ['Rain', '🌧️'], 65: ['Heavy rain', '🌧️'], 66: ['Freezing rain', '🌧️'], 67: ['Freezing rain', '🌧️'],
  71: ['Light snow', '🌨️'], 73: ['Snow', '🌨️'], 75: ['Heavy snow', '❄️'], 77: ['Snow grains', '🌨️'],
  80: ['Showers', '🌦️'], 81: ['Showers', '🌧️'], 82: ['Violent showers', '⛈️'], 85: ['Snow showers', '🌨️'], 86: ['Snow showers', '❄️'],
  95: ['Thunderstorm', '⛈️'], 96: ['Thunderstorm, hail', '⛈️'], 99: ['Thunderstorm, hail', '⛈️']
};
const describe = c => CODES[c] || ['Unknown', '🌡️'];

const GEO = 'https://geocoding-api.open-meteo.com/v1';
const API = 'https://api.open-meteo.com/v1';

async function geocode(name, { base = GEO, signal } = {}) {
  const q = String(name || '').trim();
  if (!q) throw new Error('No location given. Set a default location in Settings → Connectors → Weather, or ask for a city.');
  // "Boston, MA" → search "Boston", then prefer results matching the rest.
  const [city, ...rest] = q.split(',').map(s => s.trim());
  const res = await fetch(`${base}/search?name=${encodeURIComponent(city)}&count=10&language=en&format=json`, { signal });
  if (!res.ok) throw new Error(`Weather location lookup failed (${res.status}).`);
  const list = (await res.json()).results || [];
  if (!list.length) throw new Error(`Couldn't find a place called "${q}".`);
  const hint = rest.join(' ').toLowerCase();
  const STATE = { al: 'alabama', ak: 'alaska', az: 'arizona', ar: 'arkansas', ca: 'california', co: 'colorado', ct: 'connecticut', de: 'delaware', fl: 'florida', ga: 'georgia', hi: 'hawaii', id: 'idaho', il: 'illinois', in: 'indiana', ia: 'iowa', ks: 'kansas', ky: 'kentucky', la: 'louisiana', me: 'maine', md: 'maryland', ma: 'massachusetts', mi: 'michigan', mn: 'minnesota', ms: 'mississippi', mo: 'missouri', mt: 'montana', ne: 'nebraska', nv: 'nevada', nh: 'new hampshire', nj: 'new jersey', nm: 'new mexico', ny: 'new york', nc: 'north carolina', nd: 'north dakota', oh: 'ohio', ok: 'oklahoma', or: 'oregon', pa: 'pennsylvania', ri: 'rhode island', sc: 'south carolina', sd: 'south dakota', tn: 'tennessee', tx: 'texas', ut: 'utah', vt: 'vermont', va: 'virginia', wa: 'washington', wv: 'west virginia', wi: 'wisconsin', wy: 'wyoming' };
  const want = STATE[hint] || hint;
  const match = want && list.find(r => [r.admin1, r.country, r.country_code].some(x => x && String(x).toLowerCase().includes(want)));
  const r = match || list[0];
  return { name: [r.name, r.admin1, r.country_code === 'US' ? '' : r.country].filter(Boolean).join(', '), lat: r.latitude, lon: r.longitude };
}

async function forecast({ location, days = 3, units = 'imperial', base = API, geoBase = GEO, signal }) {
  const place = await geocode(location, { base: geoBase, signal });
  const f = units === 'metric';
  const params = new URLSearchParams({
    latitude: place.lat, longitude: place.lon, timezone: 'auto', forecast_days: String(Math.max(1, Math.min(7, +days || 3))),
    current: 'temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,precipitation,is_day',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset',
    temperature_unit: f ? 'celsius' : 'fahrenheit', wind_speed_unit: f ? 'kmh' : 'mph', precipitation_unit: f ? 'mm' : 'inch'
  });
  const res = await fetch(`${base}/forecast?${params}`, { signal });
  if (!res.ok) throw new Error(`Weather service error (${res.status}).`);
  const j = await res.json();
  const T = f ? '°C' : '°F', W = f ? 'km/h' : 'mph';
  const cur = j.current || {};
  const [cText, cIcon] = describe(cur.weather_code);
  const daily = (j.daily?.time || []).map((date, i) => {
    const [t, icon] = describe(j.daily.weather_code[i]);
    return {
      date, day: new Date(date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short' }),
      icon, text: t, hi: Math.round(j.daily.temperature_2m_max[i]), lo: Math.round(j.daily.temperature_2m_min[i]),
      rain: j.daily.precipitation_probability_max?.[i] ?? null
    };
  });
  const card = {
    type: 'weather', place: place.name, unit: T,
    now: { temp: Math.round(cur.temperature_2m), feels: Math.round(cur.apparent_temperature), text: cText, icon: cIcon, humidity: cur.relative_humidity_2m, wind: `${Math.round(cur.wind_speed_10m)} ${W}` },
    daily
  };
  const lines = [
    `Weather for ${place.name}:`,
    `Now: ${card.now.temp}${T} (feels ${card.now.feels}${T}), ${cText}, humidity ${card.now.humidity}%, wind ${card.now.wind}.`,
    ...daily.map(d => `${d.day} ${d.date}: ${d.text}, high ${d.hi}${T} / low ${d.lo}${T}${d.rain != null ? `, ${d.rain}% chance of precipitation` : ''}.`),
    '(A weather card is already shown to the user; summarize briefly instead of repeating every number.)'
  ];
  return { content: lines.join('\n'), card };
}

module.exports = { forecast, geocode, describe };
