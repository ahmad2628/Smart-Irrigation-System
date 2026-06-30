import { pool } from '../config/db.js';

const cache = new Map();
const TTL_MS = 60_000;

export async function getConfig(key, fallback = null) {
  const cached = cache.get(key);
  if (cached && Date.now() - cached.at < TTL_MS) return cached.value;

  const [rows] = await pool.query(
    'SELECT config_value FROM system_config WHERE config_key = ? LIMIT 1',
    [key]
  );
  const value = rows[0]?.config_value ?? fallback;
  cache.set(key, { value, at: Date.now() });
  return value;
}

export async function getConfigNumber(key, fallback) {
  const v = await getConfig(key, fallback);
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export function invalidateConfigCache() {
  cache.clear();
}

export async function listAllConfig() {
  const [rows] = await pool.query(
    'SELECT config_key, config_value, updated_by, updated_at FROM system_config ORDER BY config_key'
  );
  return rows;
}

export async function upsertConfig(key, value, updatedBy = null) {
  await pool.query(
    `INSERT INTO system_config (config_key, config_value, updated_by)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE config_value = VALUES(config_value),
                             updated_by   = VALUES(updated_by)`,
    [key, String(value), updatedBy]
  );
  cache.delete(key); // ensure next read returns the new value
}
