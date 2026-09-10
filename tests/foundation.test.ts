import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('vscode', () => {
  const mockOutputChannel = {
    appendLine: vi.fn(),
    dispose: vi.fn(),
  };
  const mockTreeView = {
    dispose: vi.fn(),
  };
  const mockDisposable = {
    dispose: vi.fn(),
  };
  class MockEventEmitter {
    public event = vi.fn();
    public fire = vi.fn();
  }
  class MockTreeItem {
    public description?: string;
    public tooltip?: string;
    public iconPath?: unknown;
    constructor(
      public label: string,
      public collapsibleState = 0
    ) {}
  }
  class MockThemeIcon {
    constructor(public id: string) {}
  }

  return {
    window: {
      createOutputChannel: vi.fn(() => mockOutputChannel),
      createTreeView: vi.fn(() => mockTreeView),
    },
    commands: {
      registerCommand: vi.fn(() => mockDisposable),
    },
    EventEmitter: MockEventEmitter,
    TreeItem: MockTreeItem,
    TreeItemCollapsibleState: {
      None: 0,
      Collapsed: 1,
      Expanded: 2,
    },
    ThemeIcon: MockThemeIcon,
  };
});

import { activate, deactivate } from '../src/extension';
import * as vscode from 'vscode';

describe('extension foundation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('exports activate as a function', () => {
    expect(typeof activate).toBe('function');
  });

  it('exports deactivate as a function', () => {
    expect(typeof deactivate).toBe('function');
  });

  it('activate creates Route Peek output channel and registers disposal', () => {
    const subscriptions: { dispose(): unknown }[] = [];
    const mockContext = { subscriptions } as unknown as vscode.ExtensionContext;

    activate(mockContext);

    expect(vscode.window.createOutputChannel).toHaveBeenCalledWith('Route Peek');
    expect(subscriptions.length).toBeGreaterThanOrEqual(1);
  });

  it('activate registers tree view and commands', () => {
    const subscriptions: { dispose(): unknown }[] = [];
    const mockContext = { subscriptions } as unknown as vscode.ExtensionContext;

    activate(mockContext);

    expect(vscode.window.createTreeView).toHaveBeenCalledWith(
      'routePeek.routesView',
      expect.objectContaining({ showCollapseAll: true })
    );
    expect(vscode.commands.registerCommand).toHaveBeenCalledWith(
      'routePeek.scanWorkspace',
      expect.any(Function)
    );
    expect(vscode.commands.registerCommand).toHaveBeenCalledWith(
      'routePeek.refreshRoutes',
      expect.any(Function)
    );
    expect(vscode.commands.registerCommand).toHaveBeenCalledWith(
      'routePeek.openRouteSource',
      expect.any(Function)
    );
    expect(vscode.commands.registerCommand).toHaveBeenCalledWith(
      'routePeek.copyRoute',
      expect.any(Function)
    );
    expect(vscode.commands.registerCommand).toHaveBeenCalledWith(
      'routePeek.copyCurl',
      expect.any(Function)
    );
    expect(vscode.commands.registerCommand).toHaveBeenCalledWith(
      'routePeek.showRouteDetails',
      expect.any(Function)
    );
    expect(vscode.commands.registerCommand).toHaveBeenCalledWith(
      'routePeek.searchRoutes',
      expect.any(Function)
    );
    expect(vscode.commands.registerCommand).toHaveBeenCalledWith(
      'routePeek.clearSearch',
      expect.any(Function)
    );
    expect(subscriptions).toHaveLength(10);
  });

  it('activate logs activation message', () => {
    const subscriptions: { dispose(): unknown }[] = [];
    const mockContext = { subscriptions } as unknown as vscode.ExtensionContext;

    activate(mockContext);

    const channel = (vscode.window.createOutputChannel as ReturnType<typeof vi.fn>).mock.results[0].value;
    expect(channel.appendLine).toHaveBeenCalledWith('Route Peek activated');
  });

  it('deactivate does not throw', () => {
    expect(() => deactivate()).not.toThrow();
  });
});
