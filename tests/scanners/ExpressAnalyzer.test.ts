import { describe, it, expect } from 'vitest';
import { ExpressAnalyzer } from '../../src/scanners/express/ExpressAnalyzer';

describe('ExpressAnalyzer', () => {
  const analyzer = new ExpressAnalyzer();

  it('extracts direct routes on express application', () => {
    const code = `
      import express from 'express';
      const app = express();
      app.get('/users', () => {});
      app.post('/users', () => {});
    `;
    const result = analyzer.analyzeFile('app.ts', '/path/app.ts', code);

    expect(result.routers).toHaveLength(1);
    expect(result.routers[0].isApp).toBe(true);
    expect(result.routes).toHaveLength(2);
    expect(result.routes[0].method).toBe('GET');
    expect(result.routes[0].rawPath).toBe('/users');
    expect(result.routes[1].method).toBe('POST');
  });

  it('extracts router declarations and mounts', () => {
    const code = `
      import express from 'express';
      const app = express();
      const router = express.Router();
      router.get('/items', () => {});
      app.use('/api', router);
    `;
    const result = analyzer.analyzeFile('app.ts', '/path/app.ts', code);

    expect(result.routers).toHaveLength(2);
    expect(result.routes).toHaveLength(1);
    expect(result.mounts).toHaveLength(1);
    expect(result.mounts[0].rawPrefix).toBe('/api');
  });

  it('evaluates static constants and template literals', () => {
    const code = `
      import express from 'express';
      const app = express();
      const prefix = '/api';
      const resource = 'users';
      app.get(prefix + '/' + resource, () => {});
      app.get(\`\${prefix}/orders\`, () => {});
    `;
    const result = analyzer.analyzeFile('app.ts', '/path/app.ts', code);

    expect(result.routes).toHaveLength(2);
    expect(result.routes[0].rawPath).toBe('/api/users');
    expect(result.routes[1].rawPath).toBe('/api/orders');
  });

  it('preserves known static segments for partially dynamic expressions', () => {
    const code = `
      import express from 'express';
      const app = express();
      const prefix = '/api';
      app.get(\`\${prefix}/\${getDynamic()}\`, () => {});
    `;
    const result = analyzer.analyzeFile('app.ts', '/path/app.ts', code);

    expect(result.routes).toHaveLength(1);
    expect(result.routes[0].rawPath).toBe('/api/<dynamic>');
    expect(result.routes[0].confidence).toBe('low');
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('rejects false positives (db.get, cache.post, unrelated objects)', () => {
    const code = `
      import express from 'express';
      const app = express();
      const db = { get: () => {} };
      db.get('/users');
      app.use(authMiddleware);
    `;
    const result = analyzer.analyzeFile('app.ts', '/path/app.ts', code);

    expect(result.routes).toHaveLength(0);
    expect(result.mounts).toHaveLength(0);
  });

  it('supports .route() chaining', () => {
    const code = `
      import express from 'express';
      const app = express();
      app.route('/users')
        .get(() => {})
        .post(() => {});
    `;
    const result = analyzer.analyzeFile('app.ts', '/path/app.ts', code);

    expect(result.routes).toHaveLength(2);
    const getRoute = result.routes.find((r) => r.method === 'GET');
    const postRoute = result.routes.find((r) => r.method === 'POST');
    expect(getRoute?.rawPath).toBe('/users');
    expect(postRoute?.rawPath).toBe('/users');
  });

  it('tracks ESM and CommonJS router exports', () => {
    const esmCode = `
      import express from 'express';
      const router = express.Router();
      export default router;
    `;
    const esmResult = analyzer.analyzeFile('routes.ts', '/path/routes.ts', esmCode);
    expect(esmResult.exports).toHaveLength(1);
    expect(esmResult.exports[0].exportedName).toBe('default');

    const cjsCode = `
      const express = require('express');
      const router = express.Router();
      module.exports = router;
    `;
    const cjsResult = analyzer.analyzeFile('routes.js', '/path/routes.js', cjsCode);
    expect(cjsResult.exports).toHaveLength(1);
    expect(cjsResult.exports[0].exportedName).toBe('default');
  });

  it('expands .all() into all 8 canonical HTTP methods', () => {
    const code = `
      import express from 'express';
      const app = express();
      app.all('/secret', () => {});
    `;
    const result = analyzer.analyzeFile('app.ts', '/path/app.ts', code);

    expect(result.routes).toHaveLength(8);
    const methods = result.routes.map((r) => r.method).sort();
    expect(methods).toEqual([
      'DELETE',
      'GET',
      'HEAD',
      'OPTIONS',
      'PATCH',
      'POST',
      'PUT',
      'TRACE',
    ]);
    for (const r of result.routes) {
      expect(r.rawPath).toBe('/secret');
    }
  });

  it('expands .all() in .route() chains', () => {
    const code = `
      import express from 'express';
      const app = express();
      app.route('/auth')
        .all(() => {})
        .get(() => {});
    `;
    const result = analyzer.analyzeFile('app.ts', '/path/app.ts', code);

    // 8 from .all() + 1 from .get()
    expect(result.routes).toHaveLength(9);
    const getRoutes = result.routes.filter((r) => r.method === 'GET');
    expect(getRoutes).toHaveLength(2); // one from .all(), one from .get()
  });

  it('correctly handles variable shadowing to prevent false positives', () => {
    const code = `
      import express from 'express';
      const app = express();

      function example() {
        const app = {
          get() {}
        };
        app.get('/fake');
      }

      function withParam(app: any) {
        app.get('/param-fake');
      }

      app.get('/real', () => {});
    `;
    const result = analyzer.analyzeFile('app.ts', '/path/app.ts', code);

    expect(result.routes).toHaveLength(1);
    expect(result.routes[0].rawPath).toBe('/real');
  });

  it('handles dynamic expressions safely (env vars, call expressions, member access)', () => {
    const code = `
      import express from 'express';
      const app = express();
      app.get(process.env.PREFIX + '/users', () => {});
      app.get(config.apiPrefix + '/items', () => {});
      app.get(getDynamicPrefix() + '/orders', () => {});
    `;
    const result = analyzer.analyzeFile('app.ts', '/path/app.ts', code);

    expect(result.routes).toHaveLength(3);
    for (const r of result.routes) {
      expect(r.confidence).toBe('low');
      expect(r.rawPath).toContain('<dynamic>');
    }
  });

  it('extracts export const router = express.Router() named exports', () => {
    const code = `
      import express from 'express';
      export const apiRouter = express.Router();
      apiRouter.get('/ping', () => {});
    `;
    const result = analyzer.analyzeFile('api.ts', '/path/api.ts', code);

    expect(result.routers).toHaveLength(1);
    expect(result.exports).toHaveLength(1);
    expect(result.exports[0].exportedName).toBe('apiRouter');
    expect(result.routes).toHaveLength(1);
  });

  it('gracefully catches parse errors without crashing', () => {
    const malformed = `app.get('/unclosed', handler`;
    const result = analyzer.analyzeFile('broken.ts', '/path/broken.ts', malformed);

    // TypeScript parser is error-tolerant and does not throw for simple syntax errors
    expect(result.file).toBe('broken.ts');
  });
});
