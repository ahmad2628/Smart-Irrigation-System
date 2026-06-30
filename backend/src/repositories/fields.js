import { pool } from '../config/db.js';

export async function listFieldsByUser(userId) {
  const [rows] = await pool.query(
    `SELECT id, user_id, name, size_acres, soil_type, location, created_at, updated_at
       FROM fields
      WHERE user_id = ?
      ORDER BY created_at DESC`,
    [userId]
  );
  return rows;
}

export async function findFieldById(id) {
  const [rows] = await pool.query('SELECT * FROM fields WHERE id = ? LIMIT 1', [id]);
  return rows[0] || null;
}

export async function createField({ userId, name, sizeAcres, soilType, location }) {
  const [result] = await pool.query(
    `INSERT INTO fields (user_id, name, size_acres, soil_type, location)
     VALUES (?, ?, ?, ?, ?)`,
    [userId, name, sizeAcres ?? null, soilType ?? null, location ?? null]
  );
  return findFieldById(result.insertId);
}

export async function updateField(id, { name, sizeAcres, soilType, location }) {
  await pool.query(
    `UPDATE fields
        SET name = COALESCE(?, name),
            size_acres = COALESCE(?, size_acres),
            soil_type = COALESCE(?, soil_type),
            location = COALESCE(?, location)
      WHERE id = ?`,
    [name ?? null, sizeAcres ?? null, soilType ?? null, location ?? null, id]
  );
  return findFieldById(id);
}

export async function deleteField(id) {
  const [result] = await pool.query('DELETE FROM fields WHERE id = ?', [id]);
  return result.affectedRows > 0;
}
