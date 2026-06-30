import { pool } from '../config/db.js';

const SELECT = `
  SELECT s.id, s.zone_id, s.created_by, s.start_time, s.duration_minutes,
         s.repeat_days, s.is_active, s.created_at,
         z.name AS zone_name,
         f.user_id AS owner_id
    FROM schedules s
    JOIN zones  z ON z.id = s.zone_id
    JOIN fields f ON f.id = z.field_id
`;

export async function listSchedulesByUser(userId) {
  const [rows] = await pool.query(
    `${SELECT} WHERE f.user_id = ? ORDER BY s.created_at DESC`,
    [userId]
  );
  return rows;
}

export async function listActiveSchedules() {
  const [rows] = await pool.query(`${SELECT} WHERE s.is_active = 1`);
  return rows;
}

export async function findScheduleById(id) {
  const [rows] = await pool.query(`${SELECT} WHERE s.id = ? LIMIT 1`, [id]);
  return rows[0] || null;
}

export async function createSchedule({ zoneId, userId, startTime, durationMinutes, repeatDays, isActive = true }) {
  const [result] = await pool.query(
    `INSERT INTO schedules (zone_id, created_by, start_time, duration_minutes, repeat_days, is_active)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [zoneId, userId ?? null, startTime, durationMinutes, repeatDays ?? null, isActive ? 1 : 0]
  );
  return findScheduleById(result.insertId);
}

export async function updateSchedule(id, { startTime, durationMinutes, repeatDays, isActive }) {
  await pool.query(
    `UPDATE schedules
        SET start_time = COALESCE(?, start_time),
            duration_minutes = COALESCE(?, duration_minutes),
            repeat_days = COALESCE(?, repeat_days),
            is_active = COALESCE(?, is_active)
      WHERE id = ?`,
    [
      startTime ?? null,
      durationMinutes ?? null,
      repeatDays ?? null,
      typeof isActive === 'boolean' ? (isActive ? 1 : 0) : null,
      id,
    ]
  );
  return findScheduleById(id);
}

export async function deleteSchedule(id) {
  const [result] = await pool.query('DELETE FROM schedules WHERE id = ?', [id]);
  return result.affectedRows > 0;
}

// Returns true if this schedule has already fired today (UTC).
export async function hasFiredToday(scheduleId) {
  const [rows] = await pool.query(
    `SELECT 1 FROM irrigation_events
      WHERE schedule_id = ?
        AND start_time >= UTC_DATE()
      LIMIT 1`,
    [scheduleId]
  );
  return rows.length > 0;
}
