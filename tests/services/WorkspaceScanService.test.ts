import { describe, it, expect, vi } from 'vitest';
import { WorkspaceScanService } from '../../src/services/WorkspaceScanService';
import { RouteDiscoveryService } from '../../src/services/RouteDiscoveryService';
import { FrameworkDetector } from '../../src/scanners/FrameworkDetector';
import { ScannerRegistry } from '../../src/services/ScannerRegistry';

describe('WorkspaceScanService', () => {
  it('returns empty result when workspace roots are empty', async () => {
    const service = new WorkspaceScanService();
    const result = await service.scan([]);

    expect(result).toEqual({
      scannedFiles: 0,
      routes: [],
    });
  });

  it('returns deterministic empty result when workspace roots are provided in Phase 2', async () => {
    const service = new WorkspaceScanService();
    const result = await service.scan(['/path/to/project']);

    expect(result).toEqual({
      scannedFiles: 0,
      routes: [],
    });
  });

  it('handles null/undefined roots gracefully', async () => {
    const service = new WorkspaceScanService();
    // @ts-expect-error testing defensive behavior
    const result = await service.scan(null);

    expect(result).toEqual({
      scannedFiles: 0,
      routes: [],
    });
  });

  it('accepts injected RouteDiscoveryService', async () => {
    const mockDetector: FrameworkDetector = {
      detect: vi.fn().mockResolvedValue({ frameworks: [] }),
    };
    const discoveryService = new RouteDiscoveryService(
      mockDetector,
      new ScannerRegistry()
    );
    const service = new WorkspaceScanService(discoveryService);

    const result = await service.scan(['/path/to/project']);

    expect(mockDetector.detect).toHaveBeenCalledWith({
      workspaceRoots: ['/path/to/project'],
    });
    expect(result.routes).toEqual([]);
  });

  it('manages isScanning state during scan execution', async () => {
    let finishScan!: (val: { routes: []; warnings: []; errors: [] }) => void;
    const slowDiscovery = {
      discover: vi.fn().mockImplementation(
        () => new Promise((resolve) => { finishScan = resolve; })
      ),
    } as unknown as RouteDiscoveryService;

    const service = new WorkspaceScanService(slowDiscovery);
    expect(service.isScanning).toBe(false);

    const scanPromise = service.scan(['/path/to/project']);
    expect(service.isScanning).toBe(true);

    finishScan({ routes: [], warnings: [], errors: [] });
    await scanPromise;
    expect(service.isScanning).toBe(false);
  });

  it('rejects concurrent scan attempts with an error', async () => {
    let finishScan!: (val: { routes: []; warnings: []; errors: [] }) => void;
    const slowDiscovery = {
      discover: vi.fn().mockImplementation(
        () => new Promise((resolve) => { finishScan = resolve; })
      ),
    } as unknown as RouteDiscoveryService;

    const service = new WorkspaceScanService(slowDiscovery);
    const firstScan = service.scan(['/path/to/project']);

    await expect(service.scan(['/path/to/project'])).rejects.toThrow(
      'Scan already in progress'
    );

    finishScan({ routes: [], warnings: [], errors: [] });
    await firstScan;
    expect(service.isScanning).toBe(false);
  });

  it('resets isScanning when discovery throws an error', async () => {
    const failingDiscovery = {
      discover: vi.fn().mockRejectedValue(new Error('Discovery failure')),
    } as unknown as RouteDiscoveryService;

    const service = new WorkspaceScanService(failingDiscovery);
    await expect(service.scan(['/path/to/project'])).rejects.toThrow('Discovery failure');
    expect(service.isScanning).toBe(false);
  });
});
