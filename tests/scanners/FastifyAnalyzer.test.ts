import { describe, it, expect } from 'vitest';
import { FastifyAnalyzer } from '../../src/scanners/fastify/FastifyAnalyzer';

describe('FastifyAnalyzer', () => {
  const analyzer = new FastifyAnalyzer();

  it('extracts standard Fastify shorthand HTTP methods', () => {
    const code = `
      import fastify from 'fastify';
      const app = fastify();
      app.get('/users', async (req, reply) => []);
      app.post('/users', async (req, reply) => ({}));
      app.put('/users/:id', async (req, reply) => ({}));
      app.patch('/users/:id', async (req, reply) => ({}));
      app.delete('/users/:id', async (req, reply) => ({}));
      app.head('/users', async (req, reply) => {});
      app.options('/users', async (req, reply) => {});
    `;

    const result = analyzer.analyzeFile('src/app.ts', '/mock/src/app.ts', code);
    expect(result.routes).toHaveLength(7);
    expect(result.routes.map((r) => `${r.method} ${r.rawPath}`)).toEqual([
      'GET /users',
      'POST /users',
      'PUT /users/:id',
      'PATCH /users/:id',
      'DELETE /users/:id',
      'HEAD /users',
      'OPTIONS /users',
    ]);
    expect(result.routes[0].source.line).toBe(4);
    expect(result.routes[0].source.column).toBe(11);
  });

  it('expands app.all() into 8 canonical methods including TRACE when Fastify version < 5', () => {
    const code = `
      import fastify from 'fastify';
      const app = fastify();
      app.all('/all-routes', async (req, reply) => 'all');
    `;

    const result = analyzer.analyzeFile('src/app.ts', '/mock/src/app.ts', code, {
      fastifyMajorVersion: 4,
    });
    expect(result.routes).toHaveLength(8);
    const methods = result.routes.map((r) => r.method);
    expect(methods).toEqual(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD', 'TRACE']);
    expect(methods).toContain('TRACE');
  });

  it('expands app.all() into 7 canonical methods excluding TRACE when Fastify version >= 5', () => {
    const code = `
      import fastify from 'fastify';
      const app = fastify();
      app.all('/all-routes', async (req, reply) => 'all');
    `;

    const result = analyzer.analyzeFile('src/app.ts', '/mock/src/app.ts', code, {
      fastifyMajorVersion: 5,
    });
    expect(result.routes).toHaveLength(7);
    const methods = result.routes.map((r) => r.method);
    expect(methods).toEqual(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD']);
    expect(methods).not.toContain('TRACE');
  });

  it('uses conservative 7-method default (excluding TRACE) when Fastify version is unknown', () => {
    const code = `
      import fastify from 'fastify';
      const app = fastify();
      app.all('/all-routes', async (req, reply) => 'all');
    `;

    const result = analyzer.analyzeFile('src/app.ts', '/mock/src/app.ts', code);
    expect(result.routes).toHaveLength(7);
    const methods = result.routes.map((r) => r.method);
    expect(methods).not.toContain('TRACE');
  });

  it('extracts object-style route declarations with url and path alias', () => {
    const code = `
      import Fastify from 'fastify';
      const app = Fastify();
      app.route({
        method: 'GET',
        url: '/items',
        handler: async () => []
      });
      app.route({
        method: ['POST', 'PUT'],
        url: '/items/:id',
        handler: async () => ({})
      });
      app.route({
        method: 'PATCH',
        path: '/items/:id',
        handler: async () => ({})
      });
      app.route({
        method: 'DELETE',
        url: '/preferred',
        path: '/ignored',
        handler: async () => ({})
      });
    `;

    const result = analyzer.analyzeFile('src/app.ts', '/mock/src/app.ts', code);
    expect(result.routes).toHaveLength(5);
    expect(result.routes.map((r) => `${r.method} ${r.rawPath}`)).toEqual([
      'GET /items',
      'POST /items/:id',
      'PUT /items/:id',
      'PATCH /items/:id',
      'DELETE /preferred',
    ]);
  });

  it('unwraps fastify-plugin wrappers (fp and fastifyPlugin)', () => {
    const code = `
      import fp from 'fastify-plugin';
      import { FastifyInstance } from 'fastify';

      async function myPlugin(fastify: FastifyInstance) {
        fastify.get('/inside-plugin', async () => 'hello');
      }

      export default fp(myPlugin);
    `;

    const result = analyzer.analyzeFile('src/plugin.ts', '/mock/src/plugin.ts', code);
    expect(result.routes).toHaveLength(1);
    expect(result.routes[0].rawPath).toBe('/inside-plugin');
    expect(result.exports).toHaveLength(1);
    expect(result.exports[0].exportedName).toBe('default');
  });

  it('evaluates local constants and template literals', () => {
    const code = `
      import fastify from 'fastify';
      const app = fastify();
      const PREFIX = '/api';
      const VERSION = 'v1';
      app.get(PREFIX + '/' + VERSION + '/data', async () => {});
      app.post(\`\${PREFIX}/items\`, async () => {});
    `;

    const result = analyzer.analyzeFile('src/app.ts', '/mock/src/app.ts', code);
    expect(result.routes).toHaveLength(2);
    expect(result.routes[0].rawPath).toBe('/api/v1/data');
    expect(result.routes[1].rawPath).toBe('/api/items');
  });

  it('marks unresolvable dynamic expressions as <dynamic> with low confidence', () => {
    const code = `
      import fastify from 'fastify';
      const app = fastify();
      function getPath() { return '/dyn'; }
      app.get(getPath(), async () => {});
      app.post(\`/prefix/\${getPath()}\`, async () => {});
    `;

    const result = analyzer.analyzeFile('src/app.ts', '/mock/src/app.ts', code);
    expect(result.routes).toHaveLength(2);
    expect(result.routes[0].rawPath).toBe('<dynamic>');
    expect(result.routes[0].confidence).toBe('low');
    expect(result.routes[1].rawPath).toBe('/prefix/<dynamic>');
    expect(result.routes[1].confidence).toBe('low');
  });

  it('ignores shadowed variables and non-fastify object calls', () => {
    const code = `
      import fastify from 'fastify';
      const app = fastify();
      app.get('/real', async () => 'real');

      function scope() {
        const app = { get: (p: string) => p };
        app.get('/shadowed');
      }

      const db = { get: (k: string) => k };
      db.get('key');

      const sw = { register: (s: string) => s };
      sw.register('/sw.js');
    `;

    const result = analyzer.analyzeFile('src/app.ts', '/mock/src/app.ts', code);
    expect(result.routes).toHaveLength(1);
    expect(result.routes[0].rawPath).toBe('/real');
    expect(result.registers).toHaveLength(0);
  });

  it('handles syntax errors gracefully without crashing', () => {
    const code = `
      import fastify from 'fastify';
      const app = fastify();
      app.get(
    `;

    const result = analyzer.analyzeFile('src/app.ts', '/mock/src/app.ts', code);
    expect(result.routes).toHaveLength(0);
  });
});
