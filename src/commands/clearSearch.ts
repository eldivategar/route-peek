import * as vscode from 'vscode';
import { RouteTreeProvider } from '../providers/RouteTreeProvider';

export function createClearSearchCommand(
  treeProvider: RouteTreeProvider,
  outputChannel: vscode.OutputChannel
): () => Promise<void> {
  return async () => {
    treeProvider.clearSearchFilter();

    try {
      await vscode.commands.executeCommand('setContext', 'routePeek.hasFilter', false);
    } catch {
      // Ignore in mock/testing environments
    }

    outputChannel.appendLine('Route Peek: Route filter cleared');
  };
}
