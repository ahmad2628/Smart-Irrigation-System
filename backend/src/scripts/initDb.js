import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';
import { env } from '../config/env.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const schemaPath = path.resolve(__dirname, '../../../database/schema.sql');

async function run() {
  console.log(`[db:init] reading ${schemaPath}`);
  const sql = await fs.readFile(schemaPath, 'utf8');

  console.log(`[db:init] connecting to mysql://${env.db.user}@${env.db.host}:${env.db.port}`);
  const conn = await mysql.createConnection({
    host: env.db.host,
    port: env.db.port,
    user: env.db.user,
    password: env.db.password,
    multipleStatements: true,
  });

  try {
    await conn.query(sql);
    console.log('[db:init] schema applied successfully');
  } finally {
    await conn.end();
  }
}

run().catch((err) => {
  console.error('[db:init] FAILED:', err.message);
  if (err.code) console.error('         code:', err.code);
  process.exit(1);
});
