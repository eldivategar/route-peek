import { FastifyInstance } from 'fastify';

export default async function userPlugin(fastify: FastifyInstance) {
  fastify.get('/', async () => []);
  fastify.post('/', async () => ({ created: true }));
  fastify.get('/:id', async () => ({ id: '1' }));
  fastify.delete('/:id', async () => ({ deleted: true }));
}
