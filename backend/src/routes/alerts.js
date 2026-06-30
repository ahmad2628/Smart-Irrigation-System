import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { list, read, readAll, remove, stream } from '../controllers/alerts.js';

const router = Router();

// SSE first — its own auth via ?token=...
router.get('/stream', stream);

router.use(requireAuth);
router.get('/', list);
router.post('/read-all', readAll);
router.post('/:id/read', read);
router.delete('/:id', remove);

export default router;
