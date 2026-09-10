import { Hono } from 'hono';

const PREFIX = '/api';
const USERS_PATH = '/users';

const app = new Hono();

app.get(`${PREFIX}${USERS_PATH}`, (c) => c.text('users'));
app.post(PREFIX + '/items', (c) => c.text('items'));

export default app;
