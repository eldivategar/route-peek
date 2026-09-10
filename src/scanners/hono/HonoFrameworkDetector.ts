import * as fs from 'fs';
import * as path from 'path';
import { FrameworkDetector, FrameworkDetectionResult } from '../FrameworkDetector';
import { ScannerContext } from '../ScannerContext';
import { discoverSourceFiles } from '../../utils/fileDiscovery';

const HONO_IMPORT_REGEX =
  /(?:import\s+.*\s+from\s+['"](?:hono(?:\/.*)?|@hono\/.*)['"]|require\s*\(\s*['"](?:hono(?:\/.*)?|@hono\/.*)['"]\s*\))/;

/**
 * Static framework detector that determines whether Hono.js is used in the workspace
 * by inspecting package manifests and source import statements without executing code.
 */
export class HonoFrameworkDetector implements FrameworkDetector {
  public async detect(context: ScannerContext): Promise<FrameworkDetectionResult> {
    if (!context.workspaceRoots || context.workspaceRoots.length === 0) {
      return { frameworks: [] };
    }

    for (const root of context.workspaceRoots) {
      // 1. Check root package.json
      const pkgPath = path.join(root, 'package.json');
      if (fs.existsSync(pkgPath)) {
        try {
          const content = await fs.promises.readFile(pkgPath, 'utf8');
          const pkg = JSON.parse(content);
          const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
          if (
            allDeps['hono'] ||
            Object.keys(allDeps).some((d) => d.startsWith('@hono/'))
          ) {
            return { frameworks: ['hono'] };
          }
        } catch {
          // Ignore invalid package.json and fall through
        }
      }

      // 2. Check source files for static Hono imports/requires
      const files = await discoverSourceFiles(root);
      for (const file of files) {
        try {
          const content = await fs.promises.readFile(file.absolutePath, 'utf8');
          if (HONO_IMPORT_REGEX.test(content)) {
            return { frameworks: ['hono'] };
          }
        } catch {
          // continue
        }
      }
    }

    return { frameworks: [] };
  }
}
