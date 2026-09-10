import { Hono } from 'hono';
import { listUsers, createUser, getUser, deleteUser } from '../controllers/userController';

const router = new Hono();

router.get('/', listUsers);
router.post('/', createUser);
router.get('/:id', getUser);
router.delete('/:id', deleteUser);

export default router;
