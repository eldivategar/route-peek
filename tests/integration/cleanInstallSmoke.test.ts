import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execSync } from 'child_process';
import Module from 'module';
import { Route } from '../../src/models/Route';

const mockShowInformationMessage = vi.fn();
const mockShowErrorMessage = vi.fn();
const mockShowQuickPick = vi.fn();
const mockShowTextDocument = vi.fn();
const mockOpenTextDocument = vi.fn().mockResolvedValue({ uri: { fsPath: 'mockDoc' } });
const mockClipboardWriteText = vi.fn().mockResolvedValue(undefined);
const mockGetConfiguration = vi.fn();
const mockOutputChannel = {
  appendLine: vi.fn(),
  dispose: vi.fn(),
};

interface TreeDataProviderLike {
  getChildren(element?: unknown): Promise<TestTreeItem[]>;
}

interface TestTreeItem {
  label?: string;
  resourcePrefix?: string;
  endpointPath?: string;
  route?: Route;
}

type CommandHandler = (...args: unknown[]) => Promise<unknown> | unknown;
type ModuleLoadFn = (request: string, parent: unknown, isMain: boolean) => unknown;

let capturedTreeDataProvider: TreeDataProviderLike | null = null;
const registeredCommands = new Map<string, CommandHandler>();

vi.mock('vscode', () => {
  class MockTreeItem {
    public description?: string;
    public tooltip?: string;
    public iconPath?: unknown;
    public command?: unknown;
    public contextValue?: string;
    constructor(
      public label: string,
      public collapsibleState = 0
    ) {}
  }

  class MockThemeIcon {
    constructor(public id: string) {}
  }

  class MockThemeColor {
    constructor(public id: string) {}
  }

  class MockEventEmitter {
    public event = vi.fn();
    public fire = vi.fn();
  }

  class MockPosition {
    constructor(public line: number, public character: number) {}
  }

  class MockRange {
    constructor(public start: MockPosition, public end: MockPosition) {}
  }

  return {
    window: {
      createOutputChannel: vi.fn(() => mockOutputChannel),
      createTreeView: vi.fn((_id: string, options: { treeDataProvider: TreeDataProviderLike }) => {
        capturedTreeDataProvider = options.treeDataProvider;
        return {
          dispose: vi.fn(),
        };
      }),
      showInformationMessage: (...args: unknown[]) => mockShowInformationMessage(...args),
      showErrorMessage: (...args: unknown[]) => mockShowErrorMessage(...args),
      showQuickPick: (...args: unknown[]) => mockShowQuickPick(...args),
      showTextDocument: (...args: unknown[]) => mockShowTextDocument(...args),
    },
    workspace: {
      workspaceFolders: [],
      openTextDocument: (...args: unknown[]) => mockOpenTextDocument(...args),
      getConfiguration: (...args: unknown[]) => mockGetConfiguration(...args),
    },
    commands: {
      registerCommand: (name: string, handler: CommandHandler) => {
        registeredCommands.set(name, handler);
        return { dispose: () => registeredCommands.delete(name) };
      },
      executeCommand: async (name: string, ...args: unknown[]) => {
        const handler = registeredCommands.get(name);
        if (handler) {
          return await handler(...args);
        }
      },
    },
    EventEmitter: MockEventEmitter,
    TreeItem: MockTreeItem,
    TreeItemCollapsibleState: {
      None: 0,
      Collapsed: 1,
      Expanded: 2,
    },
    ThemeIcon: MockThemeIcon,
    ThemeColor: MockThemeColor,
    Position: MockPosition,
    Range: MockRange,
    Uri: {
      file: (p: string) => ({ fsPath: p, scheme: 'file' }),
    },
    env: {
      clipboard: {
        writeText: (...args: unknown[]) => mockClipboardWriteText(...args),
      },
    },
  };
});

import * as vscode from 'vscode';

