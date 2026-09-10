import { Framework } from '../models/Framework';
import { ScannerContext } from './ScannerContext';
import { ScannerResult } from './ScannerResult';

/**
 * Framework-agnostic contract implemented by all framework scanners.
 */
export interface RouteScanner {
  readonly framework: Framework;

  /**
   * Evaluates whether this scanner can handle the given workspace context.
   */
  canHandle(context: ScannerContext): Promise<boolean> | boolean;

  /**
   * Discovers routes within the provided workspace context.
   */
  scan(context: ScannerContext): Promise<ScannerResult>;
}
