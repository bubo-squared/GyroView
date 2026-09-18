import type { CalibrationSet } from './LensCalibration';
import { OffsetStringParser } from './OffsetStringParser';
import { GyroViewError } from '../../shared/errors/GyroViewError';
import type { CalibrationStrings } from '../format/info/RecordingInfo';

export interface CalibrationChoice {
  readonly calibration: CalibrationSet;
  /**
   * Human-readable notes about strings that were present but skipped.
   */
  readonly warnings: readonly string[];
}

/**
 * Picks the most accurate calibration a recording offers: MEI (v3) over polynomial (v2) over
 * equidistant (v1). Strings that cannot be used are reported, not silently dropped.
 */
export class CalibrationSelector {
  public constructor(private readonly parser: OffsetStringParser = new OffsetStringParser()) {}

  public select(strings: CalibrationStrings): CalibrationChoice {
    const warnings: string[] = [];
    const candidates: readonly (readonly [name: string, text: string | undefined])[] = [
      ['offset_v3', strings.offsetV3],
      ['offset_v2', strings.offsetV2],
      ['offset', strings.offset],
    ];
    for (const [name, text] of candidates) {
      if (text === undefined) continue;
      const calibration = this.tryParse(name, text, warnings);
      if (calibration) return { calibration, warnings };
    }
    throw new GyroViewError('no-calibration', 'the recording carries no usable lens calibration');
  }

  private tryParse(name: string, text: string, warnings: string[]): CalibrationSet | undefined {
    try {
      return this.parser.parse(text);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      warnings.push(`${name} skipped: ${reason}`);
      return undefined;
    }
  }
}
