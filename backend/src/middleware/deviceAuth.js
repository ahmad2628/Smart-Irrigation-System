import { findDeviceByKey, touchHeartbeat } from '../repositories/devices.js';
import { HttpError } from '../utils/asyncHandler.js';

export async function requireDevice(req, res, next) {
  try {
    const key = req.headers['x-device-key'] || req.headers['X-Device-Key'];
    if (!key) throw new HttpError(401, 'Missing X-Device-Key header');
    const device = await findDeviceByKey(String(key));
    if (!device) throw new HttpError(401, 'Unknown device key');
    req.device = device;
    // Fire-and-forget heartbeat update; do not block the request.
    touchHeartbeat(device.id).catch(() => {});
    next();
  } catch (e) {
    next(e);
  }
}
