import { describe, it, expect } from 'vitest';
import { ExpressRouteResolver } from '../../src/scanners/express/ExpressRouteResolver';
import { FileAnalysisResult } from '../../src/scanners/express/types';

describe('ExpressRouteResolver', () => {
  const resolver = new ExpressRouteResolver();

  it('resolves single file nested router mount', () => {
    const fileResult: FileAnalysisResult = {
      file: 'app.ts',
      absolutePath: '/app/app.ts',
      routers: [
        { id: 'app.ts#app@2:7', variableName: 'app', isApp: true, source: { file: 'app.ts', line: 2, column: 7 } },
        { id: 'app.ts#router@3:7', variableName: 'router', isApp: false, source: { file: 'app.ts', line: 3, column: 7 } },
      ],
      routes: [
        {
          routerSymbolId: 'app.ts#router@3:7',
          method: 'GET',
          rawPath: '/items',
          confidence: 'high',
          source: { file: 'app.ts', line: 5, column: 1 },
        },
      ],
      mounts: [
        {
          parentSymbolId: 'app.ts#app@2:7',
          childIdentifier: 'router',
          rawPrefix: '/api',
          confidence: 'high',
          source: { file: 'app.ts', line: 6, column: 1 },
        },
      ],
      imports: [],
      exports: [],
      warnings: [],
      errors: [],
    };

    const result = resolver.resolveRoutes([fileResult], '/app');

    expect(result.routes).toHaveLength(1);
    expect(result.routes[0].path).toBe('/api/items');
    expect(result.routes[0].method).toBe('GET');
  });

  it('detects and breaks circular router mount graphs without infinite recursion', () => {
    const fileResult: FileAnalysisResult = {
      file: 'app.ts',
      absolutePath: '/app/app.ts',
      routers: [
        { id: 'app.ts#app@1:1', variableName: 'app', isApp: true, source: { file: 'app.ts', line: 1, column: 1 } },
        { id: 'app.ts#routerA@2:1', variableName: 'routerA', isApp: false, source: { file: 'app.ts', line: 2, column: 1 } },
        { id: 'app.ts#routerB@3:1', variableName: 'routerB', isApp: false, source: { file: 'app.ts', line: 3, column: 1 } },
      ],
      routes: [
        {
          routerSymbolId: 'app.ts#routerA@2:1',
          method: 'GET',
          rawPath: '/endpointA',
          confidence: 'high',
          source: { file: 'app.ts', line: 10, column: 1 },
        },
      ],
      mounts: [
        {
          parentSymbolId: 'app.ts#app@1:1',
          childIdentifier: 'routerA',
          rawPrefix: '/root',
          confidence: 'high',
          source: { file: 'app.ts', line: 5, column: 1 },
        },
        {
          parentSymbolId: 'app.ts#routerA@2:1',
          childIdentifier: 'routerB',
          rawPrefix: '/b',
          confidence: 'high',
          source: { file: 'app.ts', line: 6, column: 1 },
        },
        {
          parentSymbolId: 'app.ts#routerB@3:1',
          childIdentifier: 'routerA',
          rawPrefix: '/a',
          confidence: 'high',
          source: { file: 'app.ts', line: 7, column: 1 },
        },
      ],
      imports: [],
      exports: [],
      warnings: [],
      errors: [],
    };

    const result = resolver.resolveRoutes([fileResult], '/app');

    // Circular mounting does not hang or overflow; routes are still generated
    expect(result.routes.length).toBeGreaterThan(0);
    expect(result.warnings.some((w) => w.includes('Circular router mounting'))).toBe(true);
  });

  it('preserves multiple semantically distinct mounts of the same router', () => {
    const fileResult: FileAnalysisResult = {
      file: 'app.ts',
      absolutePath: '/app/app.ts',
      routers: [
        { id: 'app.ts#app@1:1', variableName: 'app', isApp: true, source: { file: 'app.ts', line: 1, column: 1 } },
        { id: 'app.ts#userRouter@2:1', variableName: 'userRouter', isApp: false, source: { file: 'app.ts', line: 2, column: 1 } },
      ],
      routes: [
        {
          routerSymbolId: 'app.ts#userRouter@2:1',
          method: 'GET',
          rawPath: '/users',
          confidence: 'high',
          source: { file: 'app.ts', line: 10, column: 1 },
        },
      ],
      mounts: [
        {
          parentSymbolId: 'app.ts#app@1:1',
          childIdentifier: 'userRouter',
          rawPrefix: '/admin',
          confidence: 'high',
          source: { file: 'app.ts', line: 4, column: 1 },
        },
        {
          parentSymbolId: 'app.ts#app@1:1',
          childIdentifier: 'userRouter',
          rawPrefix: '/public',
          confidence: 'high',
          source: { file: 'app.ts', line: 5, column: 1 },
        },
      ],
      imports: [],
      exports: [],
      warnings: [],
      errors: [],
    };

    const result = resolver.resolveRoutes([fileResult], '/app');

    // Both distinct routes must be generated and preserved
    expect(result.routes).toHaveLength(2);
    const paths = result.routes.map((r) => r.path).sort();
    expect(paths).toEqual(['/admin/users', '/public/users']);
  });

  it('deduplicates exact identical canonical route identities from duplicate mounts', () => {
    const fileResult: FileAnalysisResult = {
      file: 'app.ts',
      absolutePath: '/app/app.ts',
      routers: [
        { id: 'app.ts#app@1:1', variableName: 'app', isApp: true, source: { file: 'app.ts', line: 1, column: 1 } },
        { id: 'app.ts#userRouter@2:1', variableName: 'userRouter', isApp: false, source: { file: 'app.ts', line: 2, column: 1 } },
      ],
      routes: [
        {
          routerSymbolId: 'app.ts#userRouter@2:1',
          method: 'GET',
          rawPath: '/users',
          confidence: 'high',
          source: { file: 'app.ts', line: 10, column: 1 },
        },
      ],
      mounts: [
        {
          parentSymbolId: 'app.ts#app@1:1',
          childIdentifier: 'userRouter',
          rawPrefix: '/api',
          confidence: 'high',
          source: { file: 'app.ts', line: 4, column: 1 },
        },
        {
          parentSymbolId: 'app.ts#app@1:1',
          childIdentifier: 'userRouter',
          rawPrefix: '/api', // exact duplicate mount
          confidence: 'high',
          source: { file: 'app.ts', line: 5, column: 1 },
        },
      ],
      imports: [],
      exports: [],
      warnings: [],
      errors: [],
    };

    const result = resolver.resolveRoutes([fileResult], '/app');

    // Exact duplicate mount produces only 1 canonical route
    expect(result.routes).toHaveLength(1);
    expect(result.routes[0].path).toBe('/api/users');
  });

  it('detects cycles in disconnected unmounted routers', () => {
    const fileResult: FileAnalysisResult = {
      file: 'app.ts',
      absolutePath: '/app/app.ts',
      routers: [
        { id: 'app.ts#r1@1:1', variableName: 'r1', isApp: false, source: { file: 'app.ts', line: 1, column: 1 } },
        { id: 'app.ts#r2@2:1', variableName: 'r2', isApp: false, source: { file: 'app.ts', line: 2, column: 1 } },
      ],
      routes: [
        {
          routerSymbolId: 'app.ts#r1@1:1',
          method: 'GET',
          rawPath: '/ping',
          confidence: 'high',
          source: { file: 'app.ts', line: 5, column: 1 },
        },
      ],
      mounts: [
        {
          parentSymbolId: 'app.ts#r1@1:1',
          childIdentifier: 'r2',
          rawPrefix: '/two',
          confidence: 'high',
          source: { file: 'app.ts', line: 3, column: 1 },
        },
        {
          parentSymbolId: 'app.ts#r2@2:1',
          childIdentifier: 'r1',
          rawPrefix: '/one',
          confidence: 'high',
          source: { file: 'app.ts', line: 4, column: 1 },
        },
      ],
      imports: [],
      exports: [],
      warnings: [],
      errors: [],
    };

    const result = resolver.resolveRoutes([fileResult], '/app');
    expect(result.routes.length).toBeGreaterThan(0);
    expect(result.warnings.some((w) => w.includes('Circular router mounting'))).toBe(true);
  });
});
