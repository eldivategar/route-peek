import * as vscode from 'vscode';
import { Route } from '../models/Route';
import { RouteGroup, getRelativeRoutePath } from './routeGrouping';
import { RouteTreeNode } from './RouteTreeNode';

function formatFramework(framework: string): string {
  if (framework === 'express') return 'Express';
  if (framework === 'fastify') return 'Fastify';
  if (framework === 'hono') return 'Hono';
  if (framework === 'nestjs') return 'NestJS';
  return framework.charAt(0).toUpperCase() + framework.slice(1);
}

function capitalize(str: string): string {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function getMethodThemeColor(method: string): vscode.ThemeColor | undefined {
  if (typeof vscode.ThemeColor !== 'function') {
    return undefined;
  }
  switch (method.toUpperCase()) {
    case 'GET':
      return new vscode.ThemeColor('charts.green');
    case 'POST':
      return new vscode.ThemeColor('charts.blue');
    case 'PUT':
    case 'PATCH':
      return new vscode.ThemeColor('charts.yellow');
    case 'DELETE':
      return new vscode.ThemeColor('charts.red');
    default:
      return new vscode.ThemeColor('charts.purple');
  }
}

export class RouteTreeItem extends vscode.TreeItem {
  public readonly frameworkGroupKey?: string;
  public readonly routeGroup?: RouteGroup;
  public readonly node?: RouteTreeNode;

  constructor(
    public readonly label: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState = vscode.TreeItemCollapsibleState.None,
    public readonly contextValue: string = 'info',
    public readonly route?: Route,
    frameworkGroupKey?: string,
    routeGroup?: RouteGroup,
    node?: RouteTreeNode
  ) {
    super(label, collapsibleState);
    this.frameworkGroupKey = frameworkGroupKey;
    this.routeGroup = routeGroup;
    this.node = node;
  }

  public static fromNode(node: RouteTreeNode, isFiltered: boolean = false): RouteTreeItem {
    const warningColor =
      typeof vscode.ThemeColor === 'function'
        ? new vscode.ThemeColor('editorWarning.foreground')
        : undefined;

    switch (node.type) {
      case 'framework': {
        const label = `${formatFramework(node.framework ?? '')} (${node.count})`;
        const item = new RouteTreeItem(
          label,
          vscode.TreeItemCollapsibleState.Expanded,
          'framework-group',
          undefined,
          node.framework,
          undefined,
          node
        );
        item.iconPath = new vscode.ThemeIcon('symbol-namespace');
        return item;
      }

      case 'resource': {
        const label = `${node.resourcePrefix === '/' ? 'Root' : node.resourcePrefix} (${node.count})`;
        const collapsibleState =
          isFiltered || node.count <= 2
            ? vscode.TreeItemCollapsibleState.Expanded
            : vscode.TreeItemCollapsibleState.Collapsed;

        const item = new RouteTreeItem(
          label,
          collapsibleState,
          'route-group',
          undefined,
          undefined,
          undefined,
          node
        );
        item.iconPath = new vscode.ThemeIcon('symbol-folder');
        item.tooltip = `Route Group: ${node.resourcePrefix === '/' ? 'Root' : node.resourcePrefix} (${node.count} route${node.count === 1 ? '' : 's'})`;
        return item;
      }

      case 'path': {
        const label = node.endpointPath ?? node.fullPath ?? '';
        const collapsibleState =
          isFiltered || node.count <= 2
            ? vscode.TreeItemCollapsibleState.Expanded
            : vscode.TreeItemCollapsibleState.Collapsed;

        const item = new RouteTreeItem(
          label,
          collapsibleState,
          'path',
          undefined,
          undefined,
          undefined,
          node
        );
        item.iconPath = new vscode.ThemeIcon('symbol-folder');
        item.tooltip = `Path: ${node.fullPath ?? label} (${node.count} route${node.count === 1 ? '' : 's'})`;
        return item;
      }

      case 'endpoint': {
        const label = node.endpointPath ?? node.fullPath ?? '';
        const methodsStr = node.routes.map((r) => r.method.toUpperCase()).join(' · ');
        const hasChildren = !!node.children && node.children.length > 0;

        if (node.routes.length === 1 && node.route) {
          // Single-route endpoint (Case C, lifted Case A, or Case E endpoint + descendants)
          const route = node.route;
          const collapsibleState = hasChildren
            ? (isFiltered
                ? vscode.TreeItemCollapsibleState.Expanded
                : vscode.TreeItemCollapsibleState.Collapsed)
            : vscode.TreeItemCollapsibleState.None;

          const item = new RouteTreeItem(
            label,
            collapsibleState,
            'route',
            route,
            undefined,
            undefined,
            node
          );
          item.description = methodsStr;
          const methodColor = getMethodThemeColor(route.method);
          item.iconPath = node.isDynamic
            ? new vscode.ThemeIcon('warning', warningColor)
            : new vscode.ThemeIcon('symbol-method', methodColor);

          const dynamicWarning = node.isDynamic
            ? '\n\nNote: This route contains a path segment that could not be statically resolved.'
            : '';

          item.tooltip = `${route.method} ${route.path}\n\n${formatFramework(route.framework)}\n${capitalize(route.confidence)} confidence${dynamicWarning}\n\nSource:\n${route.source.file}:${route.source.line}`;

          item.command = {
            command: 'routePeek.openRouteSource',
            title: 'Open Route Source',
            arguments: [route],
          };

          return item;
        }

        // Multi-method endpoint (Case D or multi-method parent with sub-paths): collapsible node
        const collapsibleState = isFiltered
          ? vscode.TreeItemCollapsibleState.Expanded
          : vscode.TreeItemCollapsibleState.Collapsed;

        const item = new RouteTreeItem(
          label,
          collapsibleState,
          'endpoint',
          undefined,
          undefined,
          undefined,
          node
        );
        item.description = methodsStr;
        item.iconPath = node.isDynamic
          ? new vscode.ThemeIcon('warning', warningColor)
          : new vscode.ThemeIcon('symbol-property');

        const dynamicWarning = node.isDynamic
          ? '\n\nNote: This endpoint contains dynamic route segments that could not be statically resolved.'
          : '';

        item.tooltip = `${node.fullPath}\n\nMethods: ${node.routes.map((r) => r.method.toUpperCase()).join(', ')}\n${node.count} routes${dynamicWarning}`;

        return item;
      }

      case 'method': {
        const route = node.route!;
        const label = route.method.toUpperCase();
        const item = new RouteTreeItem(
          label,
          vscode.TreeItemCollapsibleState.None,
          'route',
          route,
          undefined,
          undefined,
          node
        );

        item.description = `${route.source.file}:${route.source.line}`;
        const methodColor = getMethodThemeColor(route.method);
        item.iconPath = node.isDynamic
          ? new vscode.ThemeIcon('warning', warningColor)
          : new vscode.ThemeIcon('symbol-method', methodColor);

        const dynamicWarning = node.isDynamic
          ? '\n\nNote: This route contains a path segment that could not be statically resolved.'
          : '';

        item.tooltip = `${route.method} ${route.path}\n\n${formatFramework(route.framework)}\n${capitalize(route.confidence)} confidence${dynamicWarning}\n\nSource:\n${route.source.file}:${route.source.line}`;

        item.command = {
          command: 'routePeek.openRouteSource',
          title: 'Open Route Source',
          arguments: [route],
        };

        return item;
      }
    }
  }

  public static fromRoute(route: Route, groupPrefix?: string): RouteTreeItem {
    const isDynamic = route.confidence === 'low' || route.path.includes('<dynamic>');
    const relativePath = groupPrefix ? getRelativeRoutePath(route.path, groupPrefix) : route.path;
    const paddedMethod = route.method.toUpperCase().padEnd(6, ' ');
    const label = `${paddedMethod}  ${relativePath}`;

    const item = new RouteTreeItem(
      label,
      vscode.TreeItemCollapsibleState.None,
      'route',
      route
    );

    item.description = `${route.source.file}:${route.source.line}`;
    const warningColor =
      typeof vscode.ThemeColor === 'function'
        ? new vscode.ThemeColor('editorWarning.foreground')
        : undefined;
    const methodColor = getMethodThemeColor(route.method);

    item.iconPath = isDynamic
      ? new vscode.ThemeIcon('warning', warningColor)
      : new vscode.ThemeIcon('symbol-method', methodColor);

    const dynamicWarning = isDynamic
      ? '\n\nNote: This route contains a path segment that could not be statically resolved.'
      : '';

    item.tooltip = `${route.method} ${route.path}\n\n${formatFramework(route.framework)}\n${capitalize(route.confidence)} confidence${dynamicWarning}\n\nSource:\n${route.source.file}:${route.source.line}`;

    item.command = {
      command: 'routePeek.openRouteSource',
      title: 'Open Route Source',
      arguments: [route],
    };

    return item;
  }

  public static routeGroup(group: RouteGroup, isFiltered: boolean = false): RouteTreeItem {
    const label = `${group.label} (${group.count})`;
    const collapsibleState =
      isFiltered || group.count <= 2
        ? vscode.TreeItemCollapsibleState.Expanded
        : vscode.TreeItemCollapsibleState.Collapsed;

    const item = new RouteTreeItem(
      label,
      collapsibleState,
      'route-group',
      undefined,
      undefined,
      group
    );

    item.iconPath = new vscode.ThemeIcon('symbol-folder');
    item.tooltip = `Route Group: ${group.label} (${group.count} route${group.count === 1 ? '' : 's'})`;
    return item;
  }

  public static frameworkGroup(framework: string, count: number): RouteTreeItem {
    const label = `${formatFramework(framework)} (${count})`;
    const item = new RouteTreeItem(
      label,
      vscode.TreeItemCollapsibleState.Expanded,
      'framework-group',
      undefined,
      framework
    );
    item.iconPath = new vscode.ThemeIcon('symbol-namespace');
    return item;
  }

  public static statusItem(
    label: string,
    description?: string,
    iconName: string = 'info',
    tooltip?: string
  ): RouteTreeItem {
    const item = new RouteTreeItem(
      label,
      vscode.TreeItemCollapsibleState.None,
      'status'
    );
    item.description = description;
    item.iconPath = new vscode.ThemeIcon(iconName);
    item.tooltip = tooltip ?? (description ? `${label} — ${description}` : label);
    return item;
  }
}
