import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { list, create, get, update, remove } from '../controllers/fields.js';
import { listZonesByField, createZoneForField } from '../controllers/zones.js';

const router = Router();
router.use(requireAuth);

router.get('/', list);
router.post('/', create);
router.get('/:id', get);
router.put('/:id', update);
router.delete('/:id', remove);

// Nested zone access for clarity
router.get('/:id/zones', listZonesByField);
router.post('/:id/zones', createZoneForField);

export default router;
