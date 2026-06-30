import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { startBulk, stopBulk } from '../controllers/irrigation.js';

const router = Router();
router.use(requireAuth);

router.post('/start', startBulk);
router.post('/stop',  stopBulk);

export default router;
