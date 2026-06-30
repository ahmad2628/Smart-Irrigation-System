/*
  Smart Irrigation IoT Device
  Hardware: Arduino Uno + W5100 Ethernet Shield
            + Capacitive soil moisture sensor (analog)
            + DHT11 humidity/temperature sensor
            + Water-level sensor (analog)
            + 5V relay module driving a 12V solenoid valve

  This sketch replaces the simulator. It:
    1. Posts sensor readings to POST /api/ingest/readings every READING_INTERVAL_MS
    2. Polls   GET  /api/ingest/state?zone_id=...    every STATE_POLL_MS
       and opens/closes the relay (which drives the solenoid valve) accordingly.

  Required libraries (install via Arduino IDE Library Manager):
    - Ethernet           (built-in)
    - DHT sensor library  by Adafruit
    - Adafruit Unified Sensor
    - ArduinoJson         by Benoit Blanchon  (v7+)
*/

#include <SPI.h>
#include <Ethernet.h>
#include <DHT.h>
#include <ArduinoJson.h>

// ============================ CONFIGURE ME =============================

// Your backend server (laptop running the Express API on the same LAN).
// Use the laptop's LAN IP, NOT localhost. Run `ipconfig` (Win) or
// `ifconfig | grep inet` (mac) and pick the 192.168.x.x address.
const char SERVER_HOST[] = "192.168.1.100";
const uint16_t SERVER_PORT = 4000;

// Device credentials issued by the dashboard at POST /api/devices.
const char DEVICE_KEY[] = "dk_REPLACE_ME_WITH_YOUR_KEY";
const int  ZONE_ID = 1;

// Sensor calibration. Capacitive soil sensors typically read:
//   ~1023 = dry air, ~300 = in water. Calibrate your specific sensor:
//   1) Put it in dry air, note the analogRead value → SOIL_RAW_DRY
//   2) Submerge in water, note that value             → SOIL_RAW_WET
const int SOIL_RAW_DRY = 1023;
const int SOIL_RAW_WET = 300;

// Water level / tank sensor: 0 (empty) → ~700 (full) on a typical
// SEN-13322. Adjust per your sensor.
const int LEVEL_RAW_EMPTY = 0;
const int LEVEL_RAW_FULL  = 700;

// Timing
const unsigned long READING_INTERVAL_MS = 10000UL;  // post every 10s
const unsigned long STATE_POLL_MS       = 5000UL;   // check valve state every 5s

// ============================== PINOUT =================================
// SPI pins 10–13 are reserved by the Ethernet Shield.
const uint8_t PIN_SOIL  = A0;
const uint8_t PIN_LEVEL = A1;
const uint8_t PIN_DHT   = 7;
const uint8_t PIN_RELAY = 8;
const uint8_t PIN_LED_ACTIVITY = 9;  // optional status LED

// =======================================================================

byte mac[] = { 0xDE, 0xAD, 0xBE, 0xEF, 0xFE, 0xED };
EthernetClient client;
DHT dht(PIN_DHT, DHT11);

unsigned long lastReading   = 0;
unsigned long lastStatePoll = 0;
bool valveOpen = false;

// ----------------------------------------------------------------------
void setup() {
  Serial.begin(9600);
  pinMode(PIN_RELAY, OUTPUT);
  pinMode(PIN_LED_ACTIVITY, OUTPUT);
  setValve(false);

  dht.begin();

  Serial.println(F("[boot] starting Ethernet..."));
  if (Ethernet.begin(mac) == 0) {
    Serial.println(F("[boot] DHCP failed. Hardware OK?"));
    while (true) { blink(2); delay(2000); }
  }
  Serial.print(F("[boot] IP: "));
  Serial.println(Ethernet.localIP());
  Serial.print(F("[boot] reporting to http://"));
  Serial.print(SERVER_HOST); Serial.print(F(":")); Serial.println(SERVER_PORT);
}

// ----------------------------------------------------------------------
void loop() {
  unsigned long now = millis();

  if (now - lastReading >= READING_INTERVAL_MS) {
    lastReading = now;
    postReading();
  }
  if (now - lastStatePoll >= STATE_POLL_MS) {
    lastStatePoll = now;
    pollState();
  }
  Ethernet.maintain();  // keeps DHCP lease alive
}

