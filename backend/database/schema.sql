-- =====================================================================
-- IoT-Based Smart Irrigation System — MySQL schema
-- Aligned with ERD and Functional Requirements in Phase 1 documentation.
-- =====================================================================

CREATE DATABASE IF NOT EXISTS smart_irrigation
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE smart_irrigation;

SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS activity_logs;
DROP TABLE IF EXISTS alerts;
DROP TABLE IF EXISTS system_config;
DROP TABLE IF EXISTS irrigation_events;
DROP TABLE IF EXISTS schedules;
DROP TABLE IF EXISTS weather_data;
DROP TABLE IF EXISTS sensor_readings;
DROP TABLE IF EXISTS devices;
DROP TABLE IF EXISTS zones;
DROP TABLE IF EXISTS fields;
DROP TABLE IF EXISTS crops;
DROP TABLE IF EXISTS users;

SET FOREIGN_KEY_CHECKS = 1;

-- ---------------------------------------------------------------------
-- USERS  (FR_01 Create Account, FR_02 Login, FR_18 Logout)
-- ---------------------------------------------------------------------
CREATE TABLE users (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  name            VARCHAR(120) NOT NULL,
  email           VARCHAR(160) NOT NULL UNIQUE,
  password_hash   VARCHAR(255) NOT NULL,
  role            ENUM('admin','farmer') NOT NULL DEFAULT 'farmer',
  is_active       TINYINT(1) NOT NULL DEFAULT 1,
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
                  ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- CROPS  (FR_05 Select Crop Type)  — preset moisture/humidity thresholds
-- ---------------------------------------------------------------------
CREATE TABLE crops (
  id                      INT AUTO_INCREMENT PRIMARY KEY,
  name                    VARCHAR(80) NOT NULL UNIQUE,
  description             VARCHAR(255),
  moisture_threshold_low  DECIMAL(5,2) NOT NULL COMMENT 'irrigate when soil moisture % below this',
  moisture_threshold_high DECIMAL(5,2) NOT NULL COMMENT 'stop irrigation when above this',
  ideal_humidity_min      DECIMAL(5,2),
  ideal_humidity_max      DECIMAL(5,2),
  created_at              TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- FIELDS  (FR_04 Manage Field)
-- ---------------------------------------------------------------------
CREATE TABLE fields (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  user_id      INT NOT NULL,
  name         VARCHAR(120) NOT NULL,
  size_acres   DECIMAL(8,2),
  soil_type    VARCHAR(60),
  location     VARCHAR(160),
  created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
               ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_fields_user FOREIGN KEY (user_id)
    REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- ZONES  (UC_05 Manage Zones)  — subdivisions of a field
-- ---------------------------------------------------------------------
CREATE TABLE zones (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  field_id     INT NOT NULL,
  crop_id      INT NULL,
  name         VARCHAR(120) NOT NULL,
  area_sqm     DECIMAL(10,2),
  is_enabled   TINYINT(1) NOT NULL DEFAULT 1,
  moisture_threshold_low  DECIMAL(5,2) NULL COMMENT 'per-zone override; falls back to crop default if NULL',
  moisture_threshold_high DECIMAL(5,2) NULL COMMENT 'per-zone override',
  created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_zones_field FOREIGN KEY (field_id)
    REFERENCES fields(id) ON DELETE CASCADE,
  CONSTRAINT fk_zones_crop  FOREIGN KEY (crop_id)
    REFERENCES crops(id)  ON DELETE SET NULL
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- DEVICES  (FR_16 IoT Controller Setup, FR_14 Device Health)
-- Sensors, controllers, valves, pumps registered against a zone.
-- ---------------------------------------------------------------------
CREATE TABLE devices (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  zone_id         INT NULL,
  name            VARCHAR(120) NOT NULL,
  type            ENUM('controller','soil_moisture','humidity','water_level','valve','pump') NOT NULL,
  device_key      VARCHAR(80) NOT NULL UNIQUE COMMENT 'used by IoT device to authenticate',
  status          ENUM('online','offline','fault') NOT NULL DEFAULT 'offline',
  last_heartbeat  TIMESTAMP NULL,
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_devices_zone FOREIGN KEY (zone_id)
    REFERENCES zones(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- SENSOR_READINGS  (FR_06 Read Sensor Data)
-- ---------------------------------------------------------------------
CREATE TABLE sensor_readings (
  id            BIGINT AUTO_INCREMENT PRIMARY KEY,
  zone_id       INT NOT NULL,
  device_id     INT NULL,
  moisture_pct  DECIMAL(5,2),
  humidity_pct  DECIMAL(5,2),
  water_level   DECIMAL(6,2) COMMENT 'tank level in cm or %',
  temperature_c DECIMAL(5,2),
  recorded_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_readings_zone_time (zone_id, recorded_at),
  CONSTRAINT fk_readings_zone   FOREIGN KEY (zone_id)
    REFERENCES zones(id)   ON DELETE CASCADE,
  CONSTRAINT fk_readings_device FOREIGN KEY (device_id)
    REFERENCES devices(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- WEATHER_DATA  (FR_07 Fetch Weather Data)
-- ---------------------------------------------------------------------
CREATE TABLE weather_data (
  id                BIGINT AUTO_INCREMENT PRIMARY KEY,
  location          VARCHAR(120) NOT NULL,
  temperature_c     DECIMAL(5,2),
  humidity_pct      DECIMAL(5,2),
  rain_probability  DECIMAL(5,2),
  rain_mm           DECIMAL(6,2),
  wind_kph          DECIMAL(5,2),
  condition_text    VARCHAR(80),
  forecast_for      TIMESTAMP NULL COMMENT 'null = current observation',
  fetched_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_weather_loc_time (location, fetched_at)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- SCHEDULES  (FR_10 Irrigation Scheduling)
-- ---------------------------------------------------------------------
CREATE TABLE schedules (
  id                INT AUTO_INCREMENT PRIMARY KEY,
  zone_id           INT NOT NULL,
  created_by        INT NULL,
  start_time        TIME NOT NULL,
  duration_minutes  INT NOT NULL,
  repeat_days       VARCHAR(40) COMMENT 'CSV: mon,tue,... or "daily"',
  is_active         TINYINT(1) NOT NULL DEFAULT 1,
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_schedules_zone FOREIGN KEY (zone_id)
    REFERENCES zones(id) ON DELETE CASCADE,
  CONSTRAINT fk_schedules_user FOREIGN KEY (created_by)
    REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- IRRIGATION_EVENTS  (FR_08, FR_09, FR_11 — auto/manual/scheduled)
-- ---------------------------------------------------------------------
CREATE TABLE irrigation_events (
  id              BIGINT AUTO_INCREMENT PRIMARY KEY,
  zone_id         INT NOT NULL,
  triggered_by    ENUM('auto','manual','scheduled') NOT NULL,
  reason          VARCHAR(255) COMMENT 'e.g. moisture 28% below threshold 35%',
  user_id         INT NULL COMMENT 'set for manual',
  schedule_id     INT NULL COMMENT 'set for scheduled',
  start_time      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  end_time        TIMESTAMP NULL,
  target_end_time TIMESTAMP NULL COMMENT 'set for manual+duration or scheduled runs',
  duration_sec    INT NULL,
  water_liters    DECIMAL(8,2) NULL,
  status          ENUM('running','completed','aborted','failed') NOT NULL DEFAULT 'running',
  INDEX idx_events_zone_time (zone_id, start_time),
  CONSTRAINT fk_events_zone     FOREIGN KEY (zone_id)
    REFERENCES zones(id) ON DELETE CASCADE,
  CONSTRAINT fk_events_user     FOREIGN KEY (user_id)
    REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_events_schedule FOREIGN KEY (schedule_id)
    REFERENCES schedules(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- ALERTS  (FR_13 Notifications)
-- ---------------------------------------------------------------------
CREATE TABLE alerts (
  id              BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id         INT NULL,
  type            ENUM('moisture_low','rain_expected','device_offline','device_fault','schedule_conflict','system') NOT NULL,
  severity        ENUM('info','warning','critical') NOT NULL DEFAULT 'info',
  message         VARCHAR(500) NOT NULL,
  related_entity  VARCHAR(40) COMMENT 'zone / device / schedule',
  related_id      INT,
  is_read         TINYINT(1) NOT NULL DEFAULT 0,
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_alerts_user_time (user_id, created_at),
  CONSTRAINT fk_alerts_user FOREIGN KEY (user_id)
    REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- SYSTEM_CONFIG  (FR_15 System Configuration)
-- ---------------------------------------------------------------------
CREATE TABLE system_config (
  config_key   VARCHAR(80)  NOT NULL PRIMARY KEY,
  config_value VARCHAR(500) NOT NULL,
  updated_by   INT NULL,
  updated_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
               ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_config_user FOREIGN KEY (updated_by)
    REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- ACTIVITY_LOGS  (FR_11 Activity Logging)
-- ---------------------------------------------------------------------
CREATE TABLE activity_logs (
  id           BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id      INT NULL,
  action       VARCHAR(80) NOT NULL,
  entity       VARCHAR(60),
  entity_id    INT,
  details      JSON,
  created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_logs_user_time (user_id, created_at),
  CONSTRAINT fk_logs_user FOREIGN KEY (user_id)
    REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- Seed data — preset crop profiles for FR_05
-- ---------------------------------------------------------------------
INSERT INTO crops (name, description, moisture_threshold_low, moisture_threshold_high, ideal_humidity_min, ideal_humidity_max) VALUES
  ('Wheat',     'Cool-season cereal',       30.00, 60.00, 40.00, 70.00),
  ('Rice',      'High-water paddy crop',    55.00, 85.00, 60.00, 90.00),
  ('Cotton',    'Warm-season fiber crop',   25.00, 55.00, 30.00, 60.00),
  ('Maize',     'Warm-season cereal',       35.00, 65.00, 40.00, 70.00),
  ('Sugarcane', 'High-water tropical crop', 45.00, 75.00, 50.00, 80.00),
  ('Tomato',    'Greenhouse vegetable',     40.00, 70.00, 50.00, 70.00),
  ('Potato',    'Tuber crop',               35.00, 65.00, 40.00, 65.00);

-- Default system thresholds (FR_15)
INSERT INTO system_config (config_key, config_value) VALUES
  ('default_moisture_low',     '35'),
  ('default_moisture_high',    '70'),
  ('rain_skip_threshold',      '60'),  -- skip irrigation if rain probability >= this %
  ('reading_interval_sec',     '10'),
  ('device_offline_after_sec', '120'),
  ('max_irrigation_minutes',   '30'); -- safety cap on a single auto run
