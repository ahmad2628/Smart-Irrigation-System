# IoT-Based Smart Irrigation System

Final-year project (BSCS Fall 2022–2026, Fall-2025-03, advisor Dr. Hammad Aslam, University of Lahore).
End-to-end implementation of the system specified in `Shoaib Project documentation phase 1.docx`.

## Stack

- **Backend** — Node.js 18+ / Express / MySQL 8 (via `mysql2`)
- **Frontend** — vanilla HTML + Bootstrap 5 + Chart.js (served by Express)
- **IoT simulator** — standalone Node script (Arduino sketch slot for Phase 12)
- **Weather** — OpenWeatherMap API
- **Reports** — PDFKit + CSV exporter
- **Live notifications** — Server-Sent Events
- **DB host** — Docker Compose

## Folder structure

```
backend/      Express REST API + decision engine + scheduler
frontend/     Web dashboard (served at /)
simulator/    Virtual IoT device posting readings
firmware/     Arduino sketch (planned for Phase 12)
database/     schema.sql + tables overview
docs/         DEMO.md — thesis walkthrough script
docker-compose.yml   MySQL 8 service
```

## Setup (from a fresh clone)

```bash
# 1. Start MySQL
docker compose up -d

# 2. Install backend deps
cd backend
npm install
cp .env.example .env        # set WEATHER_API_KEY if you have one

# 3. Apply schema + seed admin
npm run db:init
npm run db:seed:admin

# 4. (Optional) Seed demo farm with 24h of history
npm run db:seed:demo

# 5. Start the API + dashboard
npm run dev                 # http://localhost:4000
```

Defaults:
- Admin: `admin@smartirrigation.local` / `Admin@123`
- Demo farmer (after seed): `farmer@demo.local` / `Farmer@123`

## Running the simulator

Register a device via the dashboard (Devices section) or use a key printed by `db:seed:demo`. Then:

```bash
cd simulator
DEVICE_KEY=dk_xxxxxx ZONE_ID=2 INTERVAL_SEC=5 node simulator.js
```

The simulator drifts moisture down naturally and ramps it up while the backend says irrigation is active — so the full closed-loop can be observed in the dashboard.

## NPM scripts (in `backend/`)

| Script | Purpose |
|---|---|
| `npm run dev`           | Start API with auto-reload, decision engine enabled |
| `npm run start`         | Start API (no reload) |
| `npm run db:init`       | Apply `database/schema.sql` (DROPs existing tables!) |
| `npm run db:ping`       | Verify MySQL connection |
| `npm run db:seed:admin` | Idempotent admin account |
| `npm run db:seed:demo`  | Realistic demo farm + 24h history |
| `npm run db:demo:reset` | Wipe + reinitialize + reseed (admin + demo) |

## SRS → code mapping

| Functional Requirement | Lives in |
|---|---|
| FR_01 Create Account | `controllers/auth.js` → `register` |
| FR_02 Login | `controllers/auth.js` → `login` |
| FR_03 View Dashboard | `frontend/index.html` (Overview section), `frontend/js/overview.js` |
| FR_04 Manage Field | `controllers/fields.js` |
| FR_05 Select Crop Type | `controllers/zones.js` → `assignCrop` |
| FR_06 Read Sensor Data | `controllers/ingest.js` → `submitReading` |
| FR_07 Fetch Weather Data | `services/weather.js` |
| FR_08 Automatic Irrigation | `services/decisionEngine.js` |
| FR_09 Manual Irrigation Control | `controllers/irrigation.js` |
| FR_10 Irrigation Scheduling | `controllers/schedules.js`, scheduler in `services/decisionEngine.js#runScheduledFires` |
| FR_11 Activity Logging | `repositories/activityLogs.js` (writes) + `controllers/admin.js#logs` (reads) |
| FR_12 Generate Reports | `controllers/reports.js` (JSON / CSV / PDF) |
| FR_13 Notifications | `services/alertEngine.js` + `controllers/alerts.js` (+ SSE) |
| FR_14 Device Health Monitoring | `services/deviceHealth.js` |
| FR_15 System Configuration | `controllers/admin.js#getConfig/putConfig` |
| FR_16 IoT Controller Setup | `controllers/devices.js` (issues `device_key`) |
| FR_17 Backup & Restore | `controllers/backup.js` |
| FR_18 Logout | `controllers/auth.js` → `logout` |

## Project phases

| # | Phase | Status |
|---|---|---|
| 1  | Foundation (Express + MySQL scaffold) | ✓ |
| 2  | Authentication (JWT, bcrypt, roles) | ✓ |
| 3  | Fields / Zones / Crops CRUD | ✓ |
| 4  | IoT ingestion + simulator | ✓ |
| 5  | Weather API integration | ✓ |
| 6  | Decision engine (closed-loop) | ✓ |
| 7  | Manual / scheduled irrigation | ✓ |
| 8  | Web dashboard | ✓ |
| 9  | Reports (CSV + PDF) | ✓ |
| 10 | Notifications + device health | ✓ |
| 11 | System config + Backup/Restore | ✓ |
| 12 | Arduino firmware | planned |
| 13 | Testing + thesis demo prep | ✓ |

See `docs/DEMO.md` for the thesis defense walkthrough.

## Architecture

```
        ┌────────────────────────────────────────────────┐
        │             Express API (:4000)                │
        │                                                │
   IoT ─┤  /api/ingest/readings    (X-Device-Key auth)   ├─ MySQL
        │  /api/ingest/state                             │   ↑
        │                                                │   │
   Web ─┤  /api/auth /fields /zones /devices /reports …  │   │
        │  /api/alerts/stream (SSE)                      │   │
        │                                                │   │
        │  Decision engine (every 10–15s):               │   │
        │   • read latest reading per zone               │   │
        │   • check thresholds & weather forecast        │───┤
        │   • start/stop irrigation events               │   │
        │   • fire active schedules                      │   │
        │   • check device heartbeats                    │   │
        │   • emit alerts                                │   │
        └────────────────────────────────────────────────┘   │
                                                              │
        ┌────────────────────────────────────────────────┐   │
        │           OpenWeatherMap API                   │───┘
        └────────────────────────────────────────────────┘
```
