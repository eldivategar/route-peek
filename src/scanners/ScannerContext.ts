/**
 * Minimal context provided to framework scanners.
 * Contains only the workspace boundaries and optional configuration.
 */
export interface ScannerContext {
  readonly workspaceRoots: string[];
  readonly configuration?: Record<string, unknown>;
}
