export type HttpMethod =
  | 'GET'
  | 'POST'
  | 'PUT'
  | 'PATCH'
  | 'DELETE'
  | 'OPTIONS'
  | 'HEAD'
  | 'TRACE';

export const HTTP_METHODS: readonly HttpMethod[] = [
  'GET',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
  'OPTIONS',
  'HEAD',
  'TRACE',
] as const;

export function isHttpMethod(value: string): value is HttpMethod {
  return (HTTP_METHODS as readonly string[]).includes(value.toUpperCase());
}

export function normalizeHttpMethod(value: string): HttpMethod {
  const upper = value.toUpperCase().trim();
  if (isHttpMethod(upper)) {
    return upper;
  }
  throw new Error(`Invalid HTTP method: '${value}'`);
}
