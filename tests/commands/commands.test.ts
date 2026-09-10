import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as path from 'path';

const mockShowInformationMessage = vi.fn();
const mockShowErrorMessage = vi.fn();
const mockShowQuickPick = vi.fn();
const mockShowInputBox = vi.fn();
const mockShowTextDocument = vi.fn();
const mockOpenTextDocument = vi.fn();
const mockClipboardWriteText = vi.fn();
const mockExecuteCommand = vi.fn();
const mockGetConfiguration = vi.fn();
let mockWorkspaceFolders: Array<{ uri: { fsPath: string } }> | undefined = undefined;

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
  class MockPosition {
    constructor(
      public line: number,
      public character: number
    ) {}
  }
  class MockRange {
    constructor(
      public start: MockPosition,
      public end: MockPosition
    ) {}
  }

  return {
    window: {
      showInformationMessage: (...args: unknown[]) => mockShowInformationMessage(...args),
      showErrorMessage: (...args: unknown[]) => mockShowErrorMessage(...args),
      showQuickPick: (...args: unknown[]) => mockShowQuickPick(...args),
      showInputBox: (...args: unknown[]) => mockShowInputBox(...args),
      showTextDocument: (...args: unknown[]) => mockShowTextDocument(...args),
    },
    workspace: {
      get workspaceFolders() {
        return mockWorkspaceFolders;
      },
      openTextDocument: (...args: unknown[]) => mockOpenTextDocument(...args),
      getConfiguration: (...args: unknown[]) => mockGetConfiguration(...args),
    },

    Uri: {
      file: (fsPath: string) => ({ fsPath, scheme: 'file' }),
    },
    Position: MockPosition,
    Range: MockRange,
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
      executeCommand: (...args: unknown[]) => mockExecuteCommand(...args),
    },
  };
});

import { createScanWorkspaceCommand } from '../../src/commands/scanWorkspace';
import { createRefreshRoutesCommand } from '../../src/commands/refreshRoutes';
import { createOpenRouteSourceCommand } from '../../src/commands/openRouteSource';
import { createCopyRouteCommand } from '../../src/commands/copyRoute';
import { createCopyCurlCommand } from '../../src/commands/copyCurl';
import { createShowRouteDetailsCommand } from '../../src/commands/showRouteDetails';
import { createSearchRoutesCommand } from '../../src/commands/searchRoutes';
import { createClearSearchCommand } from '../../src/commands/clearSearch';
import { WorkspaceScanService } from '../../src/services/WorkspaceScanService';
import { RouteTreeProvider } from '../../src/providers/RouteTreeProvider';
import { RouteTreeItem } from '../../src/providers/RouteTreeItem';
import { Route, createRoute } from '../../src/models/Route';
import * as vscode from 'vscode';

