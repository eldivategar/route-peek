import * as vscode from 'vscode';
import { Route } from '../models/Route';
import { RouteTreeItem } from '../providers/RouteTreeItem';
import { RouteTreeProvider } from '../providers/RouteTreeProvider';
import { CurlGenerator } from '../services/CurlGenerator';

export function createCopyCurlCommand(
  treeProvider: RouteTreeProvider,
  outputChannel: vscode.OutputChannel
): (routeOrItem?: Route | RouteTreeItem) => Promise<void> {
  return async (routeOrItem?: Route | RouteTreeItem) => {
    let route = routeOrItem instanceof RouteTreeItem ? routeOrItem.route : routeOrItem;

    if (!route) {
      const routes = treeProvider.getRoutes();
      if (routes.length === 0) {
        void vscode.window.showInformationMessage('Route Peek: No routes available to copy.');
        return;
      }

      const items = routes.map((r) => ({
        label: `${r.method} ${r.path}`,
        description: `${r.framework} — ${r.source.file}:${r.source.line}`,
        route: r,
      }));

      const picked = await vscode.window.showQuickPick(items, {
        placeHolder: 'Select a route to copy cURL',
      });
      if (!picked) {
        return;
      }
      route = picked.route;
    }

    const config = vscode.workspace.getConfiguration('routePeek');
    const baseUrl = config.get<string>('baseUrl') || 'http://localhost:3000';

    const curlCommand = CurlGenerator.generate(route, { baseUrl });
    await vscode.env.clipboard.writeText(curlCommand);

    outputChannel.appendLine(`Route Peek: Copied cURL to clipboard: ${curlCommand}`);
    void vscode.window.showInformationMessage('Route Peek: Copied cURL command to clipboard.');
  };
}
