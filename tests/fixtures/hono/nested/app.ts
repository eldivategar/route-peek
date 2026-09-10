import { Hono } from 'hono';

const posts = new Hono();
posts.get('/', (c) => c.text('posts'));
posts.get('/:id', (c) => c.text('post detail'));

const api = new Hono();
api.route('/posts', posts);

const app = new Hono();
app.route('/api', api);

export default app;
