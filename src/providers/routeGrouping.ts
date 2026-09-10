import { Route } from '../models/Route';

export interface RouteGroup {
  id: string;
  label: string;
  prefix: string;
  count: number;
  routes: Route[];
}

const PARAMETER_PREFIXES = [':', '{', '[', '*', '<'];

function isParameterSegment(segment: string): boolean {
  return PARAMETER_PREFIXES.some((prefix) => segment.startsWith(prefix));
}

export function getStaticSegments(pathStr: string): string[] {
  const segments = pathStr.split('/').filter(Boolean);
  const staticSegments: string[] = [];

  for (const seg of segments) {
    if (isParameterSegment(seg)) {
      break;
    }
    staticSegments.push(seg);
  }

  return staticSegments;
}

export function getRouteGroupPrefix(routePath: string): string {
  const segs = getStaticSegments(routePath);
  if (segs.length === 0) {
    return '/';
  }
  if (segs.length === 1) {
    return `/${segs[0]}`;
  }

  // Check if first segment is a namespace wrapper
  const isNamespace = /^(api|rest|app|internal|public|service|v\d+(\.\d+)?)$/i.test(segs[0]);

  if (isNamespace) {
    // Check if second segment is a version wrapper (e.g. /api/v1)
    const isVersion = /^v\d+(\.\d+)?$/i.test(segs[1]);
    if (isVersion && segs.length >= 3) {
      return `/${segs[0]}/${segs[1]}/${segs[2]}`;
    }
    return `/${segs[0]}/${segs[1]}`;
  }

  // Not a namespace wrapper: first segment is the resource (e.g. /users/profile -> /users)
  return `/${segs[0]}`;
}

export function getRelativeRoutePath(routePath: string, groupPrefix: string): string {
  if (groupPrefix === '/') {
    return routePath === '/' ? '/' : routePath;
  }
  if (routePath === groupPrefix) {
    return '/';
  }
  if (routePath.startsWith(`${groupPrefix}/`)) {
    const suffix = routePath.slice(groupPrefix.length);
    return suffix.startsWith('/') ? suffix : `/${suffix}`;
  }
  return routePath;
}

export const METHOD_PRIORITY: Record<string, number> = {
  GET: 1,
  POST: 2,
  PUT: 3,
  PATCH: 4,
  DELETE: 5,
  HEAD: 6,
  OPTIONS: 7,
  TRACE: 8,
};

export function compareMethods(a: string, b: string): number {
  const pA = METHOD_PRIORITY[a.toUpperCase()] ?? 99;
  const pB = METHOD_PRIORITY[b.toUpperCase()] ?? 99;
  if (pA !== pB) {
    return pA - pB;
  }
  return a.localeCompare(b);
}

function compareRoutes(a: Route, b: Route, groupPrefix: string): number {
  const relA = getRelativeRoutePath(a.path, groupPrefix);
  const relB = getRelativeRoutePath(b.path, groupPrefix);

  if (relA !== relB) {
    return relA.localeCompare(relB);
  }

  const pA = METHOD_PRIORITY[a.method.toUpperCase()] ?? 99;
  const pB = METHOD_PRIORITY[b.method.toUpperCase()] ?? 99;

  if (pA !== pB) {
    return pA - pB;
  }

  if (a.method !== b.method) {
    return a.method.localeCompare(b.method);
  }

  const fileCmp = a.source.file.localeCompare(b.source.file);
  if (fileCmp !== 0) {
    return fileCmp;
  }

  return a.source.line - b.source.line;
}

export function groupRoutesByPrefix(routes: readonly Route[]): RouteGroup[] {
  if (routes.length === 0) {
    return [];
  }

  const groupsMap = new Map<string, RouteGroup>();

  for (const route of routes) {
    const prefix = getRouteGroupPrefix(route.path);
    const id = prefix === '/' ? 'root' : prefix;
    const label = prefix === '/' ? 'Root' : prefix;

    let group = groupsMap.get(id);
    if (!group) {
      group = {
        id,
        label,
        prefix,
        count: 0,
        routes: [],
      };
      groupsMap.set(id, group);
    }
    group.routes.push(route);
  }

  const result: RouteGroup[] = [];
  for (const group of groupsMap.values()) {
    group.routes.sort((a, b) => compareRoutes(a, b, group.prefix));
    group.count = group.routes.length;
    result.push(group);
  }

  // Deterministic sorting of groups: 'Root' always comes first, followed by alphabetical order by label
  result.sort((a, b) => {
    if (a.id === 'root') return -1;
    if (b.id === 'root') return 1;
    return a.label.localeCompare(b.label);
  });

  return result;
}
