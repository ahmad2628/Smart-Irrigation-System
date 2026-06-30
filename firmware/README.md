# Arduino Uno Firmware — Phase 12

Replaces the Node `simulator/` with real hardware. The device:
1. Reads soil moisture, humidity/temperature (DHT11), and water-level sensors
2. POSTs the readings to the backend every 10 seconds
3. Polls the backend every 5 seconds to learn whether irrigation is on
4. Switches a relay (and therefore a solenoid valve / pump) accordingly

The backend's IoT API is unchanged — the Arduino simply replaces the simulator.

## Bill of materials

| Component | Notes / approx. price (PKR) |
|---|---|
| Arduino Uno R3 | ~1,300 |
| W5100 Ethernet Shield (or W5500) | ~1,400 — must use SPI pins 10–13 |
| Capacitive soil moisture sensor v1.2 | ~250 — prefer capacitive over resistive (no corrosion) |
| DHT11 module | ~200 |
| Water-level sensor module (SEN-13322 or similar) | ~150 |
| 5V single-channel relay module | ~250 |
| 12V DC solenoid valve (1/2", normally-closed) | ~2,500 |
| 12V 1A power adapter | ~600 |
| Submersible pump (optional, for tank → valve) | ~800 |
| Breadboard + jumper wires | ~400 |
| RJ45 cable + free LAN port on your router | — |

Total ≈ **PKR 7,500** for a working single-zone rig.

## Wiring

```
Arduino Uno + Ethernet Shield   (Ethernet uses SPI pins 10–13 — leave them alone)

  A0 ── Soil moisture sensor  (signal)
  A1 ── Water level sensor    (signal)
  D7 ── DHT11                  (DATA, with 4.7kΩ pull-up to 5V — many breakout
                                modules already have this on board)
  D8 ── Relay IN
  D9 ── Status LED (+ 220Ω to GND)  — optional, blinks when posting

  5V ── soil sensor VCC, DHT11 VCC, water level VCC, relay VCC
  GND── soil sensor GND, DHT11 GND, water level GND, relay GND

  Relay COM ── +12V from external adapter
  Relay NO  ── + side of solenoid valve
  Solenoid − ── GND of 12V adapter
                (NEVER power the valve from the Arduino's 5V — it'll brown out)

  Ethernet ── RJ45 to your home router  (same LAN as the laptop running backend)
```

### Wiring diagram (ASCII)

```
                +-------------------------+
   12V DC ─┐    |                         |
           ├─── | COM     Relay     IN ───|── D8 ── Arduino
   Solenoid+──  | NO              VCC ────|── 5V
   Solenoid−──┐ |                 GND ────|── GND
              | +-------------------------+
              |
              └──── 12V GND  (common with adapter)
```

## Firmware setup

1. **Open the sketch** in Arduino IDE 2.x:
   ```
   firmware/SmartIrrigationDevice/SmartIrrigationDevice.ino
   ```

2. **Install libraries** (Library Manager → Tools → Manage Libraries):
   - `Ethernet`  (built-in)
   - `DHT sensor library` by Adafruit
   - `Adafruit Unified Sensor`
   - `ArduinoJson` by Benoit Blanchon (v7+)

3. **Configure the constants** at the top of the sketch:
   ```cpp
   const char SERVER_HOST[] = "192.168.1.100";   // your laptop's LAN IP
   const uint16_t SERVER_PORT = 4000;
   const char DEVICE_KEY[]  = "dk_…";            // see "Get a device key" below
   const int  ZONE_ID = 1;
   ```

   To find your laptop's LAN IP:
   ```bash
   # macOS
   ipconfig getifaddr en0
   # Linux
   hostname -I | awk '{print $1}'
   # Windows
   ipconfig | findstr IPv4
   ```

4. **Calibrate the soil sensor** (one-time):
   - Upload the sketch, open Serial Monitor (9600 baud)
   - In dry air, note `[post]` moisture reading → expect ~0%
   - In a glass of water, note → expect ~100%
   - If wrong, adjust `SOIL_RAW_DRY` and `SOIL_RAW_WET` and re-upload

5. **Upload** with Tools → Board → Arduino Uno, Port → /dev/cu.usbmodem… (or COMx).

## Get a device key

Register the Arduino as a "controller" device through the dashboard:

1. Login as the farmer (or admin) at http://localhost:4000
2. Open **Devices** in the sidebar
3. Click **Register device**:
   - Name: e.g. `Arduino-WheatField`
   - Type: `controller`
   - Zone: pick the zone this physical device is wired to
4. A green box appears with a `dk_…` key. **Copy it now** — it's shown only once.
5. Paste it into the sketch's `DEVICE_KEY[]` constant. Re-upload.

## Verify it's working

Open Serial Monitor at 9600 baud. You should see:

```
[boot] starting Ethernet...
[boot] IP: 192.168.1.42
[boot] reporting to http://192.168.1.100:4000
[post]  43.20% / 55.40% / 28.30°C → HTTP/1.1 201 Created
[post]  41.80% / 56.10% / 28.20°C → HTTP/1.1 201 Created
[valve] OPEN
```

In parallel, in the dashboard's **Overview** tab the zone's card should now
show live readings updating every 10 seconds, and the **last_heartbeat** in
the **Devices** tab will refresh.

When moisture falls below the zone's lower threshold, the decision engine
fires `START`, the Arduino's next state-poll picks up `irrigation_active=true`,
and the relay closes (valve opens). Reverse on STOP.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| `DHCP failed` on boot | Ethernet cable unplugged, or router not handing out leases |
| `connect failed` repeating | Wrong `SERVER_HOST` IP, or laptop firewall blocks port 4000 |
| Server returns 401 | `DEVICE_KEY` typo or stale (got regenerated) |
| Server returns 403 "Device not authorized for this zone" | The device was registered to a different zone than `ZONE_ID` |
| DHT11 reading `nan` | Loose data wire / missing 4.7kΩ pull-up resistor |
| Moisture stuck at 0% or 100% | Wrong calibration; re-run section 4 |
| Valve doesn't open | Relay wired backwards; some modules are active-HIGH — flip the `LOW`/`HIGH` in `setValve()` |
| Brown-out / Arduino resets when valve opens | You're trying to power the valve from Arduino 5V. Use the separate 12V adapter. |

## How this maps to the SRS

| FR / UC | Where in firmware |
|---|---|
| FR_06 Read sensor data, UC_07 | `readSoilMoisturePct()`, `dht.read*()`, `readWaterLevelPct()` |
| FR_16 IoT controller setup, UC_18 | `DEVICE_KEY` registration flow + `setup()` |
| FR_08 Auto irrigation (actuator side), UC_09 | `pollState()` + `setValve()` |
| FR_14 Device health monitoring, UC_16 | Heartbeat = each successful POST refreshes `last_heartbeat` server-side |

## Multi-zone setups

For a real farm with multiple zones, build one Arduino node **per zone**.
Each has its own device key + relay/valve. They share the LAN and post to
the same backend independently. The backend already supports this — every
endpoint is keyed by `zone_id`.
