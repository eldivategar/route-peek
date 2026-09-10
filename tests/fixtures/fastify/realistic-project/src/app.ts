import Fastify from 'fastify';
import apiPlugin from './routes/api';

const app = Fastify();

app.get('/health', async () => ({ status: 'ok' }));
app.register(apiPlugin, { prefix: '/api' });

export default app;
