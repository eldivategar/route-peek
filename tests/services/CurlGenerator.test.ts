import { describe, it, expect } from 'vitest';
import { CurlGenerator } from '../../src/services/CurlGenerator';
import { Route } from '../../src/models/Route';

describe('CurlGenerator', () => {
  const createTestRoute = (method: Route['method'], path: string): Route => ({
    id: `test:${method.toLowerCase()}:${path}:test.ts:1`,
    method,
    path,
    framework: 'express',
    confidence: 'high',
    source: { file: 'test.ts', line: 1, column: 1 },
  });

  describe('HTTP methods', () => {
    const methods: Route['method'][] = [
      'GET',
      'POST',
      'PUT',
      'PATCH',
      'DELETE',
      'OPTIONS',
      'HEAD',
      'TRACE',
    ];

    for (const method of methods) {
      it(`generates correct cURL command for ${method}`, () => {
        const route = createTestRoute(method, '/api/test');
        const curl = CurlGenerator.generate(route);
        expect(curl).toBe(`curl -X ${method} "http://localhost:3000/api/test"`);
      });
    }
  });

  describe('URL joining and slash boundary normalization', () => {
    it('handles base URL without trailing slash and path with leading slash', () => {
      const route = createTestRoute('GET', '/users');
      const curl = CurlGenerator.generate(route, { baseUrl: 'http://localhost:3000' });
      expect(curl).toBe('curl -X GET "http://localhost:3000/users"');
    });

    it('handles base URL with trailing slash and path with leading slash', () => {
      const route = createTestRoute('GET', '/users');
      const curl = CurlGenerator.generate(route, { baseUrl: 'http://localhost:3000/' });
      expect(curl).toBe('curl -X GET "http://localhost:3000/users"');
    });

    it('handles base URL without trailing slash and path without leading slash', () => {
      const route = createTestRoute('GET', 'users');
      const curl = CurlGenerator.generate(route, { baseUrl: 'http://localhost:3000' });
      expect(curl).toBe('curl -X GET "http://localhost:3000/users"');
    });

    it('handles base URL with trailing slash and path without leading slash', () => {
      const route = createTestRoute('GET', 'users');
      const curl = CurlGenerator.generate(route, { baseUrl: 'http://localhost:3000/' });
      expect(curl).toBe('curl -X GET "http://localhost:3000/users"');
    });

    it('handles root path / with base URL without trailing slash', () => {
      const route = createTestRoute('GET', '/');
      const curl = CurlGenerator.generate(route, { baseUrl: 'http://localhost:3000' });
      expect(curl).toBe('curl -X GET "http://localhost:3000/"');
    });

    it('handles root path / with base URL with trailing slash', () => {
      const route = createTestRoute('GET', '/');
      const curl = CurlGenerator.generate(route, { baseUrl: 'http://localhost:3000/' });
      expect(curl).toBe('curl -X GET "http://localhost:3000/"');
    });

    it('handles empty path as root path', () => {
      const route = createTestRoute('GET', '');
      const curl = CurlGenerator.generate(route, { baseUrl: 'http://localhost:3000' });
      expect(curl).toBe('curl -X GET "http://localhost:3000/"');
    });

    it('handles nested base URL without trailing slash', () => {
      const route = createTestRoute('POST', '/items');
      const curl = CurlGenerator.generate(route, { baseUrl: 'http://localhost:3000/api/v1' });
      expect(curl).toBe('curl -X POST "http://localhost:3000/api/v1/items"');
    });

    it('handles nested base URL with trailing slash', () => {
      const route = createTestRoute('POST', '/items');
      const curl = CurlGenerator.generate(route, { baseUrl: 'http://localhost:3000/api/v1/' });
      expect(curl).toBe('curl -X POST "http://localhost:3000/api/v1/items"');
    });

    it('handles nested base URL with root path /', () => {
      const route = createTestRoute('GET', '/');
      const curl = CurlGenerator.generate(route, { baseUrl: 'http://localhost:3000/api/v1' });
      expect(curl).toBe('curl -X GET "http://localhost:3000/api/v1/"');
    });

    it('trims whitespace around base URL', () => {
      const route = createTestRoute('GET', '/ping');
      const curl = CurlGenerator.generate(route, { baseUrl: '  https://api.domain.com/  ' });
      expect(curl).toBe('curl -X GET "https://api.domain.com/ping"');
    });

    it('falls back to default http://localhost:3000 when baseUrl is empty string or whitespace', () => {
      const route = createTestRoute('GET', '/ping');
      const curl = CurlGenerator.generate(route, { baseUrl: '   ' });
      expect(curl).toBe('curl -X GET "http://localhost:3000/ping"');
    });
  });

  describe('Route parameter and dynamic segment preservation', () => {
    it('preserves :param express/fiber style parameters exactly', () => {
      const route = createTestRoute('GET', '/users/:userId/posts/:postId');
      const curl = CurlGenerator.generate(route);
      expect(curl).toBe('curl -X GET "http://localhost:3000/users/:userId/posts/:postId"');
    });

    it('preserves {param} style parameters exactly', () => {
      const route = createTestRoute('GET', '/users/{userId}');
      const curl = CurlGenerator.generate(route);
      expect(curl).toBe('curl -X GET "http://localhost:3000/users/{userId}"');
    });

    it('preserves wildcard * parameters exactly', () => {
      const route = createTestRoute('GET', '/static/*');
      const curl = CurlGenerator.generate(route);
      expect(curl).toBe('curl -X GET "http://localhost:3000/static/*"');
    });

    it('preserves <dynamic> segment without modification', () => {
      const route = createTestRoute('DELETE', '/api/v1/resources/<dynamic>');
      const curl = CurlGenerator.generate(route);
      expect(curl).toBe('curl -X DELETE "http://localhost:3000/api/v1/resources/<dynamic>"');
    });
  });
});
