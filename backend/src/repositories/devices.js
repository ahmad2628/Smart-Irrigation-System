import crypto from 'node:crypto';
import { pool } from '../config/db.js';

const DEVICE_SELECT = `
  SELECT d.id, d.zone_id, d.name, d.type, d.device_key, d.status, d.last_heartbeat, d.created_at,
         z.name AS zone_name,
         f.id   AS field_id,
         f.user_id AS owner_id
    FROM devices d
    LEFT JOIN zones  z ON z.id = d.zone_id
    LEFT JOIN fields f ON f.id = z.field_id
`;

export const generateDeviceKey = () => `dk_${crypto.randomBytes(20).toString('hex')}`;

export async function listDevicesByUser(userId) {
  const [rows] = await pool.query(
    `${DEVICE_SELECT} WHERE f.user_id = ? OR (d.zone_id IS NULL AND ? = ?) ORDER BY d.created_at DESC`,
    [userId, 0, 1]  // controllers w/o zone are not user-owned in this simple model
  );
  return rows;
}

export async function findDeviceById(id) {
  const [rows] = await pool.query(`${DEVICE_SELECT} WHERE d.id = ? LIMIT 1`, [id]);
  return rows[0] || null;
}

export async function findDeviceByKey(key) {
  const [rows] = await pool.query(`${DEVICE_SELECT} WHERE d.device_key = ? LIMIT 1`, [key]);
  return rows[0] || null;
}

export async function createDevice({ zoneId, name, type }) {
  const deviceKey = generateDeviceKey();
  const [result] = await pool.query(
    `INSERT INTO devices (zone_id, name, type, device_key) VALUES (?, ?, ?, ?)`,
    [zoneId ?? null, name, type, deviceKey]
  );
  const device = await findDeviceById(result.insertId);
  // device_key is returned ONLY at creation time
  return { ...device, device_key: deviceKey };
}

export async function deleteDevice(id) {
  const [result] = await pool.query('DELETE FROM devices WHERE id = ?', [id]);
  return result.affectedRows > 0;
}

export async function touchHeartbeat(id) {
  await pool.query(
    `UPDATE devices SET last_heartbeat = CURRENT_TIMESTAMP, status = 'online' WHERE id = ?`,
    [id]
  );
}

export async function updateDeviceStatus(id, status) {
  await pool.query('UPDATE devices SET status = ? WHERE id = ?', [status, id]);
}
