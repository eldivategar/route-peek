import { FiberFileAnalysisResult } from './types';
import { Route, createRoute } from '../../models/Route';
import { RouteConfidence } from '../../models/RouteConfidence';

export interface FiberRouteResolutionResult {
  readonly routes: Route[];
  readonly warnings: string[];
}

interface MountedPrefix {
  readonly prefix: string;
  readonly confidence: RouteConfidence;
}

interface TreeEdge {
  readonly toSymbolId: string;
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

export class FiberRouteResolver {
  public resolveRoutes(fileResults: FiberFileAnalysisResult[]): FiberRouteResolutionResult {
    const warnings: string[] = [];

    for (const f of fileResults) {
      if (f.warnings && f.warnings.length > 0) {
        warnings.push(...f.warnings);
      }
    }

    // 1. Build adjacency list of receiver tree edges: Map<fromSymbolId, TreeEdge[]>
    const graph = new Map<string, TreeEdge[]>();
    const addEdge = (from: string, to: string, prefix: string, confidence: RouteConfidence) => {
      const list = graph.get(from) ?? [];
      list.push({ toSymbolId: to, prefix, confidence });
      graph.set(from, list);
    };

    // Track which symbols are children (to identify root apps)
    const childSymbols = new Set<string>();

    // 2. Intra-file edges: groups, mounts, route callbacks
    for (const f of fileResults) {
      const file = f.relativePath;

      for (const g of f.groups) {
        const from = `${file}:${g.parentReceiverName}`;
        const to = `${file}:${g.receiverName}`;
        addEdge(from, to, g.prefix, g.confidence);
        childSymbols.add(to);
      }

      for (const cb of f.routeCallbacks) {
        const from = `${file}:${cb.parentReceiverName}`;
        const to = `${file}:${cb.paramRouterName}`;
        addEdge(from, to, cb.prefix, cb.confidence);
        childSymbols.add(to);
      }

      for (const m of f.mounts) {
        const from = `${file}:${m.parentReceiverName}`;
        const to = `${file}:${m.subAppReceiverName}`;
        addEdge(from, to, m.prefix, m.confidence);
        childSymbols.add(to);
      }
    }

    // 3. Cross-file edges: function calls passing routers
    // Build index of exported/package functions: Map<functionName, { file, paramName }[]>
    const functionIndex = new Map<string, { file: string; packageName: string; paramName: string }[]>();
    for (const f of fileResults) {
      for (const fn of f.functions) {
        if (fn.paramNames.length > 0) {
          const list = functionIndex.get(fn.name) ?? [];
          list.push({
            file: f.relativePath,
            packageName: f.packageName,
            paramName: fn.paramNames[0],
          });
          functionIndex.set(fn.name, list);
        }
      }
    }

    for (const f of fileResults) {
      for (const call of f.calls) {
        const targets = functionIndex.get(call.functionName);
        if (targets) {
          for (const target of targets) {
            // Match package if specified
            if (!call.packageName || target.packageName === call.packageName || call.packageName.endsWith(target.packageName)) {
              const from = `${f.relativePath}:${call.passedReceiverName}`;
              const to = `${target.file}:${target.paramName}`;
              addEdge(from, to, '', 'high');
              childSymbols.add(to);
            }
          }
        }
      }
    }

    // 4. Identify all symbols
    const allSymbols = new Set<string>();
    for (const f of fileResults) {
      for (const a of f.apps) {
        allSymbols.add(`${f.relativePath}:${a.name}`);
      }
      for (const r of f.routes) {
        allSymbols.add(`${f.relativePath}:${r.receiverName}`);
      }
      for (const g of f.groups) {
        allSymbols.add(`${f.relativePath}:${g.parentReceiverName}`);
        allSymbols.add(`${f.relativePath}:${g.receiverName}`);
      }
      for (const m of f.mounts) {
        allSymbols.add(`${f.relativePath}:${m.parentReceiverName}`);
        allSymbols.add(`${f.relativePath}:${m.subAppReceiverName}`);
      }
      for (const cb of f.routeCallbacks) {
        allSymbols.add(`${f.relativePath}:${cb.parentReceiverName}`);
        allSymbols.add(`${f.relativePath}:${cb.paramRouterName}`);
      }
    }

    const rootSymbols: string[] = [];
    for (const sym of allSymbols) {
      if (!childSymbols.has(sym)) {
        rootSymbols.push(sym);
      }
    }

    // 5. Traverse graph from roots to compute effective prefixes for all symbols
    const symbolPrefixes = new Map<string, MountedPrefix>();

    const dfs = (currentSymbol: string, currentPrefix: MountedPrefix, visited: Set<string>) => {
      if (visited.has(currentSymbol)) {
        warnings.push(`Circular router reference detected at '${currentSymbol}'.`);
        return;
      }
      visited.add(currentSymbol);

      // Store or update prefix
      const existing = symbolPrefixes.get(currentSymbol);
      if (!existing) {
        symbolPrefixes.set(currentSymbol, currentPrefix);
      }

      const edges = graph.get(currentSymbol) ?? [];
      for (const edge of edges) {
        const nextPrefix = combinePrefixes(currentPrefix, {
          prefix: edge.prefix,
          confidence: edge.confidence,
        });
        dfs(edge.toSymbolId, nextPrefix, new Set(visited));
      }
    };

    for (const root of rootSymbols) {
      dfs(root, { prefix: '/', confidence: 'high' }, new Set());
    }

    // If there are unreached symbols (e.g. self-contained cycle of children), visit them to detect cycles
    for (const sym of allSymbols) {
      if (!symbolPrefixes.has(sym)) {
        dfs(sym, { prefix: '/', confidence: 'high' }, new Set());
      }
    }

    // 6. Generate canonical Route objects
    const resolvedRoutes: Route[] = [];

    for (const f of fileResults) {
      for (const r of f.routes) {
        const sym = `${f.relativePath}:${r.receiverName}`;
        const prefixInfo = symbolPrefixes.get(sym) ?? { prefix: '/', confidence: 'high' };

        const effectivePath = normalizeRoutePath(`${prefixInfo.prefix}/${r.path}`);
        const effectiveConfidence: RouteConfidence =
          r.confidence === 'low' || prefixInfo.confidence === 'low' ? 'low' : 'high';

        const route = createRoute({
          framework: 'fiber',
          method: r.method,
          path: effectivePath,
          source: {
            file: r.file,
            line: r.line,
            column: r.column,
          },
          confidence: effectiveConfidence,
        });

        resolvedRoutes.push(route);
      }
    }

    // Deduplicate by deterministic ID
    const uniqueMap = new Map<string, Route>();
    for (const route of resolvedRoutes) {
      if (!uniqueMap.has(route.id)) {
        uniqueMap.set(route.id, route);
      }
    }

    const uniqueRoutes = Array.from(uniqueMap.values());

    // Deterministic sorting
    uniqueRoutes.sort((a, b) => {
      const pathCmp = a.path.localeCompare(b.path);
      if (pathCmp !== 0) return pathCmp;
      const methodCmp = a.method.localeCompare(b.method);
      if (methodCmp !== 0) return methodCmp;
      const fileCmp = a.source.file.localeCompare(b.source.file);
      if (fileCmp !== 0) return fileCmp;
      return a.source.line - b.source.line;
    });

    return {
      routes: uniqueRoutes,
      warnings,
    };
  }
}
