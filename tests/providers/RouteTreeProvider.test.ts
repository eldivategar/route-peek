import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('vscode', () => {
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

  class MockTreeItem {
    public label: string;
    public collapsibleState: number;
    public description?: string;
    public tooltip?: string;
    public iconPath?: unknown;
    public command?: unknown;
    constructor(label: string, collapsibleState = 0) {
      this.label = label;
      this.collapsibleState = collapsibleState;
    }
  }

  class MockThemeIcon {
    constructor(
      public id: string,
      public color?: unknown
    ) {}
  }

  class MockThemeColor {
    constructor(public id: string) {}
  }

  class MockRange {
    constructor(
      public startLine: number,
      public startCol: number,
      public endLine: number,
      public endCol: number
    ) {}
  }

  return {
    EventEmitter: MockEventEmitter,
    TreeItem: MockTreeItem,
    TreeItemCollapsibleState: {
      None: 0,
      Collapsed: 1,
      Expanded: 2,
    },
    ThemeIcon: MockThemeIcon,
    ThemeColor: MockThemeColor,
    Range: MockRange,
    Uri: {
      file: (p: string) => ({ fsPath: p }),
    },
  };
});

import { RouteTreeProvider } from '../../src/providers/RouteTreeProvider';
import { RouteTreeItem } from '../../src/providers/RouteTreeItem';
import { createRoute } from '../../src/models/Route';

