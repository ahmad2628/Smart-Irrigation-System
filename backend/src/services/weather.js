import { env } from '../config/env.js';
import {
  insertSnapshot, getLatestCurrent, getLatestForecast, pruneOldForecasts,
} from '../repositories/weather.js';

const BASE = 'https://api.openweathermap.org/data/2.5';
const CACHE_MINUTES = 5;
const FORECAST_CACHE_MINUTES = 60;

async function fetchJson(url) {
  const res = await fetch(url);
  const body = await res.json();
  if (!res.ok) {
    const msg = body?.message || `HTTP ${res.status}`;
    const err = new Error(`OpenWeatherMap: ${msg}`);
    err.status = res.status;
    err.upstream = body;
    throw err;
  }
  return body;
}

function isFresh(timestamp, minutes) {
  if (!timestamp) return false;
  const ageMs = Date.now() - new Date(timestamp).getTime();
  return ageMs < minutes * 60 * 1000;
}

// --- CURRENT WEATHER -------------------------------------------------
export async function getCurrentWeather(city) {
  const location = city || env.weather.defaultCity;
  const cached = await getLatestCurrent(location);

  if (cached && isFresh(cached.fetched_at, CACHE_MINUTES)) {
    return { source: 'cache', location, data: cached };
  }

  if (!env.weather.apiKey) {
    if (cached) return { source: 'cache-stale (no api key)', location, data: cached };
    throw Object.assign(new Error('WEATHER_API_KEY not configured'), { status: 503 });
  }

  try {
    const url = `${BASE}/weather?q=${encodeURIComponent(location)}&appid=${env.weather.apiKey}&units=metric`;
    const live = await fetchJson(url);

    const snap = {
      location,
      temperatureC:    live.main?.temp ?? null,
      humidityPct:     live.main?.humidity ?? null,
      rainProbability: null,
      rainMm:          live.rain?.['1h'] ?? live.rain?.['3h'] ?? 0,
      windKph:         live.wind?.speed != null ? Number((live.wind.speed * 3.6).toFixed(2)) : null,
      conditionText:   live.weather?.[0]?.description ?? null,
      forecastFor:     null,
    };
    await insertSnapshot(snap);
    const fresh = await getLatestCurrent(location);
    return { source: 'live', location, data: fresh };
  } catch (e) {
    // Graceful fallback: return last cached if any
    if (cached) {
      return { source: `cache-fallback (${e.status || 'upstream-error'})`, location, data: cached };
    }
    throw e;
  }
}

// --- FORECAST --------------------------------------------------------
// OpenWeatherMap free tier: 5-day / 3-hour forecast → 40 slots.
// We store up to the next 8 slots = 24h.
export async function getForecast(city, hours = 24) {
  const location = city || env.weather.defaultCity;
  const slots = Math.min(40, Math.max(1, Math.ceil(hours / 3)));

  const cached = await getLatestForecast(location, slots);
  // Determine cache freshness using the most recently fetched cached slot
  const latestFetch = cached?.[0]?.fetched_at;
  if (latestFetch && isFresh(latestFetch, FORECAST_CACHE_MINUTES) && cached.length >= slots) {
    return { source: 'cache', location, slots: cached, peakRainProbability: peak(cached) };
  }

  if (!env.weather.apiKey) {
    if (cached?.length) return { source: 'cache-stale (no api key)', location, slots: cached, peakRainProbability: peak(cached) };
    throw Object.assign(new Error('WEATHER_API_KEY not configured'), { status: 503 });
  }

  try {
    const url = `${BASE}/forecast?q=${encodeURIComponent(location)}&appid=${env.weather.apiKey}&units=metric&cnt=${slots}`;
    const live = await fetchJson(url);

    await pruneOldForecasts(location);

    for (const item of live.list || []) {
      await insertSnapshot({
        location,
        temperatureC:    item.main?.temp ?? null,
        humidityPct:     item.main?.humidity ?? null,
        rainProbability: item.pop != null ? Number((item.pop * 100).toFixed(2)) : 0,
        rainMm:          item.rain?.['3h'] ?? 0,
        windKph:         item.wind?.speed != null ? Number((item.wind.speed * 3.6).toFixed(2)) : null,
        conditionText:   item.weather?.[0]?.description ?? null,
        forecastFor:     new Date(item.dt * 1000).toISOString().slice(0, 19).replace('T', ' '),
      });
    }

    const fresh = await getLatestForecast(location, slots);
    return { source: 'live', location, slots: fresh, peakRainProbability: peak(fresh) };
  } catch (e) {
    if (cached?.length) {
      return {
        source: `cache-fallback (${e.status || 'upstream-error'})`,
        location, slots: cached, peakRainProbability: peak(cached),
      };
    }
    throw e;
  }
}

function peak(slots) {
  if (!slots?.length) return 0;
  return Number(Math.max(...slots.map((s) => Number(s.rain_probability ?? 0))).toFixed(2));
}
