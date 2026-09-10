import { FastifyInstance } from 'fastify';
import authPlugin from './auth';
import userPlugin from './users';
import itemPlugin from './items';

export default async function apiPlugin(fastify: FastifyInstance) {
  fastify.register(authPlugin, { prefix: '/auth' });
  fastify.register(userPlugin, { prefix: '/users' });
  fastify.register(itemPlugin, { prefix: '/items' });
}
