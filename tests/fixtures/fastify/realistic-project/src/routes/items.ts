import { FastifyInstance } from 'fastify';

export default async function itemPlugin(fastify: FastifyInstance) {
  fastify.route({
    method: 'GET',
    url: '/',
    handler: async () => [],
  });
  fastify.route({
    method: ['POST', 'PUT'],
    url: '/:id',
    handler: async () => ({ saved: true }),
  });
}
