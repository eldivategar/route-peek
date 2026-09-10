import fastify from 'fastify';

const server = fastify();

const API_ROOT = '/api';
const USERS_PATH = '/users';
const HEALTH_PATH = '/health';

server.get(HEALTH_PATH, async () => ({ ok: true }));
server.get(`${API_ROOT}${USERS_PATH}`, async () => []);
server.get('/v1' + '/status', async () => ({ status: 'ok' }));
