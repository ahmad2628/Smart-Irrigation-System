# IoT Simulator

A standalone Node script that mimics an Arduino-based IoT controller, posting sensor readings to the backend on an interval. Used until real hardware is wired in (Phase 12).

## Run
```
API_URL=http://localhost:4000 \
DEVICE_KEY=dk_xxx... \
ZONE_ID=1 \
INTERVAL_SEC=10 \
node simulator.js
```

Or with flags:
```
node simulator.js --device-key=dk_xxx --zone-id=1 --interval=10
```

## Getting a device key
1. Log in to the backend and obtain a JWT.
2. `POST /api/devices` with body like `{ "name": "Controller 1", "type": "controller", "zone_id": 1 }`.
3. The response contains `device_key` — store it. It will NOT be shown again.

## Behavior
- Posts 4 metrics: moisture %, humidity %, water level %, temperature °C
- Values drift slowly between bounds so charts look natural
- Each post updates the device's `last_heartbeat` server-side
