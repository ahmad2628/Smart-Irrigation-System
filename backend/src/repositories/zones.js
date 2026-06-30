import { pool } from '../config/db.js';

const ZONE_SELECT = `
  SELECT z.id, z.field_id, z.crop_id, z.name, z.area_sqm, z.is_enabled, z.created_at,
         z.moisture_threshold_low  AS zone_threshold_low,
         z.moisture_threshold_high AS zone_threshold_high,
         f.user_id AS owner_id,
         f.name    AS field_name,
         f.location AS field_location,
         c.name    AS crop_name,
         COALESCE(z.moisture_threshold_low,  c.moisture_threshold_low)  AS moisture_threshold_low,
         COALESCE(z.moisture_threshold_high, c.moisture_threshold_high) AS moisture_threshold_high
    FROM zones z
    JOIN fields f ON f.id = z.field_id
    LEFT JOIN crops c ON c.id = z.crop_id
`;

export async function listAllEnabledZones() {
  const [rows] = await pool.query(
    `${ZONE_SELECT} WHERE z.is_enabled = 1 ORDER BY z.id`
  );
  return rows;
}

export async function listZonesByUser(userId) {
  const [rows] = await pool.query(
    `${ZONE_SELECT} WHERE f.user_id = ? ORDER BY z.created_at DESC`,
    [userId]
  );
  return rows;
}

export async function listZonesByFieldId(fieldId) {
  const [rows] = await pool.query(
    `${ZONE_SELECT} WHERE z.field_id = ? ORDER BY z.created_at DESC`,
    [fieldId]
  );
  return rows;
}

export async function findZoneById(id) {
  const [rows] = await pool.query(`${ZONE_SELECT} WHERE z.id = ? LIMIT 1`, [id]);
  return rows[0] || null;
}

export async function createZone({
  fieldId, cropId, name, areaSqm, isEnabled = true,
  thresholdLow = null, thresholdHigh = null,
}) {
  const [result] = await pool.query(
    `INSERT INTO zones
       (field_id, crop_id, name, area_sqm, is_enabled,
        moisture_threshold_low, moisture_threshold_high)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [fieldId, cropId ?? null, name, areaSqm ?? null, isEnabled ? 1 : 0,
     thresholdLow, thresholdHigh]
  );
  return findZoneById(result.insertId);
}

export async function updateZone(id, {
  name, areaSqm, isEnabled, cropId,
  thresholdLow, thresholdHigh,           // undefined = leave alone, null = clear, number = set
}) {
  // Build a dynamic UPDATE so we can distinguish "clear" (null) from "leave alone" (undefined).
  const sets = [];
  const params = [];
  if (name        != null) { sets.push('name = ?');       params.push(name); }
  if (areaSqm     != null) { sets.push('area_sqm = ?');   params.push(areaSqm); }
  if (typeof isEnabled === 'boolean') { sets.push('is_enabled = ?'); params.push(isEnabled ? 1 : 0); }
  if (cropId      != null) { sets.push('crop_id = ?');    params.push(cropId); }
  if (thresholdLow  !== undefined) { sets.push('moisture_threshold_low  = ?'); params.push(thresholdLow); }
  if (thresholdHigh !== undefined) { sets.push('moisture_threshold_high = ?'); params.push(thresholdHigh); }
  if (sets.length) {
    await pool.query(`UPDATE zones SET ${sets.join(', ')} WHERE id = ?`, [...params, id]);
  }
  return findZoneById(id);
}

export async function setZoneCrop(id, cropId) {
  await pool.query('UPDATE zones SET crop_id = ? WHERE id = ?', [cropId, id]);
  return findZoneById(id);
}

export async function deleteZone(id) {
  const [result] = await pool.query('DELETE FROM zones WHERE id = ?', [id]);
  return result.affectedRows > 0;
}
