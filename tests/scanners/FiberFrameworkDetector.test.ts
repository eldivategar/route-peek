import { describe, it, expect } from 'vitest';
import * as path from 'path';
import { FiberFrameworkDetector } from '../../src/scanners/fiber/FiberFrameworkDetector';
import { ScannerContext } from '../../src/scanners/ScannerContext';

describe('FiberFrameworkDetector', () => {
  const detector = new FiberFrameworkDetector();

  it('detects Fiber v3 from go.mod', async () => {
    const fixtureDir = path.resolve(__dirname, '../fixtures/fiber/basic');
    const context: ScannerContext = { workspaceRoots: [fixtureDir] };
    const result = await detector.detect(context);
    expect(result.frameworks).toContain('fiber');
  });

  it('detects Fiber v2 from go.mod', async () => {
    const fixtureDir = path.resolve(__dirname, '../fixtures/fiber/use-mount');
    const context: ScannerContext = { workspaceRoots: [fixtureDir] };
    const result = await detector.detect(context);
    expect(result.frameworks).toContain('fiber');
  });

  it('returns empty frameworks when workspace has no Fiber evidence', async () => {
    const fixtureDir = path.resolve(__dirname, '../fixtures/express/simple');
    const context: ScannerContext = { workspaceRoots: [fixtureDir] };
    const result = await detector.detect(context);
    expect(result.frameworks).not.toContain('fiber');
  });

  it('returns empty frameworks for empty workspace roots', async () => {
    const context: ScannerContext = { workspaceRoots: [] };
    const result = await detector.detect(context);
    expect(result.frameworks).toEqual([]);
  });
});
