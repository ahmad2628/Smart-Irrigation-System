import { createApp } from './app.js';
import { env } from './config/env.js';
import { pingDb, closeDb } from './config/db.js';
import { startScheduler, stopScheduler } from './services/scheduler.js';

const app = createApp();

const server = app.listen(env.port, async () => {
  console.log(`[smart-irrigation] API listening on http://localhost:${env.port}`);
  console.log(`[smart-irrigation] env: ${env.nodeEnv}`);
  try {
    await pingDb();
    console.log('[smart-irrigation] MySQL connection: OK');
    if (process.env.DECISION_ENGINE_ENABLED !== 'false') startScheduler();
  } catch (e) {
    console.warn(`[smart-irrigation] MySQL connection: FAILED (${e.code || e.message})`);
    console.warn('[smart-irrigation] Server is up but DB is unreachable. Check backend/.env.');
  }
});

const shutdown = async (signal) => {
  console.log(`\n[smart-irrigation] ${signal} received. Shutting down...`);
  stopScheduler();
  server.close(async () => {
    await closeDb().catch(() => {});
    process.exit(0);
  });
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
