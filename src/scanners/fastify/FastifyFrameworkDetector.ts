import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';
import { FrameworkDetector, FrameworkDetectionResult } from '../FrameworkDetector';
import { ScannerContext } from '../ScannerContext';
import { discoverSourceFiles } from '../../utils/fileDiscovery';

function isFastifyModuleSpecifier(specifier: string): boolean {
  return specifier === 'fastify' || specifier.startsWith('fastify/');
}

function hasFastifyAstEvidence(sourceText: string, filePath: string): boolean {
  let sourceFile: ts.SourceFile;
  try {
    sourceFile = ts.createSourceFile(
      filePath,
      sourceText,
      ts.ScriptTarget.Latest,
      true
    );
  } catch {
    return false;
  }

  let found = false;

  function visit(node: ts.Node): void {
    if (found) return;

    // 1. ESM Import: import ... from 'fastify'
    if (ts.isImportDeclaration(node)) {
      if (ts.isStringLiteral(node.moduleSpecifier) && isFastifyModuleSpecifier(node.moduleSpecifier.text)) {
        found = true;
        return;
      }
    }

    // 2. CJS require: require('fastify')
    if (ts.isCallExpression(node)) {
      if (
        ts.isIdentifier(node.expression) &&
        node.expression.text === 'require' &&
        node.arguments.length >= 1 &&
        ts.isStringLiteral(node.arguments[0]) &&
        isFastifyModuleSpecifier(node.arguments[0].text)
      ) {
        found = true;
        return;
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return found;
}

/**
 * Static framework detector that determines whether Fastify is used in the workspace
 * by inspecting package manifests and parsing source AST without executing code or regex guessing.
 */
export class FastifyFrameworkDetector implements FrameworkDetector {
  public async detect(context: ScannerContext): Promise<FrameworkDetectionResult> {
    if (!context.workspaceRoots || context.workspaceRoots.length === 0) {
      return { frameworks: [] };
    }

    for (const root of context.workspaceRoots) {
      // 1. Primary evidence: check package.json dependencies
      const pkgPath = path.join(root, 'package.json');
      if (fs.existsSync(pkgPath)) {
        try {
          const content = await fs.promises.readFile(pkgPath, 'utf8');
          const pkg = JSON.parse(content);
          const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
          if (allDeps['fastify']) {
            return { frameworks: ['fastify'] };
          }
        } catch {
          // Ignore invalid package.json and fall through
        }
      }

      // 2. Secondary evidence: check source files for static Fastify AST import/require statements
      const files = await discoverSourceFiles(root);
      for (const file of files) {
        try {
          const content = await fs.promises.readFile(file.absolutePath, 'utf8');
          if (hasFastifyAstEvidence(content, file.absolutePath)) {
            return { frameworks: ['fastify'] };
          }
        } catch {
          // continue
        }
      }
    }

    return { frameworks: [] };
  }
}
