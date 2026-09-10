import Fastify, { FastifyInstance } from 'fastify';

const server = Fastify();

async function userPlugin(fastify: FastifyInstance) {
  fastify.get('/:id', async (req, reply) => ({ user: true }));
  fastify.post('/', async (req, reply) => ({ created: true }));
}

async function v1Plugin(fastify: FastifyInstance) {
  fastify.register(userPlugin, { prefix: '/users' });
}

async function apiPlugin(fastify: FastifyInstance) {
  fastify.register(v1Plugin, { prefix: '/v1' });
}

server.register(apiPlugin, { prefix: '/api' });
