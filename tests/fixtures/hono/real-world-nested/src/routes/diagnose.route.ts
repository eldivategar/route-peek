import { Hono } from 'hono';

const diagnoseRouter = new Hono();

diagnoseRouter.post('/', (c) => c.text('diagnose'));
diagnoseRouter.get('/:id', (c) => c.text('diagnose id'));

export { diagnoseRouter };
