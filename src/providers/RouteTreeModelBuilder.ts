import { Route } from '../models/Route';
import { RouteTreeNode } from './RouteTreeNode';
import {
  groupRoutesByPrefix,
  getRelativeRoutePath,
  compareMethods,
} from './routeGrouping';

/**
 * Pure TypeScript builder that constructs a data-oriented presentation tree
 * from canonical Route[] without any VS Code dependencies.
 *
 * Implements the 4-tier hierarchy:
 * Framework -> Resource -> Endpoint -> Method
 * with Smart Compact mode (Cases A, B, C, D).
 */
export class RouteTreeModelBuilder {
  /**
   * Builds the presentation tree for the provided routes.
   *
   * @param routes Discovered or search-filtered routes
   * @returns Array of top-level framework nodes (or empty if routes is empty)
   */
  public static build(routes: readonly Route[]): RouteTreeNode[] {
    if (routes.length === 0) {
      return [];
    }

    // 1. Group routes by framework preserving order of appearance
    const frameworkMap = new Map<string, Route[]>();
    for (const route of routes) {
      const list = frameworkMap.get(route.framework) ?? [];
      list.push(route);
      frameworkMap.set(route.framework, list);
    }

    const frameworkNodes: RouteTreeNode[] = [];

    for (const [framework, frameworkRoutes] of frameworkMap.entries()) {
      const frameworkNode = this.buildFrameworkNode(framework, frameworkRoutes);
      frameworkNodes.push(frameworkNode);
    }

    return frameworkNodes;
  }

  private static buildFrameworkNode(
    framework: string,
    frameworkRoutes: readonly Route[]
  ): RouteTreeNode {
    // Group routes using the exact existing resource grouping algorithm
    const resourceGroups = groupRoutesByPrefix(frameworkRoutes);
    const children: RouteTreeNode[] = [];

    for (const group of resourceGroups) {
      // Case A: A resource with one route may be lifted only when the resource node
      // is presentation-redundant (i.e. group.prefix === route.path or relative path is '/')
      if (group.routes.length === 1) {
        const singleRoute = group.routes[0];
        const relPath = getRelativeRoutePath(singleRoute.path, group.prefix);

        if (relPath === '/' || group.prefix === singleRoute.path) {
          // Lifted directly to framework level as a single-route endpoint
          const isDynamic =
            singleRoute.confidence === 'low' || singleRoute.path.includes('<dynamic>');

          children.push({
            id: `endpoint:${framework}:${singleRoute.path}`,
            type: 'endpoint',
            framework,
            resourcePrefix: group.prefix,
            endpointPath: singleRoute.path, // Full path because it is displayed at top level
            fullPath: singleRoute.path,
            count: 1,
            routes: [singleRoute],
            route: singleRoute,
            isDynamic,
          });
          continue;
        }
      }

      // Case B: Resource has multiple routes or non-redundant prefix -> Resource Node
      const resourceNode = this.buildResourceNode(framework, group.prefix, group.routes);
      children.push(resourceNode);
    }

    // Sort framework children deterministically:
    // Root group ('/') comes first, then sort by prefix/endpointPath alphabetically
    children.sort((a, b) => {
      const pathA = a.type === 'endpoint' ? a.endpointPath ?? '' : a.resourcePrefix ?? '';
      const pathB = b.type === 'endpoint' ? b.endpointPath ?? '' : b.resourcePrefix ?? '';

      if (pathA === '/' || pathA === 'Root') return -1;
      if (pathB === '/' || pathB === 'Root') return 1;

      const cmp = pathA.localeCompare(pathB);
      if (cmp !== 0) return cmp;

      // If paths match, resource groups precede endpoints
      if (a.type !== b.type) {
        return a.type === 'resource' ? -1 : 1;
      }
      return a.id.localeCompare(b.id);
    });

    const isDynamic = frameworkRoutes.some(
      (r) => r.confidence === 'low' || r.path.includes('<dynamic>')
    );

    return {
      id: `framework:${framework}`,
      type: 'framework',
      framework,
      count: frameworkRoutes.length,
      routes: frameworkRoutes,
      children,
      isDynamic,
    };
  }

  private static buildResourceNode(
    framework: string,
    resourcePrefix: string,
    routes: readonly Route[]
  ): RouteTreeNode {
    // Group routes by relative endpoint path
    const endpointMap = new Map<string, Route[]>();

    for (const route of routes) {
      const relPath = getRelativeRoutePath(route.path, resourcePrefix);
      const list = endpointMap.get(relPath) ?? [];
      list.push(route);
      endpointMap.set(relPath, list);
    }

    const endpointNodes: RouteTreeNode[] = [];

    for (const [relPath, endpointRoutes] of endpointMap.entries()) {
      // Sort routes by canonical method priority
      endpointRoutes.sort((a, b) => {
        const methodCmp = compareMethods(a.method, b.method);
        if (methodCmp !== 0) return methodCmp;

        const fileCmp = a.source.file.localeCompare(b.source.file);
        if (fileCmp !== 0) return fileCmp;

        return a.source.line - b.source.line;
      });

      const isDynamic = endpointRoutes.some(
        (r) => r.confidence === 'low' || r.path.includes('<dynamic>')
      );
      const fullPath = endpointRoutes[0].path;

      if (endpointRoutes.length === 1) {
        // Case C: Single method endpoint (leaf node)
        const singleRoute = endpointRoutes[0];
        endpointNodes.push({
          id: `endpoint:${framework}:${fullPath}`,
          type: 'endpoint',
          framework,
          resourcePrefix,
          endpointPath: relPath,
          fullPath,
          count: 1,
          routes: endpointRoutes,
          route: singleRoute,
          isDynamic,
        });
      } else {
        // Case D: Multiple methods on same endpoint path (collapsible node)
        const methodChildren: RouteTreeNode[] = endpointRoutes.map((r) => ({
          id: `method:${r.id}`,
          type: 'method',
          framework,
          resourcePrefix,
          endpointPath: relPath,
          fullPath: r.path,
          count: 1,
          routes: [r],
          route: r,
          isDynamic: r.confidence === 'low' || r.path.includes('<dynamic>'),
        }));

        endpointNodes.push({
          id: `endpoint:${framework}:${fullPath}`,
          type: 'endpoint',
          framework,
          resourcePrefix,
          endpointPath: relPath,
          fullPath,
          count: endpointRoutes.length,
          routes: endpointRoutes,
          route: undefined, // Multi-route endpoint does not bind a single route
          children: methodChildren,
          isDynamic,
        });
      }
    }

    // Sort endpoints inside resource group deterministically:
    // Root '/' first, then alphabetical by relative path
    endpointNodes.sort((a, b) => {
      const pA = a.endpointPath ?? '';
      const pB = b.endpointPath ?? '';

      if (pA === '/') return -1;
      if (pB === '/') return 1;

      return pA.localeCompare(pB);
    });

    const isDynamic = routes.some(
      (r) => r.confidence === 'low' || r.path.includes('<dynamic>')
    );

    return {
      id: `resource:${framework}:${resourcePrefix}`,
      type: 'resource',
      framework,
      resourcePrefix,
      count: routes.length,
      routes,
      children: endpointNodes,
      isDynamic,
    };
  }
}
