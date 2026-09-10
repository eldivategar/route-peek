import Fastify from 'fastify';
import userRoutes from './routes/users';
const authRoutes = require('./routes/auth');

const app = Fastify();

app.register(userRoutes, { prefix: '/api/users' });
app.register(authRoutes, { prefix: '/api/auth' });
