import { asyncHandler, HttpError } from '../utils/asyncHandler.js';
import { findZoneById } from '../repositories/zones.js';
import { insertReading } from '../repositories/sensorReadings.js';
import { findActiveEventForZone } from '../repositories/irrigationEvents.js';

// POST /api/ingest/readings
// Auth: X-Device-Key header (req.device populated by requireDevice middleware).
// Body: { zone_id?, moisture_pct?, humidity_pct?, water_level?, temperature_c? }
//   - zone_id: optional. defaults to the device's zone_id.
//   - at least one metric must be present.
export const submitReading = asyncHandler(async (req, res) => {
  const device = req.device;
  const { zone_id, moisture_pct, humidity_pct, water_level, temperature_c } = req.body;

  const zoneId = zone_id ?? device.zone_id;
  if (!zoneId) {
    throw new HttpError(400, 'zone_id required (device has no default zone)');
  }
  const zone = await findZoneById(zoneId);
  if (!zone) throw new HttpError(404, 'Zone not found');

  // If the device is bound to a specific zone, only that zone's readings are allowed.
  if (device.zone_id != null && device.zone_id !== zoneId) {
    throw new HttpError(403, 'Device is not authorized for this zone');
  }

  const metrics = [moisture_pct, humidity_pct, water_level, temperature_c];
  if (metrics.every((v) => v == null)) {
    throw new HttpError(400, 'At least one metric is required');
  }

  const id = await insertReading({
    zoneId,
    deviceId: device.id,
    moisture: moisture_pct,
    humidity: humidity_pct,
    waterLevel: water_level,
    temperature: temperature_c,
  });

  res.status(201).json({ id, zone_id: zoneId, recorded_at: new Date().toISOString() });
});

// GET /api/ingest/state?zone_id=N (device auth)
// Tells an IoT device whether irrigation is currently active for a zone
// so it can drive its valves/pump accordingly. Used by the simulator.
export const state = asyncHandler(async (req, res) => {
  const device = req.device;
  const zoneId = Number(req.query.zone_id) || device.zone_id;
  if (!zoneId) throw new HttpError(400, 'zone_id required');
  if (device.zone_id != null && device.zone_id !== zoneId) {
    throw new HttpError(403, 'Device is not authorized for this zone');
  }
  const event = await findActiveEventForZone(zoneId);
  res.json({
    zone_id: zoneId,
    irrigation_active: !!event,
    event_id: event?.id ?? null,
    triggered_by: event?.triggered_by ?? null,
    started_at: event?.start_time ?? null,
  });
});
