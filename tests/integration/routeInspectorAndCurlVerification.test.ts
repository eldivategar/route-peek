import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockShowInformationMessage = vi.fn();
const mockShowErrorMessage = vi.fn();
const mockShowQuickPick = vi.fn();
const mockShowTextDocument = vi.fn();
const mockOpenTextDocument = vi.fn();
const mockClipboardWriteText = vi.fn();
const mockGetConfiguration = vi.fn();

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
    public event = vi.fn();
    public fire = vi.fn();
  }

  return {
    window: {
      showInformationMessage: (...args: unknown[]) => mockShowInformationMessage(...args),
      showErrorMessage: (...args: unknown[]) => mockShowErrorMessage(...args),
      showQuickPick: (...args: unknown[]) => mockShowQuickPick(...args),
      showTextDocument: (...args: unknown[]) => mockShowTextDocument(...args),
    },
    workspace: {
      workspaceFolders: [{ uri: { fsPath: '/mock/workspace' } }],
      openTextDocument: (...args: unknown[]) => mockOpenTextDocument(...args),
      getConfiguration: (...args: unknown[]) => mockGetConfiguration(...args),
    },
    EventEmitter: MockEventEmitter,
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
    env: {
      clipboard: {
        writeText: (...args: unknown[]) => mockClipboardWriteText(...args),
      },
    },
    commands: {
      executeCommand: vi.fn(),
    },
  };
});

import { RouteTreeProvider } from '../../src/providers/RouteTreeProvider';
import { RouteTreeItem } from '../../src/providers/RouteTreeItem';
import { createCopyCurlCommand } from '../../src/commands/copyCurl';
import { createCopyRouteCommand } from '../../src/commands/copyRoute';
import { createShowRouteDetailsCommand } from '../../src/commands/showRouteDetails';
import { createOpenRouteSourceCommand } from '../../src/commands/openRouteSource';
import { Route } from '../../src/models/Route';
import * as vscode from 'vscode';

