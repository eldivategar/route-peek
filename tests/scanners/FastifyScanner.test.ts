import { describe, it, expect } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';
import { FastifyScanner } from '../../src/scanners/fastify/FastifyScanner';

describe('FastifyScanner', () => {
  const scanner = new FastifyScanner();
  const fixturesDir = path.resolve(__dirname, '../fixtures/fastify');

  it('scans realistic project matching expected-routes.json', async () => {
    const root = path.join(fixturesDir, 'realistic-project');
    const result = await scanner.scan({ workspaceRoots: [root] });

    expect(result.framework).toBe('fastify');
    expect(result.routes).toHaveLength(11);

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

  it('scans simple fixture matching expected-routes.json', async () => {
    const root = path.join(fixturesDir, 'simple');
    const result = await scanner.scan({ workspaceRoots: [root] });

    expect(result.routes).toHaveLength(15);
    const simplePaths = result.routes.map((r) => `${r.method} ${r.path}`);
    expect(simplePaths).toContain('TRACE /all-endpoint');

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

  it('scans object-routes fixture matching expected-routes.json', async () => {
    const root = path.join(fixturesDir, 'object-routes');
    const result = await scanner.scan({ workspaceRoots: [root] });

    expect(result.routes).toHaveLength(5);
    const objectPaths = result.routes.map((r) => `${r.method} ${r.path}`);
    expect(objectPaths).toContain('PATCH /items/:id');

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

  it('scans nested fixture with multi-level register prefixes', async () => {
    const root = path.join(fixturesDir, 'nested');
    const result = await scanner.scan({ workspaceRoots: [root] });

    expect(result.routes).toHaveLength(2);
    const paths = result.routes.map((r) => `${r.method} ${r.path}`);
    expect(paths).toContain('GET /api/v1/users/:id');
    expect(paths).toContain('POST /api/v1/users');
  });

  it('scans cross-file fixture resolving imports and exports', async () => {
    const root = path.join(fixturesDir, 'cross-file');
    const result = await scanner.scan({ workspaceRoots: [root] });

    expect(result.routes).toHaveLength(4);
    const paths = result.routes.map((r) => `${r.method} ${r.path}`);
    expect(paths).toContain('POST /api/auth/login');
    expect(paths).toContain('POST /api/auth/register');
    expect(paths).toContain('GET /api/users/:id');
    expect(paths).toContain('GET /api/users/profile');
  });

  it('scans constants fixture resolving expressions', async () => {
    const root = path.join(fixturesDir, 'constants');
    const result = await scanner.scan({ workspaceRoots: [root] });

    expect(result.routes).toHaveLength(3);
    const paths = result.routes.map((r) => `${r.method} ${r.path}`);
    expect(paths).toContain('GET /health');
    expect(paths).toContain('GET /api/users');
    expect(paths).toContain('GET /v1/status');
  });

  it('scans dynamic fixture marking dynamic segments with low confidence', async () => {
    const root = path.join(fixturesDir, 'dynamic');
    const result = await scanner.scan({ workspaceRoots: [root] });

    expect(result.routes).toHaveLength(2);
    expect(result.routes[0].path).toBe('/<dynamic>');
    expect(result.routes[0].confidence).toBe('low');
    expect(result.routes[1].path).toBe('/api/<dynamic>');
    expect(result.routes[1].confidence).toBe('low');
  });

  it('scans multiline fixture matching expected-routes.json', async () => {
    const root = path.join(fixturesDir, 'multiline');
    const result = await scanner.scan({ workspaceRoots: [root] });

    expect(result.routes).toHaveLength(2);
    expect(result.routes.map((r) => `${r.method} ${r.path}`)).toEqual([
      'GET /multiline-get',
      'POST /multiline-post',
    ]);
  });

  it('scans shadowing fixture ignoring non-fastify variables', async () => {
    const root = path.join(fixturesDir, 'shadowing');
    const result = await scanner.scan({ workspaceRoots: [root] });

    expect(result.routes).toHaveLength(1);
    expect(result.routes[0].path).toBe('/valid-fastify');
  });

  it('scans plugin-wrapper fixture unwrapping fastify-plugin', async () => {
    const root = path.join(fixturesDir, 'plugin-wrapper');
    const result = await scanner.scan({ workspaceRoots: [root] });

    expect(result.routes).toHaveLength(2);
    const paths = result.routes.map((r) => `${r.method} ${r.path}`);
    expect(paths).toContain('GET /users/profile');
    expect(paths).toContain('POST /users/profile');
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

  it('scans Fastify v5 fixture expanding .all() into 7 methods without TRACE', async () => {
    const root = path.join(fixturesDir, 'v5-all');
    const result = await scanner.scan({ workspaceRoots: [root] });

    expect(result.routes).toHaveLength(7);
    const methods = result.routes.map((r) => r.method);
    expect(new Set(methods)).toEqual(
      new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'])
    );
    expect(methods).not.toContain('TRACE');

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

  it('preserves canonical Fastify parameter syntax :id and does not convert to {id}', async () => {
    const root = path.join(fixturesDir, 'realistic-project');
    const result = await scanner.scan({ workspaceRoots: [root] });

    const paramRoutes = result.routes.filter((r) => r.path.includes(':id'));
    expect(paramRoutes.length).toBeGreaterThan(0);
    for (const r of result.routes) {
      expect(r.path).not.toContain('{id}');
      expect(r.path).not.toContain('{');
      expect(r.path).not.toContain('}');
    }
    expect(paramRoutes.map((r) => r.path)).toContain('/api/users/:id');
    expect(paramRoutes.map((r) => r.path)).toContain('/api/items/:id');
  });

  it('canHandle returns true for Fastify workspace and false for Express', async () => {
    const fastifyRoot = path.join(fixturesDir, 'realistic-project');
    const expressRoot = path.resolve(__dirname, '../fixtures/express/realistic-project');

    expect(await scanner.canHandle({ workspaceRoots: [fastifyRoot] })).toBe(true);
    expect(await scanner.canHandle({ workspaceRoots: [expressRoot] })).toBe(false);
  });
});
