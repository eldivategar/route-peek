import { HttpMethod } from '../../models/HttpMethod';
import { RouteConfidence } from '../../models/RouteConfidence';
import { RouteSource } from '../../models/RouteSource';

/**
 * Unique symbol identifier for a Fastify app instance or plugin in intermediate AST analysis.
 * Format: <file>#<variableOrFunctionName>@<line>:<column>
 */
export type FastifyAppSymbolId = string;

export interface RawFastifyRouteDeclaration {
  readonly appSymbolId: FastifyAppSymbolId;
  readonly method: HttpMethod;
  readonly rawPath: string;
  readonly confidence: RouteConfidence;
  readonly source: RouteSource;
  readonly warnings?: string[];
}

export interface FastifyRegisterDeclaration {
  readonly parentSymbolId: FastifyAppSymbolId;
  /**
   * Symbol ID of the registered child plugin, or local imported identifier if cross-file.
   */
  readonly childIdentifier: string;
  readonly rawPrefix: string;
  readonly confidence: RouteConfidence;
  readonly source: RouteSource;
}

export interface FastifyAppDeclaration {
  readonly id: FastifyAppSymbolId;
  readonly variableName: string;
  readonly source: RouteSource;
}

export interface ImportBinding {
  readonly localName: string;
  readonly importedName: string; // 'default' | named export name | '*'
  readonly moduleSpecifier: string;
  readonly sourceFile: string;
  readonly line: number;
}

export interface ExportBinding {
  readonly exportedName: string; // 'default' | named export name
  readonly localSymbolId: FastifyAppSymbolId;
  readonly sourceFile: string;
  readonly line: number;
}

export interface FastifyFileAnalysisResult {
  readonly file: string; // Workspace-relative path
  readonly absolutePath: string;
  readonly apps: FastifyAppDeclaration[];
  readonly routes: RawFastifyRouteDeclaration[];
  readonly registers: FastifyRegisterDeclaration[];
  readonly imports: ImportBinding[];
  readonly exports: ExportBinding[];
  readonly warnings: string[];
  readonly errors: string[];
}

export interface FastifyAnalysisOptions {
  readonly fastifyMajorVersion?: number;
}

/**
 * Extracts the major semver integer from a Fastify package.json dependency string.
 * Example: "^5.0.0" -> 5, "~4.20.0" -> 4, ">=5.0.0" -> 5, "4.x" -> 4, "latest" -> undefined.
 */
export function parseFastifyMajorVersion(versionString: string): number | undefined {
  if (!versionString) return undefined;
  const trimmed = versionString.trim();
  const match = trimmed.match(/(?:^|[^\d])(\d+)(?:\.\d+|\.x)?/);
  if (match) {
    const num = parseInt(match[1], 10);
    if (!isNaN(num)) {
      return num;
    }
  }
  return undefined;
}
