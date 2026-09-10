import { describe, it, expect } from 'vitest';
import {
  groupRoutesByPrefix,
  getRelativeRoutePath,
  getStaticSegments,
} from '../../src/providers/routeGrouping';
import { createRoute, Route } from '../../src/models/Route';

describe('routeGrouping', () => {
  describe('getStaticSegments', () => {
    it('extracts static segments and stops before parameter segments', () => {
      expect(getStaticSegments('/')).toEqual([]);
      expect(getStaticSegments('/users')).toEqual(['users']);
      expect(getStaticSegments('/api/v1/users/:id')).toEqual(['api', 'v1', 'users']);
      expect(getStaticSegments('/api/v1/diagnose/{id}')).toEqual(['api', 'v1', 'diagnose']);
      expect(getStaticSegments('/api/v1/auth/*')).toEqual(['api', 'v1', 'auth']);
      expect(getStaticSegments('/api/<dynamic>/profile')).toEqual(['api']);
      expect(getStaticSegments('/:id')).toEqual([]);
    });
  });

  describe('getRelativeRoutePath', () => {
    it('returns correct relative path based on group prefix', () => {
      expect(getRelativeRoutePath('/', '/')).toBe('/');
      expect(getRelativeRoutePath('/users', '/users')).toBe('/');
      expect(getRelativeRoutePath('/users/:id', '/users')).toBe('/:id');
      expect(getRelativeRoutePath('/api/v1/auth/*', '/api/v1/auth')).toBe('/*');
      expect(getRelativeRoutePath('/api/v1/auth/sign-in/email', '/api/v1/auth')).toBe(
        '/sign-in/email'
      );
      expect(getRelativeRoutePath('/api/v1/diagnose', '/api/v1/diagnose')).toBe('/');
      expect(getRelativeRoutePath('/api/v1/diagnose/{id}', '/api/v1/diagnose')).toBe('/{id}');
      expect(getRelativeRoutePath('/api/v1/health', '/api/v1/health')).toBe('/');
      expect(getRelativeRoutePath('/:id', '/')).toBe('/:id');
    });
  });

  describe('groupRoutesByPrefix', () => {
    it('1. returns empty array when input routes is empty', () => {
      expect(groupRoutesByPrefix([])).toEqual([]);
    });

    it('2. groups single framework routes correctly', () => {
      const routes: Route[] = [
        createRoute({
          method: 'GET',
          path: '/users',
          framework: 'express',
          source: { file: 'src/users.ts', line: 10, column: 1 },
        }),
        createRoute({
          method: 'POST',
          path: '/users',
          framework: 'express',
          source: { file: 'src/users.ts', line: 20, column: 1 },
        }),
      ];

      const groups = groupRoutesByPrefix(routes);
      expect(groups).toHaveLength(1);
      expect(groups[0].label).toBe('/users');
      expect(groups[0].prefix).toBe('/users');
      expect(groups[0].count).toBe(2);
      expect(groups[0].routes).toHaveLength(2);
    });

    it('3. isolates root routes into Root group', () => {
      const routes: Route[] = [
        createRoute({
          method: 'GET',
          path: '/',
          framework: 'hono',
          source: { file: 'src/index.ts', line: 5, column: 1 },
        }),
        createRoute({
          method: 'GET',
          path: '/api/v1/health',
          framework: 'hono',
          source: { file: 'src/health.ts', line: 12, column: 1 },
        }),
      ];

      const groups = groupRoutesByPrefix(routes);
      expect(groups).toHaveLength(2);
      expect(groups[0].label).toBe('Root');
      expect(groups[0].prefix).toBe('/');
      expect(groups[0].count).toBe(1);
      expect(groups[0].routes[0].path).toBe('/');

      expect(groups[1].label).toBe('/api/v1/health');
      expect(groups[1].prefix).toBe('/api/v1/health');
      expect(groups[1].count).toBe(1);
    });

    it('4. groups shared single-segment prefixes', () => {
      const routes: Route[] = [
        createRoute({
          method: 'GET',
          path: '/users',
          framework: 'express',
          source: { file: 'src/users.ts', line: 1, column: 1 },
        }),
        createRoute({
          method: 'GET',
          path: '/users/:id',
          framework: 'express',
          source: { file: 'src/users.ts', line: 5, column: 1 },
        }),
        createRoute({
          method: 'GET',
          path: '/posts',
          framework: 'express',
          source: { file: 'src/posts.ts', line: 1, column: 1 },
        }),
      ];

      const groups = groupRoutesByPrefix(routes);
      expect(groups).toHaveLength(2);
      expect(groups.map((g) => g.label)).toEqual(['/posts', '/users']);
      expect(groups.find((g) => g.label === '/users')!.count).toBe(2);
      expect(groups.find((g) => g.label === '/posts')!.count).toBe(1);
    });

    it('5. collapses single-child chains and splits at nested branch prefixes', () => {
      const routes: Route[] = [
        createRoute({
          method: 'POST',
          path: '/api/v1/auth/login',
          framework: 'hono',
          source: { file: 'src/auth.ts', line: 10, column: 1 },
        }),
        createRoute({
          method: 'POST',
          path: '/api/v1/auth/logout',
          framework: 'hono',
          source: { file: 'src/auth.ts', line: 20, column: 1 },
        }),
        createRoute({
          method: 'GET',
          path: '/api/v1/users',
          framework: 'hono',
          source: { file: 'src/users.ts', line: 5, column: 1 },
        }),
        createRoute({
          method: 'GET',
          path: '/api/v1/users/:id',
          framework: 'hono',
          source: { file: 'src/users.ts', line: 15, column: 1 },
        }),
      ];

      const groups = groupRoutesByPrefix(routes);
      expect(groups.map((g) => g.label)).toEqual(['/api/v1/auth', '/api/v1/users']);
      expect(groups[0].count).toBe(2);
      expect(groups[1].count).toBe(2);
    });

    it('6. handles multiple HTTP methods on identical paths and sorts methods by priority', () => {
      const routes: Route[] = [
        createRoute({
          method: 'DELETE',
          path: '/api/v1/items/:id',
          framework: 'hono',
          source: { file: 'src/items.ts', line: 30, column: 1 },
        }),
        createRoute({
          method: 'GET',
          path: '/api/v1/items/:id',
          framework: 'hono',
          source: { file: 'src/items.ts', line: 10, column: 1 },
        }),
        createRoute({
          method: 'PATCH',
          path: '/api/v1/items/:id',
          framework: 'hono',
          source: { file: 'src/items.ts', line: 25, column: 1 },
        }),
        createRoute({
          method: 'POST',
          path: '/api/v1/items/:id',
          framework: 'hono',
          source: { file: 'src/items.ts', line: 15, column: 1 },
        }),
      ];

      const groups = groupRoutesByPrefix(routes);
      expect(groups).toHaveLength(1);
      expect(groups[0].label).toBe('/api/v1/items');
      expect(groups[0].count).toBe(4);

      const methods = groups[0].routes.map((r) => r.method);
      // Expected standard order: GET, POST, PATCH, DELETE
      expect(methods).toEqual(['GET', 'POST', 'PATCH', 'DELETE']);
    });

    it('7. handles dynamic routes with low confidence', () => {
      const routes: Route[] = [
        createRoute({
          method: 'GET',
          path: '/api/users/<dynamic>',
          framework: 'express',
          source: { file: 'src/routes.ts', line: 15, column: 1 },
          confidence: 'low',
        }),
      ];

      const groups = groupRoutesByPrefix(routes);
      expect(groups).toHaveLength(1);
      expect(groups[0].label).toBe('/api/users');
      expect(groups[0].count).toBe(1);
      expect(groups[0].routes[0].confidence).toBe('low');
    });

    it('8. handles parameter-only routes gracefully under Root', () => {
      const routes: Route[] = [
        createRoute({
          method: 'GET',
          path: '/:id',
          framework: 'express',
          source: { file: 'src/routes.ts', line: 1, column: 1 },
        }),
      ];

      const groups = groupRoutesByPrefix(routes);
      expect(groups).toHaveLength(1);
      expect(groups[0].label).toBe('Root');
      expect(groups[0].count).toBe(1);
      expect(groups[0].routes[0].path).toBe('/:id');
    });

    it('9. calculates accurate descendant counts with filtered routes', () => {
      const allRoutes: Route[] = [
        createRoute({
          method: 'GET',
          path: '/api/v1/auth/login',
          framework: 'hono',
          source: { file: 'src/auth.ts', line: 1, column: 1 },
        }),
        createRoute({
          method: 'POST',
          path: '/api/v1/auth/login',
          framework: 'hono',
          source: { file: 'src/auth.ts', line: 5, column: 1 },
        }),
        createRoute({
          method: 'GET',
          path: '/api/v1/users',
          framework: 'hono',
          source: { file: 'src/users.ts', line: 10, column: 1 },
        }),
      ];

      // Full groups
      const fullGroups = groupRoutesByPrefix(allRoutes);
      expect(fullGroups.find((g) => g.label === '/api/v1/auth')!.count).toBe(2);
      expect(fullGroups.find((g) => g.label === '/api/v1/users')!.count).toBe(1);

      // Filtered to only "login"
      const filteredRoutes = allRoutes.filter((r) => r.path.includes('login'));
      const filteredGroups = groupRoutesByPrefix(filteredRoutes);
      expect(filteredGroups).toHaveLength(1);
      expect(filteredGroups[0].label).toBe('/api/v1/auth');
      expect(filteredGroups[0].count).toBe(2);
    });

    it('10. deterministic sorting: Root always comes first, followed by alphabetical order', () => {
      const routes: Route[] = [
        createRoute({
          method: 'GET',
          path: '/zebra',
          framework: 'express',
          source: { file: 'src/z.ts', line: 1, column: 1 },
        }),
        createRoute({
          method: 'GET',
          path: '/',
          framework: 'express',
          source: { file: 'src/index.ts', line: 1, column: 1 },
        }),
        createRoute({
          method: 'GET',
          path: '/alpha',
          framework: 'express',
          source: { file: 'src/a.ts', line: 1, column: 1 },
        }),
      ];

      const groups = groupRoutesByPrefix(routes);
      expect(groups.map((g) => g.label)).toEqual(['Root', '/alpha', '/zebra']);
    });

    it('11. preserves source metadata on grouped routes', () => {
      const routes: Route[] = [
        createRoute({
          method: 'GET',
          path: '/users',
          framework: 'express',
          source: { file: 'src/modules/users.ts', line: 42, column: 8 },
        }),
      ];

      const groups = groupRoutesByPrefix(routes);
      expect(groups[0].routes[0].source).toEqual({
        file: 'src/modules/users.ts',
        line: 42,
        column: 8,
      });
    });

    it('12. groups real Express realistic-project routes into clean resource clusters', () => {
      const routes: Route[] = [
        createRoute({
          method: 'POST',
          path: '/api/auth/login',
          framework: 'express',
          source: { file: 'src/routes/auth.ts', line: 7, column: 1 },
        }),
        createRoute({
          method: 'GET',
          path: '/api/auth/profile',
          framework: 'express',
          source: { file: 'src/routes/auth.ts', line: 9, column: 1 },
        }),
        createRoute({
          method: 'POST',
          path: '/api/auth/register',
          framework: 'express',
          source: { file: 'src/routes/auth.ts', line: 8, column: 1 },
        }),
        createRoute({
          method: 'GET',
          path: '/api/users',
          framework: 'express',
          source: { file: 'src/routes/users.ts', line: 7, column: 1 },
        }),
        createRoute({
          method: 'POST',
          path: '/api/users',
          framework: 'express',
          source: { file: 'src/routes/users.ts', line: 8, column: 1 },
        }),
        createRoute({
          method: 'DELETE',
          path: '/api/users/:id',
          framework: 'express',
          source: { file: 'src/routes/users.ts', line: 10, column: 1 },
        }),
        createRoute({
          method: 'GET',
          path: '/api/users/:id',
          framework: 'express',
          source: { file: 'src/routes/users.ts', line: 9, column: 1 },
        }),
      ];

      const groups = groupRoutesByPrefix(routes);
      expect(groups.map((g) => g.label)).toEqual(['/api/auth', '/api/users']);
      expect(groups[0].count).toBe(3);
      expect(groups[1].count).toBe(4);

      // Verify relative paths in auth group
      const authRelPaths = groups[0].routes.map((r) =>
        getRelativeRoutePath(r.path, groups[0].prefix)
      );
      expect(authRelPaths).toEqual(['/login', '/profile', '/register']);

      // Verify relative paths in users group
      const usersRelPaths = groups[1].routes.map((r) =>
        getRelativeRoutePath(r.path, groups[1].prefix)
      );
      expect(usersRelPaths).toEqual(['/', '/', '/:id', '/:id']);
    });

    it('13. groups all 18 real-world Hono routes from potadi-backend-service exactly as designed', () => {
      const routes: Route[] = [
        createRoute({
          method: 'GET',
          path: '/',
          framework: 'hono',
          source: { file: 'src/index.ts', line: 64, column: 1 },
        }),
        createRoute({
          method: 'GET',
          path: '/api/v1/auth/*',
          framework: 'hono',
          source: { file: 'src/routes/auth.route.ts', line: 20, column: 1 },
        }),
        createRoute({
          method: 'POST',
          path: '/api/v1/auth/*',
          framework: 'hono',
          source: { file: 'src/routes/auth.route.ts', line: 21, column: 1 },
        }),
        createRoute({
          method: 'POST',
          path: '/api/v1/auth/request-password-reset',
          framework: 'hono',
          source: { file: 'src/routes/auth.route.ts', line: 30, column: 1 },
        }),
        createRoute({
          method: 'POST',
          path: '/api/v1/auth/reset-password',
          framework: 'hono',
          source: { file: 'src/routes/auth.route.ts', line: 40, column: 1 },
        }),
        createRoute({
          method: 'POST',
          path: '/api/v1/auth/sign-in/email',
          framework: 'hono',
          source: { file: 'src/routes/auth.route.ts', line: 50, column: 1 },
        }),
        createRoute({
          method: 'POST',
          path: '/api/v1/auth/sign-out',
          framework: 'hono',
          source: { file: 'src/routes/auth.route.ts', line: 60, column: 1 },
        }),
        createRoute({
          method: 'POST',
          path: '/api/v1/auth/sign-up/email',
          framework: 'hono',
          source: { file: 'src/routes/auth.route.ts', line: 70, column: 1 },
        }),
        createRoute({
          method: 'GET',
          path: '/api/v1/diagnose',
          framework: 'hono',
          source: { file: 'src/routes/diagnose.route.ts', line: 10, column: 1 },
        }),
        createRoute({
          method: 'POST',
          path: '/api/v1/diagnose',
          framework: 'hono',
          source: { file: 'src/routes/diagnose.route.ts', line: 15, column: 1 },
        }),
        createRoute({
          method: 'GET',
          path: '/api/v1/diagnose/{id}',
          framework: 'hono',
          source: { file: 'src/routes/diagnose.route.ts', line: 25, column: 1 },
        }),
        createRoute({
          method: 'DELETE',
          path: '/api/v1/diagnose/{id}',
          framework: 'hono',
          source: { file: 'src/routes/diagnose.route.ts', line: 35, column: 1 },
        }),
        createRoute({
          method: 'PATCH',
          path: '/api/v1/diagnose/{id}',
          framework: 'hono',
          source: { file: 'src/routes/diagnose.route.ts', line: 45, column: 1 },
        }),
        createRoute({
          method: 'GET',
          path: '/api/v1/diagnose/{id}/report',
          framework: 'hono',
          source: { file: 'src/routes/diagnose.route.ts', line: 55, column: 1 },
        }),
        createRoute({
          method: 'POST',
          path: '/api/v1/diagnose/image',
          framework: 'hono',
          source: { file: 'src/routes/diagnose.route.ts', line: 65, column: 1 },
        }),
        createRoute({
          method: 'GET',
          path: '/api/v1/diagnose/history',
          framework: 'hono',
          source: { file: 'src/routes/diagnose.route.ts', line: 75, column: 1 },
        }),
        createRoute({
          method: 'GET',
          path: '/api/v1/docs',
          framework: 'hono',
          source: { file: 'src/index.ts', line: 50, column: 1 },
        }),
        createRoute({
          method: 'GET',
          path: '/api/v1/health',
          framework: 'hono',
          source: { file: 'src/index.ts', line: 55, column: 1 },
        }),
      ];

      const groups = groupRoutesByPrefix(routes);
      expect(groups.map((g) => `${g.label} (${g.count})`)).toEqual([
        'Root (1)',
        '/api/v1/auth (7)',
        '/api/v1/diagnose (8)',
        '/api/v1/docs (1)',
        '/api/v1/health (1)',
      ]);

      const totalGroupedRoutes = groups.reduce((acc, g) => acc + g.count, 0);
      expect(totalGroupedRoutes).toBe(18);

      // Verify relative paths in auth group
      const authGroup = groups.find((g) => g.label === '/api/v1/auth')!;
      expect(
        authGroup.routes.map((r) => `${r.method} ${getRelativeRoutePath(r.path, authGroup.prefix)}`)
      ).toEqual([
        'GET /*',
        'POST /*',
        'POST /request-password-reset',
        'POST /reset-password',
        'POST /sign-in/email',
        'POST /sign-out',
        'POST /sign-up/email',
      ]);

      // Verify relative paths in diagnose group
      const diagnoseGroup = groups.find((g) => g.label === '/api/v1/diagnose')!;
      expect(
        diagnoseGroup.routes.map(
          (r) => `${r.method} ${getRelativeRoutePath(r.path, diagnoseGroup.prefix)}`
        )
      ).toEqual([
        'GET /',
        'POST /',
        'GET /{id}',
        'PATCH /{id}',
        'DELETE /{id}',
        'GET /{id}/report',
        'GET /history',
        'POST /image',
      ]);
    });
  });
});
