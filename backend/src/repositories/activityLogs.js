import { pool } from '../config/db.js';

export async function logActivity({ userId = null, action, entity = null, entityId = null, details = null }) {
  await pool.query(
    'INSERT INTO activity_logs (user_id, action, entity, entity_id, details) VALUES (?, ?, ?, ?, ?)',
    [userId, action, entity, entityId, details ? JSON.stringify(details) : null]
  );
}

export async function listActivityLogs({ userId, action, entity, limit = 100, offset = 0 } = {}) {
  const safeLimit  = Math.max(1, Math.min(Number(limit)  || 100, 1000));
  const safeOffset = Math.max(0, Number(offset) || 0);

  const conds = [];
  const params = [];
  if (userId) { conds.push('a.user_id = ?'); params.push(Number(userId)); }
  if (action) { conds.push('a.action  = ?'); params.push(String(action)); }
  if (entity) { conds.push('a.entity  = ?'); params.push(String(entity)); }
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

  const [rows] = await pool.query(
    `SELECT a.id, a.user_id, u.email AS user_email, a.action, a.entity, a.entity_id,
            a.details, a.created_at
       FROM activity_logs a
       LEFT JOIN users u ON u.id = a.user_id
       ${where}
       ORDER BY a.id DESC
       LIMIT ? OFFSET ?`,
    [...params, safeLimit, safeOffset]
  );
  return rows;
}
