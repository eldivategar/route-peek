import { describe, it, expect } from 'vitest';
import { RouteTreeModelBuilder } from '../../src/providers/RouteTreeModelBuilder';
import { createRoute, Route } from '../../src/models/Route';
import { HttpMethod } from '../../src/models/HttpMethod';

describe('RouteTreeModelBuilder', () => {
  it('returns empty array when input routes is empty', () => {
    expect(RouteTreeModelBuilder.build([])).toEqual([]);
  });

  describe('Merging same-path methods', () => {
    it('merges GET and POST on same path into a single endpoint node with method children', () => {
      const r1 = createRoute({
        method: 'POST',
        path: '/api/users',
        framework: 'express',
        source: { file: 'src/routes/users.ts', line: 15, column: 1 },
      });
      const r2 = createRoute({
        method: 'GET',
        path: '/api/users',
        framework: 'express',
        source: { file: 'src/routes/users.ts', line: 10, column: 1 },
      });

      const tree = RouteTreeModelBuilder.build([r1, r2]);
      expect(tree).toHaveLength(1);

      const fw = tree[0];
      expect(fw.framework).toBe('express');
      expect(fw.count).toBe(2);

      // Under framework: Resource /api/users (2)
      expect(fw.children).toHaveLength(1);
      const res = fw.children![0];
      expect(res.type).toBe('resource');
      expect(res.resourcePrefix).toBe('/api/users');
      expect(res.count).toBe(2);

      // Under resource: 1 endpoint node for '/' with 2 routes
      expect(res.children).toHaveLength(1);
      const endpoint = res.children![0];
      expect(endpoint.type).toBe('endpoint');
      expect(endpoint.endpointPath).toBe('/');
      expect(endpoint.fullPath).toBe('/api/users');
      expect(endpoint.count).toBe(2);
      expect(endpoint.route).toBeUndefined(); // Multi-method does not bind single route

      // Method children sorted in canonical order: GET, then POST
      expect(endpoint.children).toHaveLength(2);
      expect(endpoint.children![0].type).toBe('method');
      expect(endpoint.children![0].route).toBe(r2); // GET
      expect(endpoint.children![0].route!.method).toBe('GET');

      expect(endpoint.children![1].type).toBe('method');
      expect(endpoint.children![1].route).toBe(r1); // POST
      expect(endpoint.children![1].route!.method).toBe('POST');
    });
  });

  describe('Single-method endpoint (Case C)', () => {
    it('creates a leaf endpoint node with no child method nodes', () => {
      const route = createRoute({
        method: 'GET',
        path: '/api/users/:id',
        framework: 'express',
        source: { file: 'src/routes/users.ts', line: 20, column: 1 },
      });

      const tree = RouteTreeModelBuilder.build([route]);
      const fw = tree[0];

      // Resource /api/users
      const res = fw.children![0];
      expect(res.children).toHaveLength(1);

      const endpoint = res.children![0];
      expect(endpoint.type).toBe('endpoint');
      expect(endpoint.endpointPath).toBe('/:id');
      expect(endpoint.count).toBe(1);
      expect(endpoint.route).toBe(route);
      expect(endpoint.children).toBeUndefined(); // Leaf node!
    });
  });

  describe('Smart compact Case A (single route resource lifting)', () => {
    it('lifts single-route resource to framework level when presentation-redundant', () => {
      const pingRoute = createRoute({
        method: 'GET',
        path: '/api/ping',
        framework: 'fiber',
        source: { file: 'routes/ping.go', line: 5, column: 1 },
      });

      const tree = RouteTreeModelBuilder.build([pingRoute]);
      expect(tree).toHaveLength(1);

      const fw = tree[0];
      expect(fw.children).toHaveLength(1);

      // Lifted directly to framework level as an endpoint node!
      const lifted = fw.children![0];
      expect(lifted.type).toBe('endpoint');
      expect(lifted.endpointPath).toBe('/api/ping');
      expect(lifted.fullPath).toBe('/api/ping');
      expect(lifted.count).toBe(1);
      expect(lifted.route).toBe(pingRoute);
      expect(lifted.children).toBeUndefined();
    });

    it('does NOT lift when prefix is not redundant (e.g. /api/v1/auth vs /api/v1/auth/login)', () => {
      const loginRoute = createRoute({
        method: 'POST',
        path: '/api/v1/auth/login',
        framework: 'fiber',
        source: { file: 'routes/auth.go', line: 10, column: 1 },
      });

      const tree = RouteTreeModelBuilder.build([loginRoute]);
      const fw = tree[0];
      expect(fw.children).toHaveLength(1);

      const res = fw.children![0];
      expect(res.type).toBe('resource');
      expect(res.resourcePrefix).toBe('/api/v1/auth');
      expect(res.count).toBe(1);
      expect(res.children![0].endpointPath).toBe('/login');
    });
  });

  describe('Nested resource with multiple endpoints (Case B)', () => {
    it('groups multiple endpoints under resource and aggregates methods cleanly', () => {
      const routes: Route[] = [
        createRoute({
          method: 'GET',
          path: '/api/v1/communities',
          framework: 'fiber',
          source: { file: 'routes/communities.go', line: 10, column: 1 },
        }),
        createRoute({
          method: 'POST',
          path: '/api/v1/communities',
          framework: 'fiber',
          source: { file: 'routes/communities.go', line: 15, column: 1 },
        }),
        createRoute({
          method: 'GET',
          path: '/api/v1/communities/:community_id',
          framework: 'fiber',
          source: { file: 'routes/communities.go', line: 20, column: 1 },
        }),
        createRoute({
          method: 'GET',
          path: '/api/v1/communities/:community_id/feeds/:post_id',
          framework: 'fiber',
          source: { file: 'routes/communities.go', line: 30, column: 1 },
        }),
        createRoute({
          method: 'DELETE',
          path: '/api/v1/communities/:community_id/feeds/:post_id',
          framework: 'fiber',
          source: { file: 'routes/communities.go', line: 35, column: 1 },
        }),
      ];

      const tree = RouteTreeModelBuilder.build(routes);
      const fw = tree[0];
      expect(fw.count).toBe(5);

      const res = fw.children![0];
      expect(res.type).toBe('resource');
      expect(res.resourcePrefix).toBe('/api/v1/communities');
      expect(res.count).toBe(5);

      // Distinct endpoint paths: '/', '/:community_id', '/:community_id/feeds/:post_id'
      expect(res.children).toHaveLength(3);

      // Endpoint 1: '/' -> GET, POST (multi-method)
      const ep1 = res.children![0];
      expect(ep1.endpointPath).toBe('/');
      expect(ep1.count).toBe(2);
      expect(ep1.children).toHaveLength(2);

      // Endpoint 2: '/:community_id' -> GET (single-method leaf)
      const ep2 = res.children![1];
      expect(ep2.endpointPath).toBe('/:community_id');
      expect(ep2.count).toBe(1);
      expect(ep2.route).toBeDefined();
      expect(ep2.children).toBeUndefined();

      // Endpoint 3: '/:community_id/feeds/:post_id' -> GET, DELETE (multi-method)
      const ep3 = res.children![2];
      expect(ep3.endpointPath).toBe('/:community_id/feeds/:post_id');
      expect(ep3.count).toBe(2);
      expect(ep3.children).toHaveLength(2);
      expect(ep3.children![0].route!.method).toBe('GET');
      expect(ep3.children![1].route!.method).toBe('DELETE');
    });
  });

  describe('Dynamic routes and warnings', () => {
    it('propagates isDynamic flag to endpoint and framework nodes', () => {
      const dynamicRoute = createRoute({
        method: 'GET',
        path: '/api/users/<dynamic>',
        framework: 'express',
        source: { file: 'src/routes.ts', line: 10, column: 1 },
        confidence: 'low',
      });
      const normalRoute = createRoute({
        method: 'POST',
        path: '/api/users/<dynamic>',
        framework: 'express',
        source: { file: 'src/routes.ts', line: 20, column: 1 },
        confidence: 'high',
      });

      const tree = RouteTreeModelBuilder.build([dynamicRoute, normalRoute]);
      const fw = tree[0];
      expect(fw.isDynamic).toBe(true);

      const res = fw.children![0];
      expect(res.isDynamic).toBe(true);

      const ep = res.children![0];
      expect(ep.isDynamic).toBe(true);
      expect(ep.children![0].isDynamic).toBe(true); // GET is dynamic
      expect(ep.children![1].isDynamic).toBe(true); // <dynamic> in path makes it dynamic
    });
  });

  describe('Deterministic method ordering', () => {
    it('sorts methods in canonical priority: GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS, TRACE', () => {
      const methods: HttpMethod[] = [
        'TRACE',
        'DELETE',
        'OPTIONS',
        'POST',
        'PATCH',
        'GET',
        'HEAD',
        'PUT',
      ];
      const routes = methods.map((method, idx) =>
        createRoute({
          method,
          path: '/test',
          framework: 'fastify',
          source: { file: 'server.ts', line: idx + 1, column: 1 },
        })
      );

      const tree = RouteTreeModelBuilder.build(routes);
      const res = tree[0].children![0];
      const ep = res.children![0];

      const orderedMethods = ep.children!.map((c) => c.route!.method);
      expect(orderedMethods).toEqual([
        'GET',
        'POST',
        'PUT',
        'PATCH',
        'DELETE',
        'HEAD',
        'OPTIONS',
        'TRACE',
      ]);
    });
  });

  describe('Shallow Compact Endpoint Grouping (UX Polishing Requirements)', () => {
    it('groups resource endpoints flatly without excessive path-segment nesting: /api/dashboard/v1/communities, /api/dashboard/v1/events, /api/dashboard/v1/feeds', () => {
      const routes = [
        createRoute({ method: 'GET', path: '/api/dashboard/v1/communities', framework: 'fiber', source: { file: 'dash.go', line: 10, column: 1 } }),
        createRoute({ method: 'GET', path: '/api/dashboard/v1/events', framework: 'fiber', source: { file: 'dash.go', line: 20, column: 1 } }),
        createRoute({ method: 'GET', path: '/api/dashboard/v1/feeds', framework: 'fiber', source: { file: 'dash.go', line: 30, column: 1 } }),
      ];

      const tree = RouteTreeModelBuilder.build(routes);
      expect(tree).toHaveLength(1);

      const fw = tree[0];
      expect(fw.children).toHaveLength(1);
      const res = fw.children![0];
      expect(res.resourcePrefix).toBe('/api/dashboard');
      expect(res.count).toBe(3);

      // Must NOT create nested /v1 folder; must be direct shallow endpoint children!
      expect(res.children).toHaveLength(3);
      expect(res.children![0].endpointPath).toBe('/v1/communities');
      expect(res.children![0].type).toBe('endpoint');
      expect(res.children![0].count).toBe(1);
      expect(res.children![0].children).toBeUndefined(); // Direct leaf

      expect(res.children![1].endpointPath).toBe('/v1/events');
      expect(res.children![1].type).toBe('endpoint');
      expect(res.children![1].count).toBe(1);
      expect(res.children![1].children).toBeUndefined(); // Direct leaf

      expect(res.children![2].endpointPath).toBe('/v1/feeds');
      expect(res.children![2].type).toBe('endpoint');
      expect(res.children![2].count).toBe(1);
      expect(res.children![2].children).toBeUndefined(); // Direct leaf
    });

    it('keeps sibling subpaths as shallow siblings under resource: /users/:id and /users/:id/reset-password', () => {
      const routes = [
        createRoute({ method: 'GET', path: '/users/:id', framework: 'express', source: { file: 'users.ts', line: 10, column: 1 } }),
        createRoute({ method: 'POST', path: '/users/:id/reset-password', framework: 'express', source: { file: 'users.ts', line: 20, column: 1 } }),
      ];

      const tree = RouteTreeModelBuilder.build(routes);
      const res = tree[0].children![0];
      expect(res.resourcePrefix).toBe('/users');
      expect(res.children).toHaveLength(2);

      expect(res.children![0].endpointPath).toBe('/:id');
      expect(res.children![0].count).toBe(1);
      expect(res.children![0].children).toBeUndefined(); // Direct leaf

      expect(res.children![1].endpointPath).toBe('/:id/reset-password');
      expect(res.children![1].count).toBe(1);
      expect(res.children![1].children).toBeUndefined(); // Direct leaf
    });

    it('merges same-path methods cleanly with expandable method nodes: GET, PATCH, DELETE /users/:id', () => {
      const getRoute = createRoute({ method: 'GET', path: '/users/:id', framework: 'express', source: { file: 'u.ts', line: 10, column: 1 } });
      const patchRoute = createRoute({ method: 'PATCH', path: '/users/:id', framework: 'express', source: { file: 'u.ts', line: 11, column: 1 } });
      const delRoute = createRoute({ method: 'DELETE', path: '/users/:id', framework: 'express', source: { file: 'u.ts', line: 12, column: 1 } });

      const tree = RouteTreeModelBuilder.build([getRoute, patchRoute, delRoute]);
      const res = tree[0].children![0];

      expect(res.children).toHaveLength(1);
      const parentNode = res.children![0];
      expect(parentNode.type).toBe('endpoint');
      expect(parentNode.endpointPath).toBe('/:id');
      expect(parentNode.count).toBe(3);
      expect(parentNode.routes).toHaveLength(3); // 3 methods on :id

      // Method children in priority order: GET, PATCH, DELETE
      expect(parentNode.children).toHaveLength(3);
      expect(parentNode.children![0].type).toBe('method');
      expect(parentNode.children![0].route!.method).toBe('GET');

      expect(parentNode.children![1].type).toBe('method');
      expect(parentNode.children![1].route!.method).toBe('PATCH');

      expect(parentNode.children![2].type).toBe('method');
      expect(parentNode.children![2].route!.method).toBe('DELETE');
    });

    it('renders single method /health as direct clickable leaf under Case A', () => {
      const healthRoute = createRoute({
        method: 'GET',
        path: '/health',
        framework: 'fiber',
        source: { file: 'health.go', line: 10, column: 1 },
      });

      const tree = RouteTreeModelBuilder.build([healthRoute]);
      const fw = tree[0];
      expect(fw.children).toHaveLength(1);
      const leaf = fw.children![0];
      expect(leaf.type).toBe('endpoint');
      expect(leaf.endpointPath).toBe('/health');
      expect(leaf.route).toBe(healthRoute);
      expect(leaf.children).toBeUndefined();
    });

    it('preserves <dynamic> path and low confidence warning without emoji', () => {
      const dynamicRoute = createRoute({
        method: 'GET',
        path: '/api/users/<dynamic>',
        framework: 'express',
        source: { file: 'users.ts', line: 10, column: 1 },
        confidence: 'low',
      });
      const normalRoute = createRoute({
        method: 'GET',
        path: '/api/users/profile',
        framework: 'express',
        source: { file: 'users.ts', line: 20, column: 1 },
        confidence: 'high',
      });

      const tree = RouteTreeModelBuilder.build([dynamicRoute, normalRoute]);
      const res = tree[0].children![0];
      expect(res.isDynamic).toBe(true);

      expect(res.children).toHaveLength(2);
      expect(res.children![0].endpointPath).toBe('/<dynamic>');
      expect(res.children![0].isDynamic).toBe(true);

      expect(res.children![1].endpointPath).toBe('/profile');
      expect(res.children![1].isDynamic).toBe(false);
    });

    it('reconstructs clean compact tree from search results matching only relevant endpoints', () => {
      const allRoutes = [
        createRoute({ method: 'GET', path: '/api/v1/communities', framework: 'fiber', source: { file: 'c.go', line: 1, column: 1 } }),
        createRoute({ method: 'GET', path: '/api/v1/communities/:id', framework: 'fiber', source: { file: 'c.go', line: 2, column: 1 } }),
        createRoute({ method: 'GET', path: '/api/v1/communities/:id/discussions', framework: 'fiber', source: { file: 'c.go', line: 3, column: 1 } }),
        createRoute({ method: 'POST', path: '/api/v1/communities/:id/discussions', framework: 'fiber', source: { file: 'c.go', line: 4, column: 1 } }),
        createRoute({ method: 'GET', path: '/api/v1/communities/:id/members', framework: 'fiber', source: { file: 'c.go', line: 5, column: 1 } }),
      ];

      // Filter to only "discussions"
      const filteredRoutes = allRoutes.filter((r) => r.path.includes('discussions'));
      expect(filteredRoutes).toHaveLength(2);

      const tree = RouteTreeModelBuilder.build(filteredRoutes);
      const fw = tree[0];
      expect(fw.count).toBe(2);

      const res = fw.children![0];
      expect(res.resourcePrefix).toBe('/api/v1/communities');

      // Only the matching discussions endpoint is present, with GET and POST merged
      expect(res.children).toHaveLength(1);
      expect(res.children![0].endpointPath).toBe('/:id/discussions');
      expect(res.children![0].count).toBe(2);
      expect(res.children![0].children).toHaveLength(2);
      expect(res.children![0].children![0].route!.method).toBe('GET');
      expect(res.children![0].children![1].route!.method).toBe('POST');
    });
  });
});
