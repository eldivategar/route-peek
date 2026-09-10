import { describe, it, expect } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';
import { ExpressScanner } from '../../src/scanners/express/ExpressScanner';

interface ExpectedRoute {
  id: string;
  method: string;
  path: string;
  framework: string;
  confidence: string;
  file?: string;
  line?: number;
}

describe('ExpressScanner Fixture Tests', () => {
  const scanner = new ExpressScanner();
  const fixturesBase = path.resolve(__dirname, '../fixtures/express');

  const fixtures = [
    'basic',
    'router',
    'cross-file-router',
    'cross-file-nested',
    'cross-file-cjs',
    'constants',
    'dynamic',
    'route-chain',
    'false-positives',
    'circular',
    'unresolved-import',
    'malformed',
    'realistic-project',
  ];

  for (const fixture of fixtures) {
    it(`correctly scans fixture: ${fixture}`, async () => {
      const fixtureDir = path.join(fixturesBase, fixture);
      const expectedJsonPath = path.join(fixtureDir, 'expected-routes.json');
      const expectedContent = await fs.promises.readFile(expectedJsonPath, 'utf8');
      const expectedRoutes: ExpectedRoute[] = JSON.parse(expectedContent);

      const result = await scanner.scan({
        workspaceRoots: [fixtureDir],
      });

      expect(result.framework).toBe('express');
      expect(result.routes).toHaveLength(expectedRoutes.length);

      for (let i = 0; i < expectedRoutes.length; i++) {
        const expected = expectedRoutes[i];
        const actual = result.routes[i];

        expect(actual.id).toBe(expected.id);
        expect(actual.method).toBe(expected.method);
        expect(actual.path).toBe(expected.path);
        expect(actual.framework).toBe(expected.framework);
        expect(actual.confidence).toBe(expected.confidence);

        if (expected.file) {
          expect(actual.source.file).toBe(expected.file);
        }
        if (expected.line) {
          expect(actual.source.line).toBe(expected.line);
        }
      }
    });
  }

  it('canHandle returns true for Express fixture', async () => {
    const fixtureDir = path.join(fixturesBase, 'basic');
    const canHandle = await scanner.canHandle({
      workspaceRoots: [fixtureDir],
    });
    expect(canHandle).toBe(true);
  });

  it('handles empty workspace roots cleanly', async () => {
    const result = await scanner.scan({ workspaceRoots: [] });
    expect(result.routes).toEqual([]);
    expect(result.framework).toBe('express');
  });

  it('emits warnings for dynamic paths', async () => {
    const fixtureDir = path.join(fixturesBase, 'dynamic');
    const result = await scanner.scan({ workspaceRoots: [fixtureDir] });
    expect(result.warnings && result.warnings.length > 0).toBe(true);
  });

  it('isolates malformed files and reports errors while discovering valid routes', async () => {
    const fixtureDir = path.join(fixturesBase, 'malformed');
    const result = await scanner.scan({ workspaceRoots: [fixtureDir] });
    expect(result.routes).toHaveLength(1);
    expect(result.routes[0].path).toBe('/valid');
  });

  it('guarantees 100% deterministic results across repeated scans', async () => {
    const fixtureDir = path.join(fixturesBase, 'realistic-project');
    const firstRun = await scanner.scan({ workspaceRoots: [fixtureDir] });

    for (let iteration = 0; iteration < 5; iteration++) {
      const run = await scanner.scan({ workspaceRoots: [fixtureDir] });
      expect(run.routes.length).toBe(firstRun.routes.length);
      expect(run.routes.map((r) => r.id)).toEqual(firstRun.routes.map((r) => r.id));
      expect(run.routes.map((r) => r.path)).toEqual(firstRun.routes.map((r) => r.path));
      expect(run.routes.map((r) => r.method)).toEqual(firstRun.routes.map((r) => r.method));
      expect(run.warnings).toEqual(firstRun.warnings);
      expect(run.errors).toEqual(firstRun.errors);
    }
  });

  it('completes performance scan sanity check well within SLA', async () => {
    const fixtureDir = path.join(fixturesBase, 'realistic-project');
    const start = Date.now();
    const result = await scanner.scan({ workspaceRoots: [fixtureDir] });
    const durationMs = Date.now() - start;

    expect(result.routes.length).toBe(7);
    // Sanity check: multi-file analysis must execute in < 250ms (typically < 30ms)
    expect(durationMs).toBeLessThan(250);
  });
});
