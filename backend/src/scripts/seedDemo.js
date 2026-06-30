// Seeds a realistic farm with 24 hours of synthetic sensor data and irrigation
// history so the dashboard has content to show during a thesis demo.
//
// Idempotent: tear-down anything previously seeded under the "demo" user.
//   npm run db:seed:demo

import { hashPassword } from '../utils/password.js';
import { generateDeviceKey } from '../repositories/devices.js';
import { pool, closeDb } from '../config/db.js';

const DEMO_EMAIL = 'farmer@demo.local';
const DEMO_PASS  = 'Farmer@123';
const DEMO_NAME  = 'Demo Farmer';

async function getOrCreateDemoUser() {
  const [existing] = await pool.query('SELECT id FROM users WHERE email = ?', [DEMO_EMAIL]);
  if (existing.length) return existing[0].id;
  const hash = await hashPassword(DEMO_PASS);
  const [result] = await pool.query(
    'INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)',
    [DEMO_NAME, DEMO_EMAIL, hash, 'farmer']
  );
  return result.insertId;
}

async function wipeDemo(userId) {
  // Cascade deletes from fields → zones → readings/events/devices/schedules.
  await pool.query('DELETE FROM fields WHERE user_id = ?', [userId]);
  await pool.query('DELETE FROM alerts WHERE user_id = ?', [userId]);
}

async function cropId(name) {
  const [rows] = await pool.query('SELECT id FROM crops WHERE name = ? LIMIT 1', [name]);
  return rows[0]?.id;
}

async function seedField(userId, { name, sizeAcres, soilType, location }) {
  const [r] = await pool.query(
    `INSERT INTO fields (user_id, name, size_acres, soil_type, location)
     VALUES (?, ?, ?, ?, ?)`,
    [userId, name, sizeAcres, soilType, location]
  );
  return r.insertId;
}

async function seedZone({ fieldId, name, cropName, area, low = null, high = null }) {
  const cId = await cropId(cropName);
  const [r] = await pool.query(
    `INSERT INTO zones
       (field_id, crop_id, name, area_sqm, is_enabled,
        moisture_threshold_low, moisture_threshold_high)
     VALUES (?, ?, ?, ?, 1, ?, ?)`,
    [fieldId, cId, name, area, low, high]
  );
  return r.insertId;
}

async function seedDevice({ zoneId, name, type, online = true }) {
  const key = generateDeviceKey();
  const [r] = await pool.query(
    `INSERT INTO devices (zone_id, name, type, device_key, status, last_heartbeat)
     VALUES (?, ?, ?, ?, ?, ${online ? 'NOW()' : 'NULL'})`,
    [zoneId, name, type, key, online ? 'online' : 'offline']
  );
  return { id: r.insertId, key };
}

// Generate 24 hours of sensor readings every 10 minutes per zone with a
// realistic moisture curve: drops slowly, jumps after a simulated irrigation.
async function seedReadings(zoneId, baseMoisture, deviceId) {
  const now = Date.now();
  const intervalSec = 600; // 10 min
  const hours = 24;
  let moisture = baseMoisture;
  const rows = [];
  for (let i = hours * 6; i >= 0; i--) {
    const recordedAt = new Date(now - i * intervalSec * 1000);
    // simulate occasional irrigation bump every ~5h
    if (i > 0 && i % 30 === 0 && moisture < 50) moisture += 18 + Math.random() * 5;
    else moisture = Math.max(15, moisture - 0.3 - Math.random() * 0.5);
    moisture = Math.min(95, moisture);

    const humidity = 50 + Math.sin(i / 8) * 15 + Math.random() * 4;
    const tank     = Math.max(40, 95 - (i / (hours * 6)) * 40 + (Math.random() - 0.5) * 3);
    const temp     = 26 + Math.sin(i / 12) * 6 + (Math.random() - 0.5);

    rows.push([
      zoneId, deviceId,
      Number(moisture.toFixed(2)),
      Number(humidity.toFixed(2)),
      Number(tank.toFixed(2)),
      Number(temp.toFixed(2)),
      recordedAt.toISOString().slice(0, 19).replace('T', ' '),
    ]);
  }
  // Bulk insert
  await pool.query(
    `INSERT INTO sensor_readings
       (zone_id, device_id, moisture_pct, humidity_pct, water_level, temperature_c, recorded_at)
     VALUES ?`,
    [rows]
  );
}

