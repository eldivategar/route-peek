import { Hono } from 'hono';

function getDynamicPath(): string {
  return '/runtime/' + Math.random();
}

const app = new Hono();

app.get(getDynamicPath(), (c) => c.text('dynamic'));
app.post(`/api/${getDynamicPath()}`, (c) => c.text('mixed'));

export default app;
