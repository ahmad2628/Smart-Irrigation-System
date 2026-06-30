import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const FRONTEND_DIR = path.resolve(__dirname, '../frontend');
import { notFound, errorHandler } from './middleware/error.js';
import healthRouter from './routes/health.js';
import authRouter from './routes/auth.js';
import cropsRouter from './routes/crops.js';
import fieldsRouter from './routes/fields.js';
import zonesRouter from './routes/zones.js';
import devicesRouter from './routes/devices.js';
import ingestRouter from './routes/ingest.js';
import weatherRouter from './routes/weather.js';
import irrigationRouter from './routes/irrigation.js';
import schedulesRouter from './routes/schedules.js';
import reportsRouter from './routes/reports.js';
import adminRouter from './routes/admin.js';
import alertsRouter from './routes/alerts.js';

export function createApp() {
  const app = express();
  app.use(helmet({
    contentSecurityPolicy: false, // disabled for the dashboard's CDN scripts
  }));
  app.use(cors());
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(morgan('dev'));

  app.use('/', healthRouter);
  app.use('/api/auth', authRouter);
  app.use('/api/crops', cropsRouter);
  app.use('/api/fields', fieldsRouter);
  app.use('/api/zones', zonesRouter);
  app.use('/api/devices', devicesRouter);
  app.use('/api/ingest', ingestRouter);
  app.use('/api/weather', weatherRouter);
  app.use('/api/irrigation', irrigationRouter);
  app.use('/api/schedules', schedulesRouter);
  app.use('/api/reports', reportsRouter);
  app.use('/api/admin', adminRouter);
  app.use('/api/alerts', alertsRouter);

  // Static frontend
  app.use(express.static(FRONTEND_DIR));

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
