import express from 'express';
import { login, register, getProfile } from '../controllers/authController';
import { requireAuth } from '../middleware/auth';

const router = express.Router();

router.post('/login', login);
router.post('/register', register);
router.get('/profile', requireAuth, getProfile);

export default router;
