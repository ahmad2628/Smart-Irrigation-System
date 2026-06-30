// USB-Serial bridge.
// Reads JSON lines from an Arduino on a USB serial port and POSTs each
// reading to the backend's /api/ingest/readings endpoint.
//
// Usage:
//   SERIAL_PORT=/dev/cu.usbmodem11201 \
//   API_URL=http://localhost:4000 \
//   DEVICE_KEY=dk_xxx \
//   ZONE_ID=1 \
//   node bridge.js
//
// To find your port:
//   npm run list-ports
//   (macOS) ls /dev/cu.*
//   (Linux) ls /dev/ttyACM* /dev/ttyUSB*

import { SerialPort } from 'serialport';
import { ReadlineParser } from '@serialport/parser-readline';

const argv = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = a.match(/^--([^=]+)=(.+)$/);
    return m ? [m[1], m[2]] : [a.replace(/^--/, ''), true];
  })
);

const SERIAL_PORT = process.env.SERIAL_PORT || argv['port'];
const BAUD        = Number(process.env.BAUD || argv['baud'] || 9600);
const API_URL     = process.env.API_URL || argv['api-url'] || 'http://localhost:4000';
const DEVICE_KEY  = process.env.DEVICE_KEY || argv['device-key'];
const ZONE_ID     = Number(process.env.ZONE_ID || argv['zone-id'] || 0);

if (!SERIAL_PORT) {
  console.error('Missing SERIAL_PORT.');
  console.error('  macOS:  ls /dev/cu.usbmodem*');
  console.error('  Linux:  ls /dev/ttyACM* /dev/ttyUSB*');
  console.error('  Windows: open Device Manager → Ports (COM3, COM4, …)');
  process.exit(1);
}
if (!DEVICE_KEY) { console.error('Missing DEVICE_KEY (register a device in the dashboard).'); process.exit(1); }
if (!ZONE_ID)    { console.error('Missing ZONE_ID (zone this device reports for).'); process.exit(1); }

console.log(`[bridge] listening on ${SERIAL_PORT} @ ${BAUD} baud`);
console.log(`[bridge] forwarding to ${API_URL}/api/ingest/readings`);
console.log(`[bridge] zone=${ZONE_ID}, key=${DEVICE_KEY.slice(0, 10)}…`);

const port = new SerialPort({ path: SERIAL_PORT, baudRate: BAUD });
const parser = port.pipe(new ReadlineParser({ delimiter: '\n' }));

port.on('open', () => console.log('[bridge] serial port open'));
port.on('error', (e) => console.error('[bridge] serial error:', e.message));

parser.on('data', async (line) => {
  const trimmed = line.trim();
  if (!trimmed.startsWith('{')) return; // ignore boot banners / debug prints

  let reading;
  try { reading = JSON.parse(trimmed); }
  catch (e) { console.warn('[bridge] bad JSON:', trimmed.slice(0, 80)); return; }

  // Drop the hello banner
  if (reading.hello) {
    console.log('[bridge] arduino said hello:', reading.hello);
    return;
  }

  // Echo debug frames (raw analog values) so we can diagnose calibration
  if (reading._debug) {
    console.log(`[debug] raw_soil=${reading.raw_soil}  raw_level=${reading.raw_level}`);
    return;
  }

  reading.zone_id = ZONE_ID;
  try {
    const res = await fetch(`${API_URL}/api/ingest/readings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Device-Key': DEVICE_KEY },
      body: JSON.stringify(reading),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error(`[bridge] HTTP ${res.status}: ${body.error || ''}`);
      return;
    }
    const ts = new Date().toISOString().slice(11, 19);
    console.log(`[${ts}] moisture=${reading.moisture_pct}%  hum=${reading.humidity_pct}%  level=${reading.water_level}%  temp=${reading.temperature_c}°C  →  id=${body.id}`);
  } catch (e) {
    console.error('[bridge] forward failed:', e.message);
  }
});

const stop = () => { console.log('\n[bridge] stopping'); port.close(() => process.exit(0)); };
process.on('SIGINT',  stop);
process.on('SIGTERM', stop);
