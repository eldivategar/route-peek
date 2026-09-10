import { Hono } from 'hono';

const app = new Hono();
app.get('/valid-hono', (c) => c.text('valid'));

function outer() {
  const app = {
    get: (_path: string, _fn: any) => {},
  };
  app.get('/shadowed-object', () => {});
}

function handler(app: { post: (p: string) => void }) {
  app.post('/shadowed-param');
}

export default app;
