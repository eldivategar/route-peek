import { HonoFileAnalysisResult, HonoAppSymbolId } from './types';
import { Route, createRoute } from '../../models/Route';
import { RouteConfidence } from '../../models/RouteConfidence';
import { resolveRelativeModule } from '../../utils/moduleResolver';

export interface HonoRouteResolutionResult {
  readonly routes: Route[];
  readonly warnings: string[];
}

interface MountedPrefix {
  readonly prefix: string;
  readonly confidence: RouteConfidence;
}

interface MountEdge {
  readonly childSymbolId: HonoAppSymbolId;
  readonly prefix: string;
  readonly confidence: RouteConfidence;
}

/**
 * Normalizes an effective route path by collapsing redundant slashes,
 * stripping trailing slashes (except root '/'), and collapsing adjacent dynamic tokens.
 */
function normalizeRoutePath(rawPath: string): string {
  let cleaned = rawPath.replace(/\\/g, '/');

  // Collapse multiple consecutive slashes
  cleaned = cleaned.replace(/\/+/g, '/');

  // Ensure leading slash
  if (!cleaned.startsWith('/')) {
    cleaned = '/' + cleaned;
  }

  // Strip trailing slash unless it is strictly '/'
  if (cleaned.length > 1 && cleaned.endsWith('/')) {
    cleaned = cleaned.slice(0, -1);
  }

  // Collapse adjacent dynamic tokens: <dynamic>/<dynamic> -> <dynamic>
  while (cleaned.includes('<dynamic>/<dynamic>')) {
    cleaned = cleaned.replace(/<dynamic>\/<dynamic>/g, '<dynamic>');
  }

  return cleaned;
}

function combinePrefixes(p1: MountedPrefix, p2: MountedPrefix): MountedPrefix {
  const combinedPath = normalizeRoutePath(p1.prefix + '/' + p2.prefix);
  const combinedConfidence: RouteConfidence =
    p1.confidence === 'low' || p2.confidence === 'low' ? 'low' : 'high';

  return {
    prefix: combinedPath,
    confidence: combinedConfidence,
  };
}

