import { pool } from '../config/db.js';

export async function listAlerts({ userId, unreadOnly = false, limit = 50, role = 'farmer' } = {}) {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 50, 500));
  const isAdmin = role === 'admin';
  const conds = [];
  const params = [];

  if (!isAdmin) {
    // Farmer: own alerts only (system-wide alerts have user_id NULL — show too)
    conds.push('(a.user_id = ? OR a.user_id IS NULL)');
    params.push(userId);
  }
  if (unreadOnly) conds.push('a.is_read = 0');

  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  const [rows] = await pool.query(
    `SELECT a.id, a.user_id, a.type, a.severity, a.message,
            a.related_entity, a.related_id, a.is_read, a.created_at
       FROM alerts a
       ${where}
       ORDER BY a.id DESC
       LIMIT ?`,
    [...params, safeLimit]
  );
  return rows;
}

export async function countUnread({ userId, role = 'farmer' }) {
  const isAdmin = role === 'admin';
  const [rows] = await pool.query(
    isAdmin
      ? `SELECT COUNT(*) AS c FROM alerts WHERE is_read = 0`
      : `SELECT COUNT(*) AS c FROM alerts WHERE is_read = 0 AND (user_id = ? OR user_id IS NULL)`,
    isAdmin ? [] : [userId]
  );
  return Number(rows[0]?.c || 0);
}

export async function createAlert({
  userId = null, type, severity = 'info', message,
  relatedEntity = null, relatedId = null,
}) {
  const [result] = await pool.query(
    `INSERT INTO alerts (user_id, type, severity, message, related_entity, related_id)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [userId, type, severity, message, relatedEntity, relatedId]
  );
  const [rows] = await pool.query('SELECT * FROM alerts WHERE id = ?', [result.insertId]);
  return rows[0];
}

// Avoid duplicate alerts: skip if a same-type, same-related alert was created within `windowMin` minutes.
export async function hasRecentAlert({ type, relatedEntity, relatedId, windowMin = 10 }) {
  const [rows] = await pool.query(
    `SELECT 1 FROM alerts
      WHERE type = ?
        AND (related_entity <=> ?) AND (related_id <=> ?)
        AND created_at >= (NOW() - INTERVAL ? MINUTE)
      LIMIT 1`,
    [type, relatedEntity, relatedId, Number(windowMin)]
  );
  return rows.length > 0;
}

export async function markRead(id, { userId, role }) {
  // Admin can mark anyone's; farmer only own / system.
  const sql = role === 'admin'
    ? `UPDATE alerts SET is_read = 1 WHERE id = ?`
    : `UPDATE alerts SET is_read = 1 WHERE id = ? AND (user_id = ? OR user_id IS NULL)`;
  const params = role === 'admin' ? [id] : [id, userId];
  const [result] = await pool.query(sql, params);
  return result.affectedRows > 0;
}

export async function markAllRead({ userId, role }) {
  const sql = role === 'admin'
    ? `UPDATE alerts SET is_read = 1 WHERE is_read = 0`
    : `UPDATE alerts SET is_read = 1 WHERE is_read = 0 AND (user_id = ? OR user_id IS NULL)`;
  const params = role === 'admin' ? [] : [userId];
  const [result] = await pool.query(sql, params);
  return result.affectedRows;
}

export async function deleteAlert(id, { userId, role }) {
  const sql = role === 'admin'
    ? `DELETE FROM alerts WHERE id = ?`
    : `DELETE FROM alerts WHERE id = ? AND (user_id = ? OR user_id IS NULL)`;
  const params = role === 'admin' ? [id] : [id, userId];
  const [result] = await pool.query(sql, params);
  return result.affectedRows > 0;
}
