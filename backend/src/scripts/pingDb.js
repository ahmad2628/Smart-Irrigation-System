import { pingDb, closeDb } from '../config/db.js';
import { env } from '../config/env.js';

try {
  await pingDb();
  console.log(`[db:ping] OK — connected to ${env.db.database} at ${env.db.host}:${env.db.port}`);
  process.exit(0);
} catch (e) {
  console.error('[db:ping] FAILED:', e.code || e.message);
  process.exit(1);
} finally {
  await closeDb().catch(() => {});
}
