import * as path from 'path';
import * as fs from 'fs';

const CANDIDATE_EXTENSIONS = [
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mts',
  '.cts',
  '.mjs',
  '.cjs',
];

/**
 * Resolves a local relative import specifier (e.g. "./routes/users", "../api")
 * to a concrete source file path relative to the workspace root.
 *
 * @param containingFileAbs Absolute path of the file containing the import
 * @param importSpecifier The raw import string (e.g. "./routes/users")
 * @param workspaceRoot Absolute path of the workspace root
 * @param knownFiles Optional pre-indexed set of normalized relative file paths for fast lookup
 * @returns Normalized relative path with forward slashes, or undefined if unresolvable
 */
export function resolveRelativeModule(
  containingFileAbs: string,
  importSpecifier: string,
  workspaceRoot: string,
  knownFiles?: Set<string>
): string | undefined {
  if (!importSpecifier.startsWith('.') && !importSpecifier.startsWith('/')) {
    // Non-relative import (e.g. "express", "hono", "cors") — outside local file resolution
    return undefined;
  }

  const baseDir = path.dirname(containingFileAbs);
  const resolvedTargetAbs = path.resolve(baseDir, importSpecifier);
  const targetExt = path.extname(resolvedTargetAbs).toLowerCase();

  const candidates: string[] = [
    resolvedTargetAbs, // exact path
    ...CANDIDATE_EXTENSIONS.map((ext) => resolvedTargetAbs + ext), // with extension
    ...CANDIDATE_EXTENSIONS.map((ext) => path.join(resolvedTargetAbs, 'index' + ext)), // index files
  ];

  // In TypeScript ESM projects, imports often use .js extension (e.g. "./routes/auth.js")
  // while the actual source file on disk is TypeScript (.ts, .tsx, .mts, etc.).
  if (targetExt === '.js' || targetExt === '.mjs' || targetExt === '.cjs' || targetExt === '.jsx') {
    const withoutExt = resolvedTargetAbs.slice(0, -targetExt.length);
    candidates.push(
      ...CANDIDATE_EXTENSIONS.map((ext) => withoutExt + ext),
      ...CANDIDATE_EXTENSIONS.map((ext) => path.join(withoutExt, 'index' + ext))
    );
  }

  for (const candidate of candidates) {
    const rel = path.relative(workspaceRoot, candidate).replace(/\\/g, '/');

    if (knownFiles) {
      if (knownFiles.has(rel)) {
        return rel;
      }
    } else {
      if (fs.existsSync(candidate)) {
        try {
          const stat = fs.statSync(candidate);
          if (stat.isFile()) {
            return rel;
          }
        } catch {
          // continue
        }
      }
    }
  }

  return undefined;
}
