import * as ts from 'typescript';
import * as path from 'path';
import {
  FastifyFileAnalysisResult,
  FastifyAppDeclaration,
  RawFastifyRouteDeclaration,
  FastifyRegisterDeclaration,
  ImportBinding,
  ExportBinding,
  FastifyAppSymbolId,
  FastifyAnalysisOptions,
} from './types';
import { HttpMethod, HTTP_METHODS } from '../../models/HttpMethod';
import { RouteConfidence } from '../../models/RouteConfidence';
import { RouteSource } from '../../models/RouteSource';

// Universal HTTP methods supported across all Fastify versions (v3, v4, v5):
const FASTIFY_UNIVERSAL_HTTP_METHODS: readonly HttpMethod[] = [
  'GET',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
  'OPTIONS',
  'HEAD',
];

// Fastify < 5 (e.g. v3, v4) default supportedMethods included TRACE:
const FASTIFY_V4_HTTP_METHODS: readonly HttpMethod[] = [
  ...FASTIFY_UNIVERSAL_HTTP_METHODS,
  'TRACE',
];

// All supported canonical HTTP methods (including TRACE for explicit route declarations):
const FASTIFY_HTTP_METHODS: readonly HttpMethod[] = HTTP_METHODS;

const FASTIFY_HTTP_METHOD_SET = new Set<string>(
  FASTIFY_HTTP_METHODS.map((m) => m.toLowerCase())
);

interface PathEvalResult {
  readonly path: string;
  readonly confidence: RouteConfidence;
  readonly isDynamic?: boolean;
}

