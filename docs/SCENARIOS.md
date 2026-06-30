# Operational Scenarios

This document enumerates every decision the Smart Irrigation System makes,
the conditions that trigger each one, and the artifacts (events, alerts, logs)
they leave behind.

Each scenario is mapped to its source Functional Requirement (FR_xx) and
Use Case (UC_xx) from the Phase 1 SRS, and where possible includes a real
trace captured from a live run plus a one-line reproduction command.

---

## A. Auto-irrigation scenarios  *(FR_08, UC_09)*

The decision engine runs every `DECISION_PERIOD_SEC` seconds (default 15).
On each cycle it iterates every enabled zone and evaluates the rules below.

### A1. Dry zone + clear weather → **START**

| Item | Detail |
|---|---|
| **Trigger** | `latest_moisture < crop.moisture_threshold_low` AND `peakRainProbability < rain_skip_threshold` AND no event running on this zone |
| **Action** | Insert `irrigation_events` row: `triggered_by='auto'`, `status='running'`, reason `"moisture X% below threshold Y%"` |
| **Side effects** | Simulator/Arduino reads `irrigation_active=true` from `/api/ingest/state` and opens valve |
| **SRS** | FR_08, UC_09 |

**Live trace (Cotton zone, thresholds 25%–55%):**
```
10:05:53  moisture=23.99%   idle              (just dropped below 25%)
10:05:57  moisture=22.37%   idle              engine ticks, detects dry
10:06:01  moisture=28.97%   💧 ON   START      ── event #24 created
```

**Reproduce:**
```bash
# Force a dry reading on a zone, wait one cycle (~10s)
curl -X POST http://localhost:4000/api/ingest/readings \
  -H "X-Device-Key: <key>" -H "Content-Type: application/json" \
  -d '{"zone_id":3,"moisture_pct":18}'
```

---

### A2. Target moisture reached → **STOP**

| Item | Detail |
|---|---|
| **Trigger** | Active event AND `latest_moisture ≥ crop.moisture_threshold_high` |
| **Action** | Update row: `status='completed'`, `end_time=NOW()`, `duration_sec=...`, reason `"moisture X% reached upper threshold Y%"` |
| **SRS** | FR_08, UC_09 |

**Live trace (continuing from A1):**
```
10:06:14  moisture=41.77%   💧 ON   continue
10:06:22  moisture=55.96%   💧 ON   continue   (just crossed 55% upper)
10:06:30  moisture=60.54%   off     STOP        ── event #24 → completed (31s)
```

**Verify in DB:**
```sql
SELECT id, triggered_by, status, reason, duration_sec
  FROM irrigation_events WHERE zone_id=3 ORDER BY id DESC LIMIT 1;
```

---

### A3. Dry zone but rain forecast ≥ 60% → **SKIP**

| Item | Detail |
|---|---|
| **Trigger** | `moisture < threshold_low` AND `peakRainProbability ≥ rain_skip_threshold` AND no event running |
| **Action** | No event created. Emit `moisture_low` alert (warning). |
| **Why** | Avoid wasting water when nature will do it |
| **SRS** | FR_08, FR_13, UC_09, UC_15 |

**Engine log:**
```
[engine] cycle: skip:1 idle:2  peakRain=85%
[engine]   zone=3 SKIP: moisture 22% < 25% but rain 85% >= 60%
```

**Reproduce:**
```bash
# Force a high-rain forecast directly into cache
docker exec smart-irrigation-mysql mysql -uroot -psmart_root smart_irrigation -e \
  "INSERT INTO weather_data (location,rain_probability,forecast_for,fetched_at)
   VALUES ('Lahore,PK',85, NOW()+INTERVAL 3 HOUR, NOW());"
# Then post a dry reading. Within one cycle the engine SKIPs.
```

---

### A4. Rain forecast spikes during active auto run → **ABORT**

| Item | Detail |
|---|---|
| **Trigger** | Event is running, `triggered_by='auto'`, AND `peakRainProbability ≥ rain_skip_threshold` |
| **Action** | Event ends with `status='aborted'`, reason `"rain X% expected — stopping auto irrigation"`. Emit `rain_expected` alert. |
| **Important** | Only `auto` runs respect rain — `manual` and `scheduled` keep going (user explicitly chose) |
| **SRS** | FR_08, FR_13 |

**Reproduce:**
```bash
# While an auto event is running, inject a high rain forecast.
# The engine's next cycle (~10s) will abort it.
```

---

### A5. Safety duration cap exceeded → **ABORT**