describe('commands', () => {
  let mockOutputChannel: { appendLine: ReturnType<typeof vi.fn> };
  let mockScanService: WorkspaceScanService;
  let mockTreeProvider: RouteTreeProvider;

  const sampleRoute: Route = {
    id: 'test-route-1',
    method: 'GET',
    path: '/api/users',
    framework: 'express',
    confidence: 'high',
    source: { file: 'src/routes/users.ts', line: 10, column: 5 },
  };

  const dynamicRoute: Route = {
    id: 'test-route-2',
    method: 'POST',
    path: '/api/users/<dynamic>',
    framework: 'express',
    confidence: 'low',
    source: { file: 'src/routes/users.ts', line: 20, column: 5 },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockWorkspaceFolders = undefined;
    mockGetConfiguration.mockReturnValue({
      get: vi.fn((key: string, defaultVal?: unknown) => defaultVal),
    });
    mockOutputChannel = {
      appendLine: vi.fn(),
    };
    let isScanningVal = false;
    mockScanService = {
      get isScanning() {
        return isScanningVal;
      },
      set isScanning(val: boolean) {
        isScanningVal = val;
      },
      scan: vi.fn().mockResolvedValue({ scannedFiles: 0, routes: [] }),
    } as unknown as WorkspaceScanService;
    mockTreeProvider = {
      refresh: vi.fn(),
      setRoutes: vi.fn(),
      setState: vi.fn(),
      getRoutes: vi.fn().mockReturnValue([]),
      getFilteredRoutes: vi.fn().mockReturnValue([]),
      getActiveSearchQuery: vi.fn().mockReturnValue(''),
      setSearchFilter: vi.fn(),
      clearSearchFilter: vi.fn(),
    } as unknown as RouteTreeProvider;
  });

  describe('scanWorkspace', () => {
    it('notifies and logs when no workspace is open', async () => {
      mockWorkspaceFolders = undefined;
      const command = createScanWorkspaceCommand(
        mockScanService,
        mockTreeProvider,
        mockOutputChannel as unknown as vscode.OutputChannel
      );

      await command();

      expect(mockScanService.scan).not.toHaveBeenCalled();
      expect(mockShowInformationMessage).toHaveBeenCalledWith(
        'Route Peek: No workspace is currently open.'
      );
      expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
        'Route Peek: No workspace is currently open.'
      );
    });

    it('scans, updates provider, and reports when no routes found', async () => {
      mockWorkspaceFolders = [{ uri: { fsPath: '/test/workspace' } }];
      const command = createScanWorkspaceCommand(
        mockScanService,
        mockTreeProvider,
        mockOutputChannel as unknown as vscode.OutputChannel
      );

      await command();

      expect(mockTreeProvider.setState).toHaveBeenCalledWith('scanning');
      expect(mockScanService.scan).toHaveBeenCalledWith(['/test/workspace']);
      expect(mockTreeProvider.setRoutes).toHaveBeenCalledWith([]);
      expect(mockShowInformationMessage).toHaveBeenCalledWith(
        'Route Peek: Scan completed. No routes found.'
      );
      expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
        'Route Peek: Scan completed. No routes found.'
      );
    });

    it('scans, updates provider, and reports count when routes are discovered', async () => {
      mockWorkspaceFolders = [{ uri: { fsPath: '/test/workspace' } }];
      (mockScanService.scan as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        scannedFiles: 1,
        routes: [sampleRoute],
      });

      const command = createScanWorkspaceCommand(
        mockScanService,
        mockTreeProvider,
        mockOutputChannel as unknown as vscode.OutputChannel
      );

      await command();

      expect(mockTreeProvider.setState).toHaveBeenCalledWith('scanning');
      expect(mockTreeProvider.setRoutes).toHaveBeenCalledWith([sampleRoute]);
      expect(mockShowInformationMessage).toHaveBeenCalledWith(
        'Route Peek: Discovered 1 routes.'
      );
      expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
        'Route Peek: Scan completed. Discovered 1 routes.'
      );
    });

    it('prevents concurrent scans and refreshes across commands using shared isScanning', async () => {
      mockWorkspaceFolders = [{ uri: { fsPath: '/test/workspace' } }];
      let isScanningShared = false;
      let resolveScan!: (val: unknown) => void;
      const sharedScanService = {
        get isScanning() {
          return isScanningShared;
        },
        scan: vi.fn().mockImplementation(() => {
          isScanningShared = true;
          return new Promise((resolve) => {
            resolveScan = (res) => {
              isScanningShared = false;
              resolve(res);
            };
          });
        }),
      } as unknown as WorkspaceScanService;

      const scanCmd = createScanWorkspaceCommand(
        sharedScanService,
        mockTreeProvider,
        mockOutputChannel as unknown as vscode.OutputChannel
      );
      const refreshCmd = createRefreshRoutesCommand(
        sharedScanService,
        mockTreeProvider,
        mockOutputChannel as unknown as vscode.OutputChannel
      );

      // Start scanWorkspace
      const firstScan = scanCmd();
      expect(sharedScanService.isScanning).toBe(true);

      // Attempt second scanWorkspace
      await scanCmd();
      expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
        'Route Peek: Scan already in progress.'
      );

      // Attempt refreshRoutes while scan is in progress
      await refreshCmd();
      expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
        'Route Peek: Refresh already in progress.'
      );

      // Finish first scan
      resolveScan({ scannedFiles: 0, routes: [] });
      await firstScan;
      expect(sharedScanService.isScanning).toBe(false);

      // Now start refreshRoutes
      const firstRefresh = refreshCmd();
      expect(sharedScanService.isScanning).toBe(true);

      // Attempt scanWorkspace while refresh is in progress
      await scanCmd();
      expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
        'Route Peek: Scan already in progress.'
      );

      // Finish refresh
      resolveScan({ scannedFiles: 0, routes: [] });
      await firstRefresh;
      expect(sharedScanService.isScanning).toBe(false);
    });

    it('handles scan errors gracefully', async () => {
      mockWorkspaceFolders = [{ uri: { fsPath: '/test/workspace' } }];
      (mockScanService.scan as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error('Scan IO failure')
      );

      const command = createScanWorkspaceCommand(
        mockScanService,
        mockTreeProvider,
        mockOutputChannel as unknown as vscode.OutputChannel
      );

      await command();

      expect(mockTreeProvider.setState).toHaveBeenCalledWith('error', 'Scan IO failure');
      expect(mockShowErrorMessage).toHaveBeenCalledWith('Route Peek: Failed to scan workspace.');
      expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
        'Route Peek: Scan failed: Scan IO failure'
      );
    });
  });

  describe('refreshRoutes', () => {
    it('notifies when no workspace is open', async () => {
      mockWorkspaceFolders = undefined;
      const command = createRefreshRoutesCommand(
        mockScanService,
        mockTreeProvider,
        mockOutputChannel as unknown as vscode.OutputChannel
      );

      await command();

      expect(mockScanService.scan).not.toHaveBeenCalled();
      expect(mockShowInformationMessage).toHaveBeenCalledWith(
        'Route Peek: No workspace is currently open.'
      );
    });

    it('rescans and refreshes routes', async () => {
      mockWorkspaceFolders = [{ uri: { fsPath: '/test/workspace' } }];
      (mockScanService.scan as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        scannedFiles: 2,
        routes: [sampleRoute],
      });

      const command = createRefreshRoutesCommand(
        mockScanService,
        mockTreeProvider,
        mockOutputChannel as unknown as vscode.OutputChannel
      );

      await command();

      expect(mockTreeProvider.setState).toHaveBeenCalledWith('scanning');
      expect(mockTreeProvider.setRoutes).toHaveBeenCalledWith([sampleRoute]);
      expect(mockShowInformationMessage).toHaveBeenCalledWith(
        'Route Peek: Refreshed 1 routes.'
      );
      expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
        'Route Peek: Routes refreshed. Discovered 1 routes.'
      );
    });

    it('handles refresh errors gracefully', async () => {
      mockWorkspaceFolders = [{ uri: { fsPath: '/test/workspace' } }];
      (mockScanService.scan as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error('Refresh failure')
      );

      const command = createRefreshRoutesCommand(
        mockScanService,
        mockTreeProvider,
        mockOutputChannel as unknown as vscode.OutputChannel
      );

      await command();

      expect(mockTreeProvider.setState).toHaveBeenCalledWith('error', 'Refresh failure');
      expect(mockShowErrorMessage).toHaveBeenCalledWith('Route Peek: Failed to refresh routes.');
    });

    it('prevents refresh when scanService is already scanning', async () => {
      mockWorkspaceFolders = [{ uri: { fsPath: '/test/workspace' } }];
      // @ts-expect-error setting mock property
      mockScanService.isScanning = true;

      const command = createRefreshRoutesCommand(
        mockScanService,
        mockTreeProvider,
        mockOutputChannel as unknown as vscode.OutputChannel
      );

      await command();

      expect(mockScanService.scan).not.toHaveBeenCalled();
      expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
        'Route Peek: Refresh already in progress.'
      );
    });
  });

  describe('openRouteSource', () => {
    it('does nothing when no route is provided', async () => {
      const command = createOpenRouteSourceCommand(
        mockOutputChannel as unknown as vscode.OutputChannel
      );

      await command(undefined as unknown as Route);

      expect(mockOpenTextDocument).not.toHaveBeenCalled();
      expect(mockShowTextDocument).not.toHaveBeenCalled();
    });

    it('navigates to relative file path using workspace root with 0-based coordinates', async () => {
      mockWorkspaceFolders = [{ uri: { fsPath: '/test/workspace' } }];
      const mockDoc = { uri: { fsPath: '/test/workspace/src/routes/users.ts' } };
      mockOpenTextDocument.mockResolvedValueOnce(mockDoc);

      const command = createOpenRouteSourceCommand(
        mockOutputChannel as unknown as vscode.OutputChannel
      );

      await command(sampleRoute);

      expect(mockOpenTextDocument).toHaveBeenCalledWith({
        fsPath: '/test/workspace/src/routes/users.ts',
        scheme: 'file',
      });
      expect(mockShowTextDocument).toHaveBeenCalledWith(mockDoc, {
        selection: expect.objectContaining({
          start: expect.objectContaining({ line: 9, character: 4 }),
          end: expect.objectContaining({ line: 9, character: 4 }),
        }),
        preview: false,
      });
      expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
        'Route Peek: Navigated to src/routes/users.ts:10:5'
      );
    });

    it('accepts a RouteTreeItem instance', async () => {
      mockWorkspaceFolders = [{ uri: { fsPath: '/test/workspace' } }];
      const mockDoc = { uri: { fsPath: '/test/workspace/src/routes/users.ts' } };
      mockOpenTextDocument.mockResolvedValueOnce(mockDoc);

      const item = RouteTreeItem.fromRoute(sampleRoute);
      const command = createOpenRouteSourceCommand(
        mockOutputChannel as unknown as vscode.OutputChannel
      );

      await command(item);

      expect(mockOpenTextDocument).toHaveBeenCalled();
      expect(mockShowTextDocument).toHaveBeenCalled();
    });

    it('handles document opening failure gracefully', async () => {
      mockWorkspaceFolders = [{ uri: { fsPath: '/test/workspace' } }];
      mockOpenTextDocument.mockRejectedValueOnce(new Error('File not found'));

      const command = createOpenRouteSourceCommand(
        mockOutputChannel as unknown as vscode.OutputChannel
      );

      await command(sampleRoute);

      expect(mockShowErrorMessage).toHaveBeenCalledWith(
        "Route Peek: Could not open source file 'src/routes/users.ts'."
      );
      expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
        expect.stringContaining('Route Peek: Failed to open source file')
      );
    });

    it('resolves relative file path against the matching folder in multi-root workspace', async () => {
      const tempDir1 = path.resolve(__dirname, '../fixtures/fiber/basic');
      const tempDir2 = path.resolve(__dirname, '../fixtures/fiber/test-files');
      mockWorkspaceFolders = [
        { uri: { fsPath: tempDir1 } },
        { uri: { fsPath: tempDir2 } },
      ];

      const routeInFolder2 = createRoute({
        framework: 'fiber',
        method: 'GET',
        path: '/real',
        source: {
          file: 'routes.go',
          line: 8,
          column: 2,
        },
        confidence: 'high',
      });

      const mockDoc = { uri: { fsPath: path.join(tempDir2, 'routes.go') } };
      mockOpenTextDocument.mockResolvedValueOnce(mockDoc);

      const command = createOpenRouteSourceCommand(
        mockOutputChannel as unknown as vscode.OutputChannel
      );

      await command(routeInFolder2);

      // Must be resolved against tempDir2 (folder 1), NOT tempDir1 (folder 0)!
      expect(mockOpenTextDocument).toHaveBeenCalledWith({
        fsPath: path.join(tempDir2, 'routes.go'),
        scheme: 'file',
      });
    });

    it('navigates to normal route, nested router, cross-file router, ESM, and CJS source files with 0-based coordinates', async () => {
      mockWorkspaceFolders = [{ uri: { fsPath: '/test/workspace' } }];
      const mockDoc = { uri: { fsPath: '/test/workspace/placeholder.ts' } };
      mockOpenTextDocument.mockResolvedValue(mockDoc);

      const command = createOpenRouteSourceCommand(
        mockOutputChannel as unknown as vscode.OutputChannel
      );

      const testCases: Array<{
        name: string;
        route: Route;
        expectedFile: string;
        expectedLine: number;
        expectedCol: number;
      }> = [
        {
          name: 'normal route',
          route: {
            id: 'r1',
            method: 'GET',
            path: '/users',
            framework: 'express',
            confidence: 'high',
            source: { file: 'src/routes/users.ts', line: 15, column: 3 },
          },
          expectedFile: '/test/workspace/src/routes/users.ts',
          expectedLine: 14,
          expectedCol: 2,
        },
        {
          name: 'nested router route',
          route: {
            id: 'r2',
            method: 'POST',
            path: '/api/v1/items',
            framework: 'express',
            confidence: 'high',
            source: { file: 'src/routes/api/v1/items.ts', line: 42, column: 7 },
          },
          expectedFile: '/test/workspace/src/routes/api/v1/items.ts',
          expectedLine: 41,
          expectedCol: 6,
        },
        {
          name: 'cross-file router route',
          route: {
            id: 'r3',
            method: 'GET',
            path: '/api/auth/profile',
            framework: 'express',
            confidence: 'high',
            source: { file: 'src/routes/auth.ts', line: 9, column: 1 },
          },
          expectedFile: '/test/workspace/src/routes/auth.ts',
          expectedLine: 8,
          expectedCol: 0,
        },
        {
          name: 'ESM project route',
          route: {
            id: 'r4',
            method: 'GET',
            path: '/esm-endpoint',
            framework: 'express',
            confidence: 'high',
            source: { file: 'src/esmApp.mjs', line: 12, column: 1 },
          },
          expectedFile: '/test/workspace/src/esmApp.mjs',
          expectedLine: 11,
          expectedCol: 0,
        },
        {
          name: 'CJS project route',
          route: {
            id: 'r5',
            method: 'POST',
            path: '/cjs-endpoint',
            framework: 'express',
            confidence: 'high',
            source: { file: 'src/cjsApp.cjs', line: 25, column: 5 },
          },
          expectedFile: '/test/workspace/src/cjsApp.cjs',
          expectedLine: 24,
          expectedCol: 4,
        },
      ];

      for (const tc of testCases) {
        mockOpenTextDocument.mockClear();
        mockShowTextDocument.mockClear();

        await command(tc.route);

        expect(mockOpenTextDocument).toHaveBeenCalledWith({
          fsPath: tc.expectedFile,
          scheme: 'file',
        });
        expect(mockShowTextDocument).toHaveBeenCalledWith(mockDoc, {
          selection: expect.objectContaining({
            start: expect.objectContaining({ line: tc.expectedLine, character: tc.expectedCol }),
            end: expect.objectContaining({ line: tc.expectedLine, character: tc.expectedCol }),
          }),
          preview: false,
        });
      }
    });
  });

  describe('copyRoute', () => {
    it('copies route text from Route object to clipboard', async () => {
      const command = createCopyRouteCommand(
        mockTreeProvider,
        mockOutputChannel as unknown as vscode.OutputChannel
      );

      await command(sampleRoute);

      expect(mockClipboardWriteText).toHaveBeenCalledWith('GET /api/users');
      expect(mockShowInformationMessage).toHaveBeenCalledWith(
        'Route Peek: Copied GET /api/users to clipboard.'
      );
    });

    it('copies route text from RouteTreeItem to clipboard', async () => {
      const item = RouteTreeItem.fromRoute(sampleRoute);
      const command = createCopyRouteCommand(
        mockTreeProvider,
        mockOutputChannel as unknown as vscode.OutputChannel
      );

      await command(item);

      expect(mockClipboardWriteText).toHaveBeenCalledWith('GET /api/users');
    });

    it('prompts user with QuickPick when no route passed', async () => {
      (mockTreeProvider.getRoutes as ReturnType<typeof vi.fn>).mockReturnValue([sampleRoute]);
      mockShowQuickPick.mockResolvedValueOnce({
        label: 'GET /api/users',
        route: sampleRoute,
      });

      const command = createCopyRouteCommand(
        mockTreeProvider,
        mockOutputChannel as unknown as vscode.OutputChannel
      );

      await command();

      expect(mockShowQuickPick).toHaveBeenCalled();
      expect(mockClipboardWriteText).toHaveBeenCalledWith('GET /api/users');
    });

    it('informs user when no routes exist to copy', async () => {
      (mockTreeProvider.getRoutes as ReturnType<typeof vi.fn>).mockReturnValue([]);

      const command = createCopyRouteCommand(
        mockTreeProvider,
        mockOutputChannel as unknown as vscode.OutputChannel
      );

      await command();

      expect(mockShowInformationMessage).toHaveBeenCalledWith(
        'Route Peek: No routes available to copy.'
      );
      expect(mockClipboardWriteText).not.toHaveBeenCalled();
    });
  });

  describe('copyCurl', () => {
    it('copies cURL command from Route object to clipboard with default base URL', async () => {
      const command = createCopyCurlCommand(
        mockTreeProvider,
        mockOutputChannel as unknown as vscode.OutputChannel
      );

      await command(sampleRoute);

      expect(mockClipboardWriteText).toHaveBeenCalledWith(
        'curl -X GET "http://localhost:3000/api/users"'
      );
      expect(mockShowInformationMessage).toHaveBeenCalledWith(
        'Route Peek: Copied cURL command to clipboard.'
      );
      expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
        'Route Peek: Copied cURL to clipboard: curl -X GET "http://localhost:3000/api/users"'
      );
    });

    it('copies cURL command from RouteTreeItem to clipboard', async () => {
      const item = RouteTreeItem.fromRoute(sampleRoute);
      const command = createCopyCurlCommand(
        mockTreeProvider,
        mockOutputChannel as unknown as vscode.OutputChannel
      );

      await command(item);

      expect(mockClipboardWriteText).toHaveBeenCalledWith(
        'curl -X GET "http://localhost:3000/api/users"'
      );
    });

    it('respects custom baseUrl from routePeek configuration', async () => {
      mockGetConfiguration.mockReturnValueOnce({
        get: vi.fn((key: string) => (key === 'baseUrl' ? 'https://api.mycompany.com' : undefined)),
      });

      const command = createCopyCurlCommand(
        mockTreeProvider,
        mockOutputChannel as unknown as vscode.OutputChannel
      );

      await command(sampleRoute);

      expect(mockClipboardWriteText).toHaveBeenCalledWith(
        'curl -X GET "https://api.mycompany.com/api/users"'
      );
    });

    it('preserves parameter and dynamic segments verbatim in cURL command', async () => {
      const command = createCopyCurlCommand(
        mockTreeProvider,
        mockOutputChannel as unknown as vscode.OutputChannel
      );

      await command(dynamicRoute);

      expect(mockClipboardWriteText).toHaveBeenCalledWith(
        'curl -X POST "http://localhost:3000/api/users/<dynamic>"'
      );
    });

    it('prompts user with QuickPick when no route passed', async () => {
      (mockTreeProvider.getRoutes as ReturnType<typeof vi.fn>).mockReturnValue([sampleRoute]);
      mockShowQuickPick.mockResolvedValueOnce({
        label: 'GET /api/users',
        route: sampleRoute,
      });

      const command = createCopyCurlCommand(
        mockTreeProvider,
        mockOutputChannel as unknown as vscode.OutputChannel
      );

      await command();

      expect(mockShowQuickPick).toHaveBeenCalled();
      expect(mockClipboardWriteText).toHaveBeenCalledWith(
        'curl -X GET "http://localhost:3000/api/users"'
      );
    });

    it('informs user when no routes exist to copy', async () => {
      (mockTreeProvider.getRoutes as ReturnType<typeof vi.fn>).mockReturnValue([]);

      const command = createCopyCurlCommand(
        mockTreeProvider,
        mockOutputChannel as unknown as vscode.OutputChannel
      );

      await command();

      expect(mockShowInformationMessage).toHaveBeenCalledWith(
        'Route Peek: No routes available to copy.'
      );
      expect(mockClipboardWriteText).not.toHaveBeenCalled();
    });
  });

  describe('showRouteDetails', () => {
    it('shows route metadata and executes Open Source when clicked', async () => {
      const openSourceFn = vi.fn().mockResolvedValue(undefined);
      const copyRouteFn = vi.fn().mockResolvedValue(undefined);
      const copyCurlFn = vi.fn().mockResolvedValue(undefined);
      mockShowInformationMessage.mockResolvedValueOnce('Open Source');

      const command = createShowRouteDetailsCommand(
        mockTreeProvider,
        openSourceFn,
        copyRouteFn,
        copyCurlFn,
        mockOutputChannel as unknown as vscode.OutputChannel
      );

      await command(sampleRoute);

      expect(mockShowInformationMessage).toHaveBeenCalledWith(
        expect.stringContaining('GET /api/users\nFramework: express\nConfidence: high\nSource: src/routes/users.ts:10:5\nRoute ID: test-route-1'),
        'Open Source',
        'Copy Route',
        'Copy cURL'
      );
      expect(openSourceFn).toHaveBeenCalledWith(sampleRoute);
      expect(copyRouteFn).not.toHaveBeenCalled();
      expect(copyCurlFn).not.toHaveBeenCalled();
    });

    it('executes Copy Route when clicked', async () => {
      const openSourceFn = vi.fn().mockResolvedValue(undefined);
      const copyRouteFn = vi.fn().mockResolvedValue(undefined);
      const copyCurlFn = vi.fn().mockResolvedValue(undefined);
      mockShowInformationMessage.mockResolvedValueOnce('Copy Route');

      const command = createShowRouteDetailsCommand(
        mockTreeProvider,
        openSourceFn,
        copyRouteFn,
        copyCurlFn,
        mockOutputChannel as unknown as vscode.OutputChannel
      );

      await command(sampleRoute);

      expect(copyRouteFn).toHaveBeenCalledWith(sampleRoute);
      expect(openSourceFn).not.toHaveBeenCalled();
      expect(copyCurlFn).not.toHaveBeenCalled();
    });

    it('executes Copy cURL when clicked', async () => {
      const openSourceFn = vi.fn().mockResolvedValue(undefined);
      const copyRouteFn = vi.fn().mockResolvedValue(undefined);
      const copyCurlFn = vi.fn().mockResolvedValue(undefined);
      mockShowInformationMessage.mockResolvedValueOnce('Copy cURL');

      const command = createShowRouteDetailsCommand(
        mockTreeProvider,
        openSourceFn,
        copyRouteFn,
        copyCurlFn,
        mockOutputChannel as unknown as vscode.OutputChannel
      );

      await command(sampleRoute);

      expect(copyCurlFn).toHaveBeenCalledWith(sampleRoute);
      expect(openSourceFn).not.toHaveBeenCalled();
      expect(copyRouteFn).not.toHaveBeenCalled();
    });

    it('includes dynamic warning when route is dynamic', async () => {
      const openSourceFn = vi.fn().mockResolvedValue(undefined);
      const copyRouteFn = vi.fn().mockResolvedValue(undefined);
      const copyCurlFn = vi.fn().mockResolvedValue(undefined);
      mockShowInformationMessage.mockResolvedValueOnce(undefined);

      const command = createShowRouteDetailsCommand(
        mockTreeProvider,
        openSourceFn,
        copyRouteFn,
        copyCurlFn,
        mockOutputChannel as unknown as vscode.OutputChannel
      );

      await command(dynamicRoute);

      expect(mockShowInformationMessage).toHaveBeenCalledWith(
        expect.stringContaining('Warning: Path contains a dynamically resolved segment.'),
        'Open Source',
        'Copy Route',
        'Copy cURL'
      );
    });

    it('prompts QuickPick when invoked without arguments', async () => {
      (mockTreeProvider.getRoutes as ReturnType<typeof vi.fn>).mockReturnValue([sampleRoute]);
      mockShowQuickPick.mockResolvedValueOnce({
        label: 'GET /api/users',
        route: sampleRoute,
      });
      mockShowInformationMessage.mockResolvedValueOnce(undefined);

      const openSourceFn = vi.fn().mockResolvedValue(undefined);
      const copyRouteFn = vi.fn().mockResolvedValue(undefined);
      const copyCurlFn = vi.fn().mockResolvedValue(undefined);

      const command = createShowRouteDetailsCommand(
        mockTreeProvider,
        openSourceFn,
        copyRouteFn,
        copyCurlFn,
        mockOutputChannel as unknown as vscode.OutputChannel
      );

      await command();

      expect(mockShowQuickPick).toHaveBeenCalled();
      expect(mockShowInformationMessage).toHaveBeenCalledWith(
        expect.stringContaining('GET /api/users'),
        'Open Source',
        'Copy Route',
        'Copy cURL'
      );
    });
  });


  describe('searchRoutes and clearSearch', () => {
    it('sets search filter and updates context key', async () => {
      (mockTreeProvider.getActiveSearchQuery as ReturnType<typeof vi.fn>).mockReturnValue('');
      mockShowInputBox.mockResolvedValueOnce('users');

      const command = createSearchRoutesCommand(
        mockTreeProvider,
        mockOutputChannel as unknown as vscode.OutputChannel
      );

      await command();

      expect(mockTreeProvider.setSearchFilter).toHaveBeenCalledWith('users');
      expect(mockExecuteCommand).toHaveBeenCalledWith('setContext', 'routePeek.hasFilter', true);
      expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
        'Route Peek: Filtering routes with query users'
      );
    });

    it('clears filter when blank input is given', async () => {
      (mockTreeProvider.getActiveSearchQuery as ReturnType<typeof vi.fn>).mockReturnValue('users');
      mockShowInputBox.mockResolvedValueOnce('  ');

      const command = createSearchRoutesCommand(
        mockTreeProvider,
        mockOutputChannel as unknown as vscode.OutputChannel
      );

      await command();

      expect(mockTreeProvider.setSearchFilter).toHaveBeenCalledWith('');
      expect(mockExecuteCommand).toHaveBeenCalledWith('setContext', 'routePeek.hasFilter', false);
    });

    it('does nothing when input box is cancelled', async () => {
      mockShowInputBox.mockResolvedValueOnce(undefined);

      const command = createSearchRoutesCommand(
        mockTreeProvider,
        mockOutputChannel as unknown as vscode.OutputChannel
      );

      await command();

      expect(mockTreeProvider.setSearchFilter).not.toHaveBeenCalled();
    });

    it('clearSearch command clears provider filter and resets context', async () => {
      const command = createClearSearchCommand(
        mockTreeProvider,
        mockOutputChannel as unknown as vscode.OutputChannel
      );

      await command();

      expect(mockTreeProvider.clearSearchFilter).toHaveBeenCalled();
      expect(mockExecuteCommand).toHaveBeenCalledWith('setContext', 'routePeek.hasFilter', false);
      expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
        'Route Peek: Route filter cleared'
      );
    });
  });
});
