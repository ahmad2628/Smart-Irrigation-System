import { pool } from '../config/db.js';

export async function findActiveEventForZone(zoneId) {
  const [rows] = await pool.query(
    `SELECT * FROM irrigation_events
      WHERE zone_id = ? AND status = 'running'
      ORDER BY start_time DESC LIMIT 1`,
    [zoneId]
  );
  return rows[0] || null;
}

export async function listEventsForZone(zoneId, limit = 50) {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 50, 500));
  const [rows] = await pool.query(
    `SELECT * FROM irrigation_events
      WHERE zone_id = ?
      ORDER BY start_time DESC LIMIT ?`,
    [zoneId, safeLimit]
  );
  return rows;
}

export async function startEvent({
  zoneId, triggeredBy, reason,
  userId = null, scheduleId = null, durationMinutes = null,
}) {
  const targetEndExpr = durationMinutes
    ? `(CURRENT_TIMESTAMP + INTERVAL ${Number(durationMinutes)} MINUTE)`
    : 'NULL';
  const [result] = await pool.query(
    `INSERT INTO irrigation_events
       (zone_id, triggered_by, reason, user_id, schedule_id, target_end_time, status)
     VALUES (?, ?, ?, ?, ?, ${targetEndExpr}, 'running')`,
    [zoneId, triggeredBy, reason, userId, scheduleId]
  );
  const [rows] = await pool.query('SELECT * FROM irrigation_events WHERE id = ?', [result.insertId]);
  return rows[0];
}

export async function endEvent(id, { status = 'completed', reason = null, waterLiters = null } = {}) {
  await pool.query(
    `UPDATE irrigation_events
        SET end_time = CURRENT_TIMESTAMP,
            status   = ?,
            reason   = COALESCE(?, reason),
            water_liters = ?,
            duration_sec = TIMESTAMPDIFF(SECOND, start_time, CURRENT_TIMESTAMP)
      WHERE id = ? AND status = 'running'`,
    [status, reason, waterLiters, id]
  );
  const [rows] = await pool.query('SELECT * FROM irrigation_events WHERE id = ?', [id]);
  return rows[0];
}
