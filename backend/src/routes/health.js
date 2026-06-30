import { Router } from 'express';
import { pool } from '../config/db.js';

const router = Router();

router.get('/health', async (req, res) => {
  let db = 'down';
  try {
    const conn = await pool.getConnection();
    await conn.query('SELECT 1');
    conn.release();
    db = 'up';
  } catch (e) {
    db = `down (${e.code || e.message})`;
  }
  res.json({
    status: 'ok',
    service: 'smart-irrigation-backend',
    uptimeSec: Math.round(process.uptime()),
    db,
    timestamp: new Date().toISOString(),
  });
});

export default router;
