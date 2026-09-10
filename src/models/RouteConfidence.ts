/**
 * RouteConfidence represents the degree of certainty for a statically discovered route:
 * - 'high': The route path and HTTP method are statically determined and fully resolved.
 * - 'medium': The route is partially static (e.g. constant interpolation) with minor uncertainty.
 * - 'low': The route path contains unresolved dynamic variables, computed properties, or heuristic inferences.
 */
export type RouteConfidence = 'high' | 'medium' | 'low';

export const ROUTE_CONFIDENCES: readonly RouteConfidence[] = [
  'high',
  'medium',
  'low',
] as const;

export function isRouteConfidence(value: string): value is RouteConfidence {
  return (ROUTE_CONFIDENCES as readonly string[]).includes(value);
}
