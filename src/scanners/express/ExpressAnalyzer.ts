import * as ts from 'typescript';
import * as path from 'path';
import {
  FileAnalysisResult,
  RouterDeclaration,
  RawRouteDeclaration,
  RouterMountDeclaration,
  ImportBinding,
  ExportBinding,
  RouterSymbolId,
} from './types';
import { HttpMethod, HTTP_METHODS } from '../../models/HttpMethod';
import { RouteConfidence } from '../../models/RouteConfidence';
import { RouteSource } from '../../models/RouteSource';

const SUPPORTED_HTTP_METHODS = new Set<string>([
  'get',
  'post',
  'put',
  'patch',
  'delete',
  'options',
  'head',
  'trace',
]);

interface PathEvalResult {
  readonly path: string;
  readonly confidence: RouteConfidence;
  readonly isDynamic?: boolean;
}

export class ExpressAnalyzer {
  /**
   * Analyzes a single JavaScript or TypeScript source file and extracts
   * file-level Express artifacts: routers, routes, mounts, imports, and exports.
   */
  public analyzeFile(
    relativePath: string,
    absolutePath: string,
    content: string
  ): FileAnalysisResult {
    const normRel = relativePath.replace(/\\/g, '/');
    const warnings: string[] = [];
    const errors: string[] = [];

    const ext = path.extname(absolutePath).toLowerCase();
    let scriptKind = ts.ScriptKind.TS;
    if (ext === '.tsx') scriptKind = ts.ScriptKind.TSX;
    else if (ext === '.jsx') scriptKind = ts.ScriptKind.JSX;
    else if (ext === '.js' || ext === '.mjs' || ext === '.cjs')
      scriptKind = ts.ScriptKind.JS;

    let sourceFile: ts.SourceFile;
    try {
      sourceFile = ts.createSourceFile(
        absolutePath,
        content,
        ts.ScriptTarget.Latest,
        true,
        scriptKind
      );
    } catch (err) {
      return {
        file: normRel,
        absolutePath,
        routers: [],
        routes: [],
        mounts: [],
        imports: [],
        exports: [],
        warnings: [],
        errors: [
          `Failed to parse file '${normRel}': ${err instanceof Error ? err.message : String(err)}`,
        ],
      };
    }

    const imports: ImportBinding[] = [];
    const exports: ExportBinding[] = [];
    const routers: RouterDeclaration[] = [];
    const routes: RawRouteDeclaration[] = [];
    const mounts: RouterMountDeclaration[] = [];

    // Local symbol tracking for false positive protection
    const expressModuleIdentifiers = new Set<string>(); // e.g. "express"
    const expressRouterFactoryIdentifiers = new Set<string>(); // e.g. "Router" from "import { Router } from 'express'"
    const appSymbolIds = new Map<string, RouterSymbolId>(); // varName -> symbolId
    const routerSymbolIds = new Map<string, RouterSymbolId>(); // varName -> symbolId
    const declaredRoutersByNode = new Map<ts.Node, RouterSymbolId>(); // Declaration node -> symbolId
    const localConstants = new Map<string, string>(); // varName -> string value

    function findLexicalDeclaration(idNode: ts.Identifier): ts.Declaration | undefined {
      const targetName = idNode.text;
      let current: ts.Node | undefined = idNode.parent;

      while (current) {
        // 1. Function / Method / ArrowFunction parameters
        if (
          ts.isFunctionDeclaration(current) ||
          ts.isFunctionExpression(current) ||
          ts.isArrowFunction(current) ||
          ts.isMethodDeclaration(current)
        ) {
          for (const param of current.parameters) {
            if (ts.isIdentifier(param.name) && param.name.text === targetName) {
              return param;
            }
          }
        }

        // 2. Statements in blocks, source file, or clauses
        if (
          ts.isBlock(current) ||
          ts.isSourceFile(current) ||
          ts.isModuleBlock(current) ||
          ts.isCaseClause(current) ||
          ts.isDefaultClause(current)
        ) {
          for (const stmt of current.statements) {
            if (ts.isVariableStatement(stmt)) {
              for (const decl of stmt.declarationList.declarations) {
                if (ts.isIdentifier(decl.name) && decl.name.text === targetName) {
                  return decl;
                }
              }
            }
            if (ts.isFunctionDeclaration(stmt) && stmt.name && stmt.name.text === targetName) {
              return stmt;
            }
            if (ts.isClassDeclaration(stmt) && stmt.name && stmt.name.text === targetName) {
              return stmt;
            }
          }
        }

        // 3. Catch clause parameter: catch (app)
        if (ts.isCatchClause(current) && current.variableDeclaration) {
          if (
            ts.isIdentifier(current.variableDeclaration.name) &&
            current.variableDeclaration.name.text === targetName
          ) {
            return current.variableDeclaration;
          }
        }

        current = current.parent;
      }

      return undefined;
    }

    function getSourceLocation(node: ts.Node): RouteSource {
      const { line, character } = sourceFile.getLineAndCharacterOfPosition(
        node.getStart(sourceFile)
      );
      const end = sourceFile.getLineAndCharacterOfPosition(node.getEnd());
      return {
        file: normRel,
        line: line + 1,
        column: character + 1,
        endLine: end.line + 1,
        endColumn: end.character + 1,
      };
    }

    function createSymbolId(varName: string, node: ts.Node): RouterSymbolId {
      const { line, character } = sourceFile.getLineAndCharacterOfPosition(
        node.getStart(sourceFile)
      );
      return `${normRel}#${varName}@${line + 1}:${character + 1}`;
    }

    // --- Pass 1: Collect Imports & Local Constants ---
    function collectImportsAndConstants(node: ts.Node): void {
      // 1. ESM Import Declarations
      if (ts.isImportDeclaration(node)) {
        const moduleSpecifier = (node.moduleSpecifier as ts.StringLiteral).text;
        const line =
          sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;

        if (node.importClause) {
          // Default import: import express from 'express' or import userRouter from './users'
          if (node.importClause.name) {
            const localName = node.importClause.name.text;
            if (moduleSpecifier === 'express') {
              expressModuleIdentifiers.add(localName);
            } else {
              imports.push({
                localName,
                importedName: 'default',
                moduleSpecifier,
                sourceFile: normRel,
                line,
              });
            }
          }

          // Named imports: import { Router as MyRouter } from 'express'
          if (
            node.importClause.namedBindings &&
            ts.isNamedImports(node.importClause.namedBindings)
          ) {
            for (const spec of node.importClause.namedBindings.elements) {
              const importedName = spec.propertyName
                ? spec.propertyName.text
                : spec.name.text;
              const localName = spec.name.text;

              if (moduleSpecifier === 'express') {
                if (importedName === 'Router') {
                  expressRouterFactoryIdentifiers.add(localName);
                }
              } else {
                imports.push({
                  localName,
                  importedName,
                  moduleSpecifier,
                  sourceFile: normRel,
                  line,
                });
              }
            }
          } else if (
            node.importClause.namedBindings &&
            ts.isNamespaceImport(node.importClause.namedBindings)
          ) {
            const localName = node.importClause.namedBindings.name.text;
            if (moduleSpecifier === 'express') {
              expressModuleIdentifiers.add(localName);
            } else {
              imports.push({
                localName,
                importedName: '*',
                moduleSpecifier,
                sourceFile: normRel,
                line,
              });
            }
          }
        }
      }

      // 2. CommonJS Require Statements: const express = require('express')
      if (
        ts.isVariableDeclaration(node) &&
        node.initializer &&
        ts.isCallExpression(node.initializer)
      ) {
        const call = node.initializer;
        if (
          ts.isIdentifier(call.expression) &&
          call.expression.text === 'require' &&
          call.arguments.length === 1 &&
          ts.isStringLiteral(call.arguments[0])
        ) {
          const moduleSpecifier = call.arguments[0].text;
          const line =
            sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;

          if (ts.isIdentifier(node.name)) {
            const localName = node.name.text;
            if (moduleSpecifier === 'express') {
              expressModuleIdentifiers.add(localName);
            } else {
              imports.push({
                localName,
                importedName: 'default',
                moduleSpecifier,
                sourceFile: normRel,
                line,
              });
            }
          } else if (ts.isObjectBindingPattern(node.name)) {
            for (const elem of node.name.elements) {
              if (ts.isIdentifier(elem.name)) {
                const localName = elem.name.text;
                const importedName =
                  elem.propertyName && ts.isIdentifier(elem.propertyName)
                    ? elem.propertyName.text
                    : localName;

                if (moduleSpecifier === 'express') {
                  if (importedName === 'Router') {
                    expressRouterFactoryIdentifiers.add(localName);
                  }
                } else {
                  imports.push({
                    localName,
                    importedName,
                    moduleSpecifier,
                    sourceFile: normRel,
                    line,
                  });
                }
              }
            }
          }
        }
      }

      // 3. String Constants: const prefix = '/api'
      if (
        ts.isVariableDeclaration(node) &&
        ts.isIdentifier(node.name) &&
        node.initializer
      ) {
        const varName = node.name.text;
        const evaluated = evaluateConstantString(node.initializer);
        if (evaluated !== undefined) {
          localConstants.set(varName, evaluated);
        }
      }

      ts.forEachChild(node, collectImportsAndConstants);
    }

    function evaluateConstantString(expr: ts.Expression): string | undefined {
      if (ts.isStringLiteral(expr) || ts.isNoSubstitutionTemplateLiteral(expr)) {
        return expr.text;
      }
      if (ts.isIdentifier(expr)) {
        return localConstants.get(expr.text);
      }
      if (ts.isBinaryExpression(expr) && expr.operatorToken.kind === ts.SyntaxKind.PlusToken) {
        const left = evaluateConstantString(expr.left);
        const right = evaluateConstantString(expr.right);
        if (left !== undefined && right !== undefined) {
          return left + right;
        }
      }
      return undefined;
    }

    collectImportsAndConstants(sourceFile);

    // --- Pass 2: Identify App & Router Declarations ---
    function collectRoutersAndApps(node: ts.Node): void {
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
        const varName = node.name.text;
        const init = node.initializer;

        // Pattern A: app = express()
        if (ts.isCallExpression(init)) {
          if (
            ts.isIdentifier(init.expression) &&
            expressModuleIdentifiers.has(init.expression.text)
          ) {
            const symId = createSymbolId(varName, node);
            appSymbolIds.set(varName, symId);
            declaredRoutersByNode.set(node, symId);
            routers.push({
              id: symId,
              variableName: varName,
              isApp: true,
              source: getSourceLocation(node),
            });
          }

          // Pattern B: router = express.Router(...)
          if (
            ts.isPropertyAccessExpression(init.expression) &&
            ts.isIdentifier(init.expression.expression) &&
            expressModuleIdentifiers.has(init.expression.expression.text) &&
            init.expression.name.text === 'Router'
          ) {
            const symId = createSymbolId(varName, node);
            routerSymbolIds.set(varName, symId);
            declaredRoutersByNode.set(node, symId);
            routers.push({
              id: symId,
              variableName: varName,
              isApp: false,
              source: getSourceLocation(node),
            });
          }

          // Pattern C: router = Router(...) (from express import)
          if (
            ts.isIdentifier(init.expression) &&
            expressRouterFactoryIdentifiers.has(init.expression.text)
          ) {
            const symId = createSymbolId(varName, node);
            routerSymbolIds.set(varName, symId);
            declaredRoutersByNode.set(node, symId);
            routers.push({
              id: symId,
              variableName: varName,
              isApp: false,
              source: getSourceLocation(node),
            });
          }

          // Pattern D: router = require('express').Router()
          if (
            ts.isPropertyAccessExpression(init.expression) &&
            init.expression.name.text === 'Router' &&
            ts.isCallExpression(init.expression.expression) &&
            ts.isIdentifier(init.expression.expression.expression) &&
            init.expression.expression.expression.text === 'require' &&
            init.expression.expression.arguments.length === 1 &&
            ts.isStringLiteral(init.expression.expression.arguments[0]) &&
            init.expression.expression.arguments[0].text === 'express'
          ) {
            const symId = createSymbolId(varName, node);
            routerSymbolIds.set(varName, symId);
            declaredRoutersByNode.set(node, symId);
            routers.push({
              id: symId,
              variableName: varName,
              isApp: false,
              source: getSourceLocation(node),
            });
          }
        }

        // Pattern E: router = new express.Router() or new Router()
        if (ts.isNewExpression(init)) {
          if (
            ts.isPropertyAccessExpression(init.expression) &&
            ts.isIdentifier(init.expression.expression) &&
            expressModuleIdentifiers.has(init.expression.expression.text) &&
            init.expression.name.text === 'Router'
          ) {
            const symId = createSymbolId(varName, node);
            routerSymbolIds.set(varName, symId);
            declaredRoutersByNode.set(node, symId);
            routers.push({
              id: symId,
              variableName: varName,
              isApp: false,
              source: getSourceLocation(node),
            });
          } else if (
            ts.isIdentifier(init.expression) &&
            expressRouterFactoryIdentifiers.has(init.expression.text)
          ) {
            const symId = createSymbolId(varName, node);
            routerSymbolIds.set(varName, symId);
            declaredRoutersByNode.set(node, symId);
            routers.push({
              id: symId,
              variableName: varName,
              isApp: false,
              source: getSourceLocation(node),
            });
          }
        }
      }

      ts.forEachChild(node, collectRoutersAndApps);
    }

