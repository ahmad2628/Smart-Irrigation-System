import { pool } from '../config/db.js';

export async function findByEmail(email) {
  const [rows] = await pool.query(
    'SELECT id, name, email, password_hash, role, is_active, created_at FROM users WHERE email = ? LIMIT 1',
    [email]
  );
  return rows[0] || null;
}

export async function findById(id) {
  const [rows] = await pool.query(
    'SELECT id, name, email, role, is_active, created_at FROM users WHERE id = ? LIMIT 1',
    [id]
  );
  return rows[0] || null;
}

export async function createUser({ name, email, passwordHash, role = 'farmer' }) {
  const [result] = await pool.query(
    'INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)',
    [name, email, passwordHash, role]
  );
  return findById(result.insertId);
}

export async function emailExists(email) {
  const [rows] = await pool.query('SELECT 1 FROM users WHERE email = ? LIMIT 1', [email]);
  return rows.length > 0;
}
