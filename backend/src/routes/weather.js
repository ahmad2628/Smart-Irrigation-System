import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { current, forecast } from '../controllers/weather.js';

const router = Router();
router.use(requireAuth);

router.get('/current',  current);
router.get('/forecast', forecast);

export default router;
