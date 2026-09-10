import { HttpMethod } from '../../models/HttpMethod';
import { RouteConfidence } from '../../models/RouteConfidence';

export interface RawFiberRouteDeclaration {
  readonly receiverName: string;
  readonly method: HttpMethod;
  readonly path: string;
  readonly confidence: RouteConfidence;
  readonly file: string;
  readonly line: number;
  readonly column: number;
  readonly isDynamic?: boolean;
}

export interface FiberAppDeclaration {
  readonly name: string;
  readonly file: string;
  readonly line: number;
  readonly column: number;
}

export interface FiberGroupDeclaration {
  readonly receiverName: string;
  readonly parentReceiverName: string;
  readonly prefix: string;
  readonly confidence: RouteConfidence;
  readonly file: string;
  readonly line: number;
  readonly column: number;
}

export interface FiberRouteCallbackDeclaration {
  readonly parentReceiverName: string;
  readonly paramRouterName: string;
  readonly prefix: string;
  readonly confidence: RouteConfidence;
  readonly file: string;
  readonly line: number;
  readonly column: number;
}

export interface FiberMountDeclaration {
  readonly parentReceiverName: string;
  readonly subAppReceiverName: string;
  readonly prefix: string;
  readonly confidence: RouteConfidence;
  readonly file: string;
  readonly line: number;
  readonly column: number;
}

export interface FiberFunctionDecl {
  readonly name: string;
  readonly paramNames: readonly string[];
  readonly file: string;
  readonly routes: readonly RawFiberRouteDeclaration[];
  readonly groups: readonly FiberGroupDeclaration[];
  readonly mounts: readonly FiberMountDeclaration[];
  readonly routeCallbacks: readonly FiberRouteCallbackDeclaration[];
}

export interface FiberFunctionCall {
  readonly functionName: string;
  readonly packageName?: string;
  readonly passedReceiverName: string;
  readonly file: string;
  readonly line: number;
  readonly column: number;
}

export interface FiberFileAnalysisResult {
  readonly relativePath: string;
  readonly absolutePath: string;
  readonly packageName: string;
  readonly imports: readonly { path: string; alias?: string }[];
  readonly apps: readonly FiberAppDeclaration[];
  readonly routes: readonly RawFiberRouteDeclaration[];
  readonly groups: readonly FiberGroupDeclaration[];
  readonly mounts: readonly FiberMountDeclaration[];
  readonly routeCallbacks: readonly FiberRouteCallbackDeclaration[];
  readonly functions: readonly FiberFunctionDecl[];
  readonly calls: readonly FiberFunctionCall[];
  readonly constants: ReadonlyMap<string, string>;
  readonly errors?: readonly string[];
  readonly warnings?: readonly string[];
}
