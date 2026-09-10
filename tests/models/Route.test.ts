import { describe, it, expect } from 'vitest';
import { createRoute, Route } from '../../src/models/Route';
import {
  HTTP_METHODS,
  isHttpMethod,
  normalizeHttpMethod,
} from '../../src/models/HttpMethod';
import {
  KNOWN_FRAMEWORKS,
  normalizeFramework,
} from '../../src/models/Framework';
import {
  ROUTE_CONFIDENCES,
  isRouteConfidence,
} from '../../src/models/RouteConfidence';
import {
  generateRouteId,
  canonicalizePathForIdentity,
} from '../../src/utils/routeIdentity';

describe('Route Model & Domain Primitives', () => {
  describe('HttpMethod', () => {
    it('defines standard HTTP methods without routing constructs like ALL or USE', () => {
      expect(HTTP_METHODS).toEqual([
        'GET',
        'POST',
        'PUT',
        'PATCH',
        'DELETE',
        'OPTIONS',
        'HEAD',
        'TRACE',
      ]);
    });

    it('validates HTTP methods with isHttpMethod', () => {
      expect(isHttpMethod('GET')).toBe(true);
      expect(isHttpMethod('post')).toBe(true);
      expect(isHttpMethod('DELETE')).toBe(true);
      expect(isHttpMethod('ALL')).toBe(false);
      expect(isHttpMethod('USE')).toBe(false);
      expect(isHttpMethod('INVALID')).toBe(false);
    });

    it('normalizes HTTP method to uppercase', () => {
      expect(normalizeHttpMethod('get')).toBe('GET');
      expect(normalizeHttpMethod('  post  ')).toBe('POST');
    });

    it('throws on invalid HTTP method normalization', () => {
      expect(() => normalizeHttpMethod('INVALID')).toThrow(
        "Invalid HTTP method: 'INVALID'"
      );
    });
  });

  describe('Framework', () => {
    it('recognizes known framework identifiers', () => {
      expect(KNOWN_FRAMEWORKS).toContain('express');
      expect(KNOWN_FRAMEWORKS).toContain('fastify');
      expect(KNOWN_FRAMEWORKS).toContain('hono');
      expect(KNOWN_FRAMEWORKS).toContain('nestjs');
      expect(KNOWN_FRAMEWORKS).toContain('fastapi');
      expect(KNOWN_FRAMEWORKS).toContain('unknown');
    });

    it('normalizes framework strings', () => {
      expect(normalizeFramework('Express')).toBe('express');
      expect(normalizeFramework('  FASTIFY  ')).toBe('fastify');
      expect(normalizeFramework('non-existent')).toBe('unknown');
    });
  });

  describe('RouteConfidence', () => {
    it('defines canonical confidence levels', () => {
      expect(ROUTE_CONFIDENCES).toEqual(['high', 'medium', 'low']);
      expect(isRouteConfidence('high')).toBe(true);
      expect(isRouteConfidence('medium')).toBe(true);
      expect(isRouteConfidence('low')).toBe(true);
      expect(isRouteConfidence('unknown')).toBe(false);
    });
  });

  describe('routeIdentity', () => {
    it('canonicalizes paths for identity', () => {
      expect(canonicalizePathForIdentity('/api/users')).toBe('/api/users');
      expect(canonicalizePathForIdentity('/api/users/')).toBe('/api/users');
      expect(canonicalizePathForIdentity('api/users')).toBe('/api/users');
      expect(canonicalizePathForIdentity('/api//users///')).toBe('/api/users');
      expect(canonicalizePathForIdentity('/')).toBe('/');
      expect(canonicalizePathForIdentity('')).toBe('/');
      expect(canonicalizePathForIdentity('   ')).toBe('/');
    });

    it('generates deterministic route ID matching preferred format', () => {
      const id = generateRouteId(
        'Express',
        'get',
        '/api/users/',
        'src\\routes\\users.ts',
        12
      );
      expect(id).toBe('express:GET:/api/users:src/routes/users.ts:12');
    });

    it('is strictly deterministic across calls', () => {
      const id1 = generateRouteId('fastify', 'POST', '/items', 'src/items.ts', 45);
      const id2 = generateRouteId('fastify', 'POST', '/items', 'src/items.ts', 45);
      expect(id1).toBe(id2);
    });
  });

  describe('Route creation', () => {
    it('constructs valid Route with automatic deterministic ID', () => {
      const route = createRoute({
        method: 'GET',
        path: '/api/users',
        framework: 'express',
        source: {
          file: 'src/routes/users.ts',
          line: 15,
          column: 5,
        },
        confidence: 'high',
      });

      expect(route).toEqual<Route>({
        id: 'express:GET:/api/users:src/routes/users.ts:15',
        method: 'GET',
        path: '/api/users',
        framework: 'express',
        source: {
          file: 'src/routes/users.ts',
          line: 15,
          column: 5,
        },
        confidence: 'high',
      });
    });

    it('respects explicit ID if provided', () => {
      const route = createRoute({
        id: 'custom-id',
        method: 'POST',
        path: '/auth/login',
        framework: 'hono',
        source: {
          file: 'src/auth.ts',
          line: 20,
          column: 1,
        },
        confidence: 'medium',
      });

      expect(route.id).toBe('custom-id');
    });
  });
});
