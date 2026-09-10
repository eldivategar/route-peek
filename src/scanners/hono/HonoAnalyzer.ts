import * as ts from 'typescript';
import * as path from 'path';
import {
  HonoFileAnalysisResult,
  HonoAppDeclaration,
  RawHonoRouteDeclaration,
  HonoMountDeclaration,
  ImportBinding,
  ExportBinding,
  HonoAppSymbolId,
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

export class HonoAnalyzer {
  /**
   * Analyzes a single JavaScript or TypeScript source file and extracts
   * file-level Hono artifacts: apps/sub-apps, routes, mounts, imports, and exports.
   */
  public analyzeFile(
    relativePath: string,
    absolutePath: string,
    content: string
  ): HonoFileAnalysisResult {
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
        apps: [],
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
    const apps: HonoAppDeclaration[] = [];
    const routes: RawHonoRouteDeclaration[] = [];
    const mounts: HonoMountDeclaration[] = [];

    // Local symbol tracking for false positive protection
    const HONO_CLASS_NAMES = new Set(['Hono', 'OpenAPIHono']);
    const honoNamespaceIdentifiers = new Set<string>(); // e.g. "hono" in "import * as hono from 'hono'"
    const honoClassIdentifiers = new Set<string>(); // e.g. "Hono", "OpenAPIHono"
    const createRouteIdentifiers = new Set<string>(['createRoute']);
    const appSymbolIds = new Map<string, HonoAppSymbolId>(); // varName -> symbolId
    const declaredAppsByNode = new Map<ts.Node, HonoAppSymbolId>(); // Declaration node -> symbolId
    const localConstants = new Map<string, string>(); // varName -> string value

    interface RouteConfigDeclaration {
      readonly method: HttpMethod | 'ALL';
      readonly rawPath: string;
      readonly confidence: RouteConfidence;
    }

    const routeConfigs = new Map<string, RouteConfigDeclaration>();

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

        // 2. Block or SourceFile statements / declarations
        if (
          ts.isBlock(current) ||
          ts.isSourceFile(current) ||
          ts.isModuleBlock(current) ||
          ts.isCaseClause(current) ||
          ts.isDefaultClause(current)
        ) {
          const statements = (current as { statements?: ts.NodeArray<ts.Statement> }).statements;
          if (statements) {
            for (const stmt of statements) {
              if (stmt.pos > idNode.pos) {
                continue;
              }
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
        }

        // 3. For statements / catch clauses
        if (ts.isForStatement(current) || ts.isForOfStatement(current) || ts.isForInStatement(current)) {
          const init = (current as { initializer?: ts.ForInitializer }).initializer;
          if (init && ts.isVariableDeclarationList(init)) {
            for (const decl of init.declarations) {
              if (ts.isIdentifier(decl.name) && decl.name.text === targetName) {
                return decl;
              }
            }
          }
        }
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

    function isHonoModule(specifier: string): boolean {
      return (
        specifier === 'hono' ||
        specifier.startsWith('hono/') ||
        specifier === '@hono/zod-openapi' ||
        specifier.startsWith('@hono/')
      );
    }

    // Pass 1: Discover imports and module bindings
    ts.forEachChild(sourceFile, (node) => {
      // ESM: import { Hono } from 'hono'
      if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
        const mod = node.moduleSpecifier.text;
        const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;

        if (isHonoModule(mod) && node.importClause) {
          // Namespace import: import * as hono from 'hono'
          if (node.importClause.namedBindings && ts.isNamespaceImport(node.importClause.namedBindings)) {
            honoNamespaceIdentifiers.add(node.importClause.namedBindings.name.text);
          }
          // Named imports: import { Hono, OpenAPIHono, createRoute } from 'hono' or '@hono/zod-openapi'
          if (node.importClause.namedBindings && ts.isNamedImports(node.importClause.namedBindings)) {
            for (const element of node.importClause.namedBindings.elements) {
              const imported = element.propertyName ? element.propertyName.text : element.name.text;
              if (HONO_CLASS_NAMES.has(imported)) {
                honoClassIdentifiers.add(element.name.text);
              }
              if (imported === 'createRoute') {
                createRouteIdentifiers.add(element.name.text);
              }
            }
          }
          // Default import fallback if any
          if (node.importClause.name) {
            honoClassIdentifiers.add(node.importClause.name.text);
          }
        }

        // Record all imports for cross-file linking
        if (node.importClause) {
          if (node.importClause.name) {
            imports.push({
              localName: node.importClause.name.text,
              importedName: 'default',
              moduleSpecifier: mod,
              sourceFile: normRel,
              line,
            });
          }
          if (node.importClause.namedBindings) {
            if (ts.isNamespaceImport(node.importClause.namedBindings)) {
              imports.push({
                localName: node.importClause.namedBindings.name.text,
                importedName: '*',
                moduleSpecifier: mod,
                sourceFile: normRel,
                line,
              });
            } else if (ts.isNamedImports(node.importClause.namedBindings)) {
              for (const element of node.importClause.namedBindings.elements) {
                const imported = element.propertyName ? element.propertyName.text : element.name.text;
                imports.push({
                  localName: element.name.text,
                  importedName: imported,
                  moduleSpecifier: mod,
                  sourceFile: normRel,
                  line,
                });
              }
            }
          }
        }
      }

      // CJS: const { Hono } = require('hono') or const hono = require('hono')
      if (ts.isVariableStatement(node)) {
        for (const decl of node.declarationList.declarations) {
          if (decl.initializer && ts.isCallExpression(decl.initializer)) {
            const call = decl.initializer;
            if (
              ts.isIdentifier(call.expression) &&
              call.expression.text === 'require' &&
              call.arguments.length > 0 &&
              ts.isStringLiteral(call.arguments[0])
            ) {
              const mod = (call.arguments[0] as ts.StringLiteral).text;
              const line = sourceFile.getLineAndCharacterOfPosition(decl.getStart(sourceFile)).line + 1;

              if (isHonoModule(mod)) {
                if (ts.isObjectBindingPattern(decl.name)) {
                  for (const element of decl.name.elements) {
                    if (ts.isIdentifier(element.name)) {
                      const propName = element.propertyName && ts.isIdentifier(element.propertyName)
                        ? element.propertyName.text
                        : element.name.text;
                      if (HONO_CLASS_NAMES.has(propName)) {
                        honoClassIdentifiers.add(element.name.text);
                      }
                      if (propName === 'createRoute') {
                        createRouteIdentifiers.add(element.name.text);
                      }
                    }
                  }
                } else if (ts.isIdentifier(decl.name)) {
                  honoNamespaceIdentifiers.add(decl.name.text);
                }
              }

              // Record CJS import binding
              if (ts.isIdentifier(decl.name)) {
                imports.push({
                  localName: decl.name.text,
                  importedName: 'default',
                  moduleSpecifier: mod,
                  sourceFile: normRel,
                  line,
                });
              } else if (ts.isObjectBindingPattern(decl.name)) {
                for (const element of decl.name.elements) {
                  if (ts.isIdentifier(element.name)) {
                    const prop = element.propertyName && ts.isIdentifier(element.propertyName)
                      ? element.propertyName.text
                      : element.name.text;
                    imports.push({
                      localName: element.name.text,
                      importedName: prop,
                      moduleSpecifier: mod,
                      sourceFile: normRel,
                      line,
                    });
                  }
                }
              }
            }
          }
        }
      }
    });

    // Helper: Checks if an expression is `new Hono()` or `new OpenAPIHono()` or `new hono.Hono()`
    function isHonoInstantiation(expr: ts.Expression): boolean {
      if (ts.isNewExpression(expr)) {
        if (ts.isIdentifier(expr.expression)) {
          const name = expr.expression.text;
          return honoClassIdentifiers.has(name);
        }
        if (ts.isPropertyAccessExpression(expr.expression)) {
          const prop = expr.expression;
          if (
            ts.isIdentifier(prop.expression) &&
            honoNamespaceIdentifiers.has(prop.expression.text) &&
            HONO_CLASS_NAMES.has(prop.name.text)
          ) {
            return true;
          }
        }
      }
      return false;
    }

    // Helper: Unwraps chained calls on a Hono app instantiation (e.g. `new Hono().basePath('/api')`)
    function inspectHonoCreationExpression(expr: ts.Expression): { isHono: boolean; basePath?: string } {
      if (isHonoInstantiation(expr)) {
        return { isHono: true };
      }

      if (ts.isCallExpression(expr) && ts.isPropertyAccessExpression(expr.expression)) {
        const prop = expr.expression;
        if (prop.name.text === 'basePath' && expr.arguments.length > 0 && ts.isStringLiteral(expr.arguments[0])) {
          const parentResult = inspectHonoCreationExpression(prop.expression);
          if (parentResult.isHono) {
            return { isHono: true, basePath: expr.arguments[0].text };
          }
        }
      }

      return { isHono: false };
    }

    // Helper: Evaluates path argument into string, handling literals, constants, and template literals
    function evaluatePathExpression(expr: ts.Expression): PathEvalResult {
      if (ts.isStringLiteral(expr)) {
        return { path: expr.text, confidence: 'high' };
      }

      if (ts.isNoSubstitutionTemplateLiteral(expr)) {
        return { path: expr.text, confidence: 'high' };
      }

      if (ts.isIdentifier(expr)) {
        const val = localConstants.get(expr.text);
        if (val !== undefined) {
          return { path: val, confidence: 'high' };
        }
        return { path: '<dynamic>', confidence: 'low', isDynamic: true };
      }

      if (ts.isBinaryExpression(expr) && expr.operatorToken.kind === ts.SyntaxKind.PlusToken) {
        const left = evaluatePathExpression(expr.left);
        const right = evaluatePathExpression(expr.right);
        if (!left.isDynamic && !right.isDynamic) {
          return {
            path: left.path + right.path,
            confidence: 'high',
          };
        }
        return { path: '<dynamic>', confidence: 'low', isDynamic: true };
      }

      if (ts.isTemplateExpression(expr)) {
        let isFullyStatic = true;
        let constructed = expr.head.text;

        for (const span of expr.templateSpans) {
          const evalSpan = evaluatePathExpression(span.expression);
          if (evalSpan.isDynamic) {
            isFullyStatic = false;
            constructed += '<dynamic>' + span.literal.text;
          } else {
            constructed += evalSpan.path + span.literal.text;
          }
        }

        if (isFullyStatic) {
          return { path: constructed, confidence: 'high' };
        }
        return { path: constructed, confidence: 'low', isDynamic: true };
      }

      return { path: '<dynamic>', confidence: 'low', isDynamic: true };
    }

    function parseRouteConfigObject(objExpr: ts.ObjectLiteralExpression): RouteConfigDeclaration | undefined {
      let methodStr: string | undefined;
      let pathResult: PathEvalResult | undefined;

      for (const prop of objExpr.properties) {
        if (ts.isPropertyAssignment(prop) && (ts.isIdentifier(prop.name) || ts.isStringLiteral(prop.name))) {
          const propKey = prop.name.text.toLowerCase();
          if (propKey === 'method') {
            if (ts.isStringLiteral(prop.initializer)) {
              methodStr = prop.initializer.text.toLowerCase();
            }
          } else if (propKey === 'path') {
            pathResult = evaluatePathExpression(prop.initializer);
          }
        }
      }

      if (methodStr && pathResult && (SUPPORTED_HTTP_METHODS.has(methodStr) || methodStr === 'all')) {
        return {
          method: methodStr.toUpperCase() as HttpMethod | 'ALL',
          rawPath: pathResult.path,
          confidence: pathResult.confidence,
        };
      }
      return undefined;
    }

    function resolveRouteConfigFromExpression(expr: ts.Expression): RouteConfigDeclaration | undefined {
      if (ts.isIdentifier(expr)) {
        return routeConfigs.get(expr.text);
      }
      if (ts.isCallExpression(expr)) {
        if (expr.arguments.length > 0 && ts.isObjectLiteralExpression(expr.arguments[0])) {
          return parseRouteConfigObject(expr.arguments[0]);
        }
      }
      if (ts.isObjectLiteralExpression(expr)) {
        return parseRouteConfigObject(expr);
      }
      return undefined;
    }

    // Pass 2: Track local constants and Hono app/sub-app declarations
    ts.forEachChild(sourceFile, (node) => {
      if (ts.isVariableStatement(node)) {
        for (const decl of node.declarationList.declarations) {
          if (ts.isIdentifier(decl.name) && decl.initializer) {
            const varName = decl.name.text;

            // Track string constants
            if (ts.isStringLiteral(decl.initializer)) {
              localConstants.set(varName, decl.initializer.text);
            }

            // Track Hono app instances: const app = new Hono() or const apiV1 = new OpenAPIHono()
            const creation = inspectHonoCreationExpression(decl.initializer);
            if (creation.isHono) {
              const { line, character } = sourceFile.getLineAndCharacterOfPosition(decl.getStart(sourceFile));
              const symbolId: HonoAppSymbolId = `${normRel}#${varName}@${line + 1}:${character + 1}`;

              const source: RouteSource = {
                file: normRel,
                line: line + 1,
                column: character + 1,
              };

              apps.push({
                id: symbolId,
                variableName: varName,
                basePath: creation.basePath,
                source,
              });

              appSymbolIds.set(varName, symbolId);
              declaredAppsByNode.set(decl, symbolId);
            }

            // Track route configs: const route = createRoute({ method: 'post', path: '...' })
            if (ts.isCallExpression(decl.initializer)) {
              const call = decl.initializer;
              let isCreateRoute = false;
              if (ts.isIdentifier(call.expression)) {
                if (createRouteIdentifiers.has(call.expression.text) || call.expression.text === 'createRoute') {
                  isCreateRoute = true;
                }
              }
              if (isCreateRoute && call.arguments.length > 0 && ts.isObjectLiteralExpression(call.arguments[0])) {
                const parsed = parseRouteConfigObject(call.arguments[0]);
                if (parsed) {
                  routeConfigs.set(varName, parsed);
                }
              }
            }
          }
        }
      }
    });

    // Helper: Unwraps chained method calls on Hono app instances (e.g. `app.get(...).post(...)` or `app.route(...)`)
    function resolveAppSymbolFromExpression(expr: ts.Expression): HonoAppSymbolId | undefined {
      if (ts.isIdentifier(expr)) {
        const lexicalDecl = findLexicalDeclaration(expr);
        if (lexicalDecl && declaredAppsByNode.has(lexicalDecl)) {
          return declaredAppsByNode.get(lexicalDecl);
        }
        return undefined;
      }

      if (ts.isCallExpression(expr) && ts.isPropertyAccessExpression(expr.expression)) {
        const method = expr.expression.name.text;
        // Known chaining methods in Hono
        if (
          SUPPORTED_HTTP_METHODS.has(method) ||
          method === 'all' ||
          method === 'route' ||
          method === 'use' ||
          method === 'basePath' ||
          method === 'openapi' ||
          method === 'on' ||
          method === 'doc'
        ) {
          return resolveAppSymbolFromExpression(expr.expression.expression);
        }
      }

      return undefined;
    }

    // Pass 3: Traverse AST and extract routes, mounts, and exports
    function visit(node: ts.Node): void {
      ts.forEachChild(node, visit);

      // 1. Detect routes: app.get('/path', handler), app.route('/prefix', subApp), app.openapi(...), app.on(...)
      if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
        const propAccess = node.expression;
        const methodName = propAccess.name.text.toLowerCase();

        // 1.A. Mounting: app.route('/prefix', subApp)
        if (methodName === 'route' && node.arguments.length >= 2) {
          const appSymbolId = resolveAppSymbolFromExpression(propAccess.expression);
          if (appSymbolId) {
            const prefixEval = evaluatePathExpression(node.arguments[0]);
            const targetArg = node.arguments[1];
            let childIdentifier: string | undefined;

            if (ts.isIdentifier(targetArg)) {
              childIdentifier = targetArg.text;
            }

            if (childIdentifier) {
              const { line, character } = sourceFile.getLineAndCharacterOfPosition(propAccess.name.getStart(sourceFile));
              mounts.push({
                parentSymbolId: appSymbolId,
                childIdentifier,
                rawPrefix: prefixEval.path,
                confidence: prefixEval.confidence,
                source: {
                  file: normRel,
                  line: line + 1,
                  column: character + 1,
                },
              });
            }
          }
        }

        // 1.B. HTTP Route: app.get('/path', handler), app.post(...), app.all(...)
        if ((SUPPORTED_HTTP_METHODS.has(methodName) || methodName === 'all') && node.arguments.length >= 2) {
          const appSymbolId = resolveAppSymbolFromExpression(propAccess.expression);
          if (appSymbolId) {
            const pathEval = evaluatePathExpression(node.arguments[0]);
            const { line, character } = sourceFile.getLineAndCharacterOfPosition(propAccess.name.getStart(sourceFile));

            const source: RouteSource = {
              file: normRel,
              line: line + 1,
              column: character + 1,
            };

            if (methodName === 'all') {
              // Expand .all() into all 8 canonical HTTP methods per contract
              for (const canonicalMethod of HTTP_METHODS) {
                routes.push({
                  appSymbolId,
                  method: canonicalMethod,
                  rawPath: pathEval.path,
                  confidence: pathEval.confidence,
                  source,
                });
              }
            } else {
              routes.push({
                appSymbolId,
                method: methodName.toUpperCase() as HttpMethod,
                rawPath: pathEval.path,
                confidence: pathEval.confidence,
                source,
              });
            }
          }
        }

        // 1.C. OpenAPI Route: app.openapi(routeDef, handler)
        if (methodName === 'openapi' && node.arguments.length >= 2) {
          const appSymbolId = resolveAppSymbolFromExpression(propAccess.expression);
          if (appSymbolId) {
            const config = resolveRouteConfigFromExpression(node.arguments[0]);
            if (config) {
              const { line, character } = sourceFile.getLineAndCharacterOfPosition(propAccess.name.getStart(sourceFile));
              const source: RouteSource = {
                file: normRel,
                line: line + 1,
                column: character + 1,
              };

              if (config.method === 'ALL') {
                for (const canonicalMethod of HTTP_METHODS) {
                  routes.push({
                    appSymbolId,
                    method: canonicalMethod,
                    rawPath: config.rawPath,
                    confidence: config.confidence,
                    source,
                  });
                }
              } else {
                routes.push({
                  appSymbolId,
                  method: config.method,
                  rawPath: config.rawPath,
                  confidence: config.confidence,
                  source,
                });
              }
            }
          }
        }

        // 1.D. Multi-method route: app.on(['POST', 'GET'], '/path', handler) or app.on('GET', '/path', handler)
        if (methodName === 'on' && node.arguments.length >= 2) {
          const appSymbolId = resolveAppSymbolFromExpression(propAccess.expression);
          if (appSymbolId) {
            const methodArg = node.arguments[0];
            const pathArg = node.arguments[1];
            const methods: HttpMethod[] = [];

            if (ts.isStringLiteral(methodArg)) {
              const m = methodArg.text.toUpperCase();
              if (SUPPORTED_HTTP_METHODS.has(m.toLowerCase())) {
                methods.push(m as HttpMethod);
              }
            } else if (ts.isArrayLiteralExpression(methodArg)) {
              for (const elem of methodArg.elements) {
                if (ts.isStringLiteral(elem)) {
                  const m = elem.text.toUpperCase();
                  if (SUPPORTED_HTTP_METHODS.has(m.toLowerCase())) {
                    methods.push(m as HttpMethod);
                  }
                }
              }
            }

            if (methods.length > 0) {
              const pathEval = evaluatePathExpression(pathArg);
              const { line, character } = sourceFile.getLineAndCharacterOfPosition(propAccess.name.getStart(sourceFile));
              const source: RouteSource = {
                file: normRel,
                line: line + 1,
                column: character + 1,
              };

              for (const m of methods) {
                routes.push({
                  appSymbolId,
                  method: m,
                  rawPath: pathEval.path,
                  confidence: pathEval.confidence,
                  source,
                });
              }
            }
          }
        }
      }

      // 2. Export default: export default app;
      if (ts.isExportAssignment(node) && !node.isExportEquals) {
        if (ts.isIdentifier(node.expression)) {
          const varName = node.expression.text;
          const lexicalDecl = findLexicalDeclaration(node.expression);
          const symbolId = (lexicalDecl && declaredAppsByNode.get(lexicalDecl)) ?? appSymbolIds.get(varName);

          if (symbolId) {
            const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
            exports.push({
              exportedName: 'default',
              localSymbolId: symbolId,
              sourceFile: normRel,
              line,
            });
          }
        }
      }

      // 3. Named exports: export { app as myApp } or export const app = new Hono()
      if (ts.isExportDeclaration(node) && node.exportClause && ts.isNamedExports(node.exportClause)) {
        for (const element of node.exportClause.elements) {
          const localName = element.propertyName ? element.propertyName.text : element.name.text;
          const exportedName = element.name.text;
          const symbolId = appSymbolIds.get(localName);

          if (symbolId) {
            const line = sourceFile.getLineAndCharacterOfPosition(element.getStart(sourceFile)).line + 1;
            exports.push({
              exportedName,
              localSymbolId: symbolId,
              sourceFile: normRel,
              line,
            });
          }
        }
      }

      if (ts.isVariableStatement(node) && node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) {
        for (const decl of node.declarationList.declarations) {
          if (ts.isIdentifier(decl.name)) {
            const varName = decl.name.text;
            const symbolId = declaredAppsByNode.get(decl);
            if (symbolId) {
              const line = sourceFile.getLineAndCharacterOfPosition(decl.getStart(sourceFile)).line + 1;
              exports.push({
                exportedName: varName,
                localSymbolId: symbolId,
                sourceFile: normRel,
                line,
              });
            }
          }
        }
      }

      // 4. CommonJS: module.exports = app or exports.app = app
      if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
        // module.exports = app
        if (
          ts.isPropertyAccessExpression(node.left) &&
          ts.isIdentifier(node.left.expression) &&
          node.left.expression.text === 'module' &&
          node.left.name.text === 'exports' &&
          ts.isIdentifier(node.right)
        ) {
          const varName = node.right.text;
          const symbolId = appSymbolIds.get(varName);
          if (symbolId) {
            const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
            exports.push({
              exportedName: 'default',
              localSymbolId: symbolId,
              sourceFile: normRel,
              line,
            });
          }
        }
        // exports.app = app
        if (
          ts.isPropertyAccessExpression(node.left) &&
          ts.isIdentifier(node.left.expression) &&
          node.left.expression.text === 'exports' &&
          ts.isIdentifier(node.right)
        ) {
          const expName = node.left.name.text;
          const varName = node.right.text;
          const symbolId = appSymbolIds.get(varName);
          if (symbolId) {
            const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
            exports.push({
              exportedName: expName,
              localSymbolId: symbolId,
              sourceFile: normRel,
              line,
            });
          }
        }
      }
    }

    visit(sourceFile);

    return {
      file: normRel,
      absolutePath,
      apps,
      routes,
      mounts,
      imports,
      exports,
      warnings,
      errors,
    };
  }
}
