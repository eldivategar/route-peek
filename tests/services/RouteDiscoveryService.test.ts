import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RouteDiscoveryService } from '../../src/services/RouteDiscoveryService';
import { ScannerRegistry } from '../../src/services/ScannerRegistry';
import { FrameworkDetector } from '../../src/scanners/FrameworkDetector';
import { RouteScanner } from '../../src/scanners/RouteScanner';
import { createRoute } from '../../src/models/Route';

describe('RouteDiscoveryService', () => {
  let mockDetector: FrameworkDetector;
  let registry: ScannerRegistry;
  let service: RouteDiscoveryService;

  beforeEach(() => {
    mockDetector = {
      detect: vi.fn().mockResolvedValue({ frameworks: [] }),
    };
    registry = new ScannerRegistry();
    service = new RouteDiscoveryService(mockDetector, registry);
  });

  it('returns empty result when workspace roots are empty', async () => {
    const result = await service.discover({ workspaceRoots: [] });

    expect(result.routes).toEqual([]);
    expect(result.scannedFrameworks).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(result.errors).toEqual([]);
    expect(mockDetector.detect).not.toHaveBeenCalled();
  });

  it('handles detector failure gracefully without throwing', async () => {
    mockDetector.detect = vi
      .fn()
      .mockRejectedValue(new Error('Detector disk read error'));

    const result = await service.discover({ workspaceRoots: ['/app'] });

    expect(result.routes).toEqual([]);
    expect(result.errors).toEqual([
      { message: 'Framework detection failed: Detector disk read error' },
    ]);
  });

  it('adds a warning when detected framework has no registered scanner', async () => {
    mockDetector.detect = vi.fn().mockResolvedValue({ frameworks: ['express'] });

    const result = await service.discover({ workspaceRoots: ['/app'] });

    expect(result.routes).toEqual([]);
    expect(result.warnings).toEqual([
      { message: "No scanner registered for detected framework 'express'." },
    ]);
  });

  it('skips scanner when canHandle returns false', async () => {
    mockDetector.detect = vi.fn().mockResolvedValue({ frameworks: ['express'] });
    const mockScanner: RouteScanner = {
      framework: 'express',
      canHandle: vi.fn().mockResolvedValue(false),
      scan: vi.fn(),
    };
    registry.register(mockScanner);

    const result = await service.discover({ workspaceRoots: ['/app'] });

    expect(mockScanner.canHandle).toHaveBeenCalled();
    expect(mockScanner.scan).not.toHaveBeenCalled();
    expect(result.scannedFrameworks).toEqual([]);
    expect(result.routes).toEqual([]);
  });

  it('aggregates routes from matching scanner', async () => {
    mockDetector.detect = vi.fn().mockResolvedValue({ frameworks: ['express'] });

    const testRoute = createRoute({
      method: 'GET',
      path: '/users',
      framework: 'express',
      source: { file: 'src/users.ts', line: 10, column: 1 },
      confidence: 'high',
    });

    const mockScanner: RouteScanner = {
      framework: 'express',
      canHandle: vi.fn().mockResolvedValue(true),
      scan: vi.fn().mockResolvedValue({
        framework: 'express',
        routes: [testRoute],
        warnings: [{ message: 'Minor warning' }],
      }),
    };
    registry.register(mockScanner);

    const result = await service.discover({ workspaceRoots: ['/app'] });

    expect(result.scannedFrameworks).toEqual(['express']);
    expect(result.routes).toEqual([testRoute]);
    expect(result.warnings).toEqual([{ message: 'Minor warning' }]);
    expect(result.errors).toEqual([]);
  });

  it('isolates scanner failure and preserves routes from healthy scanners', async () => {
    mockDetector.detect = vi
      .fn()
      .mockResolvedValue({ frameworks: ['express', 'fastify'] });

    const expressRoute = createRoute({
      method: 'GET',
      path: '/api/v1',
      framework: 'express',
      source: { file: 'src/v1.ts', line: 5, column: 1 },
      confidence: 'high',
    });

    const expressScanner: RouteScanner = {
      framework: 'express',
      canHandle: () => true,
      scan: vi.fn().mockResolvedValue({
        framework: 'express',
        routes: [expressRoute],
      }),
    };

    const failingFastifyScanner: RouteScanner = {
      framework: 'fastify',
      canHandle: () => true,
      scan: vi.fn().mockRejectedValue(new Error('Syntax crash in fastify routes')),
    };

    registry.register(expressScanner);
    registry.register(failingFastifyScanner);

    const result = await service.discover({ workspaceRoots: ['/app'] });

    // Express route is preserved despite Fastify scanner crash
    expect(result.routes).toEqual([expressRoute]);
    expect(result.scannedFrameworks).toEqual(['express', 'fastify']);
    expect(result.errors).toEqual([
      {
        message: "Scanner for framework 'fastify' failed: Syntax crash in fastify routes",
      },
    ]);
  });

  it('orders routes deterministically (path -> method -> file -> line -> column -> id)', async () => {
    mockDetector.detect = vi.fn().mockResolvedValue({ frameworks: ['express'] });

    const routeZ = createRoute({
      method: 'GET',
      path: '/zeta',
      framework: 'express',
      source: { file: 'b.ts', line: 1, column: 1 },
      confidence: 'high',
    });
    const routeA2 = createRoute({
      method: 'POST',
      path: '/alpha',
      framework: 'express',
      source: { file: 'a.ts', line: 10, column: 1 },
      confidence: 'high',
    });
    const routeA1 = createRoute({
      method: 'GET',
      path: '/alpha',
      framework: 'express',
      source: { file: 'a.ts', line: 5, column: 1 },
      confidence: 'high',
    });
    const routeA3 = createRoute({
      method: 'POST',
      path: '/alpha',
      framework: 'express',
      source: { file: 'a.ts', line: 15, column: 1 },
      confidence: 'high',
    });

    // Pass in reverse/scrambled order
    const mockScanner: RouteScanner = {
      framework: 'express',
      canHandle: () => true,
      scan: vi.fn().mockResolvedValue({
        framework: 'express',
        routes: [routeZ, routeA3, routeA2, routeA1],
      }),
    };
    registry.register(mockScanner);

    const result = await service.discover({ workspaceRoots: ['/app'] });

    expect(result.routes).toEqual([routeA1, routeA2, routeA3, routeZ]);
  });
});
