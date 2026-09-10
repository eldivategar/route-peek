import { describe, it, expect } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';
import { FiberScanner } from '../../src/scanners/fiber/FiberScanner';
import { ScannerContext } from '../../src/scanners/ScannerContext';

describe('FiberScanner', () => {
  const scanner = new FiberScanner();
  const fixturesDir = path.resolve(__dirname, '../fixtures/fiber');

  const fixtures = [
    'basic',
    'groups',
    'nested-groups',
    'route',
    'use-mount',
    'add',
    'all',
    'constants',
    'dynamic',
    'middleware',
    'multiline',
    'shadowing',
    'multiple-apps',
    'cross-file',
    'invalid',
    'false-positives',
    'realistic-project',
    'test-files',
    'struct-methods',
  ];

  for (const f of fixtures) {
    it(`correctly scans fixture '${f}' against expected-routes.json`, async () => {
      const fixtureRoot = path.join(fixturesDir, f);
      const expectedPath = path.join(fixtureRoot, 'expected-routes.json');
      const expectedContent = await fs.promises.readFile(expectedPath, 'utf8');
      const expected = JSON.parse(expectedContent);

      const context: ScannerContext = { workspaceRoots: [fixtureRoot] };
      const res = await scanner.scan(context);

      expect(res.framework).toBe('fiber');
      expect(res.routes.length).toBe(expected.length);
      expect(res.routes).toEqual(expected);
    });
  }

  it('*_test.go must never produce Fiber routes', async () => {
    const fixtureRoot = path.join(fixturesDir, 'test-files');
    const context: ScannerContext = { workspaceRoots: [fixtureRoot] };
    const res = await scanner.scan(context);

    // Verify /real is found
    expect(res.routes.some((r) => r.path === '/real')).toBe(true);

    // Verify no test routes (/probe) or test files are found
    expect(res.routes.some((r) => r.path === '/probe')).toBe(false);
    expect(res.routes.some((r) => r.source.file.includes('_test.go'))).toBe(false);
  });

  it('verifies struct receiver routes and negative non-Fiber method rejection', async () => {
    const fixtureRoot = path.join(fixturesDir, 'struct-methods');
    const context: ScannerContext = { workspaceRoots: [fixtureRoot] };
    const res = await scanner.scan(context);

    // Expected production routes
    expect(res.routes.some((r) => r.method === 'GET' && r.path === '/health/live')).toBe(true);
    expect(res.routes.some((r) => r.method === 'GET' && r.path === '/')).toBe(true);
    expect(res.routes.some((r) => r.method === 'POST' && r.path === '/api/v1/users/search')).toBe(true);
    expect(res.routes.some((r) => r.method === 'POST' && r.path === '/api/v1/users')).toBe(true);
    expect(res.routes.some((r) => r.method === 'GET' && r.path === '/api/v1/helper')).toBe(true);

    // Negative cases: must strictly NOT produce routes
    expect(res.routes.some((r) => r.path.includes('not-a-fiber-route'))).toBe(false);
    expect(res.routes.some((r) => r.path.includes('Authorization'))).toBe(false);
    expect(res.routes.some((r) => r.path.includes('example.com'))).toBe(false);
    expect(res.routes.some((r) => r.path.includes('invalid-ptr-router'))).toBe(false);
  });

  it('preserves native parameter syntax (:id) and never converts to OpenAPI curly braces ({id})', async () => {
    const fixtureRoot = path.join(fixturesDir, 'realistic-project');
    const context: ScannerContext = { workspaceRoots: [fixtureRoot] };
    const res = await scanner.scan(context);

    const paramRoutes = res.routes.filter((r) => r.path.includes(':id'));
    expect(paramRoutes.length).toBeGreaterThan(0);
    for (const r of res.routes) {
      expect(r.path).not.toContain('{id}');
    }
  });
});
