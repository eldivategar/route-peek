/**
 * Route Identity Convention:
 * Format: <framework>:<method>:<path>:<normalized-file>:<line>
 *
 * Example:
 * express:GET:/api/users:src/routes/users.ts:12
 *
 * Requirements:
 * - framework: normalized to lowercase, trimmed
 * - method: normalized to uppercase, trimmed
 * - path: local minimal canonicalization (leading slash, no trailing slash except root '/', forward slashes)
 * - file: normalized with forward slashes ('/'), trimmed
 * - line: 1-based integer line number
 * - strictly deterministic: no UUIDs, no timestamps, no scan-order dependencies
 */

/**
 * Minimal path canonicalization strictly used for deterministic route identity.
 * This is not a route resolver or prefix composer.
 */
export function canonicalizePathForIdentity(rawPath: string): string {
  if (!rawPath || rawPath.trim() === '' || rawPath === '/') {
    return '/';
  }
  let p = rawPath.trim().replace(/\\/g, '/').replace(/\/+/g, '/');
  if (!p.startsWith('/')) {
    p = '/' + p;
  }
  if (p.length > 1 && p.endsWith('/')) {
    p = p.slice(0, -1);
  }
  return p;
}

/**
 * Generates a deterministic route ID based on the stable facts of the route.
 */
export function generateRouteId(
  framework: string,
  method: string,
  path: string,
  file: string,
  line: number
): string {
  const normFramework = framework.toLowerCase().trim();
  const normMethod = method.toUpperCase().trim();
  const normPath = canonicalizePathForIdentity(path);
  const normFile = file.replace(/\\/g, '/').trim();
  return `${normFramework}:${normMethod}:${normPath}:${normFile}:${line}`;
}