describe('RouteTreeProvider', () => {
  let provider: RouteTreeProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new RouteTreeProvider();
  });

  it('getTreeItem returns the passed element', () => {
    const item = new RouteTreeItem('Test Route');
    expect(provider.getTreeItem(item)).toBe(item);
  });

  it('getChildren with root returns empty state item when no routes exist', async () => {
    const children = await provider.getChildren();

    expect(children).toHaveLength(1);
    expect(children[0].label).toBe('No routes discovered yet.');
    expect(children[0].description).toBe("Run 'Scan Workspace' to scan");
  });

  it('getChildren returns compact hierarchy: framework group -> route group -> endpoint -> method', async () => {
    const r1 = createRoute({
      method: 'GET',
      path: '/api/users',
      framework: 'express',
      source: { file: 'src/routes.ts', line: 10, column: 1 },
      confidence: 'high',
    });
    const r2 = createRoute({
      method: 'POST',
      path: '/api/users',
      framework: 'express',
      source: { file: 'src/routes.ts', line: 15, column: 1 },
      confidence: 'high',
    });
    const r3 = createRoute({
      method: 'GET',
      path: '/api/users/:id',
      framework: 'express',
      source: { file: 'src/routes.ts', line: 20, column: 1 },
      confidence: 'high',
    });

    provider.setRoutes([r1, r2, r3]);
    const rootChildren = await provider.getChildren();

    // Top level: Framework group
    expect(rootChildren).toHaveLength(1);
    expect(rootChildren[0].label).toBe('Express (3)');
    expect(rootChildren[0].collapsibleState).toBe(2); // Expanded

    // Middle level: Resource group under framework
    const groupItems = await provider.getChildren(rootChildren[0]);
    expect(groupItems).toHaveLength(1);
    expect(groupItems[0].label).toBe('/api/users (3)');
    expect(groupItems[0].contextValue).toBe('route-group');

    // Endpoint level under resource group: '/' (GET · POST) and '/:id' (GET)
    const endpointItems = await provider.getChildren(groupItems[0]);
    expect(endpointItems).toHaveLength(2);

    // Multi-method endpoint '/'
    expect(endpointItems[0].label).toBe('/');
    expect(endpointItems[0].description).toBe('GET · POST');
    expect(endpointItems[0].contextValue).toBe('endpoint');
    expect(endpointItems[0].collapsibleState).toBe(1); // Collapsed by default

    // Single-method endpoint '/:id'
    expect(endpointItems[1].label).toBe('/:id');
    expect(endpointItems[1].description).toBe('GET');
    expect(endpointItems[1].contextValue).toBe('route');
    expect(endpointItems[1].collapsibleState).toBe(0); // Leaf node
    expect(endpointItems[1].route).toBe(r3);

    // Expanding multi-method endpoint returns method children
    const methodItems = await provider.getChildren(endpointItems[0]);
    expect(methodItems).toHaveLength(2);
    expect(methodItems[0].label).toBe('GET');
    expect(methodItems[0].description).toBe('src/routes.ts:10');
    expect(methodItems[0].route).toBe(r1);

    expect(methodItems[1].label).toBe('POST');
    expect(methodItems[1].description).toBe('src/routes.ts:15');
    expect(methodItems[1].route).toBe(r2);
  });

  it('lifts single route directly to framework level under Case A to avoid unnecessary nesting', async () => {
    const singleRoute = createRoute({
      method: 'GET',
      path: '/api/ping',
      framework: 'express',
      source: { file: 'src/routes.ts', line: 5, column: 1 },
    });

    provider.setRoutes([singleRoute]);
    const rootChildren = await provider.getChildren();
    expect(rootChildren).toHaveLength(1);

    const items = await provider.getChildren(rootChildren[0]);
    expect(items).toHaveLength(1);
    expect(items[0].label).toBe('/api/ping');
    expect(items[0].description).toBe('GET');
    expect(items[0].contextValue).toBe('route');
    expect(items[0].collapsibleState).toBe(0); // Leaf node
    expect(items[0].route).toBe(singleRoute);
  });

  it('renders scanning state correctly', async () => {
    provider.setState('scanning');
    const children = await provider.getChildren();

    expect(children).toHaveLength(1);
    expect(children[0].label).toBe('Scanning workspace...');
    expect(children[0].description).toBe('Please wait');
  });

  it('renders empty scanned state correctly', async () => {
    provider.setRoutes([]);
    expect(provider.getState()).toBe('empty');

    const children = await provider.getChildren();
    expect(children).toHaveLength(1);
    expect(children[0].label).toBe('No routes found in this workspace.');
  });

  it('renders error state correctly', async () => {
    provider.setState('error', 'Syntax error in file');
    const children = await provider.getChildren();

    expect(children).toHaveLength(1);
    expect(children[0].label).toBe('Failed to scan workspace.');
    expect(children[0].description).toBe('Syntax error in file');
  });

  it('renders dynamic routes with warning ThemeIcon without emoji in label, and normal routes with symbol-method', async () => {
    const normalRoute = createRoute({
      method: 'GET',
      path: '/api/users',
      framework: 'express',
      source: { file: 'src/users.ts', line: 5, column: 1 },
      confidence: 'high',
    });
    const dynamicRoute = createRoute({
      method: 'GET',
      path: '/api/users/<dynamic>',
      framework: 'express',
      source: { file: 'src/routes.ts', line: 15, column: 1 },
      confidence: 'low',
    });

    provider.setRoutes([normalRoute, dynamicRoute]);
    const rootChildren = await provider.getChildren();
    const groupItems = await provider.getChildren(rootChildren[0]);

    // Both routes belong to /api/users
    expect(groupItems).toHaveLength(1);
    expect(groupItems[0].label).toBe('/api/users (2)');

    const endpointItems = await provider.getChildren(groupItems[0]);
    expect(endpointItems).toHaveLength(2);

    // Normal endpoint item: label is relative path '/', description is method
    expect(endpointItems[0].label).toBe('/');
    expect(endpointItems[0].description).toBe('GET');
    expect(endpointItems[0].label).not.toContain('⚠');
    expect((endpointItems[0].iconPath as { id: string }).id).toBe('symbol-method');

    // Dynamic endpoint item: label is relative path '/<dynamic>'
    expect(endpointItems[1].label).toBe('/<dynamic>');
    expect(endpointItems[1].description).toBe('GET');
    expect(endpointItems[1].label).not.toContain('⚠');
    expect((endpointItems[1].iconPath as { id: string }).id).toBe('warning');
    expect(endpointItems[1].tooltip).toContain('Low confidence');
    expect(endpointItems[1].tooltip).toContain('could not be statically resolved');
    expect(endpointItems[1].tooltip).toContain('src/routes.ts:15');
  });

  it('collapses route groups with more than 2 routes, and auto-expands on search filter', async () => {
    const routes = [
      createRoute({
        method: 'GET',
        path: '/api/users',
        framework: 'express',
        source: { file: 'src/users.ts', line: 1, column: 1 },
      }),
      createRoute({
        method: 'POST',
        path: '/api/users',
        framework: 'express',
        source: { file: 'src/users.ts', line: 2, column: 1 },
      }),
      createRoute({
        method: 'DELETE',
        path: '/api/users/:id',
        framework: 'express',
        source: { file: 'src/users.ts', line: 3, column: 1 },
      }),
    ];

    provider.setRoutes(routes);
    const rootChildren = await provider.getChildren();
    const groupItems = await provider.getChildren(rootChildren[0]);

    expect(groupItems).toHaveLength(1);
    expect(groupItems[0].label).toBe('/api/users (3)');
    // 3 routes > 2 -> Collapsed (state 1) by default
    expect(groupItems[0].collapsibleState).toBe(1);

    // When search is active, it auto-expands (state 2)
    provider.setSearchFilter('users');
    const filteredRoot = await provider.getChildren();
    const filteredGroups = await provider.getChildren(filteredRoot[0]);
    expect(filteredGroups[0].collapsibleState).toBe(2);
  });

  it('applies and clears in-memory search filtering with dynamic count updates', async () => {
    const r1 = createRoute({
      method: 'GET',
      path: '/api/users',
      framework: 'express',
      source: { file: 'src/users.ts', line: 1, column: 1 },
      confidence: 'high',
    });
    const r2 = createRoute({
      method: 'GET',
      path: '/api/users/:id',
      framework: 'express',
      source: { file: 'src/users.ts', line: 2, column: 1 },
      confidence: 'high',
    });
    const r3 = createRoute({
      method: 'POST',
      path: '/api/auth/login',
      framework: 'express',
      source: { file: 'src/auth.ts', line: 5, column: 1 },
      confidence: 'high',
    });
    const r4 = createRoute({
      method: 'POST',
      path: '/api/auth/register',
      framework: 'express',
      source: { file: 'src/auth.ts', line: 6, column: 1 },
      confidence: 'high',
    });

    provider.setRoutes([r1, r2, r3, r4]);

    // Search for "users"
    provider.setSearchFilter('users');
    expect(provider.getActiveSearchQuery()).toBe('users');

    let rootChildren = await provider.getChildren();
    expect(rootChildren[0].label).toBe('Express (2)');
    let groupItems = await provider.getChildren(rootChildren[0]);
    expect(groupItems).toHaveLength(1);
    expect(groupItems[0].label).toBe('/api/users (2)');
    const endpointItems = await provider.getChildren(groupItems[0]);
    expect(endpointItems).toHaveLength(2);
    expect(endpointItems[0].label).toBe('/');
    expect(endpointItems[0].description).toBe('GET');
    expect(endpointItems[1].label).toBe('/:id');
    expect(endpointItems[1].description).toBe('GET');

    // Search with no matches
    provider.setSearchFilter('orders');
    rootChildren = await provider.getChildren();
    expect(rootChildren[0].label).toBe("No routes matching 'orders'.");

    // Clear search
    provider.clearSearchFilter();
    rootChildren = await provider.getChildren();
    expect(rootChildren[0].label).toBe('Express (4)');
    groupItems = await provider.getChildren(rootChildren[0]);
    expect(groupItems).toHaveLength(2);
    expect(groupItems.map((g) => g.label)).toEqual(['/api/auth (2)', '/api/users (2)']);
  });

  it('refresh fires onDidChangeTreeData event', () => {
    const listener = vi.fn();
    provider.onDidChangeTreeData(listener);

    provider.refresh();

    expect(listener).toHaveBeenCalledTimes(1);
  });
});
