import { hashPassword } from '../utils/password.js';
import { pool, closeDb } from '../config/db.js';

const ADMIN_EMAIL    = process.env.SEED_ADMIN_EMAIL    || 'admin@smartirrigation.local';
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD || 'Admin@123';
const ADMIN_NAME     = process.env.SEED_ADMIN_NAME     || 'System Admin';

try {
  const [existing] = await pool.query('SELECT id FROM users WHERE email = ? LIMIT 1', [ADMIN_EMAIL]);
  if (existing.length) {
    console.log(`[seedAdmin] admin already exists: ${ADMIN_EMAIL} (id=${existing[0].id})`);
  } else {
    const hash = await hashPassword(ADMIN_PASSWORD);
    const [result] = await pool.query(
      'INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)',
      [ADMIN_NAME, ADMIN_EMAIL, hash, 'admin']
    );
    console.log(`[seedAdmin] created admin id=${result.insertId} email=${ADMIN_EMAIL}`);
    console.log(`[seedAdmin] password: ${ADMIN_PASSWORD}  (change in production)`);
  }
} catch (e) {
  console.error('[seedAdmin] FAILED:', e.message);
  process.exitCode = 1;
} finally {
  await closeDb().catch(() => {});
}
