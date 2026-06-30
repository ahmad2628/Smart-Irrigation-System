import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { list, create, get, remove } from '../controllers/devices.js';

const router = Router();
router.use(requireAuth);

router.get('/', list);
router.post('/', create);
router.get('/:id', get);
router.delete('/:id', remove);

export default router;
