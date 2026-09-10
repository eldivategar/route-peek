import { describe, it, expect } from 'vitest';
import { FiberRouteResolver } from '../../src/scanners/fiber/FiberRouteResolver';
import { FiberFileAnalysisResult } from '../../src/scanners/fiber/types';

describe('FiberRouteResolver', () => {
  const resolver = new FiberRouteResolver();

  it('resolves nested group prefixes to effective path', () => {
    const fileResult: FiberFileAnalysisResult = {
      relativePath: 'main.go',
      absolutePath: '/app/main.go',
      packageName: 'main',
      imports: [{ path: 'github.com/gofiber/fiber/v3' }],
      apps: [{ name: 'app', file: 'main.go', line: 4, column: 2 }],
      groups: [
        {
          receiverName: 'api',
          parentReceiverName: 'app',
          prefix: '/api',
          confidence: 'high',
          file: 'main.go',
          line: 5,
          column: 2,
        },
        {
          receiverName: 'v1',
          parentReceiverName: 'api',
          prefix: '/v1',
          confidence: 'high',
          file: 'main.go',
          line: 6,
          column: 2,
        },
      ],
      routes: [
        {
          receiverName: 'v1',
          method: 'GET',
          path: '/users',
          confidence: 'high',
          file: 'main.go',
          line: 7,
          column: 2,
        },
      ],
      mounts: [],
      routeCallbacks: [],
      functions: [],
      calls: [],
      constants: new Map(),
    };

    const res = resolver.resolveRoutes([fileResult]);
    expect(res.routes.length).toBe(1);
    expect(res.routes[0].path).toBe('/api/v1/users');
    expect(res.routes[0].method).toBe('GET');
    expect(res.routes[0].framework).toBe('fiber');
    expect(res.routes[0].id).toBe('fiber:GET:/api/v1/users:main.go:7');
  });

  it('resolves sub-app mounting with prefix inheritance', () => {
    const fileResult: FiberFileAnalysisResult = {
      relativePath: 'main.go',
      absolutePath: '/app/main.go',
      packageName: 'main',
      imports: [{ path: 'github.com/gofiber/fiber/v3' }],
      apps: [
        { name: 'app', file: 'main.go', line: 4, column: 2 },
        { name: 'subApp', file: 'main.go', line: 5, column: 2 },
      ],
      groups: [],
      mounts: [
        {
          parentReceiverName: 'app',
          subAppReceiverName: 'subApp',
          prefix: '/api/sub',
          confidence: 'high',
          file: 'main.go',
          line: 6,
          column: 2,
        },
      ],
      routes: [
        {
          receiverName: 'subApp',
          method: 'POST',
          path: '/ping',
          confidence: 'high',
          file: 'main.go',
          line: 7,
          column: 2,
        },
      ],
      routeCallbacks: [],
      functions: [],
      calls: [],
      constants: new Map(),
    };

    const res = resolver.resolveRoutes([fileResult]);
    expect(res.routes.length).toBe(1);
    expect(res.routes[0].path).toBe('/api/sub/ping');
    expect(res.routes[0].method).toBe('POST');
  });

  it('resolves cross-file route setup functions', () => {
    const mainFile: FiberFileAnalysisResult = {
      relativePath: 'cmd/server/main.go',
      absolutePath: '/app/cmd/server/main.go',
      packageName: 'main',
      imports: [{ path: 'github.com/gofiber/fiber/v3' }],
      apps: [{ name: 'app', file: 'cmd/server/main.go', line: 4, column: 2 }],
      groups: [
        {
          receiverName: 'api',
          parentReceiverName: 'app',
          prefix: '/api',
          confidence: 'high',
          file: 'cmd/server/main.go',
          line: 5,
          column: 2,
        },
      ],
      routes: [],
      mounts: [],
      routeCallbacks: [],
      functions: [],
      calls: [
        {
          functionName: 'SetupUserRoutes',
          passedReceiverName: 'api',
          file: 'cmd/server/main.go',
          line: 6,
          column: 2,
        },
      ],
      constants: new Map(),
    };

    const routesFile: FiberFileAnalysisResult = {
      relativePath: 'internal/routes/users.go',
      absolutePath: '/app/internal/routes/users.go',
      packageName: 'routes',
      imports: [{ path: 'github.com/gofiber/fiber/v3' }],
      apps: [],
      groups: [],
      routes: [
        {
          receiverName: 'router',
          method: 'GET',
          path: '/profile',
          confidence: 'high',
          file: 'internal/routes/users.go',
          line: 8,
          column: 2,
        },
      ],
      mounts: [],
      routeCallbacks: [],
      functions: [
        {
          name: 'SetupUserRoutes',
          paramNames: ['router'],
          file: 'internal/routes/users.go',
          routes: [],
          groups: [],
          mounts: [],
          routeCallbacks: [],
        },
      ],
      calls: [],
      constants: new Map(),
    };

    const res = resolver.resolveRoutes([mainFile, routesFile]);
    expect(res.routes.length).toBe(1);
    expect(res.routes[0].path).toBe('/api/profile');
    expect(res.routes[0].source.file).toBe('internal/routes/users.go');
  });

  it('handles circular references with warning without crashing', () => {
    const fileResult: FiberFileAnalysisResult = {
      relativePath: 'main.go',
      absolutePath: '/app/main.go',
      packageName: 'main',
      imports: [{ path: 'github.com/gofiber/fiber/v3' }],
      apps: [{ name: 'app', file: 'main.go', line: 4, column: 2 }],
      groups: [
        {
          receiverName: 'a',
          parentReceiverName: 'b',
          prefix: '/a',
          confidence: 'high',
          file: 'main.go',
          line: 5,
          column: 2,
        },
        {
          receiverName: 'b',
          parentReceiverName: 'a',
          prefix: '/b',
          confidence: 'high',
          file: 'main.go',
          line: 6,
          column: 2,
        },
      ],
      routes: [],
      mounts: [],
      routeCallbacks: [],
      functions: [],
      calls: [],
      constants: new Map(),
    };

    const res = resolver.resolveRoutes([fileResult]);
    expect(res.warnings.some((w) => w.includes('Circular'))).toBe(true);
  });
});
