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
    window: {
      showInformationMessage: vi.fn(),
      showTextDocument: vi.fn(),
    },
    workspace: {
      openTextDocument: vi.fn(),
    },
    Range: class MockRange {
      constructor(
        public startLine: number,
        public startCol: number,
        public endLine: number,
        public endCol: number
      ) {}
    },
    Selection: class MockSelection {
      constructor(
        public startLine: number,
        public startCol: number,
        public endLine: number,
        public endCol: number
      ) {}
    },
    TextEditorRevealType: {
      InCenter: 2,
    },
  };
});

import { FastifyScanner } from '../../src/scanners/fastify/FastifyScanner';
import { FastifyFrameworkDetector } from '../../src/scanners/fastify/FastifyFrameworkDetector';
import { ExpressScanner } from '../../src/scanners/express/ExpressScanner';
import { ExpressFrameworkDetector } from '../../src/scanners/express/ExpressFrameworkDetector';
import { HonoScanner } from '../../src/scanners/hono/HonoScanner';
import { HonoFrameworkDetector } from '../../src/scanners/hono/HonoFrameworkDetector';
import { CompositeFrameworkDetector } from '../../src/scanners/CompositeFrameworkDetector';
import { ScannerRegistry } from '../../src/services/ScannerRegistry';
import { RouteDiscoveryService } from '../../src/services/RouteDiscoveryService';
import { WorkspaceScanService } from '../../src/services/WorkspaceScanService';
import { RouteTreeProvider } from '../../src/providers/RouteTreeProvider';
import { RouteTreeItem } from '../../src/providers/RouteTreeItem';

