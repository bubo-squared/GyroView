import type { VersionedCalibration } from './CalibrationVersion';
import { parseOffsetString } from './parseOffsetString';
import { GyroViewError, type GyroViewErrorCode } from '../../../shared/errors/GyroViewError';
import type { CalibrationStrings } from '../info/RecordingInfo';

export interface CalibrationChoice {
  /**
   * Undefined when the recording carries no usable calibration string. Playback that stitches
   * needs one; inspection and non-stitching uses do not.
   */
  readonly calibration: VersionedCalibration | undefined;
  /**
   * Human-readable notes about strings that were present but skipped.
   */
  readonly warnings: readonly string[];
}

type Attempt = { readonly calibration: VersionedCalibration } | { readonly warning: string };

/**
 * Only these failures mean "this string is unusable, try the next one"; anything else is a bug
 * and propagates.
 */
const SKIPPABLE: ReadonlySet<GyroViewErrorCode> = new Set([
  'invalid-calibration',
  'unsupported-calibration',
]);

/**
 * Picks the most accurate calibration a recording offers: MEI (v3) over polynomial (v2) over
 * equidistant (v1). Strings that cannot be used are reported, not silently dropped; having none
 * is reported as absence, not as a failure.
 */
export function selectCalibration(strings: CalibrationStrings): CalibrationChoice {
  const candidates: readonly (readonly [name: string, text: string | undefined])[] = [
    ['offset_v3', strings.offsetV3],
    ['offset_v2', strings.offsetV2],
    ['offset', strings.offset],
  ];
  const warnings: string[] = [];
  for (const [name, text] of candidates) {
    if (text === undefined) continue;
    const attempt = tryParse(name, text);
    if ('calibration' in attempt) return { calibration: attempt.calibration, warnings };
    warnings.push(attempt.warning);
  }
  return { calibration: undefined, warnings };
}

function tryParse(name: string, text: string): Attempt {
  try {
    return { calibration: parseOffsetString(text) };
  } catch (error) {
    if (error instanceof GyroViewError && SKIPPABLE.has(error.code)) {
      return { warning: `${name} skipped: ${error.message}` };
    }
    throw error;
  }
}
