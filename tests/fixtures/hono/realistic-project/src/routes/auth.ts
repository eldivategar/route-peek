import { Hono } from 'hono';
import { login, register, profile } from '../controllers/authController';

const router = new Hono();

router.post('/login', login);
router.post('/register', register);
router.get('/profile', profile);

export default router;
