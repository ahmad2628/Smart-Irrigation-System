# Thesis Demo Walkthrough

A 10–12 minute live walkthrough of the IoT-Based Smart Irrigation System that exercises every Functional Requirement and Use Case in `Shoaib Project documentation phase 1.docx`.

---

## Before the demo

Run **once** in a terminal:

```bash
cd "/Users/abdulrehmanalvi/Desktop/IoT-Based Smart Irrigation System"

# 1. Start MySQL (Docker)
docker compose up -d

# 2. Reset the database and seed demo data
cd backend
npm run db:demo:reset

# 3. Start the backend (keep this terminal open)
DECISION_PERIOD_SEC=10 npm run dev
```

Open a second terminal for the simulator. Copy one of the device keys printed by `db:seed:demo` (e.g. the Wheat key) — you'll start the simulator partway through the demo to show live data flow.

Open the browser at **http://localhost:4000**.

---

## Section 1 — Login & roles (FR_01, FR_02, FR_18)

1. Open the login page. Show the gradient login UI.
2. Log in as **admin**: `admin@smartirrigation.local` / `Admin@123`.
3. Point out the **admin badge** in the navbar and the **Admin logs** + **Settings** items in the sidebar.
4. Logout. Log in as the **farmer**: `farmer@demo.local` / `Farmer@123`. Note the admin items disappear (role-based UI).

> *"Authentication uses bcrypt-hashed passwords and stateless JWT tokens. Roles enforced both server-side (middleware) and client-side (UI)."*

---

## Section 2 — Overview dashboard (FR_03 / UC_03)

1. **Overview** is the default view. Three cards visible:
   - **Wheat field** — moisture ~55%, status `Idle`, target band visible.
   - **Rice paddy** — moisture ~70%, idle.
   - **Cotton field** — moisture ~35% (dry!), pulsing dot if irrigation active.
