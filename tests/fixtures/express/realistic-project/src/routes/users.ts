import express from 'express';
import { listUsers, getUser, createUser, deleteUser } from '../controllers/userController';
import { requireAuth } from '../middleware/auth';

const router = express.Router();

router.get('/', listUsers);
router.post('/', requireAuth, createUser);
router.get('/:id', getUser);
router.delete('/:id', requireAuth, deleteUser);

export default router;
