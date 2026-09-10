import fastify from 'fastify';
import userPlugin from './plugins/users';

const app = fastify();
app.register(userPlugin, { prefix: '/users' });

export default app;