2. Point out the **target band** under each moisture bar (from crop's threshold low/high).
3. Mention the "Auto-refresh every 5s" hint at the top.

> *"Every zone is a card with live gauges. Status dot animates if irrigation is running."*

---

## Section 3 — Manual irrigation (FR_09 / UC_10)

1. Click **Start** on the *Cotton field* card.
2. Toast appears: "Irrigation started".
3. Card status changes to "Irrigating (manual)" with a pulsing cyan dot.
4. Click **Stop** to end the run.
5. Open **History** → pick Cotton field → see the event in the table with `triggered_by=manual`.

---

## Section 4 — Fields, Zones, Crops (FR_04, FR_05 / UC_04, UC_05, UC_06)

1. Navigate to **Fields & Zones**.
2. Show the existing field "Green Acres" and three zones.
3. On a zone, use the inline **change crop** dropdown to switch one zone's crop.
4. Show how thresholds update on the Overview card immediately.
5. Optional: create a new field "Demo Plot" and a zone in it.

> *"Each crop has its own moisture profile (e.g., Rice 55–85%, Cotton 25–55%). Switching crops re-targets the decision engine."*

---

## Section 5 — Devices & simulator (FR_06, FR_16 / UC_07, UC_18)

1. Navigate to **Devices**. Show three registered devices, last heartbeats.
2. Note that *Sensor-Cotton* is `offline` (we seeded it that way).
3. **Register a new device:** name "Demo-Sensor", type "soil_moisture", zone "Wheat field". Click **Register**.
4. The green box appears with a `dk_…` device key.

   > *"This key is shown only once. The IoT device — Arduino or simulator — uses it as authentication."*

5. **In your second terminal**, start the simulator using a Wheat zone key from the seed output:

   ```bash
   cd ../simulator
   DEVICE_KEY=dk_xxxxx ZONE_ID=<wheat-zone-id> INTERVAL_SEC=5 node simulator.js
   ```

6. Back in the browser, on **Overview**, the Wheat card's moisture and the *recorded* timestamp now update every 5 seconds.

---

## Section 6 — Decision engine: closed-loop (FR_08 / UC_09)

This is the centerpiece. In the simulator terminal, watch the log show readings drifting down.

1. Show the engine running on the backend log: `[engine] cycle: ...`
2. When moisture passes the Wheat lower threshold (30%), engine fires:
   ```
   [engine]   zone=X START: moisture 28.4% below threshold 30%
   ```
3. Simulator log shows the `💧IRRIG` flag, moisture starts climbing rapidly.
4. Engine then `continue, continue, STOP` when upper threshold (60%) reached.
5. Open **History** → see the new auto event recorded with reason `target moisture reached (...)`.

> *"This is the closed-loop: sensor → engine → command → actuator. With real hardware (Phase 12) the simulator is replaced by an Arduino sketch posting to the same endpoints."*

---

## Section 7 — Weather & rain skip (FR_07 / UC_08)

1. Open **Weather**. Show current conditions + 24h forecast table.
2. If the OpenWeatherMap key is active you'll see live data; otherwise *source: cache-fallback*.
3. Point out the **peak rain probability** badge — if ≥ 60% it says "Engine will skip auto irrigation".
4. *(Optional show)*: temporarily lower `rain_skip_threshold` in **Settings** to demonstrate the engine emitting a `rain_expected` skip alert.

---

## Section 8 — Schedules (FR_10 / UC_12)

1. Navigate to **Schedules**. Show the seeded schedule (06:00 UTC daily, Wheat, 10 min).
2. Create a new schedule for ~2 minutes from now in UTC (so it fires during the demo).
3. Wait until the engine cycle picks it up — backend log:
   ```
   [engine]   schedule=N → started event=M on zone=K
   ```
4. Show the resulting event in **History** with `triggered_by=scheduled` and a `target_end_time`.

---

## Section 9 — Notifications (FR_13 / UC_15)

1. Click the **bell icon** in the navbar — three demo alerts (rain_expected, moisture_low, device_offline).
2. Click **Mark all read** — badge clears.
3. To prove live SSE works: in the **Settings** section as admin, set `rain_skip_threshold=99`. Then in **Fields**, ensure a zone has low moisture (use a real-time tile or wait a tick). Within seconds a toast pops in from `device_fault` or `moisture_low` depending on conditions.

> *"Notifications flow over Server-Sent Events. Alerts are auto-deduplicated within a configurable window to prevent spam."*

---

## Section 10 — Reports (FR_11, FR_12 / UC_13, UC_14)

1. Navigate to **Reports**. The default range is the last 7 days.
2. Filter by zone *Wheat field* → see stat cards update.
3. Show the **Daily irrigation events** bar chart and the by-trigger / by-status breakdowns.
4. Click **Irrigation CSV** → file downloads.
5. Click **Summary PDF** → professional-looking PDF report opens.

> *"All logs are stored in `activity_logs`. Reports aggregate `irrigation_events` and `sensor_readings` via SQL."*

---

## Section 11 — Admin: Config & Backup (FR_15, FR_17 / UC_17, UC_19)

1. Logout, log in as `admin@smartirrigation.local`.
2. Open **Settings**.
3. **Edit thresholds**: change `max_irrigation_minutes` from 30 to 45, click Save. Toast confirms.
4. **Backup**: click **Full backup**. JSON file downloads.
5. *(Optional)* Show the file contents — note 12 tables.
6. To demo restore: open browser DevTools → drop a few rows via the Admin Logs section (or just describe), then upload the JSON and click Restore. Confirm dialog. Result panel shows per-table row counts restored.

---

## Section 12 — Admin: Activity log (FR_11)

1. Open **Admin logs**.
2. Show the system-wide audit trail: register, login, irrigation_start, create, update, backup, restore, etc.

---

## Section 13 — Closing

Summarize:
- Every FR and UC in the SRS is implemented in software.
- Stack: Node.js + Express + MySQL on the backend; vanilla JS + Bootstrap on the frontend; Docker for MySQL; simulator stands in for Arduino.
- Closed-loop automation with crop-aware thresholds + weather-aware skipping.
- Multi-user with role-based access; admin can configure thresholds and back up the system without restarting.

If asked **"where would a real Arduino plug in?"** — the simulator already speaks the production API. An Arduino sketch using the Ethernet Shield posts the same `POST /api/ingest/readings` with the `X-Device-Key` header. That's Phase 12 of the project plan.

---

## Cheat sheet — talking points if you forget

| Topic | One-liner |
|---|---|
| Why this matters | Pakistan uses 90%+ freshwater on agriculture; per-capita water is under 1,000 m³. Smart irrigation reduces waste through real-time, data-driven decisions. |
| What's automated | Sensor reading every 10s · decision every 10–15s · rain forecast every 60min · device health every cycle |
| Key safety feature | `max_irrigation_minutes` — engine aborts any auto run that exceeds the cap, regardless of sensor state |
| What's *not* mocked | Decision logic, scheduling, multi-user, alerts, backup — only the moisture sensor itself is simulated (and would be a real DHT/soil probe in Phase 12) |

## If something breaks live

| Symptom | Quick fix |
|---|---|
| Dashboard empty | `cd backend && npm run db:demo:reset` |
| Simulator can't connect | Make sure backend is on :4000 and key is correct |
| Weather shows "stale cache" | OpenWeatherMap key not yet activated. Mention it; the cached forecast still drives engine behavior. |
| MySQL not running | `docker compose up -d` |
