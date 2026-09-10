import { Route } from '../models/Route';
import { Framework } from '../models/Framework';

export interface ScannerWarning {
  readonly message: string;
  readonly file?: string;
  readonly line?: number;
}

export interface ScannerError {
  readonly message: string;
  readonly file?: string;
  readonly line?: number;
}

/**
 * Result returned by an individual framework scanner.
 */
export interface ScannerResult {
  readonly framework: Framework;
  readonly routes: Route[];
  readonly warnings?: ScannerWarning[];
  readonly errors?: ScannerError[];
}
