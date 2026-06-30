import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import {
  list, get, update, assignCrop, remove,
  readings, latestReading, activeIrrigation, irrigationHistory,
} from '../controllers/zones.js';
import { startForZone, stopForZone } from '../controllers/irrigation.js';

const router = Router();
router.use(requireAuth);

router.get('/', list);
router.get('/:id', get);
router.put('/:id', update);
router.delete('/:id', remove);
router.post('/:id/crop', assignCrop);
router.get('/:id/readings', readings);
router.get('/:id/readings/latest', latestReading);
router.get('/:id/irrigation/active', activeIrrigation);
router.get('/:id/irrigation', irrigationHistory);
router.post('/:id/irrigation/start', startForZone);
router.post('/:id/irrigation/stop',  stopForZone);

export default router;
