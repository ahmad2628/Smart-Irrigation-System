import { asyncHandler, HttpError } from '../utils/asyncHandler.js';
import {
  listAlerts, countUnread, markRead, markAllRead, deleteAlert,
} from '../repositories/alerts.js';
import { verifyToken } from '../utils/jwt.js';
import { findById } from '../repositories/users.js';
import { alertBus } from '../services/alertBus.js';

export const list = asyncHandler(async (req, res) => {
  const unreadOnly = req.query.unread_only === 'true';
  const alerts = await listAlerts({
    userId: req.user.id, role: req.user.role,
    unreadOnly, limit: req.query.limit,
  });
  const unread = await countUnread({ userId: req.user.id, role: req.user.role });
  res.json({ unread, alerts });
});

export const read = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, 'Invalid id');
  const ok = await markRead(id, { userId: req.user.id, role: req.user.role });
  if (!ok) throw new HttpError(404, 'Alert not found');
  res.json({ id, read: true });
});

export const readAll = asyncHandler(async (req, res) => {
  const updated = await markAllRead({ userId: req.user.id, role: req.user.role });
  res.json({ marked_read: updated });
});

export const remove = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, 'Invalid id');
  const ok = await deleteAlert(id, { userId: req.user.id, role: req.user.role });
  if (!ok) throw new HttpError(404, 'Alert not found');
  res.status(204).send();
});

// ----------- SSE stream -----------
// EventSource doesn't support custom headers, so this endpoint accepts the JWT
// via ?token=... query param. The dashboard already has the token in localStorage.
export const stream = asyncHandler(async (req, res) => {
  const token = req.query.token;
  if (!token) throw new HttpError(401, 'Missing token query param');

  let user;
  try {
    const payload = verifyToken(String(token));
    user = await findById(payload.sub);
    if (!user || !user.is_active) throw new HttpError(401, 'Inactive user');
  } catch (e) {
    throw new HttpError(401, 'Invalid token');
  }

  // SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write(`: connected\n\n`);

  const heartbeat = setInterval(() => res.write(`: ping\n\n`), 25_000);

  const onAlert = (alert) => {
    // Only send alerts the subscriber is allowed to see.
    const visible = user.role === 'admin'
      || alert.user_id == null
      || Number(alert.user_id) === Number(user.id);
    if (!visible) return;
    res.write(`event: alert\n`);
    res.write(`data: ${JSON.stringify(alert)}\n\n`);
  };

  alertBus.on('alert', onAlert);

  req.on('close', () => {
    clearInterval(heartbeat);
    alertBus.off('alert', onAlert);
  });
});
