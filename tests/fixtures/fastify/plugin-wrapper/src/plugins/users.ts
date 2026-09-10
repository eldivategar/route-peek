import fp from 'fastify-plugin';
import { FastifyInstance } from 'fastify';

async function userPlugin(fastify: FastifyInstance) {
  fastify.get('/profile', async () => ({ user: 'alice' }));
  fastify.post('/profile', async () => ({ updated: true }));
}

export default fp(userPlugin);
