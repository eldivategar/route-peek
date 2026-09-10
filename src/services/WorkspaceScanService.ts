import { Route } from '../models/Route';
import { RouteDiscoveryService } from './RouteDiscoveryService';
import { ScannerRegistry } from './ScannerRegistry';
import { FrameworkDetector, FrameworkDetectionResult } from '../scanners/FrameworkDetector';

export interface WorkspaceScanResult {
  scannedFiles: number;
  routes: Route[];
}

/**
 * Default null detector for Phase 2 where real framework detection is not yet active.
 */
class NullFrameworkDetector implements FrameworkDetector {
  public async detect(): Promise<FrameworkDetectionResult> {
    return { frameworks: [] };
  }
}

/**
 * Service representing the boundary between workspace commands and discovery orchestration.
 * In Phase 2, this delegates to RouteDiscoveryService with zero framework scanners registered,
 * guaranteeing a deterministic 0 routes result.
 */
export class WorkspaceScanService {
  private readonly discoveryService: RouteDiscoveryService;
  private _isScanning = false;

  constructor(discoveryService?: RouteDiscoveryService) {
    this.discoveryService =
      discoveryService ??
      new RouteDiscoveryService(new NullFrameworkDetector(), new ScannerRegistry());
  }

  public get isScanning(): boolean {
    return this._isScanning;
  }

  public async scan(workspaceRoots: string[]): Promise<WorkspaceScanResult> {
    if (this._isScanning) {
      throw new Error('Scan already in progress');
    }

    this._isScanning = true;
    try {
      if (!workspaceRoots || workspaceRoots.length === 0) {
        return {
          scannedFiles: 0,
          routes: [],
        };
      }

      const discoveryResult = await this.discoveryService.discover({
        workspaceRoots,
      });

      return {
        scannedFiles: 0,
        routes: discoveryResult.routes,
      };
    } finally {
      this._isScanning = false;
    }
  }
}
