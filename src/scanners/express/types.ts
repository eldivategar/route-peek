import { HttpMethod } from '../../models/HttpMethod';
import { RouteConfidence } from '../../models/RouteConfidence';
import { RouteSource } from '../../models/RouteSource';

/**
 * Unique symbol identifier for an Express app or router declaration.
 * Format: <file>#<variableName>@<line>:<column>
 */
export type RouterSymbolId = string;

export interface RawRouteDeclaration {
  readonly routerSymbolId: RouterSymbolId;
  readonly method: HttpMethod;
  readonly rawPath: string;
  readonly confidence: RouteConfidence;
  readonly source: RouteSource;
  readonly warnings?: string[];
}

export interface RouterMountDeclaration {
  readonly parentSymbolId: RouterSymbolId;
  /**
   * Symbol ID of the mounted child router, or local imported identifier if cross-file.
   */
  readonly childIdentifier: string;
  readonly rawPrefix: string;
  readonly confidence: RouteConfidence;
  readonly source: RouteSource;
}

export interface RouterDeclaration {
  readonly id: RouterSymbolId;
  readonly variableName: string;
  readonly isApp: boolean;
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
  readonly localSymbolId: RouterSymbolId;
  readonly sourceFile: string;
  readonly line: number;
}

export interface FileAnalysisResult {
  readonly file: string; // Workspace-relative path
  readonly absolutePath: string;
  readonly routers: RouterDeclaration[];
  readonly routes: RawRouteDeclaration[];
  readonly mounts: RouterMountDeclaration[];
  readonly imports: ImportBinding[];
  readonly exports: ExportBinding[];
  readonly warnings: string[];
  readonly errors: string[];
}
