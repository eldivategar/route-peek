/**
 * RouteSource identifies the origin of a route definition in the source tree.
 * Line and column numbers use 1-based indexing for consistency with standard
 * human-readable editor coordinates, compiler diagnostics, and search results.
 */
export interface RouteSource {
  /**
   * Source file path. Preferably workspace-relative, using forward slashes ('/').
   */
  readonly file: string;

  /**
   * 1-based line number.
   */
  readonly line: number;

  /**
   * 1-based column number.
   */
  readonly column: number;

  /**
   * Optional 1-based end line number.
   */
  readonly endLine?: number;

  /**
   * Optional 1-based end column number.
   */
  readonly endColumn?: number;
}