describe('Route Inspector + Copy cURL Extension Host Verification', () => {
  let treeProvider: RouteTreeProvider;
  let mockOutputChannel: { appendLine: ReturnType<typeof vi.fn> };
  let copyCurlCommand: (routeOrItem?: Route | RouteTreeItem) => Promise<void>;
  let copyRouteCommand: (routeOrItem?: Route | RouteTreeItem) => Promise<void>;
  let openSourceCommand: (routeOrItem?: Route | RouteTreeItem) => Promise<void>;
  let showDetailsCommand: (routeOrItem?: Route | RouteTreeItem) => Promise<void>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetConfiguration.mockReturnValue({
      get: vi.fn((key: string, defaultVal?: unknown) => defaultVal),
    });
    mockOutputChannel = {
      appendLine: vi.fn(),
    };
    treeProvider = new RouteTreeProvider();

    openSourceCommand = createOpenRouteSourceCommand(mockOutputChannel as unknown as vscode.OutputChannel);
    copyRouteCommand = createCopyRouteCommand(treeProvider, mockOutputChannel as unknown as vscode.OutputChannel);
    copyCurlCommand = createCopyCurlCommand(treeProvider, mockOutputChannel as unknown as vscode.OutputChannel);
    showDetailsCommand = createShowRouteDetailsCommand(
      treeProvider,
      openSourceCommand,
      copyRouteCommand,
      copyCurlCommand,
      mockOutputChannel as unknown as vscode.OutputChannel
    );
  });

  it('verifies single-route endpoint inspection, cURL generation, and context isolation', async () => {
    const singleRoute: Route = {
      id: 'fiber:get:/users/:id:routes.go:10',
      method: 'GET',
      path: '/users/:id',
      framework: 'fiber',
      confidence: 'high',
      source: { file: 'routes.go', line: 10, column: 2 },
    };

    treeProvider.setRoutes([singleRoute]);

    // Root items: framework node
    const frameworkItems = await treeProvider.getChildren();
    expect(frameworkItems).toHaveLength(1);
    expect(frameworkItems[0].contextValue).toBe('framework-group');

    // Children under framework node: resource group
    const resourceItems = await treeProvider.getChildren(frameworkItems[0]);
    expect(resourceItems).toHaveLength(1);
    expect(resourceItems[0].contextValue).toBe('route-group');

    // Children under resource group: single endpoint node
    const endpointItems = await treeProvider.getChildren(resourceItems[0]);
    expect(endpointItems).toHaveLength(1);
    const usersEndpointItem = endpointItems[0];

    // Verify single-method endpoint has contextValue 'route' and attaches canonical Route
    expect(usersEndpointItem.contextValue).toBe('route');
    expect(usersEndpointItem.route).toBeDefined();
    expect(usersEndpointItem.route!.method).toBe('GET');
    expect(usersEndpointItem.route!.path).toBe('/users/:id');

    // 1. Test Copy cURL on single-method endpoint
    await copyCurlCommand(usersEndpointItem);
    expect(mockClipboardWriteText).toHaveBeenCalledWith('curl -X GET "http://localhost:3000/users/:id"');
    expect(mockShowInformationMessage).toHaveBeenCalledWith('Route Peek: Copied cURL command to clipboard.');

    // 2. Test Inspect Route (Show Route Details) on single-method endpoint
    mockShowInformationMessage.mockResolvedValueOnce(undefined);
    await showDetailsCommand(usersEndpointItem);

    expect(mockShowInformationMessage).toHaveBeenCalledWith(
      expect.stringContaining('GET /users/:id\nFramework: fiber\nConfidence: high\nSource: routes.go:10:2\nRoute ID: fiber:get:/users/:id:routes.go:10'),
      'Open Source',
      'Copy Route',
      'Copy cURL'
    );

    // 3. Test clicking 'Copy cURL' button inside Route Inspector
    mockShowInformationMessage.mockResolvedValueOnce('Copy cURL');
    mockClipboardWriteText.mockClear();
    await showDetailsCommand(usersEndpointItem);

    expect(mockClipboardWriteText).toHaveBeenCalledWith('curl -X GET "http://localhost:3000/users/:id"');

    // 4. Test clicking 'Copy Route' button inside Route Inspector
    mockShowInformationMessage.mockResolvedValueOnce('Copy Route');
    mockClipboardWriteText.mockClear();
    await showDetailsCommand(usersEndpointItem);

    expect(mockClipboardWriteText).toHaveBeenCalledWith('GET /users/:id');
  });

  it('verifies multi-method endpoint parents remain presentation-only and method children produce independent cURL commands', async () => {
    const rGet: Route = {
      id: 'fiber:get:/api/items/:id:items.go:10',
      method: 'GET',
      path: '/api/items/:id',
      framework: 'fiber',
      confidence: 'high',
      source: { file: 'items.go', line: 10, column: 2 },
    };
    const rPut: Route = {
      id: 'fiber:put:/api/items/:id:items.go:15',
      method: 'PUT',
      path: '/api/items/:id',
      framework: 'fiber',
      confidence: 'high',
      source: { file: 'items.go', line: 15, column: 2 },
    };
    const rDelete: Route = {
      id: 'fiber:delete:/api/items/:id:items.go:20',
      method: 'DELETE',
      path: '/api/items/:id',
      framework: 'fiber',
      confidence: 'high',
      source: { file: 'items.go', line: 20, column: 2 },
    };

    treeProvider.setRoutes([rGet, rPut, rDelete]);

    const frameworkItems = await treeProvider.getChildren();
    const resourceItems = await treeProvider.getChildren(frameworkItems[0]);
    const endpointItems = await treeProvider.getChildren(resourceItems[0]);

    // Parent endpoint node for /api/items/:id has 3 methods
    const multiMethodItem = endpointItems[0];
    expect(multiMethodItem).toBeDefined();

    // CRITICAL: Parent multi-method node has contextValue 'endpoint' and NO route property!
    expect(multiMethodItem.contextValue).toBe('endpoint');
    expect(multiMethodItem.route).toBeUndefined();

    // Expand parent to get method children
    const methodChildren = await treeProvider.getChildren(multiMethodItem);
    expect(methodChildren.length).toBe(3);

    const getChild = methodChildren.find((c) => c.label === 'GET');
    const putChild = methodChildren.find((c) => c.label === 'PUT');
    const deleteChild = methodChildren.find((c) => c.label === 'DELETE');

    expect(getChild).toBeDefined();
    expect(putChild).toBeDefined();
    expect(deleteChild).toBeDefined();

    // Each child has contextValue 'route'
    expect(getChild!.contextValue).toBe('route');
    expect(putChild!.contextValue).toBe('route');
    expect(deleteChild!.contextValue).toBe('route');

    // Generate cURL for GET child
    await copyCurlCommand(getChild);
    expect(mockClipboardWriteText).toHaveBeenCalledWith('curl -X GET "http://localhost:3000/api/items/:id"');

    // Generate cURL for PUT child
    await copyCurlCommand(putChild);
    expect(mockClipboardWriteText).toHaveBeenCalledWith('curl -X PUT "http://localhost:3000/api/items/:id"');

    // Generate cURL for DELETE child
    await copyCurlCommand(deleteChild);
    expect(mockClipboardWriteText).toHaveBeenCalledWith('curl -X DELETE "http://localhost:3000/api/items/:id"');

    // Inspect PUT child
    mockShowInformationMessage.mockResolvedValueOnce(undefined);
    await showDetailsCommand(putChild);
    expect(mockShowInformationMessage).toHaveBeenCalledWith(
      expect.stringContaining('PUT /api/items/:id\nFramework: fiber\nConfidence: high\nSource: items.go:15:2\nRoute ID: fiber:put:/api/items/:id:items.go:15'),
      'Open Source',
      'Copy Route',
      'Copy cURL'
    );
  });


  it('verifies dynamic route warning in Inspector and verbatim preservation in cURL', async () => {
    const dynamicRoute: Route = {
      id: 'fiber:get:/api/v1/<dynamic>:server.go:42',
      method: 'GET',
      path: '/api/v1/<dynamic>',
      framework: 'fiber',
      confidence: 'low',
      source: { file: 'server.go', line: 42, column: 3 },
    };

    treeProvider.setRoutes([dynamicRoute]);

    // Inspect dynamic route
    mockShowInformationMessage.mockResolvedValueOnce(undefined);
    await showDetailsCommand(dynamicRoute);

    expect(mockShowInformationMessage).toHaveBeenCalledWith(
      expect.stringContaining('Warning: Path contains a dynamically resolved segment. The actual runtime value could not be determined statically.'),
      'Open Source',
      'Copy Route',
      'Copy cURL'
    );

    // Copy cURL on dynamic route
    await copyCurlCommand(dynamicRoute);
    expect(mockClipboardWriteText).toHaveBeenCalledWith('curl -X GET "http://localhost:3000/api/v1/<dynamic>"');
  });

  it('respects custom baseUrl from routePeek configuration', async () => {
    mockGetConfiguration.mockReturnValue({
      get: vi.fn((key: string) => (key === 'baseUrl' ? 'https://staging.internal.net/api/v1/' : undefined)),
    });

    const route: Route = {
      id: 'express:get:/health:app.ts:10',
      method: 'GET',
      path: '/health',
      framework: 'express',
      confidence: 'high',
      source: { file: 'app.ts', line: 10, column: 1 },
    };

    treeProvider.setRoutes([route]);

    await copyCurlCommand(route);

    expect(mockClipboardWriteText).toHaveBeenCalledWith(
      'curl -X GET "https://staging.internal.net/api/v1/health"'
    );
  });
});
