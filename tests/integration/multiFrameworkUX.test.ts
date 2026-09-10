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
import { CompositeFrameworkDetector } from '../../src/scanners/CompositeFrameworkDetector';
import { ScannerRegistry } from '../../src/services/ScannerRegistry';
import { RouteDiscoveryService } from '../../src/services/RouteDiscoveryService';
import { RouteTreeProvider } from '../../src/providers/RouteTreeProvider';

describe('Multi-Framework UX Integration (Express + Hono)', () => {
  const expressFixture = path.resolve(__dirname, '../fixtures/express/realistic-project');
  const honoFixture = path.resolve(__dirname, '../fixtures/hono/realistic-project');

  it('scans multi-root workspace with both Express and Hono, rendering coexisting framework groups in TreeView', async () => {
    const registry = new ScannerRegistry();
    registry.register(new ExpressScanner());
    registry.register(new HonoScanner());

    const compositeDetector = new CompositeFrameworkDetector([
      new ExpressFrameworkDetector(),
      new HonoFrameworkDetector(),
    ]);

    const discoveryService = new RouteDiscoveryService(compositeDetector, registry);

    const discoveryResult = await discoveryService.discover({
      workspaceRoots: [expressFixture, honoFixture],
    });

    expect(discoveryResult.scannedFrameworks).toContain('express');
    expect(discoveryResult.scannedFrameworks).toContain('hono');
    expect(discoveryResult.routes).toHaveLength(14); // 7 Express + 7 Hono

    const treeProvider = new RouteTreeProvider();
    treeProvider.setRoutes(discoveryResult.routes);
    expect(treeProvider.getState()).toBe('success');

    // Root level should contain two framework groups: Express (7) and Hono (7)
    const rootItems = await treeProvider.getChildren();
    expect(rootItems).toHaveLength(2);

    const expressGroup = rootItems.find((item) => item.frameworkGroupKey === 'express');
    const honoGroup = rootItems.find((item) => item.frameworkGroupKey === 'hono');

    expect(expressGroup).toBeDefined();
    expect(expressGroup!.label).toBe('Express (7)');

    expect(honoGroup).toBeDefined();
    expect(honoGroup!.label).toBe('Hono (7)');

    const collectLeafRoutes = async (
      groups: import('../../src/providers/RouteTreeItem').RouteTreeItem[]
    ) => {
      const leafItems: import('../../src/providers/RouteTreeItem').RouteTreeItem[] = [];
      for (const rg of groups) {
        const endpoints = await treeProvider.getChildren(rg);
        for (const ep of endpoints) {
          if (ep.node?.children) {
            const methods = await treeProvider.getChildren(ep);
            leafItems.push(...methods);
          } else {
            leafItems.push(ep);
          }
        }
      }
      return leafItems;
    };

    // Expanding Express group yields Express route groups and compact endpoints
    const expressRouteGroups = await treeProvider.getChildren(expressGroup!);
    expect(expressRouteGroups.length).toBeGreaterThanOrEqual(1);
    const expressRoutes = await collectLeafRoutes(expressRouteGroups);
    expect(expressRoutes).toHaveLength(7);
    for (const item of expressRoutes) {
      expect(item.route!.framework).toBe('express');
      expect(item.command).toEqual({
        command: 'routePeek.openRouteSource',
        title: 'Open Route Source',
        arguments: [item.route],
      });
    }

    // Expanding Hono group yields Hono route groups and compact endpoints
    const honoRouteGroups = await treeProvider.getChildren(honoGroup!);
    expect(honoRouteGroups.length).toBeGreaterThanOrEqual(1);
    const honoRoutes = await collectLeafRoutes(honoRouteGroups);
    expect(honoRoutes).toHaveLength(7);
    for (const item of honoRoutes) {
      expect(item.route!.framework).toBe('hono');
      expect(item.command).toEqual({
        command: 'routePeek.openRouteSource',
        title: 'Open Route Source',
        arguments: [item.route],
      });
    }

    // Search filter across multiple frameworks
    treeProvider.setSearchFilter('auth');
    const filteredRoot = await treeProvider.getChildren();
    expect(filteredRoot).toHaveLength(2);

    const filteredExpressGroup = filteredRoot.find((item) => item.frameworkGroupKey === 'express');
    const filteredHonoGroup = filteredRoot.find((item) => item.frameworkGroupKey === 'hono');

    expect(filteredExpressGroup!.label).toBe('Express (3)');
    expect(filteredHonoGroup!.label).toBe('Hono (3)');

    // Clear search
    treeProvider.clearSearchFilter();
    const restoredRoot = await treeProvider.getChildren();
    expect(restoredRoot).toHaveLength(2);
    expect(restoredRoot.find((i) => i.frameworkGroupKey === 'express')!.label).toBe('Express (7)');
    expect(restoredRoot.find((i) => i.frameworkGroupKey === 'hono')!.label).toBe('Hono (7)');
  });

  it('scans tri-framework multi-root workspace (Express + Hono + Fastify) rendering 3 distinct framework groups', async () => {
    const fastifyFixture = path.resolve(__dirname, '../fixtures/fastify/realistic-project');

    const registry = new ScannerRegistry();
    registry.register(new ExpressScanner());
    registry.register(new HonoScanner());
    registry.register(new FastifyScanner());

    const compositeDetector = new CompositeFrameworkDetector([
      new ExpressFrameworkDetector(),
      new HonoFrameworkDetector(),
      new FastifyFrameworkDetector(),
    ]);

    const discoveryService = new RouteDiscoveryService(compositeDetector, registry);
    const discoveryResult = await discoveryService.discover({
      workspaceRoots: [expressFixture, honoFixture, fastifyFixture],
    });

    expect(discoveryResult.scannedFrameworks).toEqual(['express', 'hono', 'fastify']);
    expect(discoveryResult.routes).toHaveLength(25); // 7 Express + 7 Hono + 11 Fastify

    const treeProvider = new RouteTreeProvider();
    treeProvider.setRoutes(discoveryResult.routes);

    const rootItems = await treeProvider.getChildren();
    expect(rootItems).toHaveLength(3);

    const expressGroup = rootItems.find((i) => i.frameworkGroupKey === 'express');
    const honoGroup = rootItems.find((i) => i.frameworkGroupKey === 'hono');
    const fastifyGroup = rootItems.find((i) => i.frameworkGroupKey === 'fastify');

    expect(expressGroup!.label).toBe('Express (7)');
    expect(honoGroup!.label).toBe('Hono (7)');
    expect(fastifyGroup!.label).toBe('Fastify (11)');

    // Search filter across all three frameworks
    treeProvider.setSearchFilter('auth');
    const filteredRoot = await treeProvider.getChildren();
    expect(filteredRoot).toHaveLength(3);
    expect(filteredRoot.find((i) => i.frameworkGroupKey === 'express')!.label).toBe('Express (3)');
    expect(filteredRoot.find((i) => i.frameworkGroupKey === 'hono')!.label).toBe('Hono (3)');
    expect(filteredRoot.find((i) => i.frameworkGroupKey === 'fastify')!.label).toBe('Fastify (3)');

    // Clear search filter
    treeProvider.clearSearchFilter();
    const clearedRoot = await treeProvider.getChildren();
    expect(clearedRoot).toHaveLength(3);
    expect(clearedRoot.find((i) => i.frameworkGroupKey === 'fastify')!.label).toBe('Fastify (11)');
  });
});
