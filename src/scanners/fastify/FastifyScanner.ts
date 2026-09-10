import * as fs from 'fs';
import * as path from 'path';
import { RouteScanner } from '../RouteScanner';
import { ScannerContext } from '../ScannerContext';
import { ScannerResult, ScannerError, ScannerWarning } from '../ScannerResult';
import { Framework } from '../../models/Framework';
import { Route } from '../../models/Route';
import { discoverSourceFiles } from '../../utils/fileDiscovery';
import { FastifyAnalyzer } from './FastifyAnalyzer';
import { FastifyRouteResolver } from './FastifyRouteResolver';
import { FastifyFileAnalysisResult, parseFastifyMajorVersion } from './types';
import { FastifyFrameworkDetector } from './FastifyFrameworkDetector';

export class FastifyScanner implements RouteScanner {
  public readonly framework: Framework = 'fastify';
  private readonly analyzer: FastifyAnalyzer;
  private readonly resolver: FastifyRouteResolver;
  private readonly detector: FastifyFrameworkDetector;

  constructor(
    analyzer = new FastifyAnalyzer(),
    resolver = new FastifyRouteResolver(),
    detector = new FastifyFrameworkDetector()
  ) {
    this.analyzer = analyzer;
    this.resolver = resolver;
    this.detector = detector;
  }

  public async canHandle(context: ScannerContext): Promise<boolean> {
    const detection = await this.detector.detect(context);
    return detection.frameworks.includes('fastify');
  }

  public async scan(context: ScannerContext): Promise<ScannerResult> {
    const allRoutes: Route[] = [];
    const allWarnings: ScannerWarning[] = [];
    const allErrors: ScannerError[] = [];

    if (!context.workspaceRoots || context.workspaceRoots.length === 0) {
      return {
        framework: 'fastify',
        routes: [],
        warnings: [],
        errors: [],
      };
    }

    for (const root of context.workspaceRoots) {
      let fastifyMajorVersion: number | undefined;
      const pkgPath = path.join(root, 'package.json');
      if (fs.existsSync(pkgPath)) {
        try {
          const pkgContent = await fs.promises.readFile(pkgPath, 'utf8');
          const pkg = JSON.parse(pkgContent);
          const versionStr = pkg.dependencies?.fastify ?? pkg.devDependencies?.fastify;
          if (typeof versionStr === 'string') {
            fastifyMajorVersion = parseFastifyMajorVersion(versionStr);
          }
        } catch {
          // Ignore invalid package.json
        }
      }

      const files = await discoverSourceFiles(root);
      const knownFiles = new Set(files.map((f) => f.relativePath));
      const fileResults: FastifyFileAnalysisResult[] = [];

      for (const file of files) {
        try {
          const content = await fs.promises.readFile(file.absolutePath, 'utf8');
          const result = this.analyzer.analyzeFile(
            file.relativePath,
            file.absolutePath,
            content,
            { fastifyMajorVersion }
          );

          fileResults.push(result);

          if (result.errors && result.errors.length > 0) {
            for (const err of result.errors) {
              allErrors.push({
                message: err,
                file: file.relativePath,
              });
            }
          }
        } catch (err) {
          allErrors.push({
            message: `Failed to read file '${file.relativePath}': ${err instanceof Error ? err.message : String(err)}`,
            file: file.relativePath,
          });
        }
      }

      const resolution = this.resolver.resolveRoutes(fileResults, root, knownFiles);
      allRoutes.push(...resolution.routes);

      for (const w of resolution.warnings) {
        allWarnings.push({ message: w });
      }
    }

    return {
      framework: 'fastify',
      routes: allRoutes,
      warnings: allWarnings.length > 0 ? allWarnings : undefined,
      errors: allErrors.length > 0 ? allErrors : undefined,
    };
  }
}