    collectRoutersAndApps(sourceFile);

    // Helper: evaluate route/mount path argument
    function evaluatePathArgument(expr: ts.Expression): PathEvalResult {
      // 1. Literal string
      if (ts.isStringLiteral(expr) || ts.isNoSubstitutionTemplateLiteral(expr)) {
        return { path: expr.text, confidence: 'high' };
      }

      // 2. Identifier (local constant)
      if (ts.isIdentifier(expr)) {
        const val = localConstants.get(expr.text);
        if (val !== undefined) {
          return { path: val, confidence: 'medium' };
        }
        return {
          path: '<dynamic>',
          confidence: 'low',
          isDynamic: true,
        };
      }

      // 3. Binary concatenation: prefix + '/users'
      if (ts.isBinaryExpression(expr) && expr.operatorToken.kind === ts.SyntaxKind.PlusToken) {
        const left = evaluatePathArgument(expr.left);
        const right = evaluatePathArgument(expr.right);

        if (!left.isDynamic && !right.isDynamic) {
          return {
            path: left.path + right.path,
            confidence: left.confidence === 'high' && right.confidence === 'high' ? 'high' : 'medium',
          };
        }

        // Partial dynamic retention: e.g. /api + '/' + getId() -> /api/<dynamic>
        const leftPart = left.isDynamic ? '<dynamic>' : left.path;
        const rightPart = right.isDynamic ? '<dynamic>' : right.path;
        const combined = `${leftPart}/${rightPart}`.replace(/\/+/g, '/').replace(/<dynamic>\/<dynamic>/g, '<dynamic>');
        return {
          path: combined,
          confidence: 'low',
          isDynamic: true,
        };
      }

      // 4. Template expression: `${prefix}/${resource}` or `/users/${getId()}`
      if (ts.isTemplateExpression(expr)) {
        let text = expr.head.text;
        let allStatic = true;

        for (const span of expr.templateSpans) {
          const evalSpan = evaluatePathArgument(span.expression);
          if (evalSpan.isDynamic) {
            allStatic = false;
            text += '<dynamic>' + span.literal.text;
          } else {
            text += evalSpan.path + span.literal.text;
          }
        }

        const normalized = text.replace(/\/+/g, '/');
        if (allStatic) {
          return { path: normalized, confidence: 'medium' };
        }
        return { path: normalized, confidence: 'low', isDynamic: true };
      }

      // 5. Unresolved expression
      return { path: '<dynamic>', confidence: 'low', isDynamic: true };
    }

