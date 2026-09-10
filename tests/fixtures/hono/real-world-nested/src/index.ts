import { Hono } from 'hono';
import { apiV1 } from './routes/api.js';

const app = new Hono();

app.route('/api/v1', apiV1);
app.get('/', (c) => c.text('root'));

export default app;
