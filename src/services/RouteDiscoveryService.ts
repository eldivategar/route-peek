import { Framework } from '../models/Framework';
import { Route } from '../models/Route';
import { FrameworkDetector } from '../scanners/FrameworkDetector';
import { ScannerContext } from '../scanners/ScannerContext';
import { ScannerError, ScannerWarning } from '../scanners/ScannerResult';
import { ScannerRegistry } from './ScannerRegistry';

export interface RouteDiscoveryResult {
  readonly routes: Route[];
  readonly scannedFrameworks: Framework[];
  readonly warnings: ScannerWarning[];
  readonly errors: ScannerError[];
}

/**
 * Framework-agnostic service that orchestrates framework detection and scanner execution.
 *
 * Guarantees:
 * - Deterministic route ordering: path -> method -> source.file -> source.line -> source.column -> id
 * - Fault isolation: failure in one scanner does not prevent other scanners from running
 *   or corrupt their results.
 */
export class RouteDiscoveryService {
  constructor(
    private readonly detector: FrameworkDetector,
    private readonly registry: ScannerRegistry
  ) {}

  public async discover(context: ScannerContext): Promise<RouteDiscoveryResult> {
    if (!context.workspaceRoots || context.workspaceRoots.length === 0) {
      return {
        routes: [],
        scannedFrameworks: [],
        warnings: [],
        errors: [],
      };
    }

    let detectedFrameworks: Framework[] = [];
    try {
      const detectionResult = await this.detector.detect(context);
      detectedFrameworks = detectionResult.frameworks ?? [];
    } catch (err) {
      return {
        routes: [],
        scannedFrameworks: [],
        warnings: [],
        errors: [
          {
            message: `Framework detection failed: ${err instanceof Error ? err.message : String(err)}`,
          },
        ],
      };
    }

    const discoveredRoutes: Route[] = [];
    const scannedFrameworks: Framework[] = [];
    const allWarnings: ScannerWarning[] = [];
    const allErrors: ScannerError[] = [];

    for (const framework of detectedFrameworks) {
      const scanner = this.registry.get(framework);
      if (!scanner) {
        allWarnings.push({
          message: `No scanner registered for detected framework '${framework}'.`,
        });
        continue;
      }

      try {
        const canHandle = await scanner.canHandle(context);
        if (!canHandle) {
          continue;
        }

        scannedFrameworks.push(framework);
        const result = await scanner.scan(context);

        if (result.routes && result.routes.length > 0) {
          discoveredRoutes.push(...result.routes);
        }
        if (result.warnings && result.warnings.length > 0) {
          allWarnings.push(...result.warnings);
        }
        if (result.errors && result.errors.length > 0) {
          allErrors.push(...result.errors);
        }
      } catch (err) {
        // Fault isolation: one scanner failure does not abort other scanners
        allErrors.push({
          message: `Scanner for framework '${framework}' failed: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    }

    // Deterministic sorting: path -> method -> source.file -> source.line -> source.column -> id
    discoveredRoutes.sort((a, b) => {
      const pathCmp = a.path.localeCompare(b.path);
      if (pathCmp !== 0) return pathCmp;

      const methodCmp = a.method.localeCompare(b.method);
      if (methodCmp !== 0) return methodCmp;

      const fileCmp = a.source.file.localeCompare(b.source.file);
      if (fileCmp !== 0) return fileCmp;

      const lineCmp = a.source.line - b.source.line;
      if (lineCmp !== 0) return lineCmp;

      const colA = a.source.column ?? 0;
      const colB = b.source.column ?? 0;
      const colCmp = colA - colB;
      if (colCmp !== 0) return colCmp;

      return a.id.localeCompare(b.id);
    });

    return {
      routes: discoveredRoutes,
      scannedFrameworks,
      warnings: allWarnings,
      errors: allErrors,
    };
  }
}
