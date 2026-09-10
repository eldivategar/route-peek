import * as fs from 'fs';
import * as path from 'path';
import { parser } from '@lezer/go';
import { FrameworkDetector, FrameworkDetectionResult } from '../FrameworkDetector';
import { ScannerContext } from '../ScannerContext';
import { discoverSourceFiles } from '../../utils/fileDiscovery';

function isFiberModuleSpecifier(specifier: string): boolean {
  return (
    specifier === 'github.com/gofiber/fiber/v3' ||
    specifier.startsWith('github.com/gofiber/fiber/v3/') ||
    specifier === 'github.com/gofiber/fiber/v2' ||
    specifier.startsWith('github.com/gofiber/fiber/v2/')
  );
}

function hasFiberGoModEvidence(goModContent: string): boolean {
  const lines = goModContent.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (
      trimmed.includes('github.com/gofiber/fiber/v3') ||
      trimmed.includes('github.com/gofiber/fiber/v2')
    ) {
      return true;
    }
  }
  return false;
}

function hasFiberAstEvidence(sourceText: string): boolean {
  let tree;
  try {
    tree = parser.parse(sourceText);
  } catch {
    return false;
  }

  let found = false;

  tree.iterate({
    enter(node) {
      if (found) return;

      // 1. Check ImportSpec for Fiber module
      if (node.name === 'ImportSpec') {
        const specNode = node.node;
        for (let c = specNode.firstChild; c; c = c.nextSibling) {
          if (c.name === 'String') {
            const raw = sourceText.slice(c.from, c.to).replace(/^["`]|["`]$/g, '');
            if (isFiberModuleSpecifier(raw)) {
              found = true;
              return;
            }
          }
        }
      }

      // 2. Check CallExpr for fiber.New()
      if (node.name === 'CallExpr') {
        const selector = node.node.getChild('SelectorExpr');
        if (selector) {
          const operand = selector.firstChild;
          const field = selector.getChild('FieldName');
          if (operand && field) {
            const receiver = sourceText.slice(operand.from, operand.to);
            const method = sourceText.slice(field.from, field.to);
            if (receiver === 'fiber' && method === 'New') {
              found = true;
              return;
            }
          }
        }
      }
    },
  });

  return found;
}

/**
 * Static framework detector that determines whether Go Fiber is used in the workspace
 * by inspecting go.mod and parsing Go AST without executing code or invoking the Go toolchain.
 */
export class FiberFrameworkDetector implements FrameworkDetector {
  public async detect(context: ScannerContext): Promise<FrameworkDetectionResult> {
    if (!context.workspaceRoots || context.workspaceRoots.length === 0) {
      return { frameworks: [] };
    }

    for (const root of context.workspaceRoots) {
      // 1. Primary evidence: check go.mod dependencies
      const goModPath = path.join(root, 'go.mod');
      if (fs.existsSync(goModPath)) {
        try {
          const content = await fs.promises.readFile(goModPath, 'utf8');
          if (hasFiberGoModEvidence(content)) {
            return { frameworks: ['fiber'] };
          }
        } catch {
          // Ignore invalid go.mod and fall through
        }
      }

      // 2. Secondary evidence: check Go source files for static Fiber AST import / fiber.New()
      const files = await discoverSourceFiles(root, undefined, new Set(['.go']));
      for (const file of files) {
        try {
          const content = await fs.promises.readFile(file.absolutePath, 'utf8');
          if (hasFiberAstEvidence(content)) {
            return { frameworks: ['fiber'] };
          }
        } catch {
          // continue
        }
      }
    }

    return { frameworks: [] };
  }
}
