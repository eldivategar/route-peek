import fastify from 'fastify';

const app = fastify();

app.all('/v5-all', async (req, reply) => 'all');

export default app;
