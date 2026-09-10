import { describe, it, expect } from 'vitest';
import { FiberAnalyzer, isFiberAppOrRouterType } from '../../src/scanners/fiber/FiberAnalyzer';

describe('FiberAnalyzer', () => {
  const analyzer = new FiberAnalyzer();

  it('extracts shorthand HTTP methods with exact 1-based coordinates', () => {
    const code = `package main

func main() {
\tapp := fiber.New()
\tapp.Get("/users", getUsers)
\tapp.Post("/users", createUser)
\tapp.Put("/users/:id", updateUser)
\tapp.Patch("/users/:id", patchUser)
\tapp.Delete("/users/:id", deleteUser)
\tapp.Head("/users", headUsers)
\tapp.Options("/users", optionsUsers)
\tapp.Trace("/users", traceUsers)
}
`;
    const res = analyzer.analyzeFile('main.go', '/app/main.go', code);
    expect(res.routes.length).toBe(8);
    expect(res.routes.map((r) => r.method)).toEqual([
      'GET',
      'POST',
      'PUT',
      'PATCH',
      'DELETE',
      'HEAD',
      'OPTIONS',
      'TRACE',
    ]);
    expect(res.routes[0].path).toBe('/users');
    expect(res.routes[0].line).toBe(5);
    expect(res.routes[0].column).toBe(2);
  });

  it('expands app.All into all 8 canonical Route Peek HTTP methods', () => {
    const code = `package main

func main() {
\tapp := fiber.New()
\tapp.All("/all-endpoint", handler)
}
`;
    const res = analyzer.analyzeFile('main.go', '/app/main.go', code);
    expect(res.routes.length).toBe(8);
    const methods = res.routes.map((r) => r.method);
    expect(methods).toEqual(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD', 'TRACE']);
    expect(res.routes.every((r) => r.path === '/all-endpoint')).toBe(true);
  });

  it('resolves app.Add with slice literal and single string', () => {
    const code = `package main

func main() {
\tapp := fiber.New()
\tapp.Add([]string{"GET", "POST", "UNKNOWN"}, "/multi", handler)
\tapp.Add("DELETE", "/single", handler)
}
`;
    const res = analyzer.analyzeFile('main.go', '/app/main.go', code);
    expect(res.routes.length).toBe(3);
    expect(res.routes[0].method).toBe('GET');
    expect(res.routes[0].path).toBe('/multi');
    expect(res.routes[1].method).toBe('POST');
    expect(res.routes[1].path).toBe('/multi');
    expect(res.routes[2].method).toBe('DELETE');
    expect(res.routes[2].path).toBe('/single');
  });

  it('resolves constants and binary string concatenation', () => {
    const code = `package main

const apiPrefix = "/api"
const v1 = "/v1"

func main() {
\tapp := fiber.New()
\tapp.Get(apiPrefix + v1 + "/items", handler)
}
`;
    const res = analyzer.analyzeFile('main.go', '/app/main.go', code);
    expect(res.routes.length).toBe(1);
    expect(res.routes[0].path).toBe('/api/v1/items');
    expect(res.routes[0].confidence).toBe('high');
  });

  it('resolves groups and nested groups', () => {
    const code = `package main

func main() {
\tapp := fiber.New()
\tapi := app.Group("/api")
\tv1 := api.Group("/v1")
\tv1.Get("/items", handler)
}
`;
    const res = analyzer.analyzeFile('main.go', '/app/main.go', code);
    expect(res.groups.length).toBe(2);
    expect(res.groups[0].receiverName).toBe('api');
    expect(res.groups[0].parentReceiverName).toBe('app');
    expect(res.groups[0].prefix).toBe('/api');

    expect(res.groups[1].receiverName).toBe('v1');
    expect(res.groups[1].parentReceiverName).toBe('api');
    expect(res.groups[1].prefix).toBe('/v1');

    expect(res.routes.length).toBe(1);
    expect(res.routes[0].receiverName).toBe('v1');
    expect(res.routes[0].path).toBe('/items');
  });

  it('resolves route callbacks: app.Route', () => {
    const code = `package main

func main() {
\tapp := fiber.New()
\tapp.Route("/users", func(router fiber.Router) {
\t\trouter.Get("/profile", getProfile)
\t})
}
`;
    const res = analyzer.analyzeFile('main.go', '/app/main.go', code);
    expect(res.routeCallbacks.length).toBe(1);
    expect(res.routeCallbacks[0].parentReceiverName).toBe('app');
    expect(res.routeCallbacks[0].paramRouterName).toBe('router');
    expect(res.routeCallbacks[0].prefix).toBe('/users');

    expect(res.routes.length).toBe(1);
    expect(res.routes[0].receiverName).toBe('router');
    expect(res.routes[0].path).toBe('/profile');
  });

  it('strictly distinguishes sub-app mounting from middleware in app.Use', () => {
    const code = `package main

func main() {
\tapp := fiber.New()
\tsubApp := fiber.New()
\tsubApp.Get("/ping", pingHandler)

\t// Sub-app mount
\tapp.Use("/sub", subApp)

\t// Middleware configuration (not sub-app)
\tapp.Use("/api", authMiddleware)
}
`;
    const res = analyzer.analyzeFile('main.go', '/app/main.go', code);
    expect(res.mounts.length).toBe(1);
    expect(res.mounts[0].parentReceiverName).toBe('app');
    expect(res.mounts[0].subAppReceiverName).toBe('subApp');
    expect(res.mounts[0].prefix).toBe('/sub');
  });

  it('resolves RouteChain calls', () => {
    const code = `package main

func main() {
\tapp := fiber.New()
\tapp.RouteChain("/chained").Get(getH).Post(postH)
}
`;
    const res = analyzer.analyzeFile('main.go', '/app/main.go', code);
    expect(res.routes.length).toBe(2);
    expect(res.routes[0].method).toBe('GET');
    expect(res.routes[0].path).toBe('/chained');
    expect(res.routes[1].method).toBe('POST');
    expect(res.routes[1].path).toBe('/chained');
  });

  it('ignores shadowed non-fiber variables', () => {
    const code = `package main

func main() {
\tapp := fiber.New()
\t{
\t\tapp := db.Connect()
\t\tapp.Get("/fake", handler)
\t}
\tapp.Get("/real", handler)
}
`;
    const res = analyzer.analyzeFile('main.go', '/app/main.go', code);
    expect(res.routes.length).toBe(1);
    expect(res.routes[0].path).toBe('/real');
  });

  it('extracts same-package direct function calls passing routers', () => {
    const code = `package routes

import (
\t"github.com/gofiber/fiber/v3"
)

func SetupRoutes(app *fiber.App) {
\tapi := app.Group("/api")

\tSetupAuthRoutes(api)
\tSetupUserRoutes(api)
\tSetupHealthRoutes(app)
}
`;
    const res = analyzer.analyzeFile('api.go', '/app/api.go', code);
    expect(res.calls.length).toBe(3);
    expect(res.calls[0].functionName).toBe('SetupAuthRoutes');
    expect(res.calls[0].passedReceiverName).toBe('api');
    expect(res.calls[1].functionName).toBe('SetupUserRoutes');
    expect(res.calls[2].functionName).toBe('SetupHealthRoutes');
    expect(res.calls[2].passedReceiverName).toBe('app');
  });

  it('validates isFiberAppOrRouterType type rules strictly', () => {
    // fiber.Router interface is valid by value
    expect(isFiberAppOrRouterType('fiber.Router')).toBe(true);
    expect(isFiberAppOrRouterType('Router')).toBe(true);

    // *fiber.Router pointer is strictly rejected per Rule #2
    expect(isFiberAppOrRouterType('*fiber.Router')).toBe(false);
    expect(isFiberAppOrRouterType('*Router')).toBe(false);

    // fiber.App struct is valid by pointer and value
    expect(isFiberAppOrRouterType('*fiber.App')).toBe(true);
    expect(isFiberAppOrRouterType('fiber.App')).toBe(true);
    expect(isFiberAppOrRouterType('*App')).toBe(true);
    expect(isFiberAppOrRouterType('App')).toBe(true);

    // Unrelated types are strictly rejected
    expect(isFiberAppOrRouterType('*fiber.Ctx')).toBe(false);
    expect(isFiberAppOrRouterType('fiber.Handler')).toBe(false);
    expect(isFiberAppOrRouterType('*sql.DB')).toBe(false);
    expect(isFiberAppOrRouterType('*gorm.DB')).toBe(false);
    expect(isFiberAppOrRouterType('string')).toBe(false);
  });

  it('enforces struct receiver type provenance and rejects unrelated field methods', () => {
    const code = `package main

import (
\t"net/http"
\t"github.com/gofiber/fiber/v3"
)

type RouteConfig struct {
\tApp *fiber.App
}

type DBConfig struct {
\tDB *sql.DB
\tApp string
}

func (c *RouteConfig) Setup() {
\tc.App.Get("/probe", handler)
}

func (d *DBConfig) Query(ctx *fiber.Ctx) {
\td.DB.Get("/fake-db")
\td.App.Get("/fake-string")
\tctx.Get("Authorization")
\thttp.Get("https://example.com")
}
`;
    const res = analyzer.analyzeFile('main.go', '/app/main.go', code);
    expect(res.routes.length).toBe(1);
    expect(res.routes[0].path).toBe('/probe');
    expect(res.routes[0].receiverName).toBe('c.App');

    // Negative assertions
    expect(res.routes.some((r) => r.path === '/fake-db')).toBe(false);
    expect(res.routes.some((r) => r.path === '/fake-string')).toBe(false);
    expect(res.routes.some((r) => r.path.includes('Authorization'))).toBe(false);
    expect(res.routes.some((r) => r.path.includes('example.com'))).toBe(false);
  });
});
