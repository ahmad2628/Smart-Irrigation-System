import 'dotenv/config';

const required = (name, value) => {
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
};

export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 4000),

  db: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: required('DB_USER', process.env.DB_USER),
    password: process.env.DB_PASSWORD ?? '',
    database: required('DB_NAME', process.env.DB_NAME),
  },

  jwt: {
    secret: process.env.JWT_SECRET || 'dev-only-insecure-secret',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },

  weather: {
    apiKey: process.env.WEATHER_API_KEY || '',
    defaultCity: process.env.WEATHER_DEFAULT_CITY || 'Lahore,PK',
  },
};