    // --- Pass 3: Route Declarations, Chaining, Mounts, and Exports ---
    function collectRoutesAndMounts(node: ts.Node): void {
      // Check CallExpressions: app.get(), router.post(), app.use(), app.route()
      if (ts.isCallExpression(node)) {
        // Direct routes or app.use: receiver.method(...)
        if (ts.isPropertyAccessExpression(node.expression)) {
          const propAccess = node.expression;
          const methodName = propAccess.name.text.toLowerCase();

          // Check if receiver is a known Express app or router
          if (ts.isIdentifier(propAccess.expression)) {
            const receiverNode = propAccess.expression;
            const receiverName = receiverNode.text;
            const decl = findLexicalDeclaration(receiverNode);
            // If declared locally in this scope, must be an Express router; if undeclared locally, fallback to module-level
            const targetSymId = decl
              ? declaredRoutersByNode.get(decl)
              : (appSymbolIds.get(receiverName) ?? routerSymbolIds.get(receiverName));

            if (targetSymId) {
              // 1. Direct HTTP method route: app.get('/users', handler) or app.all('/users', handler)
              if (
                (SUPPORTED_HTTP_METHODS.has(methodName) || methodName === 'all') &&
                node.arguments.length >= 2
              ) {
                const pathArg = node.arguments[0];
                const evalPath = evaluatePathArgument(pathArg);
                const loc = getSourceLocation(node);

                if (evalPath.isDynamic) {
                  warnings.push(
                    `Dynamic route expression at ${normRel}:${loc.line}:${loc.column} could not be statically resolved. Represented as '${evalPath.path}'.`
                  );
                }

                const methodsToRegister: readonly HttpMethod[] =
                  methodName === 'all'
                    ? HTTP_METHODS
                    : [methodName.toUpperCase() as HttpMethod];

                for (const httpMethod of methodsToRegister) {
                  routes.push({
                    routerSymbolId: targetSymId,
                    method: httpMethod,
                    rawPath: evalPath.path,
                    confidence: evalPath.confidence,
                    source: loc,
                    warnings: evalPath.isDynamic
                      ? [`Dynamic route path: '${evalPath.path}'`]
                      : undefined,
                  });
                }
              }

              // 2. Router mount: app.use('/prefix', childRouter)
              if (methodName === 'use' && node.arguments.length >= 2) {
                const prefixArg = node.arguments[0];
                const childArg = node.arguments[1];

                // Check if childArg is an identifier that matches a known router or an imported router
                if (ts.isIdentifier(childArg)) {
                  const childName = childArg.text;
                  const childDecl = findLexicalDeclaration(childArg);
                  const isImported = imports.some((imp) => imp.localName === childName);
                  const isShadowed = childDecl && !declaredRoutersByNode.has(childDecl) && !isImported;

                  if (!isShadowed) {
                    const childLocalSymId = childDecl
                      ? declaredRoutersByNode.get(childDecl)
                      : routerSymbolIds.get(childName);

                    if (childLocalSymId || isImported) {
                      const evalPrefix = evaluatePathArgument(prefixArg);
                      const loc = getSourceLocation(node);

                      if (evalPrefix.isDynamic) {
                        warnings.push(
                          `Dynamic router mount prefix at ${normRel}:${loc.line}:${loc.column} could not be statically resolved. Represented as '${evalPrefix.path}'.`
                        );
                      }

                      mounts.push({
                        parentSymbolId: targetSymId,
                        childIdentifier: childLocalSymId ?? childName,
                        rawPrefix: evalPrefix.path,
                        confidence: evalPrefix.confidence,
                        source: loc,
                      });
                    }
                  }
                }
              }
            }
          }

          // 3. Route Chaining: app.route('/users').get(...).post(...) or .all(...)
          // Handle chaining calls where the root of the call chain is app.route(path)
          if (SUPPORTED_HTTP_METHODS.has(methodName) || methodName === 'all') {
            const chainInfo = unrollRouteChain(node);
            if (chainInfo) {
              const { receiverNode, receiverName, routePathArg } = chainInfo;
              const decl = findLexicalDeclaration(receiverNode);
              const targetSymId = decl
                ? declaredRoutersByNode.get(decl)
                : (appSymbolIds.get(receiverName) ?? routerSymbolIds.get(receiverName));

              if (targetSymId) {
                const evalPath = evaluatePathArgument(routePathArg);
                const loc = getSourceLocation(propAccess.name);

                if (evalPath.isDynamic) {
                  warnings.push(
                    `Dynamic route chain expression at ${normRel}:${loc.line}:${loc.column} could not be statically resolved.`
                  );
                }

                const methodsToRegister: readonly HttpMethod[] =
                  methodName === 'all'
                    ? HTTP_METHODS
                    : [methodName.toUpperCase() as HttpMethod];

                for (const httpMethod of methodsToRegister) {
                  routes.push({
                    routerSymbolId: targetSymId,
                    method: httpMethod,
                    rawPath: evalPath.path,
                    confidence: evalPath.confidence,
                    source: loc,
                  });
                }
              }
            }
          }
        }
      }

      // 4. Exports: ESM and CommonJS
      // ESM: export const router = express.Router();
      if (ts.isVariableStatement(node) && node.modifiers) {
        const isExported = node.modifiers.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
        if (isExported) {
          for (const decl of node.declarationList.declarations) {
            if (ts.isIdentifier(decl.name)) {
              const symId = declaredRoutersByNode.get(decl);
              if (symId) {
                const loc = getSourceLocation(decl);
                exports.push({
                  exportedName: decl.name.text,
                  localSymbolId: symId,
                  sourceFile: normRel,
                  line: loc.line,
                });
              }
            }
          }
        }
      }

      // ESM: export default router
      if (ts.isExportAssignment(node) && !node.isExportEquals) {
        if (ts.isIdentifier(node.expression)) {
          const decl = findLexicalDeclaration(node.expression);
          const symId = decl
            ? declaredRoutersByNode.get(decl)
            : (routerSymbolIds.get(node.expression.text) ?? appSymbolIds.get(node.expression.text));
          if (symId) {
            const loc = getSourceLocation(node);
            exports.push({
              exportedName: 'default',
              localSymbolId: symId,
              sourceFile: normRel,
              line: loc.line,
            });
          }
        }
      }

      // ESM: export { router, userRouter as myRouter }
      if (ts.isExportDeclaration(node) && node.exportClause && ts.isNamedExports(node.exportClause)) {
        for (const elem of node.exportClause.elements) {
          const localNode = elem.propertyName ?? elem.name;
          if (ts.isIdentifier(localNode)) {
            const decl = findLexicalDeclaration(localNode);
            const symId = decl
              ? declaredRoutersByNode.get(decl)
              : (routerSymbolIds.get(localNode.text) ?? appSymbolIds.get(localNode.text));
            if (symId) {
              const loc = getSourceLocation(node);
              exports.push({
                exportedName: elem.name.text,
                localSymbolId: symId,
                sourceFile: normRel,
                line: loc.line,
              });
            }
          }
        }
      }

      // CommonJS: module.exports = router; or module.exports.router = router;
      if (
        ts.isBinaryExpression(node) &&
        node.operatorToken.kind === ts.SyntaxKind.EqualsToken
      ) {
        // module.exports = router
        if (
          ts.isPropertyAccessExpression(node.left) &&
          ts.isIdentifier(node.left.expression) &&
          node.left.expression.text === 'module' &&
          node.left.name.text === 'exports' &&
          ts.isIdentifier(node.right)
        ) {
          const decl = findLexicalDeclaration(node.right);
          const symId = decl
            ? declaredRoutersByNode.get(decl)
            : (routerSymbolIds.get(node.right.text) ?? appSymbolIds.get(node.right.text));
          if (symId) {
            const loc = getSourceLocation(node);
            exports.push({
              exportedName: 'default',
              localSymbolId: symId,
              sourceFile: normRel,
              line: loc.line,
            });
          }
        }

        // exports.router = router or module.exports.router = router
        if (ts.isPropertyAccessExpression(node.left) && ts.isIdentifier(node.right)) {
          let exportedName: string | undefined;
          if (
            ts.isIdentifier(node.left.expression) &&
            node.left.expression.text === 'exports'
          ) {
            exportedName = node.left.name.text;
          } else if (
            ts.isPropertyAccessExpression(node.left.expression) &&
            ts.isIdentifier(node.left.expression.expression) &&
            node.left.expression.expression.text === 'module' &&
            node.left.expression.name.text === 'exports'
          ) {
            exportedName = node.left.name.text;
          }

          if (exportedName) {
            const decl = findLexicalDeclaration(node.right);
            const symId = decl
              ? declaredRoutersByNode.get(decl)
              : (routerSymbolIds.get(node.right.text) ?? appSymbolIds.get(node.right.text));
            if (symId) {
              const loc = getSourceLocation(node);
              exports.push({
                exportedName,
                localSymbolId: symId,
                sourceFile: normRel,
                line: loc.line,
              });
            }
          }
        }
      }

      ts.forEachChild(node, collectRoutesAndMounts);
    }

    // Helper: Unroll method call chain to find root app.route(pathArg)
    function unrollRouteChain(
      call: ts.CallExpression
    ): { receiverNode: ts.Identifier; receiverName: string; routePathArg: ts.Expression } | undefined {
      let current: ts.Expression = call.expression;

      while (ts.isPropertyAccessExpression(current)) {
        const parentExpr: ts.Expression = current.expression;

        if (ts.isCallExpression(parentExpr)) {
          if (
            ts.isPropertyAccessExpression(parentExpr.expression) &&
            parentExpr.expression.name.text === 'route' &&
            ts.isIdentifier(parentExpr.expression.expression) &&
            parentExpr.arguments.length >= 1
          ) {
            return {
              receiverNode: parentExpr.expression.expression,
              receiverName: parentExpr.expression.expression.text,
              routePathArg: parentExpr.arguments[0],
            };
          }
          current = parentExpr.expression;
        } else {
          break;
        }
      }

      return undefined;
    }

    collectRoutesAndMounts(sourceFile);

    return {
      file: normRel,
      absolutePath,
      routers,
      routes,
      mounts,
      imports,
      exports,
      warnings,
      errors,
    };
  }
}
