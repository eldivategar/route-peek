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
import { RouteTreeProvider } from '../../src/providers/RouteTreeProvider';
import { RouteTreeItem } from '../../src/providers/RouteTreeItem';

describe('Realistic Project UX Integration', () => {
  const fixturePath = path.resolve(__dirname, '../fixtures/express/realistic-project');

  it('scans realistic project, constructs Route Tree items with framework grouping and navigation commands', async () => {
    const scanner = new ExpressScanner();
    const canHandle = await scanner.canHandle({ workspaceRoots: [fixturePath] });
    expect(canHandle).toBe(true);

    const result = await scanner.scan({ workspaceRoots: [fixturePath] });
    const routes = result.routes;
    expect(routes).toHaveLength(7);

    const treeProvider = new RouteTreeProvider();
    treeProvider.setRoutes(routes);
    expect(treeProvider.getState()).toBe('success');

    // Root level should contain framework group item
    const rootItems = await treeProvider.getChildren();
    expect(rootItems).toHaveLength(1);

    const frameworkItem = rootItems[0];
    expect(frameworkItem.label).toBe('Express (7)');
    expect(frameworkItem.frameworkGroupKey).toBe('express');
    expect(frameworkItem.contextValue).toBe('framework-group');

    // Expanding framework group returns 2 route groups: /api/auth (3) and /api/users (4)
    const routeGroups = await treeProvider.getChildren(frameworkItem);
    expect(routeGroups).toHaveLength(2);
    expect(routeGroups[0].label).toBe('/api/auth (3)');
    expect(routeGroups[0].contextValue).toBe('route-group');
    expect(routeGroups[1].label).toBe('/api/users (4)');
    expect(routeGroups[1].contextValue).toBe('route-group');

    // Expanding route groups returns endpoint items
    const authEndpoints = await treeProvider.getChildren(routeGroups[0]);
    const userEndpoints = await treeProvider.getChildren(routeGroups[1]);
    expect(authEndpoints).toHaveLength(3); // /login, /profile, /register (single-method)
    expect(userEndpoints).toHaveLength(2); // / (GET · POST), /:id (GET · DELETE)

    // Verify user endpoints have merged methods
    expect(userEndpoints[0].label).toBe('/');
    expect(userEndpoints[0].description).toBe('GET · POST');
    expect(userEndpoints[0].contextValue).toBe('endpoint');
    expect(userEndpoints[1].label).toBe('/:id');
    expect(userEndpoints[1].description).toBe('GET · DELETE');
    expect(userEndpoints[1].contextValue).toBe('endpoint');

    // Expanding multi-method endpoints yields individual method items
    const userMethodItems: RouteTreeItem[] = [];
    for (const ep of userEndpoints) {
      const methods = await treeProvider.getChildren(ep);
      userMethodItems.push(...methods);
    }
    expect(userMethodItems).toHaveLength(4);

    // Collect all leaf route-backed items (auth single-method endpoints + user method items)
    const allLeafRouteItems = [...authEndpoints, ...userMethodItems];
    expect(allLeafRouteItems).toHaveLength(7);

    // Verify single-method endpoints have method description and wired openRouteSource
    for (const item of authEndpoints) {
      expect(item).toBeInstanceOf(RouteTreeItem);
      expect(item.route).toBeDefined();
      expect(item.contextValue).toBe('route');
      expect(['GET', 'POST']).toContain(item.description);
      expect((item.iconPath as { id: string }).id).toBe('symbol-method');
      expect(item.command).toEqual({
        command: 'routePeek.openRouteSource',
        title: 'Open Route Source',
        arguments: [item.route],
      });
      expect(item.tooltip).toContain(item.route!.path);
      expect(item.tooltip).toContain('src/routes/auth.ts');
    }

    // Verify expanded method nodes have source location description and wired openRouteSource
    for (const item of userMethodItems) {
      expect(item).toBeInstanceOf(RouteTreeItem);
      expect(item.route).toBeDefined();
      expect(item.contextValue).toBe('route');
      expect((item.iconPath as { id: string }).id).toBe('symbol-method');
      expect(item.command).toEqual({
        command: 'routePeek.openRouteSource',
        title: 'Open Route Source',
        arguments: [item.route],
      });
      expect(item.tooltip).toContain(item.route!.path);
      expect(item.description).toMatch(/^src\/routes\/users\.ts:\d+$/);
    }

    // Test Search filtering in realistic project
    treeProvider.setSearchFilter('auth');
    expect(treeProvider.getFilteredRoutes()).toHaveLength(3);

    const filteredRoot = await treeProvider.getChildren();
    expect(filteredRoot).toHaveLength(1);
    expect(filteredRoot[0].label).toBe('Express (3)');

    const filteredRouteGroups = await treeProvider.getChildren(filteredRoot[0]);
    expect(filteredRouteGroups).toHaveLength(1);
    expect(filteredRouteGroups[0].label).toBe('/api/auth (3)');

    const filteredRouteItems = await treeProvider.getChildren(filteredRouteGroups[0]);
    expect(filteredRouteItems).toHaveLength(3);
    for (const item of filteredRouteItems) {
      expect(item.route!.path).toContain('/auth');
    }

    // Clear search
    treeProvider.clearSearchFilter();
    expect(treeProvider.getFilteredRoutes()).toHaveLength(7);
  });
});
