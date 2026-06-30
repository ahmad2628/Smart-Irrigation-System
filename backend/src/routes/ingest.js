import { Router } from 'express';
import { requireDevice } from '../middleware/deviceAuth.js';
import { submitReading, state } from '../controllers/ingest.js';

const router = Router();
router.post('/readings', requireDevice, submitReading);
router.get('/state', requireDevice, state);

export default router;
