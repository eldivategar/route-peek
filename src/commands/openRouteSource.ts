import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { Route } from '../models/Route';
import { RouteTreeItem } from '../providers/RouteTreeItem';

export function createOpenRouteSourceCommand(
  outputChannel: vscode.OutputChannel
): (routeOrItem: Route | RouteTreeItem) => Promise<void> {
  return async (routeOrItem: Route | RouteTreeItem) => {
    const route = routeOrItem instanceof RouteTreeItem ? routeOrItem.route : routeOrItem;
    if (!route) {
      return;
    }

    const folders = vscode.workspace.workspaceFolders;
    let absPath = route.source.file;

    if (!path.isAbsolute(route.source.file) && folders && folders.length > 0) {
      let resolvedMatch: string | undefined;
      for (const folder of folders) {
        const candidate = path.resolve(folder.uri.fsPath, route.source.file);
        if (fs.existsSync(candidate)) {
          resolvedMatch = candidate;
          break;
        }
      }
      absPath = resolvedMatch ?? path.resolve(folders[0].uri.fsPath, route.source.file);
    }

    try {
      const uri = vscode.Uri.file(absPath);
      const doc = await vscode.workspace.openTextDocument(uri);

      const targetLine = Math.max(0, route.source.line - 1);
      const targetCol = Math.max(0, (route.source.column ?? 1) - 1);
      const position = new vscode.Position(targetLine, targetCol);
      const range = new vscode.Range(position, position);

      await vscode.window.showTextDocument(doc, {
        selection: range,
        preview: false,
      });

      outputChannel.appendLine(
        `Route Peek: Navigated to ${route.source.file}:${route.source.line}:${route.source.column}`
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      outputChannel.appendLine(`Route Peek: Failed to open source file '${absPath}': ${message}`);
      void vscode.window.showErrorMessage(`Route Peek: Could not open source file '${route.source.file}'.`);
    }
  };
}
