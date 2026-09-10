import * as vscode from 'vscode';
import { RouteTreeItem } from './RouteTreeItem';
import { Route } from '../models/Route';
import { RouteSearchService } from '../services/RouteSearchService';
import { RouteTreeNode } from './RouteTreeNode';
import { RouteTreeModelBuilder } from './RouteTreeModelBuilder';

export type ScanState = 'idle' | 'scanning' | 'success' | 'empty' | 'error';

export class RouteTreeProvider implements vscode.TreeDataProvider<RouteTreeItem> {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<RouteTreeItem | undefined | void>();
  public readonly onDidChangeTreeData: vscode.Event<RouteTreeItem | undefined | void> =
    this._onDidChangeTreeData.event;

  private routes: Route[] = [];
  private filteredRoutes: Route[] = [];
  private treeNodes: RouteTreeNode[] = [];
  private state: ScanState = 'idle';
  private searchQuery: string = '';
  private errorMessage?: string;

  public getState(): ScanState {
    return this.state;
  }

  public getRoutes(): readonly Route[] {
    return this.routes;
  }

  public getFilteredRoutes(): readonly Route[] {
    return this.filteredRoutes;
  }

  public getTreeNodes(): readonly RouteTreeNode[] {
    return this.treeNodes;
  }

  public getActiveSearchQuery(): string {
    return this.searchQuery;
  }

  public setRoutes(routes: Route[]): void {
    this.routes = routes;
    this.state = routes.length > 0 ? 'success' : 'empty';
    this.applySearchFilter();
  }

  public setState(state: ScanState, errorMessage?: string): void {
    this.state = state;
    this.errorMessage = errorMessage;
    if (state === 'idle') {
      this.routes = [];
      this.filteredRoutes = [];
      this.treeNodes = [];
      this.searchQuery = '';
    }
    this.refresh();
  }

  public setSearchFilter(query: string): void {
    this.searchQuery = query;
    this.applySearchFilter();
  }

  public clearSearchFilter(): void {
    this.searchQuery = '';
    this.applySearchFilter();
  }

  private applySearchFilter(): void {
    if (!this.searchQuery.trim()) {
      this.filteredRoutes = [...this.routes];
    } else {
      this.filteredRoutes = RouteSearchService.search(this.routes, this.searchQuery);
    }
    this.treeNodes = RouteTreeModelBuilder.build(this.filteredRoutes);
    this.refresh();
  }

  public refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  public getTreeItem(element: RouteTreeItem): vscode.TreeItem {
    return element;
  }

  public getChildren(element?: RouteTreeItem): Thenable<RouteTreeItem[]> {
    const isFiltered = !!this.searchQuery.trim();

    if (!element) {
      // Root level
      switch (this.state) {
        case 'idle':
          return Promise.resolve([
            RouteTreeItem.statusItem(
              'No routes discovered yet.',
              "Run 'Scan Workspace' to scan",
              'info',
              "No routes discovered yet. Run 'Scan Workspace' to analyze this workspace."
            ),
          ]);
        case 'scanning':
          return Promise.resolve([
            RouteTreeItem.statusItem(
              'Scanning workspace...',
              'Please wait',
              'loading~spin',
              'Scanning workspace for API routes...'
            ),
          ]);
        case 'empty':
          return Promise.resolve([
            RouteTreeItem.statusItem(
              'No routes found in this workspace.',
              undefined,
              'info',
              'The workspace was analyzed, but no API routes were found.'
            ),
          ]);
        case 'error':
          return Promise.resolve([
            RouteTreeItem.statusItem(
              'Failed to scan workspace.',
              this.errorMessage ?? "Run 'Scan Workspace' again",
              'error',
              this.errorMessage
                ? `Error: ${this.errorMessage}`
                : "Failed to scan workspace. Check Output panel for details."
            ),
          ]);
        case 'success': {
          if (this.filteredRoutes.length === 0 && this.searchQuery.trim()) {
            return Promise.resolve([
              RouteTreeItem.statusItem(
                `No routes matching '${this.searchQuery}'.`,
                'Clear filter to see all routes',
                'search-stop'
              ),
            ]);
          }

          const frameworkItems = this.treeNodes.map((node) =>
            RouteTreeItem.fromNode(node, isFiltered)
          );
          return Promise.resolve(frameworkItems);
        }
      }
    }

    // Child level from presentation node
    if (element.node?.children) {
      const childItems = element.node.children.map((child) =>
        RouteTreeItem.fromNode(child, isFiltered)
      );
      return Promise.resolve(childItems);
    }

    // Fallback for legacy items without element.node
    if (element.frameworkGroupKey) {
      const fwNode = this.treeNodes.find((n) => n.framework === element.frameworkGroupKey);
      if (fwNode?.children) {
        const items = fwNode.children.map((child) =>
          RouteTreeItem.fromNode(child, isFiltered)
        );
        return Promise.resolve(items);
      }
    }

    return Promise.resolve([]);
  }
}
