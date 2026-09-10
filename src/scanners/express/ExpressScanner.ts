import * as fs from 'fs';
import { RouteScanner } from '../RouteScanner';
import { ScannerContext } from '../ScannerContext';
import { ScannerResult, ScannerError, ScannerWarning } from '../ScannerResult';
import { Framework } from '../../models/Framework';
import { Route } from '../../models/Route';
import { discoverSourceFiles } from '../../utils/fileDiscovery';
import { ExpressAnalyzer } from './ExpressAnalyzer';
import { ExpressRouteResolver } from './ExpressRouteResolver';
import { FileAnalysisResult } from './types';
import { ExpressFrameworkDetector } from './ExpressFrameworkDetector';

export class ExpressScanner implements RouteScanner {
  public readonly framework: Framework = 'express';
  private readonly analyzer: ExpressAnalyzer;
  private readonly resolver: ExpressRouteResolver;
  private readonly detector: ExpressFrameworkDetector;

  constructor(
    analyzer = new ExpressAnalyzer(),
    resolver = new ExpressRouteResolver(),
    detector = new ExpressFrameworkDetector()
  ) {
    this.analyzer = analyzer;
    this.resolver = resolver;
    this.detector = detector;
  }

  public async canHandle(context: ScannerContext): Promise<boolean> {
    const detection = await this.detector.detect(context);
    return detection.frameworks.includes('express');
  }

  public async scan(context: ScannerContext): Promise<ScannerResult> {
    const allRoutes: Route[] = [];
    const allWarnings: ScannerWarning[] = [];
    const allErrors: ScannerError[] = [];

    if (!context.workspaceRoots || context.workspaceRoots.length === 0) {
      return {
        framework: 'express',
        routes: [],
        warnings: [],
        errors: [],
      };
    }

    for (const root of context.workspaceRoots) {
      const files = await discoverSourceFiles(root);
      const knownFiles = new Set(files.map((f) => f.relativePath));
      const fileResults: FileAnalysisResult[] = [];

      for (const file of files) {
        try {
          const content = await fs.promises.readFile(file.absolutePath, 'utf8');
          const result = this.analyzer.analyzeFile(
            file.relativePath,
            file.absolutePath,
            content
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
      framework: 'express',
      routes: allRoutes,
      warnings: allWarnings.length > 0 ? allWarnings : undefined,
      errors: allErrors.length > 0 ? allErrors : undefined,
    };
  }
}
