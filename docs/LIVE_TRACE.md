# Live Trace — Auto-irrigation cycle on Cotton zone

Captured during a live run of the system on 2026-05-13. Demonstrates
[Scenario A1 (Start)](SCENARIOS.md#a1-dry-zone--clear-weather--start) and
[Scenario A2 (Stop)](SCENARIOS.md#a2-target-moisture-reached--stop) end-to-end.

## Setup
- **Zone:** Cotton field (id=3), crop thresholds 25%–55%
- **Engine cycle:** 10 seconds
- **Simulator:** posting every 5 seconds, drift ~1.5%/tick when idle, +7%/tick when irrigation active
- **Weather:** live OpenWeatherMap call returned 0% rain probability (no skip)

## Timeline

| Time UTC | Sim mode | Moisture | Engine action | Event |
|---|---|---|---|---|
| 10:05:41 | idle | 27.15% | (post previous run) | #21 completed (auto, 30s) |
| 10:05:45 | idle | 27.15% | — | |
| 10:05:49 | idle | 25.81% | — | |
| 10:05:53 | idle | 23.99% | — | (just dropped below 25% threshold) |
| 10:05:57 | idle | 22.37% | — | engine ticking… |
| **10:06:01** | **💧 ON** | **28.97%** | **START** "moisture 22.37% below threshold 25%" | **#24 running (auto)** |
| 10:06:05 | 💧 ON | 35.59% | continue | climbing fast |
| 10:06:10 | 💧 ON | 35.59% | continue | |
| 10:06:14 | 💧 ON | 41.77% | continue | |
| 10:06:18 | 💧 ON | 48.60% | continue | |
| 10:06:22 | 💧 ON | 55.96% | continue | crossed upper threshold ✓ |
| 10:06:26 | 💧 ON | 62.14% | continue | |
| **10:06:30** | **off** | **60.54%** | **STOP** "target moisture reached (62.14% >= 55%)" | **#24 completed (auto, 31s)** |
| 10:06:39 | off | 59.21% | (drying again) | |
| 10:06:51 | off | 55.80% | | |
| 10:07:08 | off | 51.73% | | |
| 10:07:25 | off | 47.69% | | |
| 10:07:41 | off | 42.10% | | (would fire again when below 25%) |

## What this proves

1. **Engine detects dryness without human intervention.** Moisture dropped from
   27% to 22% over four readings; on the next cycle (10:06:01) the engine
   created event #24 with reason matching the SRS specification.
2. **Closed-loop control works.** The simulator polls `GET /api/ingest/state`
   each tick, sees `irrigation_active=true` while #24 is running, and ramps
   moisture up. Without that endpoint, the engine would have no way to drive
   the actuator state for the IoT device.
3. **Engine knows when to stop.** Moisture crossed 55% (Cotton's upper
   threshold) at 10:06:22. The next cycle (10:06:30) ended the event with
   `status='completed'`, `duration_sec=31`.
4. **Cycle repeats cleanly.** From 10:06:30 onward, simulator went back to
   passive drift (moisture decreasing slowly). The same loop will fire again
   when moisture next crosses 25%.

## Trailing engine log (proof)

```
[engine]   zone=3 START: moisture 23.4%  below threshold 25%
[engine]   zone=3 STOP:  target moisture reached (67.08% >= 55%)
[engine]   zone=3 START: moisture 24.65% below threshold 25%
[engine]   zone=3 STOP:  target moisture reached (66.37% >= 55%)
[engine]   zone=3 START: moisture 22.37% below threshold 25%
[engine]   zone=3 STOP:  target moisture reached (62.14% >= 55%)
```

Three full START → STOP cycles in ~4 minutes of wall time. The decision
engine made the right call autonomously every time, driven only by sensor
readings and crop-specific thresholds.

## Reproducing this trace

1. Start the system (`npm run db:demo:reset && npm run dev` in `backend/`)
2. In a second terminal, start the simulator for any zone
3. Force a dry reading on that zone:
   ```bash
   curl -X POST http://localhost:4000/api/ingest/readings \
     -H "X-Device-Key: <key>" -H "Content-Type: application/json" \
     -d '{"zone_id":3,"moisture_pct":18}'
   ```
4. Watch the Overview tab — the card's pulsing cyan dot, climbing moisture
   bar, and "Irrigating (auto)" status are the human-visible projection of
   the trace above.