describe('Fastify Extension Host Manual Verification Suite', () => {
  const realisticRoot = path.resolve(__dirname, '../fixtures/fastify/realistic-project');
  const dynamicRoot = path.resolve(__dirname, '../fixtures/fastify/dynamic');
  const expressRoot = path.resolve(__dirname, '../fixtures/express/realistic-project');
  const honoRoot = path.resolve(__dirname, '../fixtures/hono/realistic-project');

  it('verifies full Extension Host lifecycle on Fastify realistic-project', async () => {
    // 1. Setup Services & Tree Provider
    const detector = new FastifyFrameworkDetector();
    const registry = new ScannerRegistry();
    registry.register(new FastifyScanner());

    const discoveryService = new RouteDiscoveryService(detector, registry);
    const scanService = new WorkspaceScanService(discoveryService);
    const treeProvider = new RouteTreeProvider();

    // 2. Scan Workspace
    const scanResult = await scanService.scan([realisticRoot]);
    expect(scanResult.routes).toHaveLength(11);

    treeProvider.setRoutes(scanResult.routes);
    expect(treeProvider.getState()).toBe('success');

    // 3. Fastify framework group appears
    const rootItems = await treeProvider.getChildren();
    expect(rootItems).toHaveLength(1);
    const fastifyGroup = rootItems[0];
    expect(fastifyGroup.label).toBe('Fastify (11)');
    expect(fastifyGroup.frameworkGroupKey).toBe('fastify');

    // 4. Route groups and lifted endpoints appear with correct resource prefixes
    const routeGroups = await treeProvider.getChildren(fastifyGroup);
    // Groups: /health (lifted endpoint), /api/auth, /api/items, /api/users
    expect(routeGroups).toHaveLength(4);
    const groupLabels = routeGroups.map((g) => g.label);
    expect(groupLabels).toContain('/health');
    expect(groupLabels).toContain('/api/auth (3)');
    expect(groupLabels).toContain('/api/items (3)');
    expect(groupLabels).toContain('/api/users (4)');

    // 5. Nested register/prefix produces correct effective paths
    const authGroup = routeGroups.find((g) => g.label === '/api/auth (3)')!;
    const authRoutes = await treeProvider.getChildren(authGroup);
    expect(authRoutes).toHaveLength(3);
    const authPaths = authRoutes.map((r) => `${r.route!.method} ${r.route!.path}`);
    expect(authPaths).toContain('POST /api/auth/login');
    expect(authPaths).toContain('POST /api/auth/register');
    expect(authPaths).toContain('GET /api/auth/profile');

    // 6. Object-style routes appear (items: GET /, POST /:id, PUT /:id)
    const itemsGroup = routeGroups.find((g) => g.label === '/api/items (3)')!;
    const itemEndpoints = await treeProvider.getChildren(itemsGroup);
    expect(itemEndpoints).toHaveLength(2); // '/' (GET), '/:id' (POST · PUT)
    const epSlash = itemEndpoints.find((e) => e.label === '/');
    const epParam = itemEndpoints.find((e) => e.label === '/:id');
    expect(epSlash).toBeDefined();
    expect(epSlash!.description).toBe('GET');
    expect(epParam).toBeDefined();
    expect(epParam!.description).toBe('POST · PUT');

    const paramMethods = await treeProvider.getChildren(epParam!);
    expect(paramMethods).toHaveLength(2);
    const itemMethods = [epSlash!.route!.method, ...paramMethods.map((r) => r.route!.method)];
    expect(itemMethods).toContain('GET');
    expect(itemMethods).toContain('POST');
    expect(itemMethods).toContain('PUT');
    for (const r of [epSlash!, ...paramMethods]) {
      expect(r.route!.source.file).toBe('src/routes/items.ts');
    }

    // 7. Cross-file plugin routes resolve to their individual source files
    const usersGroup = routeGroups.find((g) => g.label === '/api/users (4)')!;
    const userEndpoints = await treeProvider.getChildren(usersGroup);
    expect(userEndpoints).toHaveLength(2); // '/' (GET · POST), '/:id' (GET · DELETE)
    const userMethodItems: RouteTreeItem[] = [];
    for (const ep of userEndpoints) {
      const methods = await treeProvider.getChildren(ep);
      userMethodItems.push(...methods);
    }
    expect(userMethodItems).toHaveLength(4);
    for (const r of userMethodItems) {
      expect(r.route!.source.file).toBe('src/routes/users.ts');
    }

    // 8. Click route provides openRouteSource command with exact file, line, column
    const sampleRoute = authRoutes.find((r) => r.route!.path === '/api/auth/login')!;
    expect(sampleRoute.command).toEqual({
      command: 'routePeek.openRouteSource',
      title: 'Open Route Source',
      arguments: [sampleRoute.route],
    });
    expect(sampleRoute.route!.source.file).toBe('src/routes/auth.ts');
    expect(sampleRoute.route!.source.line).toBe(4);
    expect(sampleRoute.route!.source.column).toBe(11);

    // 9. Route details format is complete
    expect(sampleRoute.route!.id).toBe('fastify:POST:/api/auth/login:src/routes/auth.ts:4');
    expect(sampleRoute.route!.confidence).toBe('high');

    // 10. Search Fastify route works
    treeProvider.setSearchFilter('login');
    const searchRoot = await treeProvider.getChildren();
    expect(searchRoot).toHaveLength(1);
    expect(searchRoot[0].label).toBe('Fastify (1)');

    const searchGroups = await treeProvider.getChildren(searchRoot[0]);
    expect(searchGroups).toHaveLength(1);
    expect(searchGroups[0].label).toBe('/api/auth (1)');

    const searchItems = await treeProvider.getChildren(searchGroups[0]);
    expect(searchItems).toHaveLength(1);
    expect(searchItems[0].route!.path).toBe('/api/auth/login');

    // 11. Clear search restores all routes
    treeProvider.clearSearchFilter();
    const restoredRoot = await treeProvider.getChildren();
    expect(restoredRoot[0].label).toBe('Fastify (11)');
    const restoredGroups = await treeProvider.getChildren(restoredRoot[0]);
    expect(restoredGroups).toHaveLength(4);
  });

  it('verifies native warning icon and tooltip on dynamic route', async () => {
    const scanner = new FastifyScanner();
    const result = await scanner.scan({ workspaceRoots: [dynamicRoot] });
    expect(result.routes).toHaveLength(2);

    const dynamicRoute = result.routes.find((r) => r.path === '/<dynamic>')!;
    expect(dynamicRoute.confidence).toBe('low');

    const treeItem = RouteTreeItem.fromRoute(dynamicRoute);
    expect(treeItem.iconPath).toBeDefined();
    expect((treeItem.iconPath as { id: string }).id).toBe('warning');
    expect(treeItem.tooltip).toContain('could not be statically resolved');
    expect(treeItem.tooltip).toContain('Low confidence');
  });

  it('verifies mixed Express + Hono + Fastify workspace coexistence without interference', async () => {
    const compositeDetector = new CompositeFrameworkDetector([
      new ExpressFrameworkDetector(),
      new HonoFrameworkDetector(),
      new FastifyFrameworkDetector(),
    ]);

    const registry = new ScannerRegistry();
    registry.register(new ExpressScanner());
    registry.register(new HonoScanner());
    registry.register(new FastifyScanner());

    const discoveryService = new RouteDiscoveryService(compositeDetector, registry);
    const discoveryResult = await discoveryService.discover({
      workspaceRoots: [expressRoot, honoRoot, realisticRoot],
    });

    expect(discoveryResult.scannedFrameworks).toEqual(['express', 'hono', 'fastify']);
    expect(discoveryResult.routes).toHaveLength(25);

    const treeProvider = new RouteTreeProvider();
    treeProvider.setRoutes(discoveryResult.routes);

    const rootItems = await treeProvider.getChildren();
    expect(rootItems).toHaveLength(3);

    const expressGroup = rootItems.find((i) => i.frameworkGroupKey === 'express')!;
    const honoGroup = rootItems.find((i) => i.frameworkGroupKey === 'hono')!;
    const fastifyGroup = rootItems.find((i) => i.frameworkGroupKey === 'fastify')!;

    expect(expressGroup.label).toBe('Express (7)');
    expect(honoGroup.label).toBe('Hono (7)');
    expect(fastifyGroup.label).toBe('Fastify (11)');

    // Search filter across all three frameworks for Fastify-specific route
    treeProvider.setSearchFilter('items');
    const filteredRoot = await treeProvider.getChildren();
    expect(filteredRoot).toHaveLength(1); // Only Fastify has /items
    expect(filteredRoot[0].frameworkGroupKey).toBe('fastify');
    expect(filteredRoot[0].label).toBe('Fastify (3)');

    // Search filter across all three frameworks for route existing in all 3
    treeProvider.setSearchFilter('register');
    const registerRoot = await treeProvider.getChildren();
    expect(registerRoot).toHaveLength(3);
    expect(registerRoot.find((i) => i.frameworkGroupKey === 'express')!.label).toBe('Express (1)');
    expect(registerRoot.find((i) => i.frameworkGroupKey === 'hono')!.label).toBe('Hono (1)');
    expect(registerRoot.find((i) => i.frameworkGroupKey === 'fastify')!.label).toBe('Fastify (1)');

    treeProvider.clearSearchFilter();
    const restored = await treeProvider.getChildren();
    expect(restored).toHaveLength(3);
  });
});
