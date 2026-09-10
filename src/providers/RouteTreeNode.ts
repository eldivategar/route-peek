import { Route } from '../models/Route';

export type RouteTreeNodeType = 'framework' | 'resource' | 'path' | 'endpoint' | 'method';

/**
 * Pure data-oriented presentation node model.
 * Represents hierarchy items (framework, resource, endpoint, method)
 * with structured data, keeping Route[] as the underlying source of truth.
 *
 * Presentation formatting (labels with counts, method concatenation,
 * theme colors, collapsible state) is handled by RouteTreeItem.
 */
export interface RouteTreeNode {
  readonly id: string;
  readonly type: RouteTreeNodeType;
  readonly framework?: string;
  readonly resourcePrefix?: string;
  readonly endpointPath?: string; // Relative path for endpoint nodes (e.g. '/', '/:id') or full path if lifted
  readonly fullPath?: string; // Canonical full route path
  readonly count: number; // Total canonical routes represented
  readonly routes: readonly Route[];
  readonly route?: Route; // Defined only for single-route endpoints and method nodes
  readonly children?: readonly RouteTreeNode[];
  readonly isDynamic: boolean;
}
