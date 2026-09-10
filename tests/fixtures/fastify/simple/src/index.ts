import fastify from 'fastify';

const server = fastify();

server.get('/users', async (request, reply) => {
  return [];
});

server.post('/users', async (request, reply) => {
  return { status: 'created' };
});

server.put('/users/:id', async (request, reply) => {
  return { updated: true };
});

server.patch('/users/:id', async (request, reply) => {
  return { patched: true };
});

server.delete('/users/:id', async (request, reply) => {
  return { deleted: true };
});

server.head('/users', async (request, reply) => {
  reply.header('x-total-count', '10');
});

server.options('/users', async (request, reply) => {
  reply.header('allow', 'GET,POST,HEAD,OPTIONS');
});

server.all('/all-endpoint', async (request, reply) => {
  return { all: true };
});
