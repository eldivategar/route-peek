import { describe, it, expect, vi } from 'vitest';
import * as path from 'path';

vi.mock('vscode', () => {
  class MockTreeItem {
    public description?: string;
    public tooltip?: string;
    public iconPath?: unknown;
    public command?: unknown;
    constructor(
      public label: string,
      public collapsibleState = 0
    ) {}
  }
  class MockThemeIcon {
    constructor(public id: string) {}
  }
  class MockEventEmitter {
    private handlers: Array<() => void> = [];
    public event = (listener: () => void) => {
      this.handlers.push(listener);
      return { dispose: vi.fn() };
    };
    public fire = vi.fn(() => {
      this.handlers.forEach((h) => h());
    });
  }

  return {
    TreeItem: MockTreeItem,
    TreeItemCollapsibleState: {
      None: 0,
      Collapsed: 1,
      Expanded: 2,
    },
    ThemeIcon: MockThemeIcon,
    ThemeColor: class MockThemeColor {
      constructor(public id: string) {}
    },
    EventEmitter: MockEventEmitter,
  };
});

import { ExpressScanner } from '../../src/scanners/express/ExpressScanner';
import { ExpressFrameworkDetector } from '../../src/scanners/express/ExpressFrameworkDetector';
import { HonoScanner } from '../../src/scanners/hono/HonoScanner';
import { HonoFrameworkDetector } from '../../src/scanners/hono/HonoFrameworkDetector';
import { FastifyScanner } from '../../src/scanners/fastify/FastifyScanner';
import { FastifyFrameworkDetector } from '../../src/scanners/fastify/FastifyFrameworkDetector';
import { FiberScanner } from '../../src/scanners/fiber/FiberScanner';
import { FiberFrameworkDetector } from '../../src/scanners/fiber/FiberFrameworkDetector';
import { CompositeFrameworkDetector } from '../../src/scanners/CompositeFrameworkDetector';
import { ScannerRegistry } from '../../src/services/ScannerRegistry';
import { RouteDiscoveryService } from '../../src/services/RouteDiscoveryService';
import { RouteTreeProvider } from '../../src/providers/RouteTreeProvider';
import { RouteSearchService } from '../../src/services/RouteSearchService';

describe('Fiber Extension Host Verification & Quad-Framework Integration', () => {
  const fiberRealistic = path.resolve(__dirname, '../fixtures/fiber/realistic-project');
  const expressRealistic = path.resolve(__dirname, '../fixtures/express/realistic-project');
  const honoRealistic = path.resolve(__dirname, '../fixtures/hono/realistic-project');
  const fastifyRealistic = path.resolve(__dirname, '../fixtures/fastify/realistic-project');

  it('verifies Fiber realistic project discovery, TreeView grouping, navigation, and search', async () => {
    const registry = new ScannerRegistry();
    registry.register(new FiberScanner());
    const detector = new CompositeFrameworkDetector([new FiberFrameworkDetector()]);
    const discoveryService = new RouteDiscoveryService(detector, registry);

    const discoveryResult = await discoveryService.discover({
      workspaceRoots: [fiberRealistic],
    });

    expect(discoveryResult.scannedFrameworks).toEqual(['fiber']);
    expect(discoveryResult.routes).toHaveLength(9);

    const treeProvider = new RouteTreeProvider();
    treeProvider.setRoutes(discoveryResult.routes);
    expect(treeProvider.getState()).toBe('success');

    // 1. Root level: Fiber (9)
    const rootItems = await treeProvider.getChildren();
    expect(rootItems).toHaveLength(1);
    expect(rootItems[0].frameworkGroupKey).toBe('fiber');
    expect(rootItems[0].label).toBe('Fiber (9)');

    // 2. Resource Groups and lifted endpoints: /api/auth (3), /api/users (5), /health
    const resourceGroups = await treeProvider.getChildren(rootItems[0]);
    expect(resourceGroups).toHaveLength(3);
    const groupLabels = resourceGroups.map((g) => g.label).sort();
    expect(groupLabels).toEqual(['/api/auth (3)', '/api/users (5)', '/health']);

    // 3. Search filtering
    const searchUsers = RouteSearchService.search(discoveryResult.routes, 'users');
    expect(searchUsers).toHaveLength(5);
    expect(searchUsers.every((r) => r.path.includes('/users'))).toBe(true);

    const searchLogin = RouteSearchService.search(discoveryResult.routes, 'login');
    expect(searchLogin).toHaveLength(1);
    expect(searchLogin[0].path).toBe('/api/auth/login');
  });

  it('verifies quad-framework workspace coexistence (Express, Hono, Fastify, Fiber) without cross-contamination', async () => {
    const registry = new ScannerRegistry();
    registry.register(new ExpressScanner());
    registry.register(new HonoScanner());
    registry.register(new FastifyScanner());
    registry.register(new FiberScanner());

    const compositeDetector = new CompositeFrameworkDetector([
      new ExpressFrameworkDetector(),
      new HonoFrameworkDetector(),
      new FastifyFrameworkDetector(),
      new FiberFrameworkDetector(),
    ]);

    const discoveryService = new RouteDiscoveryService(compositeDetector, registry);

    const discoveryResult = await discoveryService.discover({
      workspaceRoots: [expressRealistic, honoRealistic, fastifyRealistic, fiberRealistic],
    });

    // 7 Express + 7 Hono + 11 Fastify + 9 Fiber = 34 total routes
    expect(discoveryResult.scannedFrameworks).toContain('express');
    expect(discoveryResult.scannedFrameworks).toContain('hono');
    expect(discoveryResult.scannedFrameworks).toContain('fastify');
    expect(discoveryResult.scannedFrameworks).toContain('fiber');
    expect(discoveryResult.routes).toHaveLength(34);

    const treeProvider = new RouteTreeProvider();
    treeProvider.setRoutes(discoveryResult.routes);

    // Root level must contain all 4 frameworks
    const rootItems = await treeProvider.getChildren();
    expect(rootItems).toHaveLength(4);

    const labels = rootItems.map((item) => item.label).sort();
    expect(labels).toEqual(['Express (7)', 'Fastify (11)', 'Fiber (9)', 'Hono (7)']);

    // Cross-framework search: "users" matches all 4 frameworks
    const searchUsers = RouteSearchService.search(discoveryResult.routes, 'users');
    const frameworksMatchingUsers = new Set(searchUsers.map((r) => r.framework));
    expect(frameworksMatchingUsers.has('express')).toBe(true);
    expect(frameworksMatchingUsers.has('hono')).toBe(true);
    expect(frameworksMatchingUsers.has('fastify')).toBe(true);
    expect(frameworksMatchingUsers.has('fiber')).toBe(true);
  });
});
