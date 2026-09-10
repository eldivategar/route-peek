import { Hono } from 'hono';

const authRouter = new Hono();

authRouter.post('/login', (c) => c.text('login'));
authRouter.get('/profile', (c) => c.text('profile'));

export { authRouter };
