# Changelog

All notable changes to Route Peek will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] — 2026-09-10

### Initial Public MVP Release

Route Peek is a local-first VS Code extension that discovers and maps API endpoints in your codebase through static analysis — without launching your application, booting servers, or sending code anywhere.

#### Static Route Discovery & Architecture
- Pure AST and lexical static analysis engines for TypeScript, JavaScript, and Go.
- Zero runtime application execution: never invokes `node`, `go run`, dev servers, or background daemons.
- Zero network activity: no HTTP probing, external API requests, or cloud dependencies.
- Zero AI dependencies: all route parsing is 100% deterministic and reproducible.
- Isolated framework scanner architecture preventing cross-framework logic pollution.

#### Multi-Framework Support
- **Express.js**:
  - Full HTTP method support: `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `OPTIONS`, `HEAD`, and `TRACE`.
  - Expansion of `app.all()` into canonical HTTP methods.
  - Multi-level nested routers (`app.use('/api', apiRouter)`, `apiRouter.use('/users', userRouter)`).
  - Cross-file router resolution across ESM (`import`) and CommonJS (`require`).
  - Chained route definitions (`app.route('/path').get(...).post(...)`).
  - Safe static constant and template literal resolution (`${prefix}/users`).
- **Fastify**:
  - Shorthand methods and object-style declarations (`fastify.route({ method, url })`).
  - Plugin registration with route prefixes (`fastify.register(plugin, { prefix: '/api' })`).
  - Support for `fastify-plugin` wrappers (`fp`, `fastifyPlugin`).
  - Version-aware `.all()` method expansion.
- **Hono**:
  - Application shorthand route methods and `app.all()`.
  - Sub-application mounting with `app.route('/prefix', subApp)`.
  - Base path prefixing via `.basePath('/api')`.
  - Cross-file sub-app resolution.
- **Go Fiber**:
  - Support for Fiber v3 and Fiber v2 application routing.
  - Shorthand methods (`app.Get`, `app.Post`, etc.), `app.All`, and `app.Add`.
  - Grouping via `app.Group("/api")` and nested sub-groups.
  - Callback sub-routing (`app.Route("/path", func(router fiber.Router) { ... })`).
  - Sub-application mounting (`app.Use("/api", subApp)`).
  - Go struct receiver method declarations (`func (c *Config) Register(app *fiber.App)`).

#### Native VS Code User Experience
- **Dedicated Activity Bar View**: Clean tree explorer accessible directly from the sidebar.
- **Hierarchical Grouping**: Endpoints organized by framework, resource prefix, and path.
- **Multi-Method Endpoint Merging**: Merges identical path endpoints (e.g. `GET`, `PATCH`, `DELETE /users/:id`) into a single view node with expandable method leaves.
- **Click-to-Source Navigation**: Clicking any discovered route jumps directly to the exact source file, line, and column.
- **In-Memory Route Search**: Instant case-insensitive filtering by HTTP method, path, framework, or file name.
- **Route Inspector**: Native modal presenting HTTP method, full effective path, framework, source location, and canonical Route ID.
- **Copy Route**: One-click clipboard copying of normalized route definitions (`METHOD /path`).
- **Copy cURL**: Pure, deterministic cURL command generator supporting route parameters and configurable base URL via `routePeek.baseUrl` (defaults to `http://localhost:3000`).
- **Dynamic Route Handling**: Static analysis detects when expressions cannot be statically determined, surfacing them as `<dynamic>` with low confidence and native warning badges rather than guessing or asserting false routes.

#### Known Limitations
- Fully dynamic runtime loops (e.g. routes constructed from dynamic runtime database queries) cannot be statically evaluated.
- Scanners for Python (FastAPI, Flask, Django) and NestJS are planned for upcoming releases.
- OpenAPI specification matching and visual API request flow inspection are intentionally deferred to future roadmap phases.