export class HonoRouteResolver {
  /**
   * Resolves multi-file router linking, mount graphs, nested prefixes, and cycle protection
   * to produce canonical Route objects for Hono.js.
   */
  public resolveRoutes(
    fileResults: HonoFileAnalysisResult[],
    workspaceRoot: string,
    knownFiles?: Set<string>
  ): HonoRouteResolutionResult {
    const warnings: string[] = [];

    // Collect all warnings from individual file analysis
    for (const f of fileResults) {
      if (f.warnings && f.warnings.length > 0) {
        warnings.push(...f.warnings);
      }
    }

    // 1. Index exports: Map<"file:exportedName", localSymbolId>
    const exportIndex = new Map<string, HonoAppSymbolId>();
    for (const fileResult of fileResults) {
      for (const exp of fileResult.exports) {
        const key = `${exp.sourceFile}:${exp.exportedName}`;
        exportIndex.set(key, exp.localSymbolId);
      }
    }

    // 2. Build Symbol Resolver for imported identifiers
    function resolveIdentifier(
      fromFileResult: HonoFileAnalysisResult,
      identifier: string
    ): HonoAppSymbolId | undefined {
      // Check if it's already a symbol declared locally in this file
      for (const a of fromFileResult.apps) {
        if (a.id === identifier || a.variableName === identifier) {
          return a.id;
        }
      }

      // Check imports
      const imp = fromFileResult.imports.find((i) => i.localName === identifier);
      if (!imp) {
        return undefined;
      }

      const targetFileRel = resolveRelativeModule(
        fromFileResult.absolutePath,
        imp.moduleSpecifier,
        workspaceRoot,
        knownFiles
      );

      if (!targetFileRel) {
        warnings.push(
          `Could not statically resolve import '${imp.localName}' from '${imp.moduleSpecifier}' in '${fromFileResult.file}'.`
        );
        return undefined;
      }

      const exportKey = `${targetFileRel}:${imp.importedName}`;
      const resolvedSymbolId = exportIndex.get(exportKey);

      if (!resolvedSymbolId) {
        // Fallback: if imported as default, check if target has a single app export
        const fallbackTarget = fileResults.find((f) => f.file === targetFileRel);
        if (fallbackTarget && fallbackTarget.apps.length === 1) {
          return fallbackTarget.apps[0].id;
        }

        warnings.push(
          `Could not find export '${imp.importedName}' for Hono app in '${targetFileRel}' imported by '${fromFileResult.file}'.`
        );
        return undefined;
      }

      return resolvedSymbolId;
    }

    // 3. Build Adjacency List: Map<parentAppId, MountEdge[]>
    const mountGraph = new Map<HonoAppSymbolId, MountEdge[]>();
    const parentCounts = new Map<HonoAppSymbolId, number>();

    // Initialize all app symbols
    for (const fileResult of fileResults) {
      for (const app of fileResult.apps) {
        mountGraph.set(app.id, []);
        if (!parentCounts.has(app.id)) {
          parentCounts.set(app.id, 0);
        }
      }
    }

    // Populate edges
    for (const fileResult of fileResults) {
      for (const mount of fileResult.mounts) {
        const childSymbolId = resolveIdentifier(fileResult, mount.childIdentifier);

        if (!childSymbolId) {
          warnings.push(
            `Could not resolve mounted Hono app '${mount.childIdentifier}' in '${fileResult.file}'.`
          );
          continue;
        }

        const edges = mountGraph.get(mount.parentSymbolId) ?? [];
        edges.push({
          childSymbolId,
          prefix: mount.rawPrefix,
          confidence: mount.confidence,
        });
        mountGraph.set(mount.parentSymbolId, edges);

        parentCounts.set(childSymbolId, (parentCounts.get(childSymbolId) ?? 0) + 1);
      }
    }

    // 4. Map app symbols to declared basePath if any
    const appBasePaths = new Map<HonoAppSymbolId, string>();
    for (const fileResult of fileResults) {
      for (const app of fileResult.apps) {
        if (app.basePath) {
          appBasePaths.set(app.id, app.basePath);
        }
      }
    }

    // 5. Compute Effective Prefixes for Each App Instance
    const appEffectivePrefixes = new Map<HonoAppSymbolId, MountedPrefix[]>();
    const reportedCycles = new Set<string>();

    function traverseMount(
      currentSymbolId: HonoAppSymbolId,
      currentPrefix: MountedPrefix,
      visited: Set<HonoAppSymbolId>
    ): void {
      if (visited.has(currentSymbolId)) {
        const cycleKey = `${Array.from(visited).join('->')}->${currentSymbolId}`;
        if (!reportedCycles.has(cycleKey)) {
          reportedCycles.add(cycleKey);
          warnings.push(
            `Circular Hono app mounting detected for symbol '${currentSymbolId}'. Breaking cycle.`
          );
        }
        return;
      }

      visited.add(currentSymbolId);

      const existing = appEffectivePrefixes.get(currentSymbolId) ?? [];
      existing.push(currentPrefix);
      appEffectivePrefixes.set(currentSymbolId, existing);

      const edges = mountGraph.get(currentSymbolId) ?? [];
      for (const edge of edges) {
        const nextPrefix = combinePrefixes(currentPrefix, {
          prefix: edge.prefix,
          confidence: edge.confidence,
        });
        traverseMount(edge.childSymbolId, nextPrefix, new Set(visited));
      }
    }

    // Pass 5A: Root traversal starting from apps with no parent mounts
    for (const [appId, pCount] of parentCounts.entries()) {
      if (pCount === 0) {
        const initialBasePath = appBasePaths.get(appId) ?? '';
        const initialPrefix: MountedPrefix = {
          prefix: initialBasePath ? normalizeRoutePath(initialBasePath) : '',
          confidence: 'high',
        };
        traverseMount(appId, initialPrefix, new Set());
      }
    }

    // Pass 5B: Unvisited routers forming closed disconnected cycles
    for (const appId of parentCounts.keys()) {
      if (!appEffectivePrefixes.has(appId)) {
        const initialBasePath = appBasePaths.get(appId) ?? '';
        const initialPrefix: MountedPrefix = {
          prefix: initialBasePath ? normalizeRoutePath(initialBasePath) : '',
          confidence: 'high',
        };
        traverseMount(appId, initialPrefix, new Set());
      }
    }

    // 6. Generate Canonical Route Models
    const canonicalRoutesMap = new Map<string, Route>();

    for (const fileResult of fileResults) {
      for (const rawRoute of fileResult.routes) {
        const prefixes = appEffectivePrefixes.get(rawRoute.appSymbolId);

        // If not mounted anywhere, treat as root route
        const activePrefixes: MountedPrefix[] =
          prefixes && prefixes.length > 0
            ? prefixes
            : [{ prefix: '', confidence: 'high' }];

        for (const p of activePrefixes) {
          const composedRaw = p.prefix ? p.prefix + '/' + rawRoute.rawPath : rawRoute.rawPath;
          const normalizedPath = normalizeRoutePath(composedRaw);

          const finalConfidence: RouteConfidence =
            p.confidence === 'low' || rawRoute.confidence === 'low' ? 'low' : 'high';

          // Call canonical createRoute with framework: 'hono'
          const route = createRoute({
            framework: 'hono',
            method: rawRoute.method,
            path: normalizedPath,
            confidence: finalConfidence,
            source: rawRoute.source,
          });

          // Deduplicate identical canonical route IDs
          canonicalRoutesMap.set(route.id, route);
        }
      }
    }

    return {
      routes: Array.from(canonicalRoutesMap.values()),
      warnings,
    };
  }
}
