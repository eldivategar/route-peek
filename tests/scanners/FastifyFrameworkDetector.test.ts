import { describe, it, expect } from 'vitest';
import * as path from 'path';
import { FastifyFrameworkDetector } from '../../src/scanners/fastify/FastifyFrameworkDetector';

describe('FastifyFrameworkDetector', () => {
  const detector = new FastifyFrameworkDetector();

  it('detects Fastify from package.json dependency', async () => {
    const fixture = path.resolve(__dirname, '../fixtures/fastify/realistic-project');
    const result = await detector.detect({ workspaceRoots: [fixture] });

    expect(result.frameworks).toContain('fastify');
  });

  it('detects Fastify from source import statement when package.json is checked', async () => {
    const fixture = path.resolve(__dirname, '../fixtures/fastify/simple');
    const result = await detector.detect({ workspaceRoots: [fixture] });

    expect(result.frameworks).toContain('fastify');
  });

  it('rejects pure Express workspace', async () => {
    const fixture = path.resolve(__dirname, '../fixtures/express/realistic-project');
    const result = await detector.detect({ workspaceRoots: [fixture] });

    expect(result.frameworks).toEqual([]);
  });

  it('rejects pure Hono workspace', async () => {
    const fixture = path.resolve(__dirname, '../fixtures/hono/realistic-project');
    const result = await detector.detect({ workspaceRoots: [fixture] });

    expect(result.frameworks).toEqual([]);
  });

  it('rejects workspace with only @fastify/cors without core fastify dependency or imports', async () => {
    const fixture = path.resolve(__dirname, '../fixtures/fastify/plugin-only');
    const result = await detector.detect({ workspaceRoots: [fixture] });

    expect(result.frameworks).toEqual([]);
  });

  it('returns empty when roots are empty', async () => {
    const result = await detector.detect({ workspaceRoots: [] });
    expect(result.frameworks).toEqual([]);
  });
});
