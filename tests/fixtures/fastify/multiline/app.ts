import fastify from 'fastify';

const app = fastify();

app.
  get(
    '/multiline-get',
    async (req, reply) => {
      return { ok: true };
    }
  );

app.route({
  method:
    'POST',
  url:
    '/multiline-post',
  handler: async (req, reply) => {
    return { ok: true };
  }
});

export default app;
