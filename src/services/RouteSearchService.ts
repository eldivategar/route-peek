import { Route } from '../models/Route';

/**
 * Framework-agnostic in-memory route search service.
 * Performs fast, case-insensitive, tokenized substring filtering across
 * route method, path, framework, and source file locations.
 */
export class RouteSearchService {
  /**
   * Filters an array of routes against a search query.
   *
   * @param routes List of canonical routes to search within
   * @param query Search string (e.g. "users", "GET", "/api/auth", "auth.ts")
   * @returns Filtered routes preserving deterministic order. If query is empty, returns original routes.
   */
  public static search(routes: readonly Route[], query: string): Route[] {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) {
      return [...routes];
    }

    // Split query by whitespace into individual tokens (e.g. "GET users" -> ["get", "users"])
    const tokens = trimmed.split(/\s+/).filter((t) => t.length > 0);

    return routes.filter((route) => {
      const method = route.method.toLowerCase();
      const path = route.path.toLowerCase();
      const framework = route.framework.toLowerCase();
      const file = route.source.file.toLowerCase();
      const combined = `${method} ${path}`;

      // Every token must match at least one attribute of the route
      return tokens.every(
        (token) =>
          method.includes(token) ||
          path.includes(token) ||
          framework.includes(token) ||
          file.includes(token) ||
          combined.includes(token)
      );
    });
  }
}
