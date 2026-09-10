import { FastifyInstance } from 'fastify';

export default async function userRoutes(fastify: FastifyInstance) {
  fastify.get('/profile', async (req, reply) => ({ profile: true }));
  fastify.get('/:id', async (req, reply) => ({ id: (req.params as any).id }));
}
