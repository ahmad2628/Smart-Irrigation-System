import { pool } from '../config/db.js';

export async function insertReading({
  zoneId, deviceId = null, moisture = null, humidity = null, waterLevel = null, temperature = null,
}) {
  const [result] = await pool.query(
    `INSERT INTO sensor_readings
       (zone_id, device_id, moisture_pct, humidity_pct, water_level, temperature_c)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [zoneId, deviceId, moisture, humidity, waterLevel, temperature]
  );
  return result.insertId;
}

export async function listReadings(zoneId, { limit = 100, sinceMinutes = null } = {}) {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 100, 1000));
  if (sinceMinutes) {
    const [rows] = await pool.query(
      `SELECT id, zone_id, device_id, moisture_pct, humidity_pct, water_level, temperature_c, recorded_at
         FROM sensor_readings
        WHERE zone_id = ? AND recorded_at >= (NOW() - INTERVAL ? MINUTE)
        ORDER BY recorded_at DESC
        LIMIT ?`,
      [zoneId, Number(sinceMinutes), safeLimit]
    );
    return rows;
  }
  const [rows] = await pool.query(
    `SELECT id, zone_id, device_id, moisture_pct, humidity_pct, water_level, temperature_c, recorded_at
       FROM sensor_readings
      WHERE zone_id = ?
      ORDER BY recorded_at DESC
      LIMIT ?`,
    [zoneId, safeLimit]
  );
  return rows;
}

export async function getLatestReading(zoneId) {
  const [rows] = await pool.query(
    `SELECT id, zone_id, device_id, moisture_pct, humidity_pct, water_level, temperature_c, recorded_at
       FROM sensor_readings
      WHERE zone_id = ?
      ORDER BY recorded_at DESC
      LIMIT 1`,
    [zoneId]
  );
  return rows[0] || null;
}
