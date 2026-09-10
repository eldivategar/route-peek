import { describe, it, expect } from 'vitest';
import { HonoRouteResolver } from '../../src/scanners/hono/HonoRouteResolver';
import { HonoFileAnalysisResult } from '../../src/scanners/hono/types';

describe('HonoRouteResolver', () => {
  const resolver = new HonoRouteResolver();

  it('resolves routes in a single file', () => {
    const fileResult: HonoFileAnalysisResult = {
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
      mounts: [],
      imports: [],
      exports: [],
      warnings: [],
      errors: [],
    };

    const res = resolver.resolveRoutes([fileResult], '/mock');
    expect(res.routes).toHaveLength(1);
    expect(res.routes[0].path).toBe('/health');
    expect(res.routes[0].framework).toBe('hono');
    expect(res.routes[0].id).toBe('hono:GET:/health:src/app.ts:4');
  });

  it('resolves nested mount prefixes', () => {
    const fileResult: HonoFileAnalysisResult = {
      file: 'src/app.ts',
      absolutePath: '/mock/src/app.ts',
      apps: [
        { id: 'src/app.ts#app@2:1', variableName: 'app', source: { file: 'src/app.ts', line: 2, column: 1 } },
        { id: 'src/app.ts#api@3:1', variableName: 'api', source: { file: 'src/app.ts', line: 3, column: 1 } },
        { id: 'src/app.ts#users@4:1', variableName: 'users', source: { file: 'src/app.ts', line: 4, column: 1 } },
      ],
      mounts: [
        {
          parentSymbolId: 'src/app.ts#app@2:1',
          childIdentifier: 'api',
          rawPrefix: '/api',
          confidence: 'high',
          source: { file: 'src/app.ts', line: 6, column: 1 },
        },
        {
          parentSymbolId: 'src/app.ts#api@3:1',
          childIdentifier: 'users',
          rawPrefix: '/users',
          confidence: 'high',
          source: { file: 'src/app.ts', line: 7, column: 1 },
        },
      ],
      routes: [
        {
          appSymbolId: 'src/app.ts#users@4:1',
          method: 'GET',
          rawPath: '/:id',
          confidence: 'high',
          source: { file: 'src/app.ts', line: 9, column: 5 },
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
    const appFile: HonoFileAnalysisResult = {
      file: 'src/app.ts',
      absolutePath: '/mock/src/app.ts',
      apps: [{ id: 'src/app.ts#app@2:1', variableName: 'app', source: { file: 'src/app.ts', line: 2, column: 1 } }],
      routes: [],
      mounts: [
        {
          parentSymbolId: 'src/app.ts#app@2:1',
          childIdentifier: 'usersRouter',
          rawPrefix: '/api/users',
          confidence: 'high',
          source: { file: 'src/app.ts', line: 5, column: 1 },
        },
      ],
      imports: [
        {
          localName: 'usersRouter',
          importedName: 'default',
          moduleSpecifier: './routes/users',
          sourceFile: 'src/app.ts',
          line: 1,
        },
      ],
      exports: [],
      warnings: [],
      errors: [],
    };

    const usersFile: HonoFileAnalysisResult = {
      file: 'src/routes/users.ts',
      absolutePath: '/mock/src/routes/users.ts',
      apps: [{ id: 'src/routes/users.ts#router@2:1', variableName: 'router', source: { file: 'src/routes/users.ts', line: 2, column: 1 } }],
      routes: [
        {
          appSymbolId: 'src/routes/users.ts#router@2:1',
          method: 'GET',
          rawPath: '/:id',
          confidence: 'high',
          source: { file: 'src/routes/users.ts', line: 4, column: 5 },
        },
      ],
      mounts: [],
      imports: [],
      exports: [
        {
          exportedName: 'default',
          localSymbolId: 'src/routes/users.ts#router@2:1',
          sourceFile: 'src/routes/users.ts',
          line: 7,
        },
      ],
      warnings: [],
      errors: [],
    };

    const knownFiles = new Set(['src/app.ts', 'src/routes/users.ts']);
    const res = resolver.resolveRoutes([appFile, usersFile], '/mock', knownFiles);

    expect(res.routes).toHaveLength(1);
    expect(res.routes[0].path).toBe('/api/users/:id');
    expect(res.routes[0].source.file).toBe('src/routes/users.ts');
  });

  it('detects and breaks circular mounts with diagnostic warning', () => {
    const fileResult: HonoFileAnalysisResult = {
      file: 'src/app.ts',
      absolutePath: '/mock/src/app.ts',
      apps: [
        { id: 'app1', variableName: 'app1', source: { file: 'src/app.ts', line: 1, column: 1 } },
        { id: 'app2', variableName: 'app2', source: { file: 'src/app.ts', line: 2, column: 1 } },
      ],
      mounts: [
        {
          parentSymbolId: 'app1',
          childIdentifier: 'app2',
          rawPrefix: '/b',
          confidence: 'high',
          source: { file: 'src/app.ts', line: 3, column: 1 },
        },
        {
          parentSymbolId: 'app2',
          childIdentifier: 'app1',
          rawPrefix: '/a',
          confidence: 'high',
          source: { file: 'src/app.ts', line: 4, column: 1 },
        },
      ],
      routes: [
        {
          appSymbolId: 'app1',
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
    expect(res.warnings.some((w) => w.includes('Circular Hono app mounting'))).toBe(true);
    expect(res.routes.length).toBeGreaterThanOrEqual(1);
  });
});