// A handful of historical irrigation events for the report charts.
async function seedIrrigationEvents(zoneId, userId) {
  const now = Date.now();
  const events = [
    { hoursAgo: 20, durSec: 600, by: 'auto',      status: 'completed', reason: 'moisture 28% below threshold 30%' },
    { hoursAgo: 18, durSec: 540, by: 'scheduled', status: 'completed', reason: 'scheduled run (06:00, 10 min)' },
    { hoursAgo: 14, durSec: 480, by: 'manual',    status: 'completed', reason: 'manual start by farmer@demo.local' },
    { hoursAgo: 10, durSec: 120, by: 'auto',      status: 'aborted',   reason: 'rain 75% expected — stopping auto irrigation' },
    { hoursAgo:  4, durSec: 720, by: 'auto',      status: 'completed', reason: 'moisture 27% below threshold 30%' },
  ];
  for (const e of events) {
    const start = new Date(now - e.hoursAgo * 3600 * 1000);
    const end   = new Date(start.getTime() + e.durSec * 1000);
    await pool.query(
      `INSERT INTO irrigation_events
         (zone_id, triggered_by, reason, user_id, start_time, end_time, duration_sec, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        zoneId, e.by, e.reason,
        e.by === 'manual' ? userId : null,
        start.toISOString().slice(0, 19).replace('T', ' '),
        end.toISOString().slice(0, 19).replace('T', ' '),
        e.durSec, e.status,
      ]
    );
  }
}

async function seedSchedule(zoneId, userId, startTime = '06:00:00', durationMinutes = 10) {
  await pool.query(
    `INSERT INTO schedules (zone_id, created_by, start_time, duration_minutes, repeat_days, is_active)
     VALUES (?, ?, ?, ?, ?, 1)`,
    [zoneId, userId, startTime, durationMinutes, 'daily']
  );
}

async function seedAlerts(userId, zoneId, deviceId) {
  const ago = (h) => new Date(Date.now() - h * 3600 * 1000).toISOString().slice(0, 19).replace('T', ' ');
  const rows = [
    [userId, 'rain_expected',  'info',    'Auto-irrigation in "Wheat field" stopped: rain 75% expected.', 'zone',   zoneId,  0, ago(10)],
    [userId, 'moisture_low',   'warning', 'Zone "Cotton field" is dry (24%) but rain 70% expected — irrigation skipped.', 'zone', zoneId,  1, ago(8)],
    [userId, 'device_offline', 'warning', 'Device "Sensor-2" went offline (no heartbeat for 120s).',     'device', deviceId, 0, ago(2)],
  ];
  for (const r of rows) {
    await pool.query(
      `INSERT INTO alerts (user_id, type, severity, message, related_entity, related_id, is_read, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      r
    );
  }
}

async function run() {
  console.log('[seedDemo] starting');
  const userId = await getOrCreateDemoUser();
  console.log(`[seedDemo] demo user id=${userId} (${DEMO_EMAIL} / ${DEMO_PASS})`);

  console.log('[seedDemo] wiping existing demo data');
  await wipeDemo(userId);

  console.log('[seedDemo] creating two fields');
  const field1 = await seedField(userId, { name: 'Green Acres',  sizeAcres: 5.0, soilType: 'Loam',  location: 'Lahore, Pakistan' });
  const field2 = await seedField(userId, { name: 'Hillside Plot', sizeAcres: 3.2, soilType: 'Sandy loam', location: 'Faisalabad, Pakistan' });

  console.log('[seedDemo] creating zones (with one per-zone override)');
  const zones = {
    wheat:     await seedZone({ fieldId: field1, name: 'Wheat field',     cropName: 'Wheat',     area: 600 }),
    rice:      await seedZone({ fieldId: field1, name: 'Rice paddy',      cropName: 'Rice',      area: 800 }),
    cotton:    await seedZone({ fieldId: field1, name: 'Cotton field',    cropName: 'Cotton',    area: 400 }),
    // Per-zone override: this Wheat zone has sandy soil and wants tighter band 35-50 (instead of crop default 30-60).
    wheat2:    await seedZone({ fieldId: field2, name: 'North Wheat',     cropName: 'Wheat',     area: 350, low: 35, high: 50 }),
    maize:     await seedZone({ fieldId: field2, name: 'Maize patch',     cropName: 'Maize',     area: 500 }),
    sugarcane: await seedZone({ fieldId: field2, name: 'Sugarcane block', cropName: 'Sugarcane', area: 700 }),
  };
  console.log('[seedDemo] zone ids:', zones);

  console.log('[seedDemo] registering devices');
  const devices = {
    wheat:     await seedDevice({ zoneId: zones.wheat,     name: 'Controller-Wheat',     type: 'controller',     online: true  }),
    rice:      await seedDevice({ zoneId: zones.rice,      name: 'Controller-Rice',      type: 'controller',     online: true  }),
    cotton:    await seedDevice({ zoneId: zones.cotton,    name: 'Sensor-Cotton',        type: 'soil_moisture',  online: false }),
    wheat2:    await seedDevice({ zoneId: zones.wheat2,    name: 'Controller-NWheat',    type: 'controller',     online: true  }),
    maize:     await seedDevice({ zoneId: zones.maize,     name: 'Controller-Maize',     type: 'controller',     online: true  }),
    sugarcane: await seedDevice({ zoneId: zones.sugarcane, name: 'Controller-Sugarcane', type: 'controller',     online: true  }),
  };

  console.log('[seedDemo] generating 24h of readings per zone (6 zones × 6 readings/h = 864 rows)');
  await seedReadings(zones.wheat,     55, devices.wheat.id);
  await seedReadings(zones.rice,      70, devices.rice.id);
  await seedReadings(zones.cotton,    35, devices.cotton.id);
  await seedReadings(zones.wheat2,    42, devices.wheat2.id);
  await seedReadings(zones.maize,     50, devices.maize.id);
  await seedReadings(zones.sugarcane, 60, devices.sugarcane.id);

  console.log('[seedDemo] seeding irrigation history across zones');
  await seedIrrigationEvents(zones.wheat,     userId);
  await seedIrrigationEvents(zones.rice,      userId);
  await seedIrrigationEvents(zones.wheat2,    userId);
  await seedIrrigationEvents(zones.maize,     userId);
  await seedIrrigationEvents(zones.sugarcane, userId);

  console.log('[seedDemo] seeding 2 schedules');
  await seedSchedule(zones.wheat,     userId, '06:00:00', 10);
  await seedSchedule(zones.sugarcane, userId, '18:00:00', 15);

  console.log('[seedDemo] seeding alerts');
  await seedAlerts(userId, zones.cotton, devices.cotton.id);

  console.log('\n=== Demo ready ===');
  console.log(`  Login as:        ${DEMO_EMAIL}`);
  console.log(`  Password:        ${DEMO_PASS}`);
  console.log(`  Fields:          "Green Acres" (Lahore) + "Hillside Plot" (Faisalabad)`);
  console.log(`  Zones (6):`);
  console.log(`    #${zones.wheat}  Wheat field      (Wheat)     — crop default thresholds`);
  console.log(`    #${zones.rice}  Rice paddy       (Rice)`);
  console.log(`    #${zones.cotton}  Cotton field     (Cotton)`);
  console.log(`    #${zones.wheat2}  North Wheat      (Wheat)     — per-zone override 35-50%`);
  console.log(`    #${zones.maize}  Maize patch      (Maize)`);
  console.log(`    #${zones.sugarcane}  Sugarcane block  (Sugarcane)`);
  console.log(`  Device keys for simulator (zone_id → key):`);
  for (const [name, z] of Object.entries(zones)) {
    console.log(`    zone ${z.toString().padStart(2)} (${name.padEnd(9)}):  ${devices[name].key}`);
  }
}

try { await run(); }
catch (e) { console.error('[seedDemo] FAILED:', e.message); process.exitCode = 1; }
finally { await closeDb().catch(() => {}); }
