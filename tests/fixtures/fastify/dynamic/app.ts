import fastify from 'fastify';

function getDynamicPath(): string {
  return '/runtime/' + Math.random();
}

const app = fastify();

app.get(getDynamicPath(), async (req, reply) => 'dynamic');
app.post(`/api/${getDynamicPath()}`, async (req, reply) => 'mixed');

export default app;
