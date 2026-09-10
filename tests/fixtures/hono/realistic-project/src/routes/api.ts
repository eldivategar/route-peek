import { Hono } from 'hono';
import users from './users';
import auth from './auth';

const api = new Hono();

api.route('/users', users);
api.route('/auth', auth);

export default api;
