import { pool } from '../config/db.js';
import { getConfigNumber } from '../repositories/systemConfig.js';
import { emitAlert } from './alertEngine.js';

// Marks devices offline whose last_heartbeat is older than the configured threshold.
// Emits one alert per device that transitions online → offline.
export async function checkDeviceHealth() {
  const offlineAfterSec = await getConfigNumber('device_offline_after_sec', 120);

  const [stale] = await pool.query(
    `SELECT d.id, d.name, d.type, d.zone_id, d.last_heartbeat,
            f.user_id AS owner_id
       FROM devices d
       LEFT JOIN zones  z ON z.id = d.zone_id
       LEFT JOIN fields f ON f.id = z.field_id
      WHERE d.status = 'online'
        AND d.last_heartbeat IS NOT NULL
        AND d.last_heartbeat < (NOW() - INTERVAL ? SECOND)`,
    [offlineAfterSec]
  );

  if (stale.length === 0) return { offlined: 0 };

  const ids = stale.map((d) => d.id);
  await pool.query(
    `UPDATE devices SET status = 'offline' WHERE id IN (?)`,
    [ids]
  );

  for (const d of stale) {
    await emitAlert({
      userId: d.owner_id ?? null,
      type: 'device_offline',
      severity: 'warning',
      message: `Device "${d.name}" went offline (no heartbeat for ${offlineAfterSec}s).`,
      relatedEntity: 'device',
      relatedId: d.id,
      windowMin: offlineAfterSec / 60 + 5, // suppress duplicates for a while
    });
  }
  return { offlined: stale.length };
}