| Item | Detail |
|---|---|
| **Trigger** | Active event running longer than `max_irrigation_minutes × 60` seconds (default 30 min) |
| **Action** | Event ends with `status='aborted'`, reason `"max duration Xs exceeded"`. Emit `device_fault` alert (warning). |
| **Why** | Protects against a stuck-low moisture sensor or broken valve flooding the field |
| **SRS** | FR_08 (safety), FR_14 |
| **Configurable** | Admin can change `max_irrigation_minutes` via Settings |

---

## B. Manual irrigation scenarios  *(FR_09, UC_10)*

### B1. Manual start without duration → run until natural stop

| Item | Detail |
|---|---|
| **Endpoint** | `POST /api/zones/:id/irrigation/start` with body `{}` |
| **Stops when** | A2 (upper threshold) OR user clicks Stop OR A5 (safety cap) |
| **SRS** | FR_09, UC_10 |

### B2. Manual start with duration → auto-stop at target_end_time

| Item | Detail |
|---|---|
| **Endpoint** | `POST /api/zones/:id/irrigation/start` with `{"duration_minutes": 15}` |
| **Stored** | `irrigation_events.target_end_time = NOW() + INTERVAL 15 MINUTE` |
| **Stop logic** | Engine each cycle: if `NOW() >= target_end_time`, end event with reason `"requested duration completed"` |

**Reproduce:**
```bash
curl -X POST http://localhost:4000/api/zones/1/irrigation/start \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"duration_minutes":2}'
# Watch event auto-stop after 2 minutes
```

### B3. Manual stop → completed immediately

| Item | Detail |
|---|---|
| **Endpoint** | `POST /api/zones/:id/irrigation/stop` |
| **Action** | Update event: `status='completed'`, reason `"manual stop by <email>"` |

### B4. Bulk multi-zone start/stop  *(UC_11)*

| Item | Detail |
|---|---|
| **Endpoint** | `POST /api/irrigation/start` body `{"zone_ids":[1,2,3]}` |
| **Per-zone outcomes** | `started` list + `skipped` list with reasons: `not_found`, `forbidden`, `already_running` |
| **Idempotent** | Re-running with same body just adds to `skipped` |

**Sample response:**
```json
{
  "started":  [{"zone_id":1,"event_id":42}, {"zone_id":3,"event_id":43}],
  "skipped":  [{"zone_id":2,"reason":"already_running","event_id":40}]
}
```

---

## C. Scheduled irrigation scenarios  *(FR_10, UC_12)*

### C1. Schedule fires at exact UTC minute

| Item | Detail |
|---|---|
| **Trigger** | Active schedule AND `current_utc_hour:minute` matches `schedule.start_time` (HH:MM) AND today's weekday in `repeat_days` |
| **Action** | Start event `triggered_by='scheduled'`, `schedule_id=N`, `target_end_time=NOW()+duration_minutes` |
| **SRS** | FR_10, UC_12 |

**Engine log:**
```
[engine]   schedule=1 → started event=42 on zone=3
```

### C2. Schedule fires but zone already running → SKIP

| Item | Detail |
|---|---|
| **Detection** | `findActiveEventForZone(zone_id)` returns row → skip this schedule |
| **Why** | Don't double-water |

### C3. Schedule won't fire twice in the same UTC day

| Item | Detail |
|---|---|
| **Detection** | `hasFiredToday(schedule_id)` checks `irrigation_events WHERE schedule_id=? AND start_time >= UTC_DATE()` |
| **Why** | Prevents loops if the cycle window catches the same minute twice |

### C4. Schedule duration elapsed → STOP

| Item | Detail |
|---|---|
| **Trigger** | Active scheduled event AND `NOW() >= target_end_time` |
| **Action** | Same as B2 — `status='completed'`, reason `"requested duration completed"` |

### C5. Weekday filter respected

`repeat_days` accepts `"daily"` or CSV of `mon,tue,wed,thu,fri,sat,sun`.
A schedule with `"mon,wed,fri"` will be checked but only fires on those weekdays.

---

## D. Device health scenarios  *(FR_14, FR_16, UC_16, UC_18)*

### D1. Device offline detection

| Item | Detail |
|---|---|
| **Trigger** | Each engine cycle: any device where `status='online'` AND `last_heartbeat < NOW() - INTERVAL device_offline_after_sec SECOND` |
| **Action** | Update `devices.status='offline'`. Emit `device_offline` warning alert. |
| **Configurable** | `device_offline_after_sec` (default 120s) |
| **SRS** | FR_14, UC_16 |

