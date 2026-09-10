import { FastifyInstance } from 'fastify';

export default async function authPlugin(fastify: FastifyInstance) {
  fastify.post('/login', async () => ({ token: 'jwt' }));
  fastify.post('/register', async () => ({ registered: true }));
  fastify.get('/profile', async () => ({ user: 'me' }));
}
