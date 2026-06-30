import { pool } from '../config/db.js';

export async function listCrops() {
  const [rows] = await pool.query(
    `SELECT id, name, description,
            moisture_threshold_low, moisture_threshold_high,
            ideal_humidity_min, ideal_humidity_max
       FROM crops
       ORDER BY name`
  );
  return rows;
}

export async function findCropById(id) {
  const [rows] = await pool.query('SELECT * FROM crops WHERE id = ? LIMIT 1', [id]);
  return rows[0] || null;
}

export async function findCropByName(name) {
  const [rows] = await pool.query('SELECT * FROM crops WHERE name = ? LIMIT 1', [name]);
  return rows[0] || null;
}

export async function createCropRow({ name, description, low, high, humLow, humHigh }) {
  const [result] = await pool.query(
    `INSERT INTO crops
       (name, description, moisture_threshold_low, moisture_threshold_high,
        ideal_humidity_min, ideal_humidity_max)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [name, description ?? null, low, high, humLow ?? null, humHigh ?? null]
  );
  return findCropById(result.insertId);
}

export async function updateCropRow(id, { name, description, low, high, humLow, humHigh }) {
  await pool.query(
    `UPDATE crops
        SET name                    = COALESCE(?, name),
            description             = COALESCE(?, description),
            moisture_threshold_low  = COALESCE(?, moisture_threshold_low),
            moisture_threshold_high = COALESCE(?, moisture_threshold_high),
            ideal_humidity_min      = COALESCE(?, ideal_humidity_min),
            ideal_humidity_max      = COALESCE(?, ideal_humidity_max)
      WHERE id = ?`,
    [name ?? null, description ?? null, low ?? null, high ?? null,
     humLow ?? null, humHigh ?? null, id]
  );
  return findCropById(id);
}

export async function deleteCropRow(id) {
  const [result] = await pool.query('DELETE FROM crops WHERE id = ?', [id]);
  return result.affectedRows > 0;
}

export async function countZonesUsingCrop(id) {
  const [rows] = await pool.query('SELECT COUNT(*) AS c FROM zones WHERE crop_id = ?', [id]);
  return Number(rows[0].c || 0);
}
