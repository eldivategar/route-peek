import { Framework } from '../models/Framework';
import { RouteScanner } from '../scanners/RouteScanner';

/**
 * Registry managing available RouteScanner implementations.
 *
 * Registration Policy:
 * - Exactly one scanner per framework.
 * - Duplicate registration for the same framework throws an explicit Error.
 */
export class ScannerRegistry {
  private readonly scanners = new Map<Framework, RouteScanner>();

  /**
   * Registers a RouteScanner.
   * @throws Error if a scanner is already registered for this scanner's framework.
   */
  public register(scanner: RouteScanner): void {
    const key = scanner.framework;
    if (this.scanners.has(key)) {
      throw new Error(`Scanner for framework '${key}' is already registered.`);
    }
    this.scanners.set(key, scanner);
  }

  /**
   * Retrieves the scanner registered for a specific framework, if any.
   */
  public get(framework: Framework): RouteScanner | undefined {
    return this.scanners.get(framework);
  }

  /**
   * Returns all registered scanners.
   */
  public getAll(): RouteScanner[] {
    return Array.from(this.scanners.values());
  }

  /**
   * Checks whether a scanner is registered for a specific framework.
   */
  public has(framework: Framework): boolean {
    return this.scanners.has(framework);
  }

  /**
   * Unregisters the scanner for the given framework.
   * Returns true if a scanner was found and removed, false otherwise.
   */
  public unregister(framework: Framework): boolean {
    return this.scanners.delete(framework);
  }

  /**
   * Removes all registered scanners.
   */
  public clear(): void {
    this.scanners.clear();
  }
}
