import { FastifyFileAnalysisResult, FastifyAppSymbolId } from './types';
import { Route, createRoute } from '../../models/Route';
import { RouteConfidence } from '../../models/RouteConfidence';
import { resolveRelativeModule } from '../../utils/moduleResolver';

export interface FastifyRouteResolutionResult {
  readonly routes: Route[];
  readonly warnings: string[];
}

interface MountedPrefix {
  readonly prefix: string;
  readonly confidence: RouteConfidence;
}

interface RegisterEdge {
  readonly childSymbolId: FastifyAppSymbolId;
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
  const combinedPath = p2.prefix
    ? normalizeRoutePath(`${p1.prefix}/${p2.prefix}`)
    : p1.prefix;
  const combinedConfidence: RouteConfidence =
    p1.confidence === 'low' || p2.confidence === 'low' ? 'low' : 'high';

  return {
    prefix: combinedPath,
    confidence: combinedConfidence,
  };
}

export class FastifyRouteResolver {
  /**
   * Resolves multi-file plugin linking, register graphs, nested prefixes, and cycle protection
   * to produce canonical Route objects for Fastify.
   */
  public resolveRoutes(
    fileResults: FastifyFileAnalysisResult[],
    workspaceRoot: string,
    knownFiles?: Set<string>
  ): FastifyRouteResolutionResult {
    const warnings: string[] = [];

    // Collect all warnings from individual file analysis
    for (const f of fileResults) {
      if (f.warnings && f.warnings.length > 0) {
        warnings.push(...f.warnings);
      }
    }

    // 1. Index exports: Map<"file:exportedName", localSymbolId>
    const exportIndex = new Map<string, FastifyAppSymbolId>();
    for (const fileResult of fileResults) {
      for (const exp of fileResult.exports) {
        const key = `${exp.sourceFile}:${exp.exportedName}`;
        exportIndex.set(key, exp.localSymbolId);
      }
    }

    // 2. Build Symbol Resolver for imported identifiers
    function resolveIdentifier(
      fromFileResult: FastifyFileAnalysisResult,
      identifier: string
    ): FastifyAppSymbolId | undefined {
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
        // Fallback: if imported as default, check if target has a single app/plugin export
        const fallbackTarget = fileResults.find((f) => f.file === targetFileRel);
        if (fallbackTarget && fallbackTarget.apps.length === 1) {
          return fallbackTarget.apps[0].id;
        }

        warnings.push(
          `Could not find export '${imp.importedName}' for Fastify plugin in '${targetFileRel}' imported by '${fromFileResult.file}'.`
        );
        return undefined;
      }

      return resolvedSymbolId;
    }

    // 3. Build Adjacency List: Map<parentAppId, RegisterEdge[]>
    const registerGraph = new Map<FastifyAppSymbolId, RegisterEdge[]>();
    const parentCounts = new Map<FastifyAppSymbolId, number>();

    // Initialize all app/plugin symbols
    for (const fileResult of fileResults) {
      for (const app of fileResult.apps) {
        registerGraph.set(app.id, []);
        if (!parentCounts.has(app.id)) {
          parentCounts.set(app.id, 0);
        }
      }
    }

    // Populate edges
    for (const fileResult of fileResults) {
      for (const reg of fileResult.registers) {
        const childSymbolId = resolveIdentifier(fileResult, reg.childIdentifier);

        if (!childSymbolId) {
          warnings.push(
            `Could not resolve registered Fastify plugin '${reg.childIdentifier}' in '${fileResult.file}'.`
          );
          continue;
        }

        const edges = registerGraph.get(reg.parentSymbolId) ?? [];
        edges.push({
          childSymbolId,
          prefix: reg.rawPrefix,
          confidence: reg.confidence,
        });
        registerGraph.set(reg.parentSymbolId, edges);

        parentCounts.set(childSymbolId, (parentCounts.get(childSymbolId) ?? 0) + 1);
      }
    }

    // 4. Compute Effective Prefixes for Each App/Plugin Instance
    const appEffectivePrefixes = new Map<FastifyAppSymbolId, MountedPrefix[]>();
    const reportedCycles = new Set<string>();

    function traverseRegister(
      currentSymbolId: FastifyAppSymbolId,
      currentPrefix: MountedPrefix,
      visited: Set<FastifyAppSymbolId>
    ): void {
      if (visited.has(currentSymbolId)) {
        const cycleKey = `${Array.from(visited).join('->')}->${currentSymbolId}`;
        if (!reportedCycles.has(cycleKey)) {
          reportedCycles.add(cycleKey);
          warnings.push(
            `Circular Fastify plugin registration detected for symbol '${currentSymbolId}'. Breaking cycle.`
          );
        }
        return;
      }

      visited.add(currentSymbolId);

      const existing = appEffectivePrefixes.get(currentSymbolId) ?? [];
      existing.push(currentPrefix);
      appEffectivePrefixes.set(currentSymbolId, existing);

      const edges = registerGraph.get(currentSymbolId) ?? [];
      for (const edge of edges) {
        const nextPrefix = combinePrefixes(currentPrefix, {
          prefix: edge.prefix,
          confidence: edge.confidence,
        });
        traverseRegister(edge.childSymbolId, nextPrefix, new Set(visited));
      }
    }

    // Pass 4A: Root traversal starting from apps with no parent registers (top-level server instances)
    for (const [appId, pCount] of parentCounts.entries()) {
      if (pCount === 0) {
        const initialPrefix: MountedPrefix = {
          prefix: '',
          confidence: 'high',
        };
        traverseRegister(appId, initialPrefix, new Set());
      }
    }

    // Pass 4B: Unvisited plugins forming closed disconnected cycles
    for (const appId of parentCounts.keys()) {
      if (!appEffectivePrefixes.has(appId)) {
        const initialPrefix: MountedPrefix = {
          prefix: '',
          confidence: 'high',
        };
        traverseRegister(appId, initialPrefix, new Set());
      }
    }

    // 5. Generate Canonical Route Models
    const canonicalRoutesMap = new Map<string, Route>();

    for (const fileResult of fileResults) {
      for (const rawRoute of fileResult.routes) {
        const prefixes = appEffectivePrefixes.get(rawRoute.appSymbolId);

        // If not registered anywhere, treat as root route (e.g. direct routes on server)
        const activePrefixes: MountedPrefix[] =
          prefixes && prefixes.length > 0
            ? prefixes
            : [{ prefix: '', confidence: 'high' }];

        for (const p of activePrefixes) {
          const composedRaw = p.prefix ? `${p.prefix}/${rawRoute.rawPath}` : rawRoute.rawPath;
          const normalizedPath = normalizeRoutePath(composedRaw);

          const finalConfidence: RouteConfidence =
            p.confidence === 'low' || rawRoute.confidence === 'low' ? 'low' : 'high';

          // Call canonical createRoute with framework: 'fastify'
          const route = createRoute({
            framework: 'fastify',
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
