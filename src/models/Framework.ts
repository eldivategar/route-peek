export type Framework =
  | 'express'
  | 'fastify'
  | 'hono'
  | 'nestjs'
  | 'fastapi'
  | 'flask'
  | 'django-rest-framework'
  | 'net/http'
  | 'gin'
  | 'echo'
  | 'fiber'
  | 'unknown';

export const KNOWN_FRAMEWORKS: readonly Framework[] = [
  'express',
  'fastify',
  'hono',
  'nestjs',
  'fastapi',
  'flask',
  'django-rest-framework',
  'net/http',
  'gin',
  'echo',
  'fiber',
  'unknown',
] as const;

export function normalizeFramework(value: string): Framework {
  const lower = value.toLowerCase().trim() as Framework;
  if ((KNOWN_FRAMEWORKS as readonly string[]).includes(lower)) {
    return lower;
  }
  return 'unknown';
}
