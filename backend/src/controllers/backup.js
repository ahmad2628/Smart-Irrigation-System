import { asyncHandler, HttpError } from '../utils/asyncHandler.js';
import { pool } from '../config/db.js';
import { logActivity } from '../repositories/activityLogs.js';
import { invalidateConfigCache } from '../repositories/systemConfig.js';

// Tables in dependency order (parents → children).
// Used for restore: truncate in reverse, insert in this order.
const TABLES_IN_ORDER = [
  'users',
  'crops',
  'fields',
  'zones',
  'devices',
  'schedules',
  'sensor_readings',
  'weather_data',
  'irrigation_events',
  'alerts',
  'system_config',
  'activity_logs',
];

// Lighter set if ?compact=true — structural data only, no time-series.
const COMPACT_TABLES = [
  'users', 'crops', 'fields', 'zones', 'devices', 'schedules', 'system_config',
];

export const backup = asyncHandler(async (req, res) => {
  const compact = req.query.compact === 'true';
  const tables = compact ? COMPACT_TABLES : TABLES_IN_ORDER;

  const out = {
    version: 1,
    generated_at: new Date().toISOString(),
    generated_by: req.user.email,
    compact,
    schema_version: 'phase-11',
    tables: {},
    counts: {},
  };

  for (const t of tables) {
    const [rows] = await pool.query(`SELECT * FROM \`${t}\``);
    out.tables[t] = rows;
    out.counts[t] = rows.length;
  }

  await logActivity({
    userId: req.user.id, action: 'backup', entity: 'system',
    details: { compact, counts: out.counts },
  });

  res.setHeader('Content-Type', 'application/json');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="smart_irrigation_backup_${new Date().toISOString().slice(0,10)}${compact ? '_compact' : ''}.json"`,
  );
  res.send(JSON.stringify(out, null, 2));
});

// POST /api/admin/restore
// Body: a JSON backup produced by GET /api/admin/backup.
//   - tables present in the backup are REPLACED entirely.
//   - tables NOT present are left untouched.
//   - foreign keys are temporarily disabled during the operation.
export const restore = asyncHandler(async (req, res) => {
  const dump = req.body;
  if (!dump || typeof dump !== 'object' || !dump.tables) {
    throw new HttpError(400, 'Body must be a backup JSON with a "tables" field');
  }

  const tablesPresent = TABLES_IN_ORDER.filter((t) => Array.isArray(dump.tables[t]));
  if (!tablesPresent.length) throw new HttpError(400, 'No recognized tables in backup');

  const conn = await pool.getConnection();
  const result = {};
  try {
    await conn.query('SET FOREIGN_KEY_CHECKS = 0');

    // Truncate in reverse order
    for (const t of [...tablesPresent].reverse()) {
      await conn.query(`TRUNCATE TABLE \`${t}\``);
    }

    // Insert in forward order
    for (const t of tablesPresent) {
      const rows = dump.tables[t];
      let inserted = 0;
      for (const row of rows) {
        const cols = Object.keys(row);
        if (!cols.length) continue;
        const placeholders = cols.map(() => '?').join(', ');
        // mysql2 auto-parses JSON columns to objects on read; re-stringify on insert.
        const values = cols.map((c) => {
          const v = row[c];
          if (v != null && typeof v === 'object') return JSON.stringify(v);
          return v;
        });
        await conn.query(
          `INSERT INTO \`${t}\` (${cols.map((c) => `\`${c}\``).join(', ')}) VALUES (${placeholders})`,
          values
        );
        inserted += 1;
      }
      result[t] = inserted;
    }

    await conn.query('SET FOREIGN_KEY_CHECKS = 1');
  } catch (e) {
    try { await conn.query('SET FOREIGN_KEY_CHECKS = 1'); } catch {}
    throw e;
  } finally {
    conn.release();
  }

  invalidateConfigCache();

  await logActivity({
    userId: req.user.id, action: 'restore', entity: 'system',
    details: { counts: result, from_backup: dump.generated_at || null },
  });

  res.json({ restored: result, from_backup: dump.generated_at || null });
});
