import { HttpMethod } from '../../models/HttpMethod';
import { RouteConfidence } from '../../models/RouteConfidence';
import { RouteSource } from '../../models/RouteSource';

/**
 * Unique symbol identifier for a Hono app or sub-app declaration in intermediate AST analysis.
 * Format: <file>#<variableName>@<line>:<column>
 */
export type HonoAppSymbolId = string;

export interface RawHonoRouteDeclaration {
  readonly appSymbolId: HonoAppSymbolId;
  readonly method: HttpMethod;
  readonly rawPath: string;
  readonly confidence: RouteConfidence;
  readonly source: RouteSource;
  readonly warnings?: string[];
}

export interface HonoMountDeclaration {
  readonly parentSymbolId: HonoAppSymbolId;
  /**
   * Symbol ID of the mounted child Hono app, or local imported identifier if cross-file.
   */
  readonly childIdentifier: string;
  readonly rawPrefix: string;
  readonly confidence: RouteConfidence;
  readonly source: RouteSource;
}

export interface HonoAppDeclaration {
  readonly id: HonoAppSymbolId;
  readonly variableName: string;
  readonly basePath?: string;
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
  readonly localSymbolId: HonoAppSymbolId;
  readonly sourceFile: string;
  readonly line: number;
}

export interface HonoFileAnalysisResult {
  readonly file: string; // Workspace-relative path
  readonly absolutePath: string;
  readonly apps: HonoAppDeclaration[];
  readonly routes: RawHonoRouteDeclaration[];
  readonly mounts: HonoMountDeclaration[];
  readonly imports: ImportBinding[];
  readonly exports: ExportBinding[];
  readonly warnings: string[];
  readonly errors: string[];
}
