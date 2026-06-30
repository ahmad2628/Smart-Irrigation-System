import { asyncHandler, HttpError } from '../utils/asyncHandler.js';
import { listActivityLogs, logActivity } from '../repositories/activityLogs.js';
import {
  listAllConfig, upsertConfig, invalidateConfigCache,
} from '../repositories/systemConfig.js';

export const logs = asyncHandler(async (req, res) => {
  const { user_id, action, entity, limit, offset } = req.query;
  const rows = await listActivityLogs({
    userId: user_id, action, entity, limit, offset,
  });
  res.json({ count: rows.length, logs: rows });
});

export const getConfig = asyncHandler(async (req, res) => {
  const items = await listAllConfig();
  res.json({ config: items });
});

export const putConfig = asyncHandler(async (req, res) => {
  const updates = req.body || {};
  if (typeof updates !== 'object' || Array.isArray(updates)) {
    throw new HttpError(400, 'Body must be an object of {key: value}');
  }
  const changed = [];
  for (const [key, value] of Object.entries(updates)) {
    if (value == null) continue;
    await upsertConfig(String(key), String(value), req.user.id);
    changed.push(key);
  }
  invalidateConfigCache();
  await logActivity({
    userId: req.user.id, action: 'update', entity: 'system_config',
    details: { keys: changed },
  });
  const items = await listAllConfig();
  res.json({ updated: changed, config: items });
});
