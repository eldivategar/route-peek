import { describe, it, expect } from 'vitest';
import * as path from 'path';
import { HonoFrameworkDetector } from '../../src/scanners/hono/HonoFrameworkDetector';

describe('HonoFrameworkDetector', () => {
  const detector = new HonoFrameworkDetector();

  it('detects Hono from package.json dependency', async () => {
    const fixture = path.resolve(__dirname, '../fixtures/hono/realistic-project');
    const result = await detector.detect({ workspaceRoots: [fixture] });

    expect(result.frameworks).toContain('hono');
  });

  it('detects Hono from source import statement when package.json has no deps', async () => {
    const fixture = path.resolve(__dirname, '../fixtures/hono/basic');
    const result = await detector.detect({ workspaceRoots: [fixture] });

    expect(result.frameworks).toContain('hono');
  });

  it('rejects workspaces without Hono evidence', async () => {
    const fixture = path.resolve(__dirname, '../fixtures/hono/false-positives');
    const result = await detector.detect({ workspaceRoots: [fixture] });

    expect(result.frameworks).toEqual([]);
  });

  it('rejects pure Express workspace', async () => {
    const fixture = path.resolve(__dirname, '../fixtures/express/realistic-project');
    const result = await detector.detect({ workspaceRoots: [fixture] });

    expect(result.frameworks).toEqual([]);
  });

  it('returns empty when roots are empty', async () => {
    const result = await detector.detect({ workspaceRoots: [] });
    expect(result.frameworks).toEqual([]);
  });
});
