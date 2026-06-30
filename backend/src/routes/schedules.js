import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { list, create, get, update, remove } from '../controllers/schedules.js';

const router = Router();
router.use(requireAuth);

router.get('/', list);
router.post('/', create);
router.get('/:id', get);
router.put('/:id', update);
router.delete('/:id', remove);

export default router;
