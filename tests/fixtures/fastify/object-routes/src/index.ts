import Fastify from 'fastify';

const app = Fastify();

app.route({
  method: 'GET',
  url: '/items',
  handler: async (req, reply) => {
    return [];
  },
});

app.route({
  method: ['GET', 'POST'],
  url: '/batch',
  handler: async (req, reply) => {
    return { ok: true };
  },
});

app.route({
  method: 'DELETE',
  url: '/items/:id',
  handler: async (req, reply) => {
    return { deleted: true };
  },
});

app.route({
  method: 'PATCH',
  path: '/items/:id',
  handler: async (req, reply) => {
    return { patched: true };
  },
});
