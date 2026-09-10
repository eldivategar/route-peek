import * as vscode from 'vscode';
import { Route } from '../models/Route';
import { RouteTreeItem } from '../providers/RouteTreeItem';
import { RouteTreeProvider } from '../providers/RouteTreeProvider';

export function createShowRouteDetailsCommand(
  treeProvider: RouteTreeProvider,
  openSourceFn: (route: Route) => Promise<void>,
  copyRouteFn: (route: Route) => Promise<void>,
  copyCurlFn: (route: Route) => Promise<void>,
  outputChannel: vscode.OutputChannel
): (routeOrItem?: Route | RouteTreeItem) => Promise<void> {
  return async (routeOrItem?: Route | RouteTreeItem) => {
    let route = routeOrItem instanceof RouteTreeItem ? routeOrItem.route : routeOrItem;

    if (!route) {
      const routes = treeProvider.getRoutes();
      if (routes.length === 0) {
        void vscode.window.showInformationMessage('Route Peek: No routes discovered yet.');
        return;
      }

      const items = routes.map((r) => ({
        label: `${r.method} ${r.path}`,
        description: `${r.framework} — ${r.source.file}:${r.source.line}`,
        route: r,
      }));

      const picked = await vscode.window.showQuickPick(items, {
        placeHolder: 'Select a route to inspect details',
      });
      if (!picked) {
        return;
      }
      route = picked.route;
    }

    outputChannel.appendLine(
      `Route Peek: Details for ${route.method} ${route.path} (${route.framework}, confidence: ${route.confidence})`
    );

    const isDynamic = route.confidence === 'low' || route.path.includes('<dynamic>');
    const dynamicWarning = isDynamic
      ? '\nWarning: Path contains a dynamically resolved segment. The actual runtime value could not be determined statically.'
      : '';

    const detailMessage = `${route.method} ${route.path}\nFramework: ${route.framework}\nConfidence: ${route.confidence}\nSource: ${route.source.file}:${route.source.line}:${route.source.column}\nRoute ID: ${route.id}${dynamicWarning}`;

    const choice = await vscode.window.showInformationMessage(
      detailMessage,
      'Open Source',
      'Copy Route',
      'Copy cURL'
    );

    if (choice === 'Open Source') {
      await openSourceFn(route);
    } else if (choice === 'Copy Route') {
      await copyRouteFn(route);
    } else if (choice === 'Copy cURL') {
      await copyCurlFn(route);
    }
  };
}

