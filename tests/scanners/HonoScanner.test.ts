import { describe, it, expect } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';
import { HonoScanner } from '../../src/scanners/hono/HonoScanner';

describe('HonoScanner', () => {
  const scanner = new HonoScanner();
  const fixturesDir = path.resolve(__dirname, '../fixtures/hono');

  it('scans realistic project matching expected-routes.json', async () => {
    const root = path.join(fixturesDir, 'realistic-project');
    const result = await scanner.scan({ workspaceRoots: [root] });

    expect(result.framework).toBe('hono');
    expect(result.routes).toHaveLength(7);

    const expectedJsonPath = path.join(root, 'expected-routes.json');
    const expected = JSON.parse(fs.readFileSync(expectedJsonPath, 'utf8'));

    const simplified = result.routes.map((r) => ({
      id: r.id,
      method: r.method,
      path: r.path,
      framework: r.framework,
      confidence: r.confidence,
      file: r.source.file,
      line: r.source.line,
    }));

    // Sort both by id for deterministic comparison
    simplified.sort((a, b) => a.id.localeCompare(b.id));
    expected.sort((a: { id: string }, b: { id: string }) => a.id.localeCompare(b.id));

    expect(simplified).toEqual(expected);
  });

  it('scans basic fixture with all HTTP methods and app.all() expansion', async () => {
    const root = path.join(fixturesDir, 'basic');
    const result = await scanner.scan({ workspaceRoots: [root] });

    // 6 specific routes + 8 from .all('/wildcard') = 14 routes
    expect(result.routes).toHaveLength(14);
    const paths = new Set(result.routes.map((r) => r.path));
    expect(paths).toContain('/users');
    expect(paths).toContain('/users/:id');
    expect(paths).toContain('/wildcard');
  });

  it('scans nested fixture with multi-level app.route()', async () => {
    const root = path.join(fixturesDir, 'nested');
    const result = await scanner.scan({ workspaceRoots: [root] });

    expect(result.routes).toHaveLength(2);
    expect(result.routes.map((r) => r.path)).toEqual(['/api/posts', '/api/posts/:id']);
  });

  it('scans constants fixture resolving constants and template literals', async () => {
    const root = path.join(fixturesDir, 'constants');
    const result = await scanner.scan({ workspaceRoots: [root] });

    expect(result.routes).toHaveLength(2);
    expect(result.routes.map((r) => r.path)).toEqual(['/api/users', '/api/items']);
    for (const r of result.routes) {
      expect(r.confidence).toBe('high');
    }
  });

  it('scans dynamic fixture marking dynamic segments as <dynamic> with low confidence', async () => {
    const root = path.join(fixturesDir, 'dynamic');
    const result = await scanner.scan({ workspaceRoots: [root] });

    expect(result.routes).toHaveLength(2);
    expect(result.routes[0].path).toBe('/<dynamic>');
    expect(result.routes[0].confidence).toBe('low');
    expect(result.routes[1].path).toBe('/api/<dynamic>');
    expect(result.routes[1].confidence).toBe('low');
  });

  it('scans shadowing fixture and ignores shadowed variables', async () => {
    const root = path.join(fixturesDir, 'shadowing');
    const result = await scanner.scan({ workspaceRoots: [root] });

    expect(result.routes).toHaveLength(1);
    expect(result.routes[0].path).toBe('/valid-hono');
  });

  it('scans false-positives fixture producing 0 routes', async () => {
    const root = path.join(fixturesDir, 'false-positives');
    const result = await scanner.scan({ workspaceRoots: [root] });

    expect(result.routes).toHaveLength(0);
  });

  it('scans invalid fixture with error isolation without crashing', async () => {
    const root = path.join(fixturesDir, 'invalid');
    const result = await scanner.scan({ workspaceRoots: [root] });

    expect(result.routes).toHaveLength(0);
  });

  it('returns empty result when workspace roots are empty', async () => {
    const result = await scanner.scan({ workspaceRoots: [] });
    expect(result.routes).toHaveLength(0);
  });

  it('scans real-world-nested fixture matching expected-routes.json', async () => {
    const root = path.join(fixturesDir, 'real-world-nested');
    const result = await scanner.scan({ workspaceRoots: [root] });

    expect(result.framework).toBe('hono');
    expect(result.routes).toHaveLength(7);

    const expectedJsonPath = path.join(root, 'expected-routes.json');
    const expected = JSON.parse(fs.readFileSync(expectedJsonPath, 'utf8'));

    const simplified = result.routes.map((r) => ({
      id: r.id,
      method: r.method,
      path: r.path,
      framework: r.framework,
      confidence: r.confidence,
      file: r.source.file,
      line: r.source.line,
    }));

    simplified.sort((a, b) => a.id.localeCompare(b.id));
    expected.sort((a: { id: string }, b: { id: string }) => a.id.localeCompare(b.id));

    expect(simplified).toEqual(expected);
  });
});
