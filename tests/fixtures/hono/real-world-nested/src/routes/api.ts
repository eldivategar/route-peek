import { Hono } from 'hono';
import { authRouter } from './auth.route.js';
import { diagnoseRouter } from './diagnose.route.js';

const apiV1 = new Hono();

apiV1.get('/docs', (c) => c.text('docs'));
apiV1.get('/health', (c) => c.text('health'));

apiV1.route('/auth', authRouter);
apiV1.route('/diagnose', diagnoseRouter);

export { apiV1 };
