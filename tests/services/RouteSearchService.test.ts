import { describe, it, expect } from 'vitest';
import { RouteSearchService } from '../../src/services/RouteSearchService';
import { createRoute, Route } from '../../src/models/Route';

describe('RouteSearchService', () => {
  const sampleRoutes: Route[] = [
    createRoute({
      method: 'GET',
      path: '/api/users',
      framework: 'express',
      confidence: 'high',
      source: { file: 'src/routes/users.ts', line: 10, column: 1 },
    }),
    createRoute({
      method: 'POST',
      path: '/api/users',
      framework: 'express',
      confidence: 'high',
      source: { file: 'src/routes/users.ts', line: 15, column: 1 },
    }),
    createRoute({
      method: 'GET',
      path: '/api/users/:id',
      framework: 'express',
      confidence: 'high',
      source: { file: 'src/routes/users.ts', line: 20, column: 1 },
    }),
    createRoute({
      method: 'DELETE',
      path: '/api/users/:id',
      framework: 'express',
      confidence: 'high',
      source: { file: 'src/routes/users.ts', line: 25, column: 1 },
    }),
    createRoute({
      method: 'POST',
      path: '/api/auth/login',
      framework: 'express',
      confidence: 'high',
      source: { file: 'src/routes/auth.ts', line: 8, column: 1 },
    }),
    createRoute({
      method: 'GET',
      path: '/api/health',
      framework: 'fastify',
      confidence: 'high',
      source: { file: 'src/server.ts', line: 5, column: 1 },
    }),
  ];

  it('returns all routes when query is empty or whitespace', () => {
    expect(RouteSearchService.search(sampleRoutes, '')).toHaveLength(6);
    expect(RouteSearchService.search(sampleRoutes, '   ')).toHaveLength(6);
  });

  it('filters by route path (case-insensitive substring)', () => {
    const results = RouteSearchService.search(sampleRoutes, 'auth');
    expect(results).toHaveLength(1);
    expect(results[0].path).toBe('/api/auth/login');
  });

  it('filters by HTTP method', () => {
    const deleteResults = RouteSearchService.search(sampleRoutes, 'DELETE');
    expect(deleteResults).toHaveLength(1);
    expect(deleteResults[0].method).toBe('DELETE');

    const lowerDeleteResults = RouteSearchService.search(sampleRoutes, 'delete');
    expect(lowerDeleteResults).toHaveLength(1);
  });

  it('filters by framework name', () => {
    const fastifyResults = RouteSearchService.search(sampleRoutes, 'fastify');
    expect(fastifyResults).toHaveLength(1);
    expect(fastifyResults[0].framework).toBe('fastify');
  });

  it('filters by source file name', () => {
    const authFileResults = RouteSearchService.search(sampleRoutes, 'auth.ts');
    expect(authFileResults).toHaveLength(1);
    expect(authFileResults[0].source.file).toBe('src/routes/auth.ts');
  });

  it('supports multi-token queries', () => {
    // "GET users" should match only GET routes containing "users"
    const results = RouteSearchService.search(sampleRoutes, 'GET users');
    expect(results).toHaveLength(2);
    expect(results.every((r) => r.method === 'GET' && r.path.includes('users'))).toBe(true);
  });

  it('returns an empty array when no routes match', () => {
    const results = RouteSearchService.search(sampleRoutes, 'nonexistent-endpoint');
    expect(results).toHaveLength(0);
  });

  it('preserves the original deterministic ordering of routes', () => {
    const results = RouteSearchService.search(sampleRoutes, 'users');
    expect(results).toHaveLength(4);
    expect(results[0].id).toBe(sampleRoutes[0].id);
    expect(results[1].id).toBe(sampleRoutes[1].id);
    expect(results[2].id).toBe(sampleRoutes[2].id);
    expect(results[3].id).toBe(sampleRoutes[3].id);
  });
});
