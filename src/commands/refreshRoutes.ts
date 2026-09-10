import * as vscode from 'vscode';
import { WorkspaceScanService } from '../services/WorkspaceScanService';
import { RouteTreeProvider } from '../providers/RouteTreeProvider';

export function createRefreshRoutesCommand(
  scanService: WorkspaceScanService,
  treeProvider: RouteTreeProvider,
  outputChannel: vscode.OutputChannel
): () => Promise<void> {
  return async () => {
    if (scanService.isScanning) {
      outputChannel.appendLine('Route Peek: Refresh already in progress.');
      return;
    }

    outputChannel.appendLine('Route Peek: Refresh Routes requested');

    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) {
      outputChannel.appendLine('Route Peek: No workspace is currently open.');
      void vscode.window.showInformationMessage('Route Peek: No workspace is currently open.');
      return;
    }

    treeProvider.setState('scanning');

    try {
      const rootPaths = folders.map((folder) => folder.uri.fsPath);
      const result = await scanService.scan(rootPaths);

      treeProvider.setRoutes(result.routes);

      outputChannel.appendLine(
        `Route Peek: Routes refreshed. Discovered ${result.routes.length} routes.`
      );
      void vscode.window.showInformationMessage(
        `Route Peek: Refreshed ${result.routes.length} routes.`
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      outputChannel.appendLine(`Route Peek: Refresh failed: ${message}`);
      treeProvider.setState('error', message);
      void vscode.window.showErrorMessage('Route Peek: Failed to refresh routes.');
    }
  };
}

