# USB Serial Bridge

Reads JSON lines from an Arduino over USB serial and forwards each reading to
the backend's `/api/ingest/readings` endpoint. Use this when the Arduino has
no network capability of its own (no Ethernet/WiFi shield).

```
┌──────────────────┐   USB    ┌────────────────────┐   HTTP    ┌──────────────┐
│ Arduino Uno      │ ───────► │ Node bridge (this) │ ────────► │ Backend API  │
│ (3 sensors)      │  serial  │ on your laptop     │           │ :4000        │
└──────────────────┘  9600    └────────────────────┘           └──────────────┘
```

## Install

```bash
cd serial-bridge
npm install
```

## Run

```bash
SERIAL_PORT=/dev/cu.usbmodem11201 \
API_URL=http://localhost:4000 \
DEVICE_KEY=dk_xxx \
ZONE_ID=1 \
node bridge.js
```

Or use flags:
```bash
node bridge.js --port=/dev/cu.usbmodem11201 --device-key=dk_xxx --zone-id=1
```

## Find your serial port

| OS | Command |
|---|---|
| macOS | `ls /dev/cu.usbmodem*` |
| Linux | `ls /dev/ttyACM* /dev/ttyUSB*` |
| Windows | Device Manager → Ports (COM3 / COM4 / …) |

You can also run `npm run list-ports`.

## What the bridge expects from the Arduino

Each line should be a JSON object with one or more of the metrics below.
Anything else (boot banners, debug prints) is silently ignored.

```json
{"moisture_pct":42.5,"humidity_pct":60.2,"water_level":78,"temperature_c":29.4}
```

The companion sketch `firmware/SmartIrrigationDeviceSerial/` does this for you.

## Get a device key

In the dashboard:
1. Login (admin or farmer)
2. **Devices → Register device**
3. Name = anything, Type = `controller`, Zone = pick the zone this rig waters
4. The response shows a `dk_…` key. Copy it (shown only once).
5. Pass it as `DEVICE_KEY` to the bridge.

## Troubleshooting

| Symptom | Likely fix |
|---|---|
| `Error: opening /dev/...` | Wrong port, or another program (Arduino Serial Monitor) is using it. Close the monitor and retry. |
| `Permission denied` on Linux | Add yourself to `dialout`: `sudo usermod -aG dialout $USER` then log out / back in. |
| HTTP 401 from API | `DEVICE_KEY` typo or device was deleted. Re-register. |
| HTTP 403 *"Device not authorized for this zone"* | The device was registered to a different `zone_id` than the one passed in. |
| Nothing arrives | Open `Tools → Serial Monitor` in Arduino IDE at 9600 baud — confirm the sketch is actually printing JSON. Then close the monitor before starting the bridge. |
