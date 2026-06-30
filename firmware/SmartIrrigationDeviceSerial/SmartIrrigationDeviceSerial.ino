/*
  Smart Irrigation IoT Device — Serial (USB) variant
  Hardware: Arduino Uno
            + Capacitive soil moisture sensor   (signal → A0)
            + Water-level sensor                (signal → A1)
            + DHT11 humidity / temperature      (DATA   → D7)

  No Ethernet shield. The Arduino simply prints JSON over USB Serial.
  A Node.js bridge running on your laptop reads the serial stream and
  forwards each reading to the backend's REST API.

  Required libraries:
    - DHT sensor library         by Adafruit
    - Adafruit Unified Sensor    by Adafruit
*/

#include <DHT.h>

// ============================ CONFIGURE ME =============================

// Soil moisture sensor calibration. Capacitive sensors typically:
//   ~1023 = dry air, ~300 = submerged in water
// Run with default values once, then adjust to your sensor.
const int SOIL_RAW_DRY = 1023;
const int SOIL_RAW_WET = 300;

// Water-level (analog) sensor calibration.
// Many cheap modules have a high baseline due to a pull-up on the signal pin.
// Read the raw value in two states (printed by the debug line) and put them here:
//   - LEVEL_RAW_EMPTY = sensor dry in air
//   - LEVEL_RAW_FULL  = sensor fully submerged / wet
const int LEVEL_RAW_EMPTY = 918;
const int LEVEL_RAW_FULL  = 1023;

// Print a reading every N milliseconds.
const unsigned long READING_INTERVAL_MS = 10000UL;

// ============================== PINOUT =================================
const uint8_t PIN_SOIL  = A0;
const uint8_t PIN_LEVEL = A1;
const uint8_t PIN_DHT   = 7;

// =======================================================================

DHT dht(PIN_DHT, DHT11);
unsigned long lastReading = 0;

// ----------------------------------------------------------------------
void setup() {
  Serial.begin(9600);
  dht.begin();
  // Wait briefly so the bridge has time to attach.
  delay(1500);
  Serial.println("{\"hello\":\"smart-irrigation-arduino\"}");
}

// ----------------------------------------------------------------------
void loop() {
  unsigned long now = millis();
  if (now - lastReading < READING_INTERVAL_MS) return;
  lastReading = now;

  float soil  = readSoilMoisturePct();
  float level = readWaterLevelPct();
  float hum   = dht.readHumidity();
  float temp  = dht.readTemperature();

  if (isnan(hum))  hum  = 0;
  if (isnan(temp)) temp = 0;

  // Debug: also print raw analog values as a JSON line the bridge ignores
  Serial.print(F("{\"_debug\":1,\"raw_soil\":"));  Serial.print(analogRead(PIN_SOIL));
  Serial.print(F(",\"raw_level\":"));              Serial.print(analogRead(PIN_LEVEL));
  Serial.println(F("}"));

  // Stream one JSON object per line — easy to parse on the laptop.
  Serial.print(F("{\"moisture_pct\":"));    Serial.print(soil, 2);
  Serial.print(F(",\"humidity_pct\":"));    Serial.print(hum, 2);
  Serial.print(F(",\"water_level\":"));     Serial.print(level, 2);
  Serial.print(F(",\"temperature_c\":"));   Serial.print(temp, 2);
  Serial.println(F("}"));
}

// ============================ SENSORS ==================================
float readSoilMoisturePct() {
  int raw = analogRead(PIN_SOIL);
  long pct = map(raw, SOIL_RAW_DRY, SOIL_RAW_WET, 0, 100);
  if (pct < 0)   pct = 0;
  if (pct > 100) pct = 100;
  return (float)pct;
}

float readWaterLevelPct() {
  int raw = analogRead(PIN_LEVEL);
  long pct = map(raw, LEVEL_RAW_EMPTY, LEVEL_RAW_FULL, 0, 100);
  if (pct < 0)   pct = 0;
  if (pct > 100) pct = 100;
  return (float)pct;
}