**Reproduce:**
```bash
# Age the heartbeat past the threshold
docker exec smart-irrigation-mysql mysql -uroot -psmart_root smart_irrigation -e \
  "UPDATE devices SET status='online',
          last_heartbeat=(NOW() - INTERVAL 200 SECOND) WHERE id=1;"
# Within one engine cycle the device flips to offline and an alert appears.
```

### D2. Device recovery → online

| Item | Detail |
|---|---|
| **Trigger** | Device posts a reading via `POST /api/ingest/readings` |
| **Action** | `requireDevice` middleware fires `touchHeartbeat(deviceId)` which updates `last_heartbeat=NOW()` and `status='online'` |

### D3. Zone with no readings → idle

| Item | Detail |
|---|---|
| **Trigger** | `getLatestReading(zone_id)` returns `null` |
| **Action** | Engine returns `{ action: 'idle', reason: 'no sensor reading yet' }`. **No false starts on uninitialized zones.** |

---

## E. Multi-user / authorization scenarios  *(FR_01, FR_02, FR_03, FR_18)*

### E1. Cross-user data isolation

| Item | Detail |
|---|---|
| **Mechanism** | Every `loadOwned*` helper checks `resource.owner_id === req.user.id` (ownership traverses `zone → field → user`) |
| **Failure mode** | 403 `Not your zone/field/device` (not 404, so privileged callers can distinguish) |
| **SRS** | FR_01, FR_02 |

