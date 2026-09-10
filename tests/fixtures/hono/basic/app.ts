import { Hono } from 'hono';

const app = new Hono();

app.get('/users', (c) => c.text('list'));
app.post('/users', (c) => c.text('create'));
app.put('/users/:id', (c) => c.text('update'));
app.patch('/users/:id', (c) => c.text('patch'));
app.delete('/users/:id', (c) => c.text('delete'));
app.options('/users', (c) => c.text('options'));
app.all('/wildcard', (c) => c.text('all'));

export default app;
