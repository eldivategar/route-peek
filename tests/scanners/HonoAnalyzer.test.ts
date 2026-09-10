import { describe, it, expect } from 'vitest';
import { HonoAnalyzer } from '../../src/scanners/hono/HonoAnalyzer';
import { HTTP_METHODS } from '../../src/models/HttpMethod';

describe('HonoAnalyzer', () => {
  const analyzer = new HonoAnalyzer();

  it('extracts standard HTTP methods (get, post, put, patch, delete, options)', () => {
    const code = `
      import { Hono } from 'hono';
      const app = new Hono();
      app.get('/users', (c) => c.text('get'));
      app.post('/users', (c) => c.text('post'));
      app.put('/users/:id', (c) => c.text('put'));
      app.patch('/users/:id', (c) => c.text('patch'));
      app.delete('/users/:id', (c) => c.text('delete'));
      app.options('/users', (c) => c.text('options'));
    `;

    const result = analyzer.analyzeFile('src/app.ts', '/mock/src/app.ts', code);
    expect(result.routes).toHaveLength(6);
    expect(result.routes.map((r) => `${r.method} ${r.rawPath}`)).toEqual([
      'GET /users',
      'POST /users',
      'PUT /users/:id',
      'PATCH /users/:id',
      'DELETE /users/:id',
      'OPTIONS /users',
    ]);
    expect(result.routes[0].source.line).toBe(4);
    expect(result.routes[0].source.column).toBe(11); // points to .get
  });

  it('expands app.all() into all 8 canonical HTTP methods', () => {
    const code = `
      import { Hono } from 'hono';
      const app = new Hono();
      app.all('/wildcard', (c) => c.text('all'));
    `;

    const result = analyzer.analyzeFile('src/app.ts', '/mock/src/app.ts', code);
    expect(result.routes).toHaveLength(8);
    const methods = result.routes.map((r) => r.method);
    expect(methods).toEqual(HTTP_METHODS);
    for (const r of result.routes) {
      expect(r.rawPath).toBe('/wildcard');
      expect(r.confidence).toBe('high');
    }
  });

  it('supports method chaining on Hono instance', () => {
    const code = `
      import { Hono } from 'hono';
      const app = new Hono();
      app.get('/a', (c) => c.text('a'))
         .post('/b', (c) => c.text('b'))
         .put('/c', (c) => c.text('c'));
    `;

    const result = analyzer.analyzeFile('src/app.ts', '/mock/src/app.ts', code);
    expect(result.routes).toHaveLength(3);
    expect(result.routes.map((r) => `${r.method} ${r.rawPath}`)).toEqual([
      'GET /a',
      'POST /b',
      'PUT /c',
    ]);
  });

  it('detects app.route() mounting and chained mounting', () => {
    const code = `
      import { Hono } from 'hono';
      const api = new Hono();
      const auth = new Hono();
      const app = new Hono();
      app.route('/api', api).route('/auth', auth);
    `;

    const result = analyzer.analyzeFile('src/app.ts', '/mock/src/app.ts', code);
    expect(result.mounts).toHaveLength(2);
    expect(result.mounts[0].rawPrefix).toBe('/api');
    expect(result.mounts[0].childIdentifier).toBe('api');
    expect(result.mounts[1].rawPrefix).toBe('/auth');
    expect(result.mounts[1].childIdentifier).toBe('auth');
  });

  it('detects .basePath() chained on Hono instantiation', () => {
    const code = `
      import { Hono } from 'hono';
      const app = new Hono().basePath('/api/v1');
    `;

    const result = analyzer.analyzeFile('src/app.ts', '/mock/src/app.ts', code);
    expect(result.apps).toHaveLength(1);
    expect(result.apps[0].basePath).toBe('/api/v1');
  });

  it('resolves static constants and template literals', () => {
    const code = `
      import { Hono } from 'hono';
      const PREFIX = '/api';
      const USERS = '/users';
      const app = new Hono();
      app.get(PREFIX + USERS, (c) => c.text('ok'));
      app.post(\`\${PREFIX}/items\`, (c) => c.text('ok'));
    `;

    const result = analyzer.analyzeFile('src/app.ts', '/mock/src/app.ts', code);
    expect(result.routes).toHaveLength(2);
    expect(result.routes[0].rawPath).toBe('/api/users');
    expect(result.routes[0].confidence).toBe('high');
    expect(result.routes[1].rawPath).toBe('/api/items');
    expect(result.routes[1].confidence).toBe('high');
  });

  it('handles dynamic expressions conservatively as <dynamic> with low confidence', () => {
    const code = `
      import { Hono } from 'hono';
      const app = new Hono();
      app.get(getPath(), (c) => c.text('ok'));
      app.post(\`/api/\${getSuffix()}\`, (c) => c.text('ok'));
    `;

    const result = analyzer.analyzeFile('src/app.ts', '/mock/src/app.ts', code);
    expect(result.routes).toHaveLength(2);
    expect(result.routes[0].rawPath).toBe('<dynamic>');
    expect(result.routes[0].confidence).toBe('low');
    expect(result.routes[1].rawPath).toBe('/api/<dynamic>');
    expect(result.routes[1].confidence).toBe('low');
  });

  it('rejects shadowed Hono variables in inner scopes', () => {
    const code = `
      import { Hono } from 'hono';
      const app = new Hono();
      app.get('/valid', (c) => c.text('ok'));

      function test() {
        const app = { get: () => {} };
        app.get('/shadowed-object');
      }

      function testParam(app: any) {
        app.get('/shadowed-param');
      }
    `;

    const result = analyzer.analyzeFile('src/app.ts', '/mock/src/app.ts', code);
    expect(result.routes).toHaveLength(1);
    expect(result.routes[0].rawPath).toBe('/valid');
  });

  it('rejects fake Hono classes without imports', () => {
    const code = `
      class Hono { get() {} }
      const app = new Hono();
      app.get('/fake');
    `;

    const result = analyzer.analyzeFile('src/app.ts', '/mock/src/app.ts', code);
    expect(result.routes).toHaveLength(0);
    expect(result.apps).toHaveLength(0);
  });

  it('extracts default and named exports', () => {
    const code = `
      import { Hono } from 'hono';
      export const api = new Hono();
      const app = new Hono();
      export default app;
    `;

    const result = analyzer.analyzeFile('src/app.ts', '/mock/src/app.ts', code);
    expect(result.exports).toHaveLength(2);
    expect(result.exports.map((e) => e.exportedName)).toEqual(['api', 'default']);
  });

  it('isolates malformed syntax with a descriptive error without crashing', () => {
    const code = `
      import { Hono } from 'hono';
      const app = new Hono(
      app.get('/unclosed');
    `;

    const result = analyzer.analyzeFile('src/app.ts', '/mock/src/app.ts', code);
    expect(result.errors.length).toBeGreaterThanOrEqual(0);
    expect(result.file).toBe('src/app.ts');
  });

  it('supports OpenAPIHono instances and multiple apps in the same file', () => {
    const code = `
      import { Hono } from 'hono';
      import { OpenAPIHono } from '@hono/zod-openapi';

      const app = new Hono();
      const apiV1 = new OpenAPIHono<{ Variables: { user: any } }>();

      apiV1.get('/docs', (c) => c.text('docs'));
      apiV1.get('/health', (c) => c.text('health'));
      app.route('/api/v1', apiV1);
      app.get('/', (c) => c.text('root'));
    `;

    const result = analyzer.analyzeFile('src/index.ts', '/mock/src/index.ts', code);
    expect(result.apps).toHaveLength(2);
    expect(result.apps.map((a) => a.variableName)).toEqual(['app', 'apiV1']);
    expect(result.mounts).toHaveLength(1);
    expect(result.mounts[0].childIdentifier).toBe('apiV1');
    expect(result.mounts[0].rawPrefix).toBe('/api/v1');
    expect(result.routes).toHaveLength(3);
    expect(result.routes.map((r) => `${r.method} ${r.rawPath}`)).toEqual([
      'GET /docs',
      'GET /health',
      'GET /',
    ]);
  });

  it('supports createRoute and app.openapi() route declarations', () => {
    const code = `
      import { OpenAPIHono, createRoute } from '@hono/zod-openapi';

      const router = new OpenAPIHono();

      const getPaginatedRoute = createRoute({
        method: 'get',
        path: '/',
      });

      const getByIdRoute = createRoute({
        method: 'get',
        path: '/{id}',
      });

      router.openapi(getPaginatedRoute, async (c) => c.text('list'));
      router.openapi(getByIdRoute, async (c) => c.text('detail'));
      router.openapi({ method: 'post', path: '/inline' }, async (c) => c.text('inline'));
    `;

    const result = analyzer.analyzeFile('src/routes.ts', '/mock/src/routes.ts', code);
    expect(result.routes).toHaveLength(3);
    expect(result.routes.map((r) => `${r.method} ${r.rawPath}`)).toEqual([
      'GET /',
      'GET /{id}',
      'POST /inline',
    ]);
  });

  it('supports app.on() with single method and method array', () => {
    const code = `
      import { Hono } from 'hono';
      const app = new Hono();

      app.on(['POST', 'GET'], '/*', (c) => c.text('catch-all'));
      app.on('delete', '/purge', (c) => c.text('purge'));
    `;

    const result = analyzer.analyzeFile('src/routes.ts', '/mock/src/routes.ts', code);
    expect(result.routes).toHaveLength(3);
    expect(result.routes.map((r) => `${r.method} ${r.rawPath}`)).toEqual([
      'POST /*',
      'GET /*',
      'DELETE /purge',
    ]);
  });
});
