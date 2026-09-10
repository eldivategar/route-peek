import * as fs from 'fs';
import * as path from 'path';

export const SUPPORTED_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mts',
  '.cts',
  '.mjs',
  '.cjs',
]);

export const DEFAULT_EXCLUDED_DIRS = new Set([
  'node_modules',
  'dist',
  'build',
  'out',
  '.git',
  'coverage',
  '.vscode',
  'temp',
  'tmp',
  'vendor',
  '.svn',
  '.hg',
  'testdata',
]);

export interface DiscoveredFile {
  readonly absolutePath: string;
  readonly relativePath: string; // Forward slashes, relative to workspace root
}

/**
 * Recursively discovers supported source files
 * in the provided workspace root, skipping excluded directories.
 * Results are sorted deterministically by relative path.
 */
export async function discoverSourceFiles(
  workspaceRoot: string,
  customExcludes?: Set<string>,
  customExtensions?: Set<string>
): Promise<DiscoveredFile[]> {
  const excluded = customExcludes ?? DEFAULT_EXCLUDED_DIRS;
  const extensions = customExtensions ?? SUPPORTED_EXTENSIONS;
  const discovered: DiscoveredFile[] = [];

  async function walk(dir: string): Promise<void> {
    let entries: fs.Dirent[];
    try {
      entries = await fs.promises.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        if (!excluded.has(entry.name)) {
          await walk(fullPath);
        }
      } else if (entry.isFile()) {
        // Go test files (*_test.go) are strictly test code and excluded from route discovery
        if (entry.name.endsWith('_test.go')) {
          continue;
        }

        const ext = path.extname(entry.name).toLowerCase();
        if (extensions.has(ext)) {
          const rel = path.relative(workspaceRoot, fullPath).replace(/\\/g, '/');
          discovered.push({
            absolutePath: fullPath,
            relativePath: rel,
          });
        }
      }
    }
  }

  await walk(workspaceRoot);

  discovered.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  return discovered;
}
