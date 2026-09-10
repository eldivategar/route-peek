import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import { FiberScanner } from '../../src/scanners/fiber/FiberScanner';
import { ScannerContext } from '../../src/scanners/ScannerContext';

describe('Fiber Real-World Repository Verification', () => {
  const realRepoPath = '/Users/eldivategar/BITCORP/Briview-EDC/Services/backend-integration';
  const repoExists = fs.existsSync(realRepoPath);

  it.skipIf(!repoExists)(
    'scans real-world Fiber codebase discovering exactly 39 production routes and 0 test routes',
    async () => {
      const scanner = new FiberScanner();
      const context: ScannerContext = { workspaceRoots: [realRepoPath] };
      const res = await scanner.scan(context);

      expect(res.framework).toBe('fiber');

      // 1. Must discover exactly 39 production routes
      expect(res.routes.length).toBe(39);

      // 2. Must NEVER include any *_test.go routes
      const testRoutes = res.routes.filter((r) => r.source.file.includes('_test.go'));
      expect(testRoutes.length).toBe(0);
      expect(res.routes.some((r) => r.path === '/probe')).toBe(false);
      expect(res.routes.some((r) => r.path === '/secure')).toBe(false);

      // 3. Assert explicit route identities to ensure the exact correct set passes
      const expectedIds = [
        'fiber:GET:/health/live:internal/delivery/http/route/route.go:108',
        'fiber:GET:/health/ready:internal/delivery/http/route/route.go:109',
        'fiber:GET:/:internal/delivery/http/route/route.go:112',
        'fiber:POST:/api/v1/auth/login:internal/delivery/http/route/route.go:132',
        'fiber:POST:/api/v1/auth/refresh:internal/delivery/http/route/route.go:133',
        'fiber:POST:/v1/oauth2/token:internal/delivery/http/route/route.go:161',
        'fiber:POST:/v1/workorder/assignment:internal/delivery/http/route/route.go:180',
        'fiber:POST:/v1/workorder/status:internal/delivery/http/route/route.go:181',
        'fiber:POST:/v1/workorder/implementation/pending:internal/delivery/http/route/route.go:189',
        'fiber:POST:/v1/workorder/implementation/failed:internal/delivery/http/route/route.go:203',
        'fiber:POST:/v1/workorder/implementation/done:internal/delivery/http/route/route.go:216',
        'fiber:POST:/v1/workorder/pm/done:internal/delivery/http/route/route.go:230',
        'fiber:POST:/v1/workorder/cm/done:internal/delivery/http/route/route.go:236',
        'fiber:POST:/v1/workorder/nop/done:internal/delivery/http/route/route.go:242',
        'fiber:POST:/v1/workorder/project/done:internal/delivery/http/route/route.go:248',
        'fiber:POST:/v1/workorder/pullout/done:internal/delivery/http/route/route.go:257',
        'fiber:POST:/v1/workorder/done-negative:internal/delivery/http/route/route.go:271',
        'fiber:GET:/v1/technicians:internal/delivery/http/route/route.go:297',
        'fiber:GET:/v1/service-points:internal/delivery/http/route/route.go:298',
        'fiber:POST:/api/v1/auth/logout:internal/delivery/http/route/route.go:305',
        'fiber:GET:/api/v1/users/current:internal/delivery/http/route/route.go:310',
        'fiber:POST:/api/v1/users/current/change-password:internal/delivery/http/route/route.go:311',
        'fiber:POST:/api/v1/users/search:internal/delivery/http/route/route.go:315',
        'fiber:POST:/api/v1/users:internal/delivery/http/route/route.go:316',
        'fiber:GET:/api/v1/users/:uuid:internal/delivery/http/route/route.go:317',
        'fiber:PATCH:/api/v1/users/:uuid:internal/delivery/http/route/route.go:318',
        'fiber:DELETE:/api/v1/users/:uuid:internal/delivery/http/route/route.go:319',
        'fiber:POST:/api/v1/users/:uuid/reset-password:internal/delivery/http/route/route.go:320',
        'fiber:POST:/api/v1/roles/search:internal/delivery/http/route/route.go:325',
        'fiber:POST:/api/v1/dispatch/search:internal/delivery/http/route/route.go:333',
        'fiber:POST:/api/v1/dispatch/summary:internal/delivery/http/route/route.go:334',
        'fiber:GET:/api/v1/dispatch/workorder/:number:internal/delivery/http/route/route.go:335',
        'fiber:GET:/api/v1/dispatch/:uuid:internal/delivery/http/route/route.go:336',
        'fiber:POST:/api/v1/dispatch/:uuid/replay:internal/delivery/http/route/route.go:337',
        'fiber:POST:/api/v1/inbound/search:internal/delivery/http/route/route.go:346',
        'fiber:GET:/api/v1/inbound/workorder/:number:internal/delivery/http/route/route.go:347',
        'fiber:GET:/api/v1/inbound/:uuid:internal/delivery/http/route/route.go:348',
        'fiber:POST:/api/v1/inbound/:uuid/replay:internal/delivery/http/route/route.go:349',
      ];

      for (const expectedId of expectedIds) {
        expect(res.routes.some((r) => r.id === expectedId)).toBe(true);
      }

      // 4. Strict rejection of non-Fiber methods
      expect(res.routes.some((r) => r.path.includes('Header'))).toBe(false);
      expect(res.routes.some((r) => r.path.includes('vendors'))).toBe(false);
      expect(res.routes.some((r) => r.path.includes('Authorization'))).toBe(false);

      // 5. Verify compact presentation tree model on actual discovered routes
      const { RouteTreeModelBuilder } = await import('../../src/providers/RouteTreeModelBuilder');
      const tree = RouteTreeModelBuilder.build(res.routes);
      expect(tree).toHaveLength(1);

      const fiberFw = tree[0];
      expect(fiberFw.type).toBe('framework');
      expect(fiberFw.framework).toBe('fiber');
      expect(fiberFw.count).toBe(39);

      // Verify resource group /api/v1/users
      const usersRes = fiberFw.children!.find(
        (c) => c.type === 'resource' && c.resourcePrefix === '/api/v1/users'
      );
      expect(usersRes).toBeDefined();
      expect(usersRes!.count).toBe(8);

      // In /api/v1/users, endpoint /:uuid has 3 methods merged (GET, PATCH, DELETE)
      const uuidEndpoint = usersRes!.children!.find((e) => e.endpointPath === '/:uuid');
      expect(uuidEndpoint).toBeDefined();
      expect(uuidEndpoint!.type).toBe('endpoint');
      expect(uuidEndpoint!.count).toBe(3);
      expect(uuidEndpoint!.children).toHaveLength(3);

      const uuidMethods = uuidEndpoint!.children!.map((m) => m.route!.method);
      expect(uuidMethods).toEqual(['GET', 'PATCH', 'DELETE']);
      expect(uuidEndpoint!.children![0].route!.source.line).toBe(317); // GET
      expect(uuidEndpoint!.children![1].route!.source.line).toBe(318); // PATCH
      expect(uuidEndpoint!.children![2].route!.source.line).toBe(319); // DELETE

      // Verify sibling endpoint /:uuid/reset-password is a direct shallow leaf node under /api/v1/users
      const resetPwEndpoint = usersRes!.children!.find((e) => e.endpointPath === '/:uuid/reset-password');
      expect(resetPwEndpoint).toBeDefined();
      expect(resetPwEndpoint!.type).toBe('endpoint');
      expect(resetPwEndpoint!.count).toBe(1);
      expect(resetPwEndpoint!.route!.method).toBe('POST');
      expect(resetPwEndpoint!.route!.source.line).toBe(320);
      expect(resetPwEndpoint!.children).toBeUndefined(); // Case C: leaf node

      // Verify single-method endpoint /search under /api/v1/users is a leaf node
      const searchEndpoint = usersRes!.children!.find((e) => e.endpointPath === '/search');
      expect(searchEndpoint).toBeDefined();
      expect(searchEndpoint!.count).toBe(1);
      expect(searchEndpoint!.route).toBeDefined();
      expect(searchEndpoint!.route!.method).toBe('POST');
      expect(searchEndpoint!.children).toBeUndefined(); // Case C: leaf node

      // 6. Verify cURL generation on actual real-world routes
      const { CurlGenerator } = await import('../../src/services/CurlGenerator');
      
      // Multi-method children cURL commands
      const getCurl = CurlGenerator.generate(uuidEndpoint!.children![0].route!);
      const patchCurl = CurlGenerator.generate(uuidEndpoint!.children![1].route!);
      const deleteCurl = CurlGenerator.generate(uuidEndpoint!.children![2].route!);

      expect(getCurl).toBe('curl -X GET "http://localhost:3000/api/v1/users/:uuid"');
      expect(patchCurl).toBe('curl -X PATCH "http://localhost:3000/api/v1/users/:uuid"');
      expect(deleteCurl).toBe('curl -X DELETE "http://localhost:3000/api/v1/users/:uuid"');

      // Single-method endpoint cURL command
      const searchCurl = CurlGenerator.generate(searchEndpoint!.route!);
      expect(searchCurl).toBe('curl -X POST "http://localhost:3000/api/v1/users/search"');

      // Custom base URL cURL generation
      const customBaseCurl = CurlGenerator.generate(searchEndpoint!.route!, {
        baseUrl: 'https://gateway.internal:8080',
      });
      expect(customBaseCurl).toBe('curl -X POST "https://gateway.internal:8080/api/v1/users/search"');

      // Verify every single route of the 39 routes produces a valid deterministic cURL command
      for (const r of res.routes) {
        const cmd = CurlGenerator.generate(r);
        expect(cmd).toMatch(/^curl -X (GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD|TRACE) "http:\/\/localhost:3000\/.*"$/);
      }

    }
  );
});

