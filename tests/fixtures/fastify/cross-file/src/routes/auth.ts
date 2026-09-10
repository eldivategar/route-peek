module.exports = async function authRoutes(fastify: any) {
  fastify.post('/login', async (req: any, reply: any) => ({ token: 'xyz' }));
  fastify.post('/register', async (req: any, reply: any) => ({ registered: true }));
};