describe('Packaged VSIX Clean-Install Smoke Test', () => {
  const realRepoPath = '/Users/eldivategar/BITCORP/Briview-EDC/Services/backend-integration';
  const repoExists = fs.existsSync(realRepoPath);
  const rootDir = path.resolve(__dirname, '../..');
  const vsixPath = path.join(rootDir, 'route-peek-0.1.0.vsix');

  let tempInstallDir: string;
  let originalModuleLoad: ModuleLoadFn | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    registeredCommands.clear();
    capturedTreeDataProvider = null;

    const moduleWithLoad = Module as unknown as { _load: ModuleLoadFn };
    originalModuleLoad = moduleWithLoad._load;
    moduleWithLoad._load = function (request: string, parent: unknown, isMain: boolean) {
      if (request === 'vscode') {
        return vscode;
      }
      return originalModuleLoad?.(request, parent, isMain);
    };

    mockGetConfiguration.mockReturnValue({
      get: vi.fn((_key: string, defaultVal?: unknown) => defaultVal),
    });

    // Ensure VSIX exists or is built
    if (!fs.existsSync(vsixPath)) {
      execSync('npm run package', { cwd: rootDir });
    }

    // Create fresh clean profile install directory
    tempInstallDir = fs.mkdtempSync(path.join(os.tmpdir(), 'route-peek-clean-install-'));
  });

  afterEach(() => {
    if (originalModuleLoad) {
      (Module as unknown as { _load: ModuleLoadFn })._load = originalModuleLoad;
    }
    if (fs.existsSync(tempInstallDir)) {
      fs.rmSync(tempInstallDir, { recursive: true, force: true });
    }
  });

  it.skipIf(!repoExists)(
    'installs packaged VSIX into clean environment, scans real-world Fiber codebase, and executes all core interactions',
    async () => {
      // 1. Unpack VSIX into clean extension environment (simulating VS Code extension installation)
      execSync(`unzip -q "${vsixPath}" -d "${tempInstallDir}"`);

      const installedExtensionDir = path.join(tempInstallDir, 'extension');
      expect(fs.existsSync(installedExtensionDir)).toBe(true);

      // Verify installed manifest
      const installedPkgPath = path.join(installedExtensionDir, 'package.json');
      expect(fs.existsSync(installedPkgPath)).toBe(true);
      const installedPkg = JSON.parse(fs.readFileSync(installedPkgPath, 'utf8'));
      expect(installedPkg.name).toBe('route-peek');
      expect(installedPkg.version).toBe('0.1.0');
      expect(installedPkg.publisher).toBe('eldivategar');

      // Verify installed bundle
      const bundledEntryPath = path.join(installedExtensionDir, installedPkg.main);
      expect(fs.existsSync(bundledEntryPath)).toBe(true);

      // 2. Load the packaged, bundled extension code from the clean install directory
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const installedExtension = require(bundledEntryPath) as {
        activate(context: vscode.ExtensionContext): void;
        deactivate(): void;
      };
      expect(typeof installedExtension.activate).toBe('function');
      expect(typeof installedExtension.deactivate).toBe('function');

      // 3. Activate extension within Extension Host environment
      const subscriptions: { dispose(): unknown }[] = [];
      const mockContext = { subscriptions } as unknown as vscode.ExtensionContext;

      installedExtension.activate(mockContext);

      // Verify command registrations
      expect(registeredCommands.has('routePeek.scanWorkspace')).toBe(true);
      expect(registeredCommands.has('routePeek.openRouteSource')).toBe(true);
      expect(registeredCommands.has('routePeek.showRouteDetails')).toBe(true);
      expect(registeredCommands.has('routePeek.copyRoute')).toBe(true);
      expect(registeredCommands.has('routePeek.copyCurl')).toBe(true);
      expect(capturedTreeDataProvider).toBeDefined();

      // 4. Open real-world Fiber project in workspace
      (vscode.workspace as unknown as { workspaceFolders: unknown[] }).workspaceFolders = [
        { uri: { fsPath: realRepoPath } },
      ];

      // 5. Execute Scan Workspace command on the installed extension
      const scanWorkspaceCmd = registeredCommands.get('routePeek.scanWorkspace');
      expect(scanWorkspaceCmd).toBeDefined();
      await scanWorkspaceCmd!();

      // Verify TreeView updated with discovered routes
      const frameworkItems = await capturedTreeDataProvider!.getChildren();
      expect(frameworkItems).toHaveLength(1);
      expect(frameworkItems[0].label).toContain('Fiber');

      // Get resource children under Fiber root
      const resourceGroups = await capturedTreeDataProvider!.getChildren(frameworkItems[0]);
      expect(resourceGroups.length).toBeGreaterThan(0);

      // Find /api/v1/users resource group
      const usersGroup = resourceGroups.find(
        (g) => g.resourcePrefix === '/api/v1/users' || g.label?.includes('/api/v1/users')
      );
      expect(usersGroup).toBeDefined();

      // Get endpoint items under /api/v1/users
      const endpoints = await capturedTreeDataProvider!.getChildren(usersGroup);
      const uuidEndpoint = endpoints.find(
        (e) => e.endpointPath === '/:uuid' || e.label?.includes('/:uuid')
      );
      expect(uuidEndpoint).toBeDefined();

      // For multi-method /:uuid, children are the individual method routes
      const methodLeaves = await capturedTreeDataProvider!.getChildren(uuidEndpoint);
      expect(methodLeaves.length).toBe(3); // GET, PATCH, DELETE

      const getMethodItem = methodLeaves.find((m) => m.route?.method === 'GET');
      expect(getMethodItem).toBeDefined();
      const targetRoute = getMethodItem!.route!;
      expect(targetRoute.method).toBe('GET');
      expect(targetRoute.path).toBe('/api/v1/users/:uuid');
      expect(targetRoute.source.line).toBe(317);

      // 6. Test Source Navigation on installed extension
      const openSourceCmd = registeredCommands.get('routePeek.openRouteSource');
      expect(openSourceCmd).toBeDefined();
      await openSourceCmd!(getMethodItem);

      expect(mockOpenTextDocument).toHaveBeenCalledTimes(1);
      expect(mockShowTextDocument).toHaveBeenCalledTimes(1);
      const showCall = mockShowTextDocument.mock.calls[0];
      // Selection range line should be target line 316 (0-indexed)
      expect(showCall[1].selection.start.line).toBe(316);

      // 7. Test Route Inspector on installed extension
      const showDetailsCmd = registeredCommands.get('routePeek.showRouteDetails');
      expect(showDetailsCmd).toBeDefined();
      await showDetailsCmd!(getMethodItem);

      // Call 0 was the scan completion message, Call 1 is the Route Inspector details modal
      expect(mockShowInformationMessage).toHaveBeenCalledTimes(2);
      expect(mockShowInformationMessage.mock.calls[0][0]).toContain('Discovered 39 routes');

      const infoCall = mockShowInformationMessage.mock.calls[1];
      const infoMessage = infoCall[0];
      expect(infoMessage).toContain('GET');
      expect(infoMessage).toContain('/api/v1/users/:uuid');
      expect(infoMessage).toContain('fiber');
      expect(infoMessage).toContain('317');
      // Verify action buttons provided
      expect(infoCall).toContain('Open Source');
      expect(infoCall).toContain('Copy Route');
      expect(infoCall).toContain('Copy cURL');

      // 8. Test Copy Route on installed extension
      const copyRouteCmd = registeredCommands.get('routePeek.copyRoute');
      expect(copyRouteCmd).toBeDefined();
      await copyRouteCmd!(getMethodItem);

      expect(mockClipboardWriteText).toHaveBeenCalledWith('GET /api/v1/users/:uuid');

      // 9. Test Copy cURL on installed extension
      const copyCurlCmd = registeredCommands.get('routePeek.copyCurl');
      expect(copyCurlCmd).toBeDefined();
      await copyCurlCmd!(getMethodItem);

      expect(mockClipboardWriteText).toHaveBeenCalledWith(
        'curl -X GET "http://localhost:3000/api/v1/users/:uuid"'
      );

      // 10. Deactivate extension clean-up
      installedExtension.deactivate();
    }
  );
});