**Test (Bilal tries to read Ali's field):**
```bash
curl -H "Authorization: Bearer $BILAL_TOKEN" http://localhost:4000/api/fields/1
# → {"error":"Not your field"}  (HTTP 403)
```

### E2. Admin role bypass

| Item | Detail |
|---|---|
| **Allowed** | If `req.user.role === 'admin'`, ownership checks are skipped |
| **Restricted** | `/api/admin/*` routes use `requireRole('admin')` middleware |
| **Examples** | `/api/admin/logs`, `/api/admin/config`, `/api/admin/backup`, `/api/admin/restore` |

### E3. Device-key authentication (separate from JWT)

| Item | Detail |
|---|---|
| **Used by** | IoT devices on `POST /api/ingest/readings` and `GET /api/ingest/state` |
| **Header** | `X-Device-Key: dk_…` |
| **Why separate** | IoT devices shouldn't have a user's JWT; per-device keys can be revoked without user impact |
| **SRS** | FR_16, UC_18 |

### E4. Logout (FR_18, UC_20)

JWT is stateless, so logout = client discards the token. The `POST /api/auth/logout` endpoint exists for activity logging only.

---

## F. Notification scenarios  *(FR_13, UC_15)*

### F1. Live SSE delivery

| Item | Detail |
|---|---|
| **Endpoint** | `GET /api/alerts/stream?token=...` (token in query — `EventSource` can't set headers) |
| **Wire format** | `event: alert\ndata: {...}\n\n` |
| **Filtering** | Server filters by `user_id` so farmers only get their own + system-wide |
| **Heartbeat** | `: ping` comment every 25s to keep proxies happy |

### F2. Alert types

| Type | Severity | Source |
|---|---|---|
| `moisture_low` | warning | A3 (rain-skip when zone is dry) |
| `rain_expected` | info | A4 (active auto run aborted) |
| `device_fault` | warning | A5 (safety cap aborted a run) |
| `device_offline` | warning | D1 (heartbeat stale) |
| `schedule_conflict` | warning | (reserved — overlapping schedules) |
| `system` | info | (reserved — admin notices) |

### F3. Dedupe window

Each alert emitter passes `windowMin` to `hasRecentAlert(...)`. Same `(type, related_entity, related_id)` within the window is dropped.
- `device_offline` window: ~3 min (avoids flapping spam)
- `moisture_low` window: 30 min (one alert per long dry spell)
- `rain_expected` window: 10 min
- `device_fault` window: 10 min

---

## G. Resilience scenarios

### G1. Weather API down → graceful fallback

| Item | Detail |
|---|---|
| **Trigger** | OpenWeatherMap returns non-2xx, times out, or `WEATHER_API_KEY` empty |
| **Response** | Backend returns last successful snapshot from `weather_data` with `source: "cache-fallback (...)"` |
| **Engine behavior** | Continues using cached `peakRainProbability`. If no cache exists, `peakRain=0` and engine proceeds without rain consideration. |

### G2. Server restart with active irrigation

| Item | Detail |
|---|---|
| **Symptom** | DB has rows with `status='running'` but no in-memory state |
| **Recovery** | Engine's first cycle re-reads `irrigation_events WHERE status='running'`. Safety cap (A5) catches anything truly stuck. |
| **Risk** | Brief window during restart where the simulator might post a reading the engine hasn't yet evaluated — handled gracefully |

### G3. Config cache freshness

| Item | Detail |
|---|---|
| **Cache** | 60s TTL on `system_config` reads |
| **Invalidation** | `PUT /api/admin/config` invalidates entire cache. Backup-restore also invalidates. |
| **Implication** | Changes via UI take effect within one engine cycle. Direct DB edits take up to 60s. |

---

## H. Data lifecycle scenarios

### H1. Backup snapshot

| Item | Detail |
|---|---|
| **Endpoint** | `GET /api/admin/backup` (or `?compact=true`) |
| **Output** | JSON with `{ version, generated_at, generated_by, tables: {...}, counts: {...} }` |
| **Modes** | Full = all 12 tables · Compact = 7 structural tables only (no time-series) |
| **SRS** | FR_17, UC_19 |

### H2. Restore

| Item | Detail |
|---|---|
| **Endpoint** | `POST /api/admin/restore` with backup JSON in body |
| **Semantics** | Tables in the backup are TRUNCATEd and INSERTed; tables NOT in the backup are untouched |
| **FK handling** | Disables foreign key checks during operation; re-enables on completion |
| **JSON columns** | `activity_logs.details` (and similar) are re-stringified during INSERT |

### H3. Reports & exports  *(FR_11, FR_12)*

| Endpoint | Format |
|---|---|
| `/api/reports/summary?from=…&to=…&zone_id=…` | JSON (stat cards) |
| `/api/reports/irrigation.csv` | CSV — every event in range |
| `/api/reports/readings.csv` | CSV — every reading in range |
| `/api/reports/summary.pdf` | PDF generated by PDFKit |

---

## Quick reference: which decision happens when

```
                       ┌── moisture < low ──┐
sensor reading arrives ─┤                    ├──► no event running
                       └── moisture ≥ low ──┘                 │
                                                              │
        ┌─────────────────────────────────────────────────────┘
        │
        ▼
   peakRain ≥ skip ──► SKIP + moisture_low alert
        │
        └──► START event (triggered_by=auto)
              │
              │ on next cycles, while running:
              ├── moisture ≥ high            ──► STOP   (target reached)
              ├── peakRain ≥ skip            ──► ABORT  (rain_expected alert)
              ├── duration ≥ max_irrigation_minutes ──► ABORT  (device_fault alert)
              ├── target_end_time reached    ──► STOP   (manual/scheduled only)
              └── otherwise                  ──► continue
```

```
schedule check (each cycle):
  for each active schedule:
    if start_time matches NOW (UTC hour:minute)
      AND today in repeat_days
      AND not already_fired_today(schedule)
      AND no active event on zone:
    → START event (triggered_by=scheduled, target_end_time=NOW+duration)
```

```
device health check (each cycle):
  for each device WHERE status='online' AND last_heartbeat < NOW - threshold:
    → status='offline' + emit device_offline alert
```

---

## SRS coverage matrix

| FR | UC | Scenarios |
|---|---|---|
| FR_01 Create account | UC_01 | E1 (data isolation), E2 (admin role) |
| FR_02 Login | UC_02 | E1, E4 |
| FR_03 View dashboard | UC_03 | All scenarios are observable on the dashboard |
| FR_04 Manage fields | UC_04 | E1 (ownership) |
| FR_05 Select crop | UC_06 | A1, A2 (thresholds drive engine) |
| FR_06 Read sensor data | UC_07 | A1–A5 inputs, D3 |
| FR_07 Fetch weather data | UC_08 | A3, A4, G1 |
| FR_08 Automatic irrigation | UC_09 | A1, A2, A3, A4, A5 |
| FR_09 Manual irrigation | UC_10 | B1, B2, B3, B4 |
| FR_10 Irrigation scheduling | UC_12 | C1, C2, C3, C4, C5 |
| FR_11 Activity logging | UC_13 | All write operations emit activity_logs rows; H3 reports |
| FR_12 Generate reports | UC_14 | H3 (CSV/PDF) |
| FR_13 Notifications | UC_15 | F1, F2, F3 |
| FR_14 Device health | UC_16 | D1, D2 |
| FR_15 System config | UC_17 | G3, admin Settings page |
| FR_16 IoT controller setup | UC_18 | E3, D1, D2 |
| FR_17 Backup & restore | UC_19 | H1, H2 |
| FR_18 Logout | UC_20 | E4 |
