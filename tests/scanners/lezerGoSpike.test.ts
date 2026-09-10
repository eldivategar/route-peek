import { describe, it, expect } from 'vitest';
import { parser } from '@lezer/go';

function getLineAndColumn(source: string, offset: number): { line: number; column: number } {
  const clamped = Math.max(0, Math.min(offset, source.length));
  let line = 1;
  let lineStart = 0;
  for (let i = 0; i < clamped; i++) {
    if (source[i] === '\n') {
      line++;
      lineStart = i + 1;
    }
  }
  const column = clamped - lineStart + 1;
  return { line, column };
}

describe('@lezer/go parser spike', () => {
  it('verifies packages and imports extraction', () => {
    const code = `package main

import (
\t"fmt"
\tfiber "github.com/gofiber/fiber/v3"
\t"github.com/gofiber/fiber/v2"
)
`;
    const tree = parser.parse(code);
    const imports: { path: string; alias?: string }[] = [];

    tree.iterate({
      enter(node) {
        if (node.name === 'ImportSpec') {
          const specNode = node.node;
          let importPath = '';
          let alias: string | undefined;

          for (let c = specNode.firstChild; c; c = c.nextSibling) {
            if (c.name === 'DefName' || c.name === 'VariableName') {
              alias = code.slice(c.from, c.to);
            } else if (c.name === 'String') {
              importPath = code.slice(c.from, c.to).replace(/^["`]|["`]$/g, '');
            }
          }

          imports.push({ path: importPath, alias });
        }
      },
    });

    expect(imports).toEqual([
      { path: 'fmt', alias: undefined },
      { path: 'github.com/gofiber/fiber/v3', alias: 'fiber' },
      { path: 'github.com/gofiber/fiber/v2', alias: undefined },
    ]);
  });

  it('verifies declarations, binary expressions, and slice literals', () => {
    const code = `package main

const prefix = "/api"
const v1 = "/v1"

func main() {
\tapp := fiber.New()
\tapp.Get(prefix + v1 + "/items", handler)
\tapp.Add([]string{"GET", "POST"}, "/multi", handler)
}
`;
    const tree = parser.parse(code);
    const cursor = tree.cursor();
    const nodeNames: string[] = [];

    do {
      if (cursor.name === 'BinaryExp' || cursor.name === 'TypedLiteral') {
        nodeNames.push(`${cursor.name}: ${code.slice(cursor.from, cursor.to)}`);
      }
    } while (cursor.next());

    expect(nodeNames.some((n) => n.startsWith('BinaryExp'))).toBe(true);
    expect(nodeNames.some((n) => n.startsWith('TypedLiteral'))).toBe(true);
  });

  it('verifies raw strings and source positions (1-based line & column)', () => {
    const code = `package main

func main() {
\tapp := fiber.New()
\tapp.Get(\`/raw/path\`, handler)
}
`;
    const tree = parser.parse(code);
    const routes: { method: string; path: string; line: number; column: number }[] = [];

    tree.iterate({
      enter(node) {
        if (node.name === 'CallExpr') {
          const call = node.node;
          const selector = call.getChild('SelectorExpr');
          if (selector) {
            const receiverNode = selector.firstChild;
            const fieldNode = selector.getChild('FieldName');
            if (receiverNode && fieldNode) {
              const method = code.slice(fieldNode.from, fieldNode.to);
              const args = call.getChild('Arguments');
              if (args) {
                const firstArg = args.getChild('String');
                if (firstArg) {
                  const path = code.slice(firstArg.from, firstArg.to).replace(/^["`]|["`]$/g, '');
                  const pos = getLineAndColumn(code, call.from);
                  routes.push({ method, path, line: pos.line, column: pos.column });
                }
              }
            }
          }
        }
      },
    });

    expect(routes).toEqual([
      { method: 'Get', path: '/raw/path', line: 5, column: 2 },
    ]);
  });
});
