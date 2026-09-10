import { Hono } from 'hono';
import api from './routes/api';

const app = new Hono();

app.route('/api', api);

export default app;