// ============================ SENSORS ==================================
float readSoilMoisturePct() {
  int raw = analogRead(PIN_SOIL);
  // Higher raw = drier soil → invert mapping
  long pct = map(raw, SOIL_RAW_DRY, SOIL_RAW_WET, 0, 100);
  if (pct < 0) pct = 0; if (pct > 100) pct = 100;
  return (float)pct;
}

float readWaterLevelPct() {
  int raw = analogRead(PIN_LEVEL);
  long pct = map(raw, LEVEL_RAW_EMPTY, LEVEL_RAW_FULL, 0, 100);
  if (pct < 0) pct = 0; if (pct > 100) pct = 100;
  return (float)pct;
}

// ============================ ACTUATOR =================================
// Most relay modules are active-LOW: pulling the input LOW closes the relay.
void setValve(bool open) {
  if (open == valveOpen) return;
  valveOpen = open;
  digitalWrite(PIN_RELAY, open ? LOW : HIGH);
  Serial.print(F("[valve] "));
  Serial.println(open ? F("OPEN") : F("CLOSED"));
}

void blink(int times) {
  for (int i = 0; i < times; i++) {
    digitalWrite(PIN_LED_ACTIVITY, HIGH); delay(80);
    digitalWrite(PIN_LED_ACTIVITY, LOW);  delay(80);
  }
}

// ============================ HTTP =====================================
//
// We craft raw HTTP/1.1 requests rather than pulling in a heavier HTTP
// client library — saves a few KB of RAM on the Uno.
//
bool connectToServer() {
  if (client.connect(SERVER_HOST, SERVER_PORT)) return true;
  Serial.println(F("[http] connect failed"));
  return false;
}

void postReading() {
  digitalWrite(PIN_LED_ACTIVITY, HIGH);

  float soil  = readSoilMoisturePct();
  float hum   = dht.readHumidity();
  float temp  = dht.readTemperature();
  float level = readWaterLevelPct();

  if (isnan(hum))  hum  = 0;
  if (isnan(temp)) temp = 0;

  JsonDocument doc;
  doc["zone_id"]       = ZONE_ID;
  doc["moisture_pct"]  = soil;
  doc["humidity_pct"]  = hum;
  doc["water_level"]   = level;
  doc["temperature_c"] = temp;

  String body;
  serializeJson(doc, body);

  if (!connectToServer()) { digitalWrite(PIN_LED_ACTIVITY, LOW); return; }

  client.print(F("POST /api/ingest/readings HTTP/1.1\r\n"));
  client.print(F("Host: "));         client.print(SERVER_HOST); client.print(F("\r\n"));
  client.print(F("X-Device-Key: ")); client.print(DEVICE_KEY);  client.print(F("\r\n"));
  client.print(F("Content-Type: application/json\r\n"));
  client.print(F("Content-Length: ")); client.print(body.length()); client.print(F("\r\n"));
  client.print(F("Connection: close\r\n\r\n"));
  client.print(body);

  // Wait for response (up to 3s)
  unsigned long t0 = millis();
  while (!client.available() && client.connected() && millis() - t0 < 3000) delay(10);

  if (client.available()) {
    String statusLine = client.readStringUntil('\n');
    statusLine.trim();
    Serial.print(F("[post]  ")); Serial.print(soil); Serial.print(F("% / "));
    Serial.print(hum);  Serial.print(F("% / "));
    Serial.print(temp); Serial.print(F("°C → ")); Serial.println(statusLine);
  }
  client.stop();
  digitalWrite(PIN_LED_ACTIVITY, LOW);
}

void pollState() {
  if (!connectToServer()) return;

  client.print(F("GET /api/ingest/state?zone_id="));
  client.print(ZONE_ID);
  client.print(F(" HTTP/1.1\r\n"));
  client.print(F("Host: "));         client.print(SERVER_HOST); client.print(F("\r\n"));
  client.print(F("X-Device-Key: ")); client.print(DEVICE_KEY);  client.print(F("\r\n"));
  client.print(F("Connection: close\r\n\r\n"));

  // Skip HTTP headers
  unsigned long t0 = millis();
  while (client.connected() && millis() - t0 < 3000) {
    String line = client.readStringUntil('\n');
    if (line == "\r" || line.length() <= 1) break;
  }

  // Read JSON body
  String body;
  while (client.available()) body += (char)client.read();
  client.stop();

  JsonDocument doc;
  DeserializationError err = deserializeJson(doc, body);
  if (err) {
    Serial.print(F("[state] JSON error: ")); Serial.println(err.c_str());
    return;
  }

  bool active = doc["irrigation_active"] | false;
  setValve(active);
}
