import * as vscode from 'vscode';
import { RouteTreeProvider } from '../providers/RouteTreeProvider';

export function createSearchRoutesCommand(
  treeProvider: RouteTreeProvider,
  outputChannel: vscode.OutputChannel
): () => Promise<void> {
  return async () => {
    const currentQuery = treeProvider.getActiveSearchQuery();

    const input = await vscode.window.showInputBox({
      title: 'Route Peek: Search Routes',
      prompt: 'Search routes by path, method, framework, or source file (leave empty to clear)',
      value: currentQuery,
      placeHolder: 'e.g. users, GET, /api, auth.ts',
    });

    if (input === undefined) {
      return;
    }

    const trimmed = input.trim();
    treeProvider.setSearchFilter(trimmed);

    try {
      await vscode.commands.executeCommand('setContext', 'routePeek.hasFilter', Boolean(trimmed));
    } catch {
      // Ignore in mock/testing environments
    }

    if (trimmed) {
      outputChannel.appendLine(`Route Peek: Filtering routes with query ${trimmed}`);
    } else {
      outputChannel.appendLine('Route Peek: Search filter cleared');
    }
  };
}
