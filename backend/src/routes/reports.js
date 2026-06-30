import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import {
  summary, irrigationCsv, readingsCsv, summaryPdf,
} from '../controllers/reports.js';

const router = Router();
router.use(requireAuth);

router.get('/summary',        summary);
router.get('/irrigation.csv', irrigationCsv);
router.get('/readings.csv',   readingsCsv);
router.get('/summary.pdf',    summaryPdf);

export default router;
