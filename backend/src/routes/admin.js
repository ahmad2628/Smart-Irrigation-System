import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { logs, getConfig, putConfig } from '../controllers/admin.js';
import { backup, restore } from '../controllers/backup.js';
import { create as cropCreate, update as cropUpdate, remove as cropRemove } from '../controllers/crops.admin.js';

const router = Router();
router.use(requireAuth, requireRole('admin'));

router.get('/logs',   logs);
router.get('/config', getConfig);
router.put('/config', putConfig);
router.get('/backup',  backup);
router.post('/restore', restore);

router.post('/crops',       cropCreate);
router.put('/crops/:id',    cropUpdate);
router.delete('/crops/:id', cropRemove);

export default router;