export class FastifyAnalyzer {
  /**
   * Analyzes a single JavaScript or TypeScript source file and extracts
   * file-level Fastify artifacts: app instances, plugin declarations, routes,
   * registers, imports, and exports.
   */
  public analyzeFile(
    relativePath: string,
    absolutePath: string,
    content: string,
    options?: FastifyAnalysisOptions
  ): FastifyFileAnalysisResult {
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
        registers: [],
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
    const apps: FastifyAppDeclaration[] = [];
    const routes: RawFastifyRouteDeclaration[] = [];
    const registers: FastifyRegisterDeclaration[] = [];

    // Local symbol tracking for false positive protection
    const fastifyFactoryIdentifiers = new Set<string>(); // e.g. "fastify", "Fastify"
    const fastifyPluginIdentifiers = new Set<string>(); // e.g. "fp", "fastifyPlugin"
    const appSymbolIds = new Map<string, FastifyAppSymbolId>(); // varName -> symbolId
    const declaredAppsByNode = new Map<ts.Node, FastifyAppSymbolId>(); // Declaration node -> symbolId
    const localConstants = new Map<string, string>(); // varName -> string value

    function findLexicalDeclaration(idNode: ts.Identifier): ts.Declaration | undefined {
      const targetName = idNode.text;
      let current: ts.Node | undefined = idNode.parent;

      while (current) {
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

    function evaluatePathExpression(node: ts.Expression): PathEvalResult {
      if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
        return { path: node.text, confidence: 'high' };
      }

      if (ts.isIdentifier(node)) {
        if (localConstants.has(node.text)) {
          return { path: localConstants.get(node.text)!, confidence: 'high' };
        }
        return { path: '<dynamic>', confidence: 'low', isDynamic: true };
      }

      if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
        const left = evaluatePathExpression(node.left);
        const right = evaluatePathExpression(node.right);
        if (!left.isDynamic && !right.isDynamic) {
          return { path: `${left.path}${right.path}`, confidence: 'high' };
        }
        return { path: '<dynamic>', confidence: 'low', isDynamic: true };
      }

      if (ts.isTemplateExpression(node)) {
        let isFullyStatic = true;
        let constructed = node.head.text;

        for (const span of node.templateSpans) {
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

    // Helper: unwrap fp(...) or fastifyPlugin(...) wrapper
    function unwrapPluginExpression(expr: ts.Expression): ts.Expression {
      if (ts.isCallExpression(expr)) {
        let isPluginWrapper = false;
        if (ts.isIdentifier(expr.expression) && fastifyPluginIdentifiers.has(expr.expression.text)) {
          isPluginWrapper = true;
        } else if (
          ts.isPropertyAccessExpression(expr.expression) &&
          ts.isIdentifier(expr.expression.expression) &&
          fastifyPluginIdentifiers.has(expr.expression.name.text)
        ) {
          isPluginWrapper = true;
        }

        if (isPluginWrapper && expr.arguments.length >= 1) {
          return unwrapPluginExpression(expr.arguments[0]);
        }
      }
      return expr;
    }

    // Pass 1: Collect imports, local string constants, and Fastify factory identifiers
    function collectPass1(node: ts.Node): void {
      // 1. Imports
      if (ts.isImportDeclaration(node)) {
        const modSpec = node.moduleSpecifier;
        if (ts.isStringLiteral(modSpec)) {
          const specText = modSpec.text;
          const isFastify =
            specText === 'fastify' || specText.startsWith('fastify/') || specText.startsWith('@fastify/');
          const isFp = specText === 'fastify-plugin';

          if (node.importClause) {
            // Default import: import fastify from 'fastify' or import fp from 'fastify-plugin'
            if (node.importClause.name) {
              const localName = node.importClause.name.text;
              const { line } = sourceFile.getLineAndCharacterOfPosition(
                node.importClause.name.getStart(sourceFile)
              );
              imports.push({
                localName,
                importedName: 'default',
                moduleSpecifier: specText,
                sourceFile: normRel,
                line: line + 1,
              });
              if (isFastify) fastifyFactoryIdentifiers.add(localName);
              if (isFp) fastifyPluginIdentifiers.add(localName);
            }

            // Named imports: import { fastify, Fastify } from 'fastify' or import { fp } from 'fastify-plugin'
            if (
              node.importClause.namedBindings &&
              ts.isNamedImports(node.importClause.namedBindings)
            ) {
              for (const elem of node.importClause.namedBindings.elements) {
                const importedName = elem.propertyName ? elem.propertyName.text : elem.name.text;
                const localName = elem.name.text;
                const { line } = sourceFile.getLineAndCharacterOfPosition(
                  elem.name.getStart(sourceFile)
                );
                imports.push({
                  localName,
                  importedName,
                  moduleSpecifier: specText,
                  sourceFile: normRel,
                  line: line + 1,
                });
                if (isFastify && (importedName === 'fastify' || importedName === 'Fastify')) {
                  fastifyFactoryIdentifiers.add(localName);
                }
                if (isFp) {
                  fastifyPluginIdentifiers.add(localName);
                }
              }
            }

            // Namespace import: import * as fastify from 'fastify'
            if (
              node.importClause.namedBindings &&
              ts.isNamespaceImport(node.importClause.namedBindings)
            ) {
              const localName = node.importClause.namedBindings.name.text;
              const { line } = sourceFile.getLineAndCharacterOfPosition(
                node.importClause.namedBindings.name.getStart(sourceFile)
              );
              imports.push({
                localName,
                importedName: '*',
                moduleSpecifier: specText,
                sourceFile: normRel,
                line: line + 1,
              });
              if (isFastify) fastifyFactoryIdentifiers.add(localName);
              if (isFp) fastifyPluginIdentifiers.add(localName);
            }
          }
        }
      }

      // 2. CJS require: const fastify = require('fastify') or const fp = require('fastify-plugin')
      if (
        ts.isVariableDeclaration(node) &&
        ts.isIdentifier(node.name) &&
        node.initializer &&
        ts.isCallExpression(node.initializer)
      ) {
        const call = node.initializer;
        if (
          ts.isIdentifier(call.expression) &&
          call.expression.text === 'require' &&
          call.arguments.length >= 1 &&
          ts.isStringLiteral(call.arguments[0])
        ) {
          const modName = call.arguments[0].text;
          const isFastify =
            modName === 'fastify' || modName.startsWith('fastify/') || modName.startsWith('@fastify/');
          const isFp = modName === 'fastify-plugin';

          const { line } = sourceFile.getLineAndCharacterOfPosition(
            node.name.getStart(sourceFile)
          );
          imports.push({
            localName: node.name.text,
            importedName: 'default',
            moduleSpecifier: modName,
            sourceFile: normRel,
            line: line + 1,
          });
          if (isFastify) fastifyFactoryIdentifiers.add(node.name.text);
          if (isFp) fastifyPluginIdentifiers.add(node.name.text);
        }
      }

      // 3. String constants: const API_PREFIX = '/api'
      if (
        ts.isVariableDeclaration(node) &&
        ts.isIdentifier(node.name) &&
        node.initializer &&
        (ts.isStringLiteral(node.initializer) || ts.isNoSubstitutionTemplateLiteral(node.initializer))
      ) {
        localConstants.set(node.name.text, node.initializer.text);
      }

      ts.forEachChild(node, collectPass1);
    }

    collectPass1(sourceFile);

    // If "fastify" or "Fastify" was not explicitly imported, check if convention is used
    if (fastifyFactoryIdentifiers.size === 0) {
      fastifyFactoryIdentifiers.add('fastify');
      fastifyFactoryIdentifiers.add('Fastify');
    }
    if (fastifyPluginIdentifiers.size === 0) {
      fastifyPluginIdentifiers.add('fp');
      fastifyPluginIdentifiers.add('fastifyPlugin');
    }

    // Pass 2: Detect Fastify instances & plugin declarations
    function collectPass2(node: ts.Node): void {
      // 2.A. Root Fastify instance: const app = fastify(...) or const server = Fastify(...)
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
        let initExpr = node.initializer;
        if (ts.isAsExpression(initExpr)) {
          initExpr = initExpr.expression;
        }

        if (ts.isCallExpression(initExpr)) {
          const callee = initExpr.expression;
          let isFastifyInit = false;

          if (ts.isIdentifier(callee) && fastifyFactoryIdentifiers.has(callee.text)) {
            isFastifyInit = true;
          } else if (
            ts.isPropertyAccessExpression(callee) &&
            ts.isIdentifier(callee.expression) &&
            fastifyFactoryIdentifiers.has(callee.expression.text) &&
            (callee.name.text === 'default' || callee.name.text === 'fastify' || callee.name.text === 'Fastify')
          ) {
            isFastifyInit = true;
          }

          if (isFastifyInit) {
            const { line, character } = sourceFile.getLineAndCharacterOfPosition(
              node.name.getStart(sourceFile)
            );
            const symbolId: FastifyAppSymbolId = `${normRel}#${node.name.text}@${line + 1}:${character + 1}`;
            const source: RouteSource = {
              file: normRel,
              line: line + 1,
              column: character + 1,
            };

            apps.push({
              id: symbolId,
              variableName: node.name.text,
              source,
            });

            appSymbolIds.set(node.name.text, symbolId);
            declaredAppsByNode.set(node, symbolId);
          }
        }
      }

      // 2.B. Fastify Plugin Functions:
      // function plugin(fastify, opts) { ... }
      // const plugin = async (fastify, opts) => { ... }
      // const plugin = fp(async (fastify, opts) => { ... })
      function registerPluginFunction(
        fnNode: ts.FunctionDeclaration | ts.FunctionExpression | ts.ArrowFunction,
        name?: string
      ): void {
        if (fnNode.parameters.length >= 1) {
          const firstParam = fnNode.parameters[0];
          if (ts.isIdentifier(firstParam.name)) {
            const paramName = firstParam.name.text;
            const { line, character } = sourceFile.getLineAndCharacterOfPosition(
              firstParam.getStart(sourceFile)
            );
            const fnName = name ?? paramName;
            const symbolId: FastifyAppSymbolId = `${normRel}#${fnName}@${line + 1}:${character + 1}`;
            const source: RouteSource = {
              file: normRel,
              line: line + 1,
              column: character + 1,
            };

            apps.push({
              id: symbolId,
              variableName: fnName,
              source,
            });

            appSymbolIds.set(paramName, symbolId);
            if (name) {
              appSymbolIds.set(name, symbolId);
            }
            declaredAppsByNode.set(firstParam, symbolId);
            declaredAppsByNode.set(fnNode, symbolId);
          }
        }
      }

      if (ts.isFunctionDeclaration(node)) {
        const isDefault = node.modifiers?.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword);
        registerPluginFunction(node, node.name ? node.name.text : isDefault ? 'default' : undefined);
      } else if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
        const unwrapped = unwrapPluginExpression(node.initializer);
        if (ts.isFunctionExpression(unwrapped) || ts.isArrowFunction(unwrapped)) {
          registerPluginFunction(unwrapped, node.name.text);
        }
      } else if (ts.isExportAssignment(node) && !node.isExportEquals) {
        const unwrapped = unwrapPluginExpression(node.expression);
        if (ts.isFunctionExpression(unwrapped) || ts.isArrowFunction(unwrapped)) {
          registerPluginFunction(unwrapped, 'default');
        }
      } else if (
        ts.isBinaryExpression(node) &&
        node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
        ts.isPropertyAccessExpression(node.left) &&
        ts.isIdentifier(node.left.expression) &&
        node.left.expression.text === 'module' &&
        node.left.name.text === 'exports'
      ) {
        const unwrapped = unwrapPluginExpression(node.right);
        if (ts.isFunctionExpression(unwrapped) || ts.isArrowFunction(unwrapped)) {
          registerPluginFunction(unwrapped, 'default');
        }
      }

      ts.forEachChild(node, collectPass2);
    }

    collectPass2(sourceFile);

    function resolveAppSymbolFromExpression(expr: ts.Expression): FastifyAppSymbolId | undefined {
      if (ts.isIdentifier(expr)) {
        const decl = findLexicalDeclaration(expr);
        if (decl) {
          return declaredAppsByNode.get(decl);
        }
        return appSymbolIds.get(expr.text);
      }
      return undefined;
    }

    // Pass 3: Traverse AST and extract routes, registers, and exports
    function visit(node: ts.Node): void {
      ts.forEachChild(node, visit);

      // 1. Detect calls: fastify.get(), fastify.route(), fastify.register()
      if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
        const propAccess = node.expression;
        const methodName = propAccess.name.text.toLowerCase();

        // 1.A. Plugin Registration: fastify.register(plugin, [options])
        if (methodName === 'register' && node.arguments.length >= 1) {
          const appSymbolId = resolveAppSymbolFromExpression(propAccess.expression);
          if (appSymbolId) {
            const rawTarget = node.arguments[0];
            const targetArg = unwrapPluginExpression(rawTarget);
            let childIdentifier: string | undefined;

            if (ts.isIdentifier(targetArg)) {
              childIdentifier = targetArg.text;
            } else if (
              ts.isCallExpression(targetArg) &&
              ts.isIdentifier(targetArg.expression) &&
              targetArg.expression.text === 'require' &&
              targetArg.arguments.length >= 1 &&
              ts.isStringLiteral(targetArg.arguments[0])
            ) {
              childIdentifier = targetArg.arguments[0].text;
            } else if (ts.isFunctionExpression(targetArg) || ts.isArrowFunction(targetArg)) {
              // Inline plugin function
              const declId = declaredAppsByNode.get(targetArg);
              if (declId) {
                childIdentifier = declId;
              } else if (targetArg.parameters.length >= 1 && ts.isIdentifier(targetArg.parameters[0].name)) {
                const param = targetArg.parameters[0];
                const { line, character } = sourceFile.getLineAndCharacterOfPosition(
                  param.getStart(sourceFile)
                );
                const inlineSymId: FastifyAppSymbolId = `${normRel}#inlinePlugin@${line + 1}:${character + 1}`;
                apps.push({
                  id: inlineSymId,
                  variableName: 'inlinePlugin',
                  source: { file: normRel, line: line + 1, column: character + 1 },
                });
                declaredAppsByNode.set(targetArg, inlineSymId);
                declaredAppsByNode.set(param, inlineSymId);
                childIdentifier = inlineSymId;
              }
            }

            if (childIdentifier) {
              let rawPrefix = '';
              let prefixConfidence: RouteConfidence = 'high';

              // Extract { prefix: '/path' } from options argument
              if (node.arguments.length >= 2) {
                const optsArg = node.arguments[1];
                if (ts.isObjectLiteralExpression(optsArg)) {
                  for (const prop of optsArg.properties) {
                    if (
                      ts.isPropertyAssignment(prop) &&
                      ts.isIdentifier(prop.name) &&
                      prop.name.text === 'prefix'
                    ) {
                      const evalPrefix = evaluatePathExpression(prop.initializer);
                      rawPrefix = evalPrefix.path;
                      prefixConfidence = evalPrefix.confidence;
                      break;
                    }
                  }
                }
              }

              const { line, character } = sourceFile.getLineAndCharacterOfPosition(
                propAccess.name.getStart(sourceFile)
              );

              registers.push({
                parentSymbolId: appSymbolId,
                childIdentifier,
                rawPrefix,
                confidence: prefixConfidence,
                source: {
                  file: normRel,
                  line: line + 1,
                  column: character + 1,
                },
              });
            }
          }
        }

        // 1.B. Shorthand HTTP Routes: fastify.get('/path', [opts], handler), fastify.all(...)
        if (
          (FASTIFY_HTTP_METHOD_SET.has(methodName) || methodName === 'all') &&
          node.arguments.length >= 2
        ) {
          const appSymbolId = resolveAppSymbolFromExpression(propAccess.expression);
          if (appSymbolId) {
            const pathEval = evaluatePathExpression(node.arguments[0]);
            const { line, character } = sourceFile.getLineAndCharacterOfPosition(
              propAccess.name.getStart(sourceFile)
            );

            const source: RouteSource = {
              file: normRel,
              line: line + 1,
              column: character + 1,
            };

            if (methodName === 'all') {
              // Version-aware .all() expansion:
              // - Fastify < 5 (e.g. v3, v4): default supportedMethods included TRACE (8 methods).
              // - Fastify >= 5: TRACE was removed from default supportedMethods; QUERY was added.
              //   Since Route Peek MVP canonical domain model does not support QUERY, v5 maps strictly to the 7 methods.
              // - Undefined / unknown version: conservative default uses the 7 universally supported methods.
              const majorVersion = options?.fastifyMajorVersion;
              const allMethods =
                majorVersion !== undefined && majorVersion < 5
                  ? FASTIFY_V4_HTTP_METHODS
                  : FASTIFY_UNIVERSAL_HTTP_METHODS;

              for (const canonicalMethod of allMethods) {
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

        // 1.C. Object-Style Route: fastify.route({ method: 'GET', url: '/path', handler })
        if (methodName === 'route' && node.arguments.length >= 1) {
          const appSymbolId = resolveAppSymbolFromExpression(propAccess.expression);
          if (appSymbolId) {
            const optsArg = node.arguments[0];
            if (ts.isObjectLiteralExpression(optsArg)) {
              let urlEval: PathEvalResult | undefined;
              let pathEval: PathEvalResult | undefined;
              const methods: HttpMethod[] = [];

              for (const prop of optsArg.properties) {
                if (
                  ts.isPropertyAssignment(prop) &&
                  (ts.isIdentifier(prop.name) || ts.isStringLiteral(prop.name))
                ) {
                  const propName = prop.name.text;
                  // Fastify route path: 'url' is canonical, 'path' is documented alias
                  if (propName === 'url') {
                    urlEval = evaluatePathExpression(prop.initializer);
                  } else if (propName === 'path') {
                    pathEval = evaluatePathExpression(prop.initializer);
                  }

                  if (propName === 'method' || propName === 'methods') {
                    const init = prop.initializer;
                    if (ts.isStringLiteral(init)) {
                      const m = init.text.toUpperCase();
                      if (FASTIFY_HTTP_METHOD_SET.has(m.toLowerCase())) {
                        methods.push(m as HttpMethod);
                      }
                    } else if (ts.isArrayLiteralExpression(init)) {
                      for (const elem of init.elements) {
                        if (ts.isStringLiteral(elem)) {
                          const m = elem.text.toUpperCase();
                          if (FASTIFY_HTTP_METHOD_SET.has(m.toLowerCase())) {
                            methods.push(m as HttpMethod);
                          }
                        }
                      }
                    }
                  }
                }
              }

              const resolvedPathEval = urlEval ?? pathEval;
              if (resolvedPathEval && methods.length > 0) {
                const { line, character } = sourceFile.getLineAndCharacterOfPosition(
                  propAccess.name.getStart(sourceFile)
                );
                const source: RouteSource = {
                  file: normRel,
                  line: line + 1,
                  column: character + 1,
                };

                for (const method of methods) {
                  routes.push({
                    appSymbolId,
                    method,
                    rawPath: resolvedPathEval.path,
                    confidence: resolvedPathEval.confidence,
                    source,
                  });
                }
              }
            }
          }
        }
      }

      // 2. Collect Exports: export default plugin, export { plugin }, module.exports = plugin
      // 2.A. ESM Default Export: export default plugin or export default fp(plugin)
      if (ts.isFunctionDeclaration(node) && node.modifiers) {
        const isDefault = node.modifiers.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword);
        const isExport = node.modifiers.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
        if (isExport && isDefault) {
          const symId = declaredAppsByNode.get(node);
          if (symId) {
            const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
            exports.push({
              exportedName: 'default',
              localSymbolId: symId,
              sourceFile: normRel,
              line: line + 1,
            });
          }
        }
      }

      if (ts.isExportAssignment(node) && !node.isExportEquals) {
        const unwrapped = unwrapPluginExpression(node.expression);
        const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));

        if (ts.isIdentifier(unwrapped)) {
          const targetSymId = appSymbolIds.get(unwrapped.text);
          if (targetSymId) {
            exports.push({
              exportedName: 'default',
              localSymbolId: targetSymId,
              sourceFile: normRel,
              line: line + 1,
            });
          }
        } else if (ts.isFunctionExpression(unwrapped) || ts.isArrowFunction(unwrapped)) {
          const symId = declaredAppsByNode.get(unwrapped);
          if (symId) {
            exports.push({
              exportedName: 'default',
              localSymbolId: symId,
              sourceFile: normRel,
              line: line + 1,
            });
          }
        }
      }

      // 2.B. ESM Named Export: export { plugin } or export const plugin = ...
      if (ts.isExportDeclaration(node) && node.exportClause && ts.isNamedExports(node.exportClause)) {
        for (const elem of node.exportClause.elements) {
          const localName = elem.name.text;
          const exportedName = elem.propertyName ? elem.name.text : localName;
          const targetSymId = appSymbolIds.get(localName);
          if (targetSymId) {
            const { line } = sourceFile.getLineAndCharacterOfPosition(elem.getStart(sourceFile));
            exports.push({
              exportedName,
              localSymbolId: targetSymId,
              sourceFile: normRel,
              line: line + 1,
            });
          }
        }
      }

      // 2.C. CommonJS: module.exports = plugin or module.exports = fp(plugin)
      if (
        ts.isBinaryExpression(node) &&
        node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
        ts.isPropertyAccessExpression(node.left)
      ) {
        const propAccess = node.left;
        const { line } = sourceFile.getLineAndCharacterOfPosition(node.left.getStart(sourceFile));

        // module.exports = ...
        if (
          ts.isIdentifier(propAccess.expression) &&
          propAccess.expression.text === 'module' &&
          propAccess.name.text === 'exports'
        ) {
          const unwrapped = unwrapPluginExpression(node.right);
          if (ts.isIdentifier(unwrapped)) {
            const targetSymId = appSymbolIds.get(unwrapped.text);
            if (targetSymId) {
              exports.push({
                exportedName: 'default',
                localSymbolId: targetSymId,
                sourceFile: normRel,
                line: line + 1,
              });
            }
          } else if (ts.isFunctionExpression(unwrapped) || ts.isArrowFunction(unwrapped)) {
            const symId = declaredAppsByNode.get(unwrapped);
            if (symId) {
              exports.push({
                exportedName: 'default',
                localSymbolId: symId,
                sourceFile: normRel,
                line: line + 1,
              });
            }
          }
        }

        // exports.name = plugin
        if (ts.isIdentifier(propAccess.expression) && propAccess.expression.text === 'exports') {
          const exportedName = propAccess.name.text;
          const unwrapped = unwrapPluginExpression(node.right);
          if (ts.isIdentifier(unwrapped)) {
            const targetSymId = appSymbolIds.get(unwrapped.text);
            if (targetSymId) {
              exports.push({
                exportedName,
                localSymbolId: targetSymId,
                sourceFile: normRel,
                line: line + 1,
              });
            }
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
      registers,
      imports,
      exports,
      warnings,
      errors,
    };
  }
}
