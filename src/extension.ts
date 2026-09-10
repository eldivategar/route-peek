import * as vscode from 'vscode';
import { RouteTreeProvider } from './providers/RouteTreeProvider';
import { WorkspaceScanService } from './services/WorkspaceScanService';
import { RouteDiscoveryService } from './services/RouteDiscoveryService';
import { ScannerRegistry } from './services/ScannerRegistry';
import { CompositeFrameworkDetector } from './scanners/CompositeFrameworkDetector';
import { ExpressFrameworkDetector } from './scanners/express/ExpressFrameworkDetector';
import { ExpressScanner } from './scanners/express/ExpressScanner';
import { HonoFrameworkDetector } from './scanners/hono/HonoFrameworkDetector';
import { HonoScanner } from './scanners/hono/HonoScanner';
import { FastifyFrameworkDetector } from './scanners/fastify/FastifyFrameworkDetector';
import { FastifyScanner } from './scanners/fastify/FastifyScanner';
import { FiberFrameworkDetector } from './scanners/fiber/FiberFrameworkDetector';
import { FiberScanner } from './scanners/fiber/FiberScanner';
import { createScanWorkspaceCommand } from './commands/scanWorkspace';
import { createRefreshRoutesCommand } from './commands/refreshRoutes';
import { createOpenRouteSourceCommand } from './commands/openRouteSource';
import { createCopyRouteCommand } from './commands/copyRoute';
import { createCopyCurlCommand } from './commands/copyCurl';
import { createShowRouteDetailsCommand } from './commands/showRouteDetails';
import { createSearchRoutesCommand } from './commands/searchRoutes';
import { createClearSearchCommand } from './commands/clearSearch';

let outputChannel: vscode.OutputChannel | undefined;

export function activate(context: vscode.ExtensionContext): void {
  outputChannel = vscode.window.createOutputChannel('Route Peek');
  outputChannel.appendLine('Route Peek activated');
  context.subscriptions.push(outputChannel);

  const detector = new CompositeFrameworkDetector([
    new ExpressFrameworkDetector(),
    new HonoFrameworkDetector(),
    new FastifyFrameworkDetector(),
    new FiberFrameworkDetector(),
  ]);
  const registry = new ScannerRegistry();
  registry.register(new ExpressScanner());
  registry.register(new HonoScanner());
  registry.register(new FastifyScanner());
  registry.register(new FiberScanner());

  const discoveryService = new RouteDiscoveryService(detector, registry);
  const scanService = new WorkspaceScanService(discoveryService);
  const treeProvider = new RouteTreeProvider();

  const treeView = vscode.window.createTreeView('routePeek.routesView', {
    treeDataProvider: treeProvider,
    showCollapseAll: true,
  });
  context.subscriptions.push(treeView);

  const openSourceFn = createOpenRouteSourceCommand(outputChannel);
  const copyRouteFn = createCopyRouteCommand(treeProvider, outputChannel);
  const copyCurlFn = createCopyCurlCommand(treeProvider, outputChannel);

  const scanCommand = vscode.commands.registerCommand(
    'routePeek.scanWorkspace',
    createScanWorkspaceCommand(scanService, treeProvider, outputChannel)
  );
  const refreshCommand = vscode.commands.registerCommand(
    'routePeek.refreshRoutes',
    createRefreshRoutesCommand(scanService, treeProvider, outputChannel)
  );
  const openSourceCommand = vscode.commands.registerCommand(
    'routePeek.openRouteSource',
    openSourceFn
  );
  const copyRouteCommand = vscode.commands.registerCommand(
    'routePeek.copyRoute',
    copyRouteFn
  );
  const copyCurlCommand = vscode.commands.registerCommand(
    'routePeek.copyCurl',
    copyCurlFn
  );
  const showDetailsCommand = vscode.commands.registerCommand(
    'routePeek.showRouteDetails',
    createShowRouteDetailsCommand(treeProvider, openSourceFn, copyRouteFn, copyCurlFn, outputChannel)
  );
  const searchCommand = vscode.commands.registerCommand(
    'routePeek.searchRoutes',
    createSearchRoutesCommand(treeProvider, outputChannel)
  );
  const clearSearchCommand = vscode.commands.registerCommand(
    'routePeek.clearSearch',
    createClearSearchCommand(treeProvider, outputChannel)
  );

  context.subscriptions.push(
    scanCommand,
    refreshCommand,
    openSourceCommand,
    copyRouteCommand,
    copyCurlCommand,
    showDetailsCommand,
    searchCommand,
    clearSearchCommand
  );

}

export function deactivate(): void {
  outputChannel = undefined;
}
