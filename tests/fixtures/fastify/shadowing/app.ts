import fastify from 'fastify';

const app = fastify();
app.get('/valid-fastify', async (req, reply) => 'valid');

function outer() {
  const app = {
    get: (_path: string, _fn: any) => {},
  };
  app.get('/shadowed-object', () => {});
}

function handler(app: { post: (p: string) => void }) {
  app.post('/shadowed-param');
}

const db = { get: (k: string) => k };
db.get('some-key');

const sw = { register: (s: string) => s };
sw.register('/sw.js');

export default app;
