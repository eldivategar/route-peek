import { FileAnalysisResult, RouterSymbolId } from './types';
import { Route, createRoute } from '../../models/Route';
import { RouteConfidence } from '../../models/RouteConfidence';
import { resolveRelativeModule } from '../../utils/moduleResolver';

export interface RouteResolutionResult {
  readonly routes: Route[];
  readonly warnings: string[];
}

interface MountedPrefix {
  readonly prefix: string;
  readonly confidence: RouteConfidence;
}

interface MountEdge {
  readonly childSymbolId: RouterSymbolId;
  readonly prefix: string;
  readonly confidence: RouteConfidence;
}

export class ExpressRouteResolver {
  /**
   * Resolves multi-file router linking, mount graphs, nested prefixes, and cycle protection
   * to produce canonical Route objects.
   */
  public resolveRoutes(
    fileResults: FileAnalysisResult[],
    workspaceRoot: string,
    knownFiles?: Set<string>
  ): RouteResolutionResult {
    const warnings: string[] = [];

    // Collect all warnings from individual file analysis
    for (const f of fileResults) {
      if (f.warnings && f.warnings.length > 0) {
        warnings.push(...f.warnings);
      }
    }

    // 1. Index exports: Map<"file:exportedName", localSymbolId>
    const exportIndex = new Map<string, RouterSymbolId>();
    for (const fileResult of fileResults) {
      for (const exp of fileResult.exports) {
        const key = `${exp.sourceFile}:${exp.exportedName}`;
        exportIndex.set(key, exp.localSymbolId);
      }
    }

    // 2. Build Symbol Resolver for imported identifiers
    // Function: resolveIdentifierToSymbol(fromFile, identifier) -> RouterSymbolId | undefined
    function resolveIdentifier(
      fromFileResult: FileAnalysisResult,
      identifier: string
    ): RouterSymbolId | undefined {
      // Check if it's already a symbol declared locally in this file
      for (const r of fromFileResult.routers) {
        if (r.id === identifier || r.variableName === identifier) {
          return r.id;
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
        // Try fallback: if imported as default, check if target has a single router export
        const fallbackTarget = fileResults.find((f) => f.file === targetFileRel);
        if (fallbackTarget && fallbackTarget.routers.length === 1) {
          return fallbackTarget.routers[0].id;
        }

        warnings.push(
          `Could not find export '${imp.importedName}' for router in '${targetFileRel}' imported by '${fromFileResult.file}'.`
        );
        return undefined;
      }

      return resolvedSymbolId;
    }

    // 3. Build directed mount graph: parentSymbolId -> MountEdge[]
    const mountGraph = new Map<RouterSymbolId, MountEdge[]>();
    const parentCount = new Map<RouterSymbolId, number>();

    // Initialize maps for all declared routers
    for (const f of fileResults) {
      for (const r of f.routers) {
        mountGraph.set(r.id, []);
        if (!parentCount.has(r.id)) {
          parentCount.set(r.id, 0);
        }
      }
    }

    // Populate mounts
    for (const f of fileResults) {
      for (const m of f.mounts) {
        const resolvedChild = resolveIdentifier(f, m.childIdentifier);
        if (resolvedChild) {
          const edges = mountGraph.get(m.parentSymbolId) ?? [];
          edges.push({
            childSymbolId: resolvedChild,
            prefix: m.rawPrefix,
            confidence: m.confidence,
          });
          mountGraph.set(m.parentSymbolId, edges);

          parentCount.set(resolvedChild, (parentCount.get(resolvedChild) ?? 0) + 1);
        }
      }
    }

    // 4. Resolve effective prefixes for each router via depth-first traversal with cycle detection
    const routerEffectivePrefixes = new Map<RouterSymbolId, MountedPrefix[]>();
    const reportedCycles = new Set<string>();

    function addEffectivePrefix(
      symbolId: RouterSymbolId,
      prefix: string,
      confidence: RouteConfidence
    ): void {
      const existing = routerEffectivePrefixes.get(symbolId) ?? [];
      if (!existing.some((p) => p.prefix === prefix && p.confidence === confidence)) {
        existing.push({ prefix, confidence });
        routerEffectivePrefixes.set(symbolId, existing);
      }
    }

    function traverseMounts(
      currentSymbolId: RouterSymbolId,
      currentPrefix: string,
      currentConfidence: RouteConfidence,
      activeCallStack: Set<RouterSymbolId>
    ): void {
      if (activeCallStack.has(currentSymbolId)) {
        const cycleKey = `${Array.from(activeCallStack).join('->')}->${currentSymbolId}`;
        if (!reportedCycles.has(cycleKey)) {
          reportedCycles.add(cycleKey);
          warnings.push(
            `Circular router mounting detected involving router '${currentSymbolId}'. Breaking cycle.`
          );
        }
        return;
      }

      activeCallStack.add(currentSymbolId);
      addEffectivePrefix(currentSymbolId, currentPrefix, currentConfidence);

      const children = mountGraph.get(currentSymbolId) ?? [];
      for (const child of children) {
        const nextPrefix = composePrefix(currentPrefix, child.prefix);
        const nextConfidence = combineConfidence(currentConfidence, child.confidence);

        traverseMounts(child.childSymbolId, nextPrefix, nextConfidence, activeCallStack);
      }

      activeCallStack.delete(currentSymbolId);
    }

    // Traverse starting from root nodes (apps or unmounted routers)
    for (const f of fileResults) {
      for (const r of f.routers) {
        const isRoot = r.isApp || (parentCount.get(r.id) ?? 0) === 0;
        if (isRoot) {
          traverseMounts(r.id, '', 'high', new Set<RouterSymbolId>());
        }
      }
    }

    // Disconnected circular components: traverse any router that was never reached from a root
    for (const f of fileResults) {
      for (const r of f.routers) {
        if (!routerEffectivePrefixes.has(r.id)) {
          traverseMounts(r.id, '', 'high', new Set<RouterSymbolId>());
        }
      }
    }

    // 5. Construct canonical routes
    const routesById = new Map<string, Route>();

    for (const f of fileResults) {
      for (const rawRoute of f.routes) {
        const prefixes = routerEffectivePrefixes.get(rawRoute.routerSymbolId);

        if (prefixes && prefixes.length > 0) {
          for (const p of prefixes) {
            const effectivePath = normalizeRoutePath(p.prefix, rawRoute.rawPath);
            const combinedConf = combineConfidence(p.confidence, rawRoute.confidence);

            const route = createRoute({
              method: rawRoute.method,
              path: effectivePath,
              framework: 'express',
              source: rawRoute.source,
              confidence: combinedConf,
            });

            routesById.set(route.id, route);
          }
        } else {
          // Unmounted / standalone router
          const effectivePath = normalizeRoutePath('', rawRoute.rawPath);
          const route = createRoute({
            method: rawRoute.method,
            path: effectivePath,
            framework: 'express',
            source: rawRoute.source,
            confidence: rawRoute.confidence,
          });

          routesById.set(route.id, route);
        }
      }
    }

    const resolvedRoutes = Array.from(routesById.values());

    // Deterministic sort: path -> method -> source.file -> source.line -> source.column -> id
    resolvedRoutes.sort((a, b) => {
      const pathCmp = a.path.localeCompare(b.path);
      if (pathCmp !== 0) return pathCmp;

      const methodCmp = a.method.localeCompare(b.method);
      if (methodCmp !== 0) return methodCmp;

      const fileCmp = a.source.file.localeCompare(b.source.file);
      if (fileCmp !== 0) return fileCmp;

      const lineCmp = a.source.line - b.source.line;
      if (lineCmp !== 0) return lineCmp;

      const colCmp = (a.source.column ?? 0) - (b.source.column ?? 0);
      if (colCmp !== 0) return colCmp;

      return a.id.localeCompare(b.id);
    });

    return {
      routes: resolvedRoutes,
      warnings,
    };
  }
}

function composePrefix(parentPrefix: string, childPrefix: string): string {
  const p1 = parentPrefix.trim();
  const p2 = childPrefix.trim();
  if (!p1 && !p2) return '';
  if (!p1) return p2;
  if (!p2) return p1;

  const cleanP1 = p1.replace(/\/+$/g, '');
  const cleanP2 = p2.replace(/^\/+/g, '');
  return `${cleanP1}/${cleanP2}`;
}

export function normalizeRoutePath(prefix: string, localPath: string): string {
  const combined = composePrefix(prefix, localPath);
  if (!combined || combined === '' || combined === '/') {
    return '/';
  }

  let p = combined.replace(/\\/g, '/').replace(/\/+/g, '/');
  // Collapse adjacent dynamic segments: e.g. <dynamic>/<dynamic> -> <dynamic>
  p = p.replace(/<dynamic>(?:\/<dynamic>)+/g, '<dynamic>');

  if (!p.startsWith('/')) {
    p = '/' + p;
  }
  if (p.length > 1 && p.endsWith('/')) {
    p = p.slice(0, -1);
  }
  return p;
}

function combineConfidence(a: RouteConfidence, b: RouteConfidence): RouteConfidence {
  if (a === 'low' || b === 'low') return 'low';
  if (a === 'medium' || b === 'medium') return 'medium';
  return 'high';
}
