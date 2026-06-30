import { pool } from '../config/db.js';

// All queries scope to a single user via the fields ownership chain.
// Optional zoneId narrows further. Date range is [from, to] inclusive on day boundaries (UTC).

function buildScope(userId, zoneId) {
  const params = [userId];
  let clause = ' AND f.user_id = ? ';
  if (zoneId) { clause += ' AND z.id = ? '; params.push(zoneId); }
  return { clause, params };
}

export async function eventCountsByTrigger({ userId, zoneId, from, to }) {
  const { clause, params } = buildScope(userId, zoneId);
  const [rows] = await pool.query(
    `SELECT e.triggered_by, COUNT(*) AS count,
            SUM(COALESCE(e.duration_sec, 0)) AS total_duration_sec
       FROM irrigation_events e
       JOIN zones  z ON z.id = e.zone_id
       JOIN fields f ON f.id = z.field_id
      WHERE e.start_time >= ? AND e.start_time < (? + INTERVAL 1 DAY)
        ${clause}
      GROUP BY e.triggered_by`,
    [from, to, ...params]
  );
  return rows;
}

export async function eventCountsByStatus({ userId, zoneId, from, to }) {
  const { clause, params } = buildScope(userId, zoneId);
  const [rows] = await pool.query(
    `SELECT e.status, COUNT(*) AS count
       FROM irrigation_events e
       JOIN zones  z ON z.id = e.zone_id
       JOIN fields f ON f.id = z.field_id
      WHERE e.start_time >= ? AND e.start_time < (? + INTERVAL 1 DAY)
        ${clause}
      GROUP BY e.status`,
    [from, to, ...params]
  );
  return rows;
}

export async function eventsPerDay({ userId, zoneId, from, to }) {
  const { clause, params } = buildScope(userId, zoneId);
  const [rows] = await pool.query(
    `SELECT DATE(e.start_time) AS day, COUNT(*) AS count,
            SUM(COALESCE(e.duration_sec, 0)) AS duration_sec
       FROM irrigation_events e
       JOIN zones  z ON z.id = e.zone_id
       JOIN fields f ON f.id = z.field_id
      WHERE e.start_time >= ? AND e.start_time < (? + INTERVAL 1 DAY)
        ${clause}
      GROUP BY DATE(e.start_time)
      ORDER BY day`,
    [from, to, ...params]
  );
  return rows;
}

export async function readingStats({ userId, zoneId, from, to }) {
  const { clause, params } = buildScope(userId, zoneId);
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS readings_count,
            ROUND(AVG(r.moisture_pct), 2) AS avg_moisture,
            ROUND(MIN(r.moisture_pct), 2) AS min_moisture,
            ROUND(MAX(r.moisture_pct), 2) AS max_moisture,
            ROUND(AVG(r.humidity_pct), 2) AS avg_humidity,
            ROUND(AVG(r.water_level),  2) AS avg_water_level
       FROM sensor_readings r
       JOIN zones  z ON z.id = r.zone_id
       JOIN fields f ON f.id = z.field_id
      WHERE r.recorded_at >= ? AND r.recorded_at < (? + INTERVAL 1 DAY)
        ${clause}`,
    [from, to, ...params]
  );
  return rows[0];
}

export async function eventsForCsv({ userId, zoneId, from, to }) {
  const { clause, params } = buildScope(userId, zoneId);
  const [rows] = await pool.query(
    `SELECT e.id, z.name AS zone, f.name AS field,
            e.triggered_by, e.status, e.reason,
            e.start_time, e.end_time, e.duration_sec, e.water_liters
       FROM irrigation_events e
       JOIN zones  z ON z.id = e.zone_id
       JOIN fields f ON f.id = z.field_id
      WHERE e.start_time >= ? AND e.start_time < (? + INTERVAL 1 DAY)
        ${clause}
      ORDER BY e.start_time`,
    [from, to, ...params]
  );
  return rows;
}

export async function readingsForCsv({ userId, zoneId, from, to, limit = 100000 }) {
  const { clause, params } = buildScope(userId, zoneId);
  const safeLimit = Math.min(Number(limit) || 100000, 200000);
  const [rows] = await pool.query(
    `SELECT r.id, z.name AS zone, f.name AS field,
            r.moisture_pct, r.humidity_pct, r.water_level, r.temperature_c, r.recorded_at
       FROM sensor_readings r
       JOIN zones  z ON z.id = r.zone_id
       JOIN fields f ON f.id = z.field_id
      WHERE r.recorded_at >= ? AND r.recorded_at < (? + INTERVAL 1 DAY)
        ${clause}
      ORDER BY r.recorded_at
      LIMIT ?`,
    [from, to, ...params, safeLimit]
  );
  return rows;
}
