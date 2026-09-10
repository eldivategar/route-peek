import { Framework } from '../models/Framework';
import { ScannerContext } from './ScannerContext';

export interface FrameworkDetectionResult {
  readonly frameworks: Framework[];
}

/**
 * Abstraction boundary for detecting frameworks present in a workspace.
 * Concrete implementations in future phases will inspect package manifests, imports, etc.
 */
export interface FrameworkDetector {
  detect(context: ScannerContext): Promise<FrameworkDetectionResult>;
}
