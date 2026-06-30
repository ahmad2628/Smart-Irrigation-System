import { pool } from '../config/db.js';

export async function insertSnapshot({
  location, temperatureC, humidityPct, rainProbability, rainMm,
  windKph, conditionText, forecastFor = null,
}) {
  await pool.query(
    `INSERT INTO weather_data
       (location, temperature_c, humidity_pct, rain_probability, rain_mm,
        wind_kph, condition_text, forecast_for)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [location, temperatureC, humidityPct, rainProbability, rainMm,
     windKph, conditionText, forecastFor]
  );
}

export async function getLatestCurrent(location) {
  const [rows] = await pool.query(
    `SELECT * FROM weather_data
      WHERE location = ? AND forecast_for IS NULL
      ORDER BY fetched_at DESC LIMIT 1`,
    [location]
  );
  return rows[0] || null;
}

export async function getLatestForecast(location, limit = 8) {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 8, 40));
  const [rows] = await pool.query(
    `SELECT * FROM weather_data
      WHERE location = ? AND forecast_for IS NOT NULL
        AND forecast_for >= NOW()
      ORDER BY forecast_for ASC
      LIMIT ?`,
    [location, safeLimit]
  );
  return rows;
}

export async function pruneOldForecasts(location) {
  await pool.query(
    `DELETE FROM weather_data
      WHERE location = ? AND forecast_for IS NOT NULL
        AND forecast_for < (NOW() - INTERVAL 6 HOUR)`,
    [location]
  );
}
