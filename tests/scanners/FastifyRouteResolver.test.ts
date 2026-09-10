import { describe, it, expect } from 'vitest';
import { FastifyRouteResolver } from '../../src/scanners/fastify/FastifyRouteResolver';
import { FastifyFileAnalysisResult } from '../../src/scanners/fastify/types';

describe('FastifyRouteResolver', () => {
  const resolver = new FastifyRouteResolver();

  it('resolves routes in a single file with deterministic route IDs', () => {
    const fileResult: FastifyFileAnalysisResult = {
      file: 'src/app.ts',
      absolutePath: '/mock/src/app.ts',
      apps: [{ id: 'src/app.ts#app@2:1', variableName: 'app', source: { file: 'src/app.ts', line: 2, column: 1 } }],
      routes: [
        {
          appSymbolId: 'src/app.ts#app@2:1',
          method: 'GET',
          rawPath: '/health',
          confidence: 'high',
          source: { file: 'src/app.ts', line: 4, column: 5 },
        },
      ],
      registers: [],
      imports: [],
      exports: [],
      warnings: [],
      errors: [],
    };

    const res = resolver.resolveRoutes([fileResult], '/mock');
    expect(res.routes).toHaveLength(1);
    expect(res.routes[0].path).toBe('/health');
    expect(res.routes[0].framework).toBe('fastify');
    expect(res.routes[0].id).toBe('fastify:GET:/health:src/app.ts:4');
  });

  it('resolves nested plugin registration prefixes', () => {
    const fileResult: FastifyFileAnalysisResult = {
      file: 'src/app.ts',
      absolutePath: '/mock/src/app.ts',
      apps: [
        { id: 'src/app.ts#server@2:1', variableName: 'server', source: { file: 'src/app.ts', line: 2, column: 1 } },
        { id: 'src/app.ts#apiPlugin@5:1', variableName: 'apiPlugin', source: { file: 'src/app.ts', line: 5, column: 1 } },
        { id: 'src/app.ts#userPlugin@10:1', variableName: 'userPlugin', source: { file: 'src/app.ts', line: 10, column: 1 } },
      ],
      registers: [
        {
          parentSymbolId: 'src/app.ts#server@2:1',
          childIdentifier: 'apiPlugin',
          rawPrefix: '/api',
          confidence: 'high',
          source: { file: 'src/app.ts', line: 3, column: 1 },
        },
        {
          parentSymbolId: 'src/app.ts#apiPlugin@5:1',
          childIdentifier: 'userPlugin',
          rawPrefix: '/users',
          confidence: 'high',
          source: { file: 'src/app.ts', line: 7, column: 1 },
        },
      ],
      routes: [
        {
          appSymbolId: 'src/app.ts#userPlugin@10:1',
          method: 'GET',
          rawPath: '/:id',
          confidence: 'high',
          source: { file: 'src/app.ts', line: 12, column: 5 },
        },
      ],
      imports: [],
      exports: [],
      warnings: [],
      errors: [],
    };

    const res = resolver.resolveRoutes([fileResult], '/mock');
    expect(res.routes).toHaveLength(1);
    expect(res.routes[0].path).toBe('/api/users/:id');
    expect(res.routes[0].method).toBe('GET');
  });

  it('resolves cross-file module imports and exports', () => {
    const serverFile: FastifyFileAnalysisResult = {
      file: 'src/server.ts',
      absolutePath: '/mock/src/server.ts',
      apps: [{ id: 'src/server.ts#app@2:1', variableName: 'app', source: { file: 'src/server.ts', line: 2, column: 1 } }],
      routes: [],
      registers: [
        {
          parentSymbolId: 'src/server.ts#app@2:1',
          childIdentifier: 'userRoutes',
          rawPrefix: '/api/users',
          confidence: 'high',
          source: { file: 'src/server.ts', line: 4, column: 1 },
        },
      ],
      imports: [
        {
          localName: 'userRoutes',
          importedName: 'default',
          moduleSpecifier: './routes/users',
          sourceFile: 'src/server.ts',
          line: 1,
        },
      ],
      exports: [],
      warnings: [],
      errors: [],
    };

    const usersFile: FastifyFileAnalysisResult = {
      file: 'src/routes/users.ts',
      absolutePath: '/mock/src/routes/users.ts',
      apps: [{ id: 'src/routes/users.ts#plugin@2:1', variableName: 'plugin', source: { file: 'src/routes/users.ts', line: 2, column: 1 } }],
      routes: [
        {
          appSymbolId: 'src/routes/users.ts#plugin@2:1',
          method: 'GET',
          rawPath: '/:id',
          confidence: 'high',
          source: { file: 'src/routes/users.ts', line: 4, column: 5 },
        },
      ],
      registers: [],
      imports: [],
      exports: [
        {
          exportedName: 'default',
          localSymbolId: 'src/routes/users.ts#plugin@2:1',
          sourceFile: 'src/routes/users.ts',
          line: 6,
        },
      ],
      warnings: [],
      errors: [],
    };

    const knownFiles = new Set(['src/server.ts', 'src/routes/users.ts']);
    const res = resolver.resolveRoutes([serverFile, usersFile], '/mock', knownFiles);

    expect(res.routes).toHaveLength(1);
    expect(res.routes[0].path).toBe('/api/users/:id');
    expect(res.routes[0].source.file).toBe('src/routes/users.ts');
  });

  it('detects and breaks circular plugin registrations with diagnostic warning', () => {
    const fileResult: FastifyFileAnalysisResult = {
      file: 'src/app.ts',
      absolutePath: '/mock/src/app.ts',
      apps: [
        { id: 'pluginA', variableName: 'pluginA', source: { file: 'src/app.ts', line: 1, column: 1 } },
        { id: 'pluginB', variableName: 'pluginB', source: { file: 'src/app.ts', line: 2, column: 1 } },
      ],
      registers: [
        {
          parentSymbolId: 'pluginA',
          childIdentifier: 'pluginB',
          rawPrefix: '/b',
          confidence: 'high',
          source: { file: 'src/app.ts', line: 3, column: 1 },
        },
        {
          parentSymbolId: 'pluginB',
          childIdentifier: 'pluginA',
          rawPrefix: '/a',
          confidence: 'high',
          source: { file: 'src/app.ts', line: 4, column: 1 },
        },
      ],
      routes: [
        {
          appSymbolId: 'pluginA',
          method: 'GET',
          rawPath: '/ping',
          confidence: 'high',
          source: { file: 'src/app.ts', line: 6, column: 1 },
        },
      ],
      imports: [],
      exports: [],
      warnings: [],
      errors: [],
    };

    const res = resolver.resolveRoutes([fileResult], '/mock');
    expect(res.warnings.some((w) => w.includes('Circular Fastify plugin registration'))).toBe(true);
    expect(res.routes.length).toBeGreaterThanOrEqual(1);
  });
});
