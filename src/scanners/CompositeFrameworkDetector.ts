import { Framework } from '../models/Framework';
import { FrameworkDetector, FrameworkDetectionResult } from './FrameworkDetector';
import { ScannerContext } from './ScannerContext';

/**
 * Framework-agnostic composite detector that aggregates detection results
 * across multiple independent framework detectors with fault isolation.
 */
export class CompositeFrameworkDetector implements FrameworkDetector {
  constructor(private readonly detectors: readonly FrameworkDetector[]) {}

  public async detect(context: ScannerContext): Promise<FrameworkDetectionResult> {
    const detected = new Set<Framework>();

    for (const detector of this.detectors) {
      try {
        const result = await detector.detect(context);
        if (result && result.frameworks) {
          for (const framework of result.frameworks) {
            detected.add(framework);
          }
        }
      } catch {
        // Fault isolation: one detector failure does not abort other detectors
      }
    }

    return { frameworks: Array.from(detected) };
  }
}
