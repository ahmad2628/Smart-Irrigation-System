// Smart Irrigation IoT Simulator
// Posts realistic, slowly-drifting sensor readings to the backend.
//
// Usage:
//   API_URL=http://localhost:4000 \
//   DEVICE_KEY=dk_xxx \
//   ZONE_ID=1 \
//   INTERVAL_SEC=10 \
//   node simulator.js
//
// You can also pass --device-key and --zone-id on the command line.

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = a.match(/^--([^=]+)=(.+)$/);
    return m ? [m[1], m[2]] : [a.replace(/^--/, ''), true];
  })
);

const API_URL      = process.env.API_URL      || args['api-url']    || 'http://localhost:4000';
const DEVICE_KEY   = process.env.DEVICE_KEY   || args['device-key'];
const ZONE_ID      = Number(process.env.ZONE_ID || args['zone-id'] || 0);
const INTERVAL_SEC = Number(process.env.INTERVAL_SEC || args['interval'] || 10);

if (!DEVICE_KEY) {
  console.error('Missing DEVICE_KEY. Get one from: POST /api/devices');
  process.exit(1);
}
if (!ZONE_ID) {
  console.error('Missing ZONE_ID. Specify the zone this device reports for.');
  process.exit(1);
}

// State that drifts over time so readings look realistic, not like pure noise.
const state = {
  moisture: 45,    // %
  humidity: 55,    // %
  waterLevel: 80,  // % (tank fullness)
  temperature: 28, // °C
};

const drift = (current, { min, max, step }) => {
  const change = (Math.random() - 0.5) * 2 * step;
  let next = current + change;
  if (next < min) next = min + (min - next);
  if (next > max) next = max - (next - max);
  return Number(next.toFixed(2));
};

async function postReading(reading) {
  const res = await fetch(`${API_URL}/api/ingest/readings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Device-Key': DEVICE_KEY,
    },
    body: JSON.stringify(reading),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`HTTP ${res.status}: ${body}`);
  }
  return res.json();
}

async function fetchIrrigationState() {
  try {
    const res = await fetch(`${API_URL}/api/ingest/state?zone_id=${ZONE_ID}`, {
      headers: { 'X-Device-Key': DEVICE_KEY },
    });
    if (!res.ok) return { irrigation_active: false };
    return res.json();
  } catch {
    return { irrigation_active: false };
  }
}

async function tick() {
  // Check if backend's decision engine has triggered irrigation.
  const { irrigation_active } = await fetchIrrigationState();

  if (irrigation_active) {
    // Active irrigation: moisture climbs steadily; water tank drains.
    state.moisture = Math.min(95, state.moisture + 6 + Math.random() * 2);
    state.waterLevel = Math.max(5, state.waterLevel - 1.5);
  } else {
    // Idle: soil dries slowly, with normal jitter.
    state.moisture = Math.max(10, state.moisture - 1.5 + (Math.random() - 0.5));
  }
  state.moisture    = Number(state.moisture.toFixed(2));
  state.waterLevel  = Number(state.waterLevel.toFixed(2));
  state.humidity    = drift(state.humidity,    { min: 30, max: 90, step: 2 });
  state.temperature = drift(state.temperature, { min: 18, max: 42, step: 1 });

  const reading = {
    zone_id: ZONE_ID,
    moisture_pct: state.moisture,
    humidity_pct: state.humidity,
    water_level:  state.waterLevel,
    temperature_c: state.temperature,
  };

  try {
    const result = await postReading(reading);
    const ts = new Date().toISOString().replace('T', ' ').slice(11, 19);
    const tag = irrigation_active ? '💧IRRIG' : '       ';
    console.log(`[${ts}] ${tag} zone=${ZONE_ID} moisture=${state.moisture}% hum=${state.humidity}% lvl=${state.waterLevel}% temp=${state.temperature}°C → id=${result.id}`);
  } catch (e) {
    console.error(`[error] ${e.message}`);
  }
}

console.log(`[simulator] starting`);
console.log(`            API: ${API_URL}`);
console.log(`            zone: ${ZONE_ID}`);
console.log(`            interval: ${INTERVAL_SEC}s`);
console.log(`            device key: ${DEVICE_KEY.slice(0, 8)}...`);

tick();
const handle = setInterval(tick, INTERVAL_SEC * 1000);

const stop = () => {
  console.log('\n[simulator] stopping');
  clearInterval(handle);
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
