import { describe, it, expect } from 'vitest';
import * as path from 'path';
import { resolveRelativeModule } from '../../src/utils/moduleResolver';

describe('moduleResolver', () => {
  const workspaceRoot = path.resolve(__dirname, '../fixtures/express/cross-file-router');
  const containingFile = path.join(workspaceRoot, 'app.ts');

  it('resolves relative import without extension', () => {
    const resolved = resolveRelativeModule(
      containingFile,
      './routes/users',
      workspaceRoot
    );

    expect(resolved).toBe('routes/users.ts');
  });

  it('resolves relative import with explicit extension', () => {
    const resolved = resolveRelativeModule(
      containingFile,
      './routes/users.ts',
      workspaceRoot
    );

    expect(resolved).toBe('routes/users.ts');
  });

  it('returns undefined for non-relative packages like express', () => {
    const resolved = resolveRelativeModule(
      containingFile,
      'express',
      workspaceRoot
    );

    expect(resolved).toBeUndefined();
  });

  it('returns undefined for missing file', () => {
    const resolved = resolveRelativeModule(
      containingFile,
      './routes/non-existent',
      workspaceRoot
    );

    expect(resolved).toBeUndefined();
  });

  it('uses knownFiles set when provided', () => {
    const knownFiles = new Set(['routes/custom.js']);
    const resolved = resolveRelativeModule(
      containingFile,
      './routes/custom',
      workspaceRoot,
      knownFiles
    );

    expect(resolved).toBe('routes/custom.js');
  });
});
