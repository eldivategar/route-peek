# Route Peek

> Navigate and understand every API endpoint in your codebase — without running your application.

Route Peek is a local-first VS Code extension that automatically discovers, maps, and navigates API routes from your source code using deterministic static analysis.

Instead of hunting through nested router files, controller classes, mounting middleware, and handler definitions, Route Peek indexes your API surface and displays it directly in your editor.

---

## Why Route Peek?

When developing or onboarding to an unfamiliar backend codebase, understanding which endpoints exist and how they are structured can be painful:
- Routes are often fragmented across multiple nested folders and files.
- Prefixes are composed through nested router mounts (`/api` + `/v1` + `/users`).
- Documentation is frequently outdated or missing entirely.
- Starting a local development server or Docker stack just to inspect routes is slow, noisy, and sometimes blocked by missing credentials or environment variables.

Route Peek solves this by reading the source code directly.

---

## How It Works

1. **AST & Static Analysis**: Route Peek analyzes source files using abstract syntax tree (AST) parsers (TypeScript Compiler API and pure Go AST analysis).
2. **Deterministic Route Resolution**: The resolver engine reconstructs router graphs, mounts, sub-applications, and chained routes into canonical effective paths.
3. **Local-First & Offline**: Scanning runs entirely within your editor. No local server is booted, no code is executed, no network requests are sent, and no code is uploaded anywhere.

---

## Supported Frameworks

Route Peek currently supports static route discovery for:

| Framework | Language | Discovery Capabilities |
| :--- | :--- | :--- |
| **Express.js** | TypeScript / JavaScript | Standard methods, `app.all()`, `express.Router()`, nested mounts, chained routes, cross-file resolution |
| **Fastify** | TypeScript / JavaScript | Shorthand methods, `fastify.route()`, `fastify.register()` with prefixes, `fastify-plugin` (`fp`) |
| **Hono** | TypeScript / JavaScript | Shorthand methods, `app.all()`, `app.route()`, `.basePath()`, sub-app composition |
| **Go Fiber** | Go (v3 & v2) | Shorthand methods, `app.All`, `app.Add`, `app.Group`, `app.Route`, `app.Use` sub-apps, struct receiver methods |

*Note: NestJS, Python (FastAPI, Flask, Django), and additional Go frameworks (Gin, Echo) are planned for future milestones.*

---

## Features

### 1. Interactive Route Explorer (TreeView)
Access the dedicated **Route Peek** view container in your Activity Bar. Endpoints are grouped logically by framework, resource prefix, and endpoint path. Multi-method endpoints (such as `GET`, `PATCH`, and `DELETE /api/v1/users/:id`) are grouped together so you can see all available actions on a resource at a glance.

### 2. Click-to-Source Navigation
Click any route in the tree to jump directly to its source declaration line and column in the editor.

### 3. In-Memory Search & Filtering
Filter routes instantly by HTTP method (e.g. `POST`), path segment (e.g. `/users`), framework, or source file name.

### 4. Route Inspector
Inspect comprehensive route metadata with one click:
- HTTP Method
- Full Effective Path
- Framework
- Confidence Level
- Source file path, line number, and column
- Canonical deterministic Route ID
- Interactive action buttons: **Open Source**, **Copy Route**, **Copy cURL**

### 5. Copy Route & Copy cURL
- **Copy Route**: Copy clean `METHOD /path` strings straight to your clipboard.
- **Copy cURL**: Generate reproducible, ready-to-run `curl` commands formatted with correct HTTP methods, URL paths, and configurable base URLs.

---

## Example Route Tree

```text
ROUTE PEEK
├── Express (8)
│   ├── /api/v1/auth
│   │   ├── POST  /login
│   │   └── POST  /refresh
│   └── /api/v1/users
│       ├── GET   /
│       ├── POST  /
│       └── /:id
│           ├── GET
│           ├── PATCH
│           └── DELETE
└── Fiber (4)
    └── /health
        ├── GET   /live
        └── GET   /ready
```

---

## Dynamic Route Handling & Confidence

Static analysis cannot always predict expressions that are dynamically evaluated at runtime (e.g. environment variables or dynamic string lookups).

Route Peek adheres to a strict principle: **Never guess.**

- **High Confidence**: Paths and prefixes that are fully resolved statically (including string constants and static template literals).
- **Medium Confidence**: Paths inferred from recognizable static conventions.
- **Low Confidence (`<dynamic>`)**: Dynamic expressions that cannot be guaranteed statically are rendered with `<dynamic>` placeholders and a native warning indicator.

---

## Configuration

Route Peek can be configured via VS Code Settings (`settings.json`):

| Setting | Default | Description |
| :--- | :--- | :--- |
| `routePeek.baseUrl` | `"http://localhost:3000"` | The base URL used when generating cURL commands via Copy cURL. |

---

## Commands

All commands are available from the VS Code Command Palette (`Cmd+Shift+P` / `Ctrl+Shift+P`):

- **Route Peek: Scan Workspace** (`routePeek.scanWorkspace`) — Scans all active workspace folders for API endpoints.
- **Route Peek: Refresh Routes** (`routePeek.refreshRoutes`) — Rescans workspace files and updates the TreeView.
- **Route Peek: Search Routes** (`routePeek.searchRoutes`) — Opens QuickPick to filter discovered routes.
- **Route Peek: Clear Route Filter** (`routePeek.clearSearch`) — Clears the active search filter and restores the full tree.
- **Route Peek: Show Route Details** (`routePeek.showRouteDetails`) — Opens the Route Inspector modal for a selected route.
- **Route Peek: Copy Route** (`routePeek.copyRoute`) — Copies `METHOD /path` to the clipboard.
- **Route Peek: Copy cURL** (`routePeek.copyCurl`) — Copies a formatted `curl` command to the clipboard.
- **Route Peek: Open Route Source** (`routePeek.openRouteSource`) — Opens the declaration file and jumps to the line.

---

## Privacy & Security

- **100% Local-First**: No code, metadata, or telemetry is sent to any external server.
- **Zero Runtime Execution**: Your application code is never executed, imported, or run in a node process or VM.
- **Zero Network Activity**: Scanning does not perform HTTP requests or open local ports.
- **Zero AI Dependency**: Discovery is powered by deterministic syntax parsers, ensuring predictable, reproducible results.

---

## Limitations

- Routes generated purely inside dynamic runtime loops or reflection mechanisms cannot be statically resolved.
- Support for NestJS, Python (FastAPI/Flask/Django), OpenAPI contract matching, and visual request flow graphs are deferred to future roadmap phases.

---

## Development

### Prerequisites
- Node.js >= 18
- VS Code >= 1.85.0

### Setup
```bash
git clone https://github.com/eldivategar/route-peek.git
cd route-peek
npm install
```

### Build & Test
```bash
npm run typecheck    # Check TypeScript types
npm run lint         # Run ESLint
npm test             # Run Vitest test suite
npm run build        # Compile production bundle via esbuild
npm run package      # Build .vsix extension package
npm run validate:vsix # Validate packaged VSIX archive integrity
```

---

## License & Support

- **License**: [MIT](LICENSE)
- **Support & Issues**: File bug reports and feature requests on [GitHub Issues](https://github.com/eldivategar/route-peek/issues).
