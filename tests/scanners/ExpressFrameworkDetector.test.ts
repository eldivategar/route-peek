import { describe, it, expect } from 'vitest';
import * as path from 'path';
import { ExpressFrameworkDetector } from '../../src/scanners/express/ExpressFrameworkDetector';

describe('ExpressFrameworkDetector', () => {
  const detector = new ExpressFrameworkDetector();

  it('detects Express in fixture containing express imports', async () => {
    const fixtureDir = path.resolve(__dirname, '../fixtures/express/basic');
    const result = await detector.detect({ workspaceRoots: [fixtureDir] });

    expect(result.frameworks).toContain('express');
  });

  it('detects Express in fixture containing CommonJS require', async () => {
    const fixtureDir = path.resolve(__dirname, '../fixtures/express/cross-file-cjs');
    const result = await detector.detect({ workspaceRoots: [fixtureDir] });

    expect(result.frameworks).toContain('express');
  });

  it('returns empty frameworks for empty workspace roots', async () => {
    const result = await detector.detect({ workspaceRoots: [] });
    expect(result.frameworks).toEqual([]);
  });

  it('returns empty frameworks when no Express evidence is present', async () => {
    // tests/fixtures/express/false-positives has no express dependency in package.json,
    // but app.ts imports express. Let's test with a directory without express evidence.
    const emptyDir = path.resolve(__dirname, '../models');
    const result = await detector.detect({ workspaceRoots: [emptyDir] });

    expect(result.frameworks).toEqual([]);
  });
});
