import { HttpMethod } from './HttpMethod';
import { Framework } from './Framework';
import { RouteSource } from './RouteSource';
import { RouteConfidence } from './RouteConfidence';
import { generateRouteId } from '../utils/routeIdentity';

/**
 * Canonical framework-agnostic Route model.
 * Represents stable facts of a discovered route without premature metadata.
 */
export interface Route {
  readonly id: string;
  readonly method: HttpMethod;
  readonly path: string;
  readonly framework: Framework;
  readonly source: RouteSource;
  readonly confidence: RouteConfidence;
}

export interface CreateRouteParams {
  id?: string;
  method: HttpMethod;
  path: string;
  framework: Framework;
  source: RouteSource;
  confidence: RouteConfidence;
}

/**
 * Factory helper that creates a canonical Route, automatically generating
 * a deterministic ID if not explicitly provided.
 */
export function createRoute(params: CreateRouteParams): Route {
  const id =
    params.id ??
    generateRouteId(
      params.framework,
      params.method,
      params.path,
      params.source.file,
      params.source.line
    );

  return {
    id,
    method: params.method,
    path: params.path,
    framework: params.framework,
    source: params.source,
    confidence: params.confidence,
  };
}
