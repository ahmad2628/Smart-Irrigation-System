# Database

`schema.sql` creates the `smart_irrigation` database and all tables.

## Apply the schema

### Option A — via the backend (recommended)
From `backend/`:
```
npm run db:init
```
This connects using `backend/.env` and applies `schema.sql`.

### Option B — MySQL CLI
```
mysql -u root -p < database/schema.sql
```

### Option C — MySQL Workbench / phpMyAdmin
Open `schema.sql` and execute it.

## Tables overview
| Table              | Purpose / SRS link                              |
|--------------------|-------------------------------------------------|
| users              | accounts (FR_01, FR_02, FR_18)                  |
| crops              | preset moisture profiles (FR_05)                |
| fields / zones     | farm structure (FR_04, UC_05)                   |
| devices            | sensors / controller / valves / pump (FR_16)    |
| sensor_readings    | live readings (FR_06)                           |
| weather_data       | OpenWeatherMap snapshots (FR_07)                |
| schedules          | timed irrigation (FR_10)                        |
| irrigation_events  | every irrigation run (FR_08, FR_09, FR_11)      |
| alerts             | notifications (FR_13)                           |
| system_config      | thresholds, intervals (FR_15)                   |
| activity_logs      | audit trail (FR_11)                             |
