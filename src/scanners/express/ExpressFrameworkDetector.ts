import * as fs from 'fs';
import * as path from 'path';
import { FrameworkDetector, FrameworkDetectionResult } from '../FrameworkDetector';
import { ScannerContext } from '../ScannerContext';
import { discoverSourceFiles } from '../../utils/fileDiscovery';

const EXPRESS_IMPORT_REGEX =
  /(?:import\s+.*\s+from\s+['"]express['"]|require\s*\(\s*['"]express['"]\s*\))/;

/**
 * Static framework detector that determines whether Express is used in the workspace
 * by inspecting package manifests and source import statements without executing code.
 */
export class ExpressFrameworkDetector implements FrameworkDetector {
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
          if (
            (pkg.dependencies && pkg.dependencies.express) ||
            (pkg.devDependencies && pkg.devDependencies.express)
          ) {
            return { frameworks: ['express'] };
          }
        } catch {
          // Ignore invalid package.json and fall through
        }
      }

      // 2. Check source files for static Express imports/requires
      const files = await discoverSourceFiles(root);
      for (const file of files) {
        try {
          const content = await fs.promises.readFile(file.absolutePath, 'utf8');
          if (EXPRESS_IMPORT_REGEX.test(content)) {
            return { frameworks: ['express'] };
          }
        } catch {
          // continue
        }
      }
    }

    return { frameworks: [] };
  }
}
