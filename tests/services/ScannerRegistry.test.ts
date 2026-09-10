import { describe, it, expect, beforeEach } from 'vitest';
import { ScannerRegistry } from '../../src/services/ScannerRegistry';
import { RouteScanner } from '../../src/scanners/RouteScanner';
import { Framework } from '../../src/models/Framework';

function createMockScanner(framework: Framework): RouteScanner {
  return {
    framework,
    canHandle: () => true,
    scan: async () => ({ framework, routes: [] }),
  };
}

describe('ScannerRegistry', () => {
  let registry: ScannerRegistry;

  beforeEach(() => {
    registry = new ScannerRegistry();
  });

  it('registers and retrieves a scanner', () => {
    const scanner = createMockScanner('express');
    registry.register(scanner);

    expect(registry.has('express')).toBe(true);
    expect(registry.get('express')).toBe(scanner);
  });

  it('returns undefined for unregistered framework', () => {
    expect(registry.get('fastify')).toBeUndefined();
    expect(registry.has('fastify')).toBe(false);
  });

  it('enumerates all registered scanners', () => {
    const expressScanner = createMockScanner('express');
    const fastifyScanner = createMockScanner('fastify');

    registry.register(expressScanner);
    registry.register(fastifyScanner);

    const all = registry.getAll();
    expect(all).toHaveLength(2);
    expect(all).toContain(expressScanner);
    expect(all).toContain(fastifyScanner);
  });

  it('throws an explicit error on duplicate framework registration', () => {
    const first = createMockScanner('hono');
    const second = createMockScanner('hono');

    registry.register(first);

    expect(() => registry.register(second)).toThrow(
      "Scanner for framework 'hono' is already registered."
    );
  });

  it('unregisters an existing scanner', () => {
    const scanner = createMockScanner('nestjs');
    registry.register(scanner);

    expect(registry.unregister('nestjs')).toBe(true);
    expect(registry.has('nestjs')).toBe(false);
    expect(registry.get('nestjs')).toBeUndefined();
  });

  it('returns false when unregistering a non-existent scanner', () => {
    expect(registry.unregister('gin')).toBe(false);
  });

  it('clears all scanners', () => {
    registry.register(createMockScanner('express'));
    registry.register(createMockScanner('fastify'));

    registry.clear();
    expect(registry.getAll()).toHaveLength(0);
  });
});
