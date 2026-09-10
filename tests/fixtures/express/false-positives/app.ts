import express from 'express';

const app = express();
const handler = () => {};

// Unrelated object method calls
const db = {
  get: (_p: string) => {},
  post: (_p: string) => {},
};
db.get('/users');
db.post('/users');

const cache = {
  get: (_k: string) => {},
};
cache.get('/cache/key');

// Unrelated object named router
const router = {
  get: (_p: string) => {},
};
router.get('/not-an-express-route');

// Middleware-only calls
app.use(handler);
app.use('/api', handler);
