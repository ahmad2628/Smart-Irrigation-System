# Quick start (after unzipping)

## 1. Prerequisites

- macOS / Linux / Windows
- Node.js 18 or newer  → `node --version`
- Docker Desktop installed and **running**
- (Optional) Arduino IDE if you want to use real hardware

## 2. Start MySQL

From the project root:
```bash
docker compose up -d
```

This starts a MySQL 8 container on port 3306 named `smart-irrigation-mysql`.

## 3. Install backend dependencies

```bash
cd backend
npm install
```

## 4. Configure environment

```bash
cp .env.example .env
```

Edit `.env` and (optionally) add your OpenWeatherMap API key
(get one free at https://home.openweathermap.org/users/sign_up):

```
WEATHER_API_KEY=your_key_here
```

Note: the system works without the weather key — it gracefully falls back
to cached data. The decision engine will simply use 0% rain probability.

## 5. Initialize the database

```bash
npm run db:demo:reset
```

This runs:
- `db:init`        → applies `database/schema.sql` (creates 12 tables)
- `db:seed:admin`  → creates admin account `admin@smartirrigation.local / Admin@123`
- `db:seed:demo`   → creates a demo farmer + 2 fields + 6 zones + 24h of history

## 6. Start the backend + dashboard

```bash
npm run dev
```

Open http://localhost:4000 in your browser.

Login as:
- `farmer@demo.local`            / `Farmer@123`  (demo farmer)
- `admin@smartirrigation.local`  / `Admin@123`  (system admin)

## 7. (Optional) Run the simulator

To see live data flow on the dashboard without hardware, start a virtual
IoT device. In a second terminal:

```bash
cd simulator
DEVICE_KEY=<key from db:seed:demo output> ZONE_ID=1 INTERVAL_SEC=5 node simulator.js
```

The seed prints six device keys (one per zone). Each simulator instance
emulates one IoT device posting realistic sensor data every 5 seconds.

## 8. (Optional) Use real hardware over USB

If you have an Arduino Uno wired with soil moisture + DHT11 + water-level sensors:

```bash
# Upload firmware/SmartIrrigationDeviceSerial/SmartIrrigationDeviceSerial.ino
# Then run the bridge:
cd serial-bridge
npm install
SERIAL_PORT=/dev/cu.usbserial-XXXX \
DEVICE_KEY=<key> \
ZONE_ID=1 \
node bridge.js
```

See `firmware/README.md` and `serial-bridge/README.md` for full hardware
setup and wiring instructions.

## Stopping everything

```bash
pkill -f "node src/server.js"
pkill -f "node simulator.js"
pkill -f "node bridge.js"
docker compose down            # optional; stops MySQL
```

## Project documentation

- `README.md`       — full project overview + SRS-to-code mapping
- `docs/DEMO.md`    — 13-section thesis defense walkthrough
- `docs/SCENARIOS.md` — every operational scenario the system handles
- `docs/LIVE_TRACE.md` — a captured real run of the decision engine

## Troubleshooting

| Problem | Fix |
|---|---|
| `Docker daemon not running` | Start Docker Desktop |
| `MySQL connection FAILED` | `docker compose up -d` and wait 10s |
| Port 4000 already in use | `lsof -nP -iTCP:4000` to find the process |
| Weather shows "cache-fallback" | OpenWeatherMap API key not set or not yet activated (takes 1-2 hours) |
| Schema needs reapplying | `npm run db:demo:reset` (wipes DB!) |
