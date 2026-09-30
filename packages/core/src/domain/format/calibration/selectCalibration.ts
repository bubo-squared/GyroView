import type { VersionedCalibration } from './CalibrationVersion';
import { parseOffsetString } from './parseOffsetString';
import { GyroViewError, type GyroViewErrorCode } from '../../../shared/errors/GyroViewError';
import { CALIBRATION_SOURCES, type CalibrationSource } from '../info/calibrationSources';
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
 * The order the calibration strings are tried in: the legacy string first, whose equidistant
 * reading is the one Insta360's own stitch agrees with on the far field (ADR 0023), then, for a
 * recording without it, the Mei strings, the newer fit (v6) before the older (v3), and the
 * polynomial (v2) last.
 */
export const CALIBRATION_PREFERENCE: readonly (keyof CalibrationStrings)[] = [
  'offset',
  'offsetV6',
  'offsetV3',
  'offsetV2',
];

/**
 * Picks the calibration a recording is stitched through, the first usable string in
 * {@link CALIBRATION_PREFERENCE}. Strings that cannot be used are reported, not silently
 * dropped; having none is reported as absence, not as a failure.
 */
export function selectCalibration(strings: CalibrationStrings): CalibrationChoice {
  const warnings: string[] = [];
  for (const attempt of attemptsOf(strings)) {
    if ('calibration' in attempt) return { calibration: attempt.calibration, warnings };
    warnings.push(attempt.warning);
  }
  return { calibration: undefined, warnings };
}

/**
 * Every usable calibration string of a recording, in {@link CALIBRATION_PREFERENCE}: what the
 * measurements compare, where playback takes the first.
 */
export function usableCalibrationsOf(strings: CalibrationStrings): VersionedCalibration[] {
  return [...attemptsOf(strings)].flatMap((attempt) =>
    'calibration' in attempt ? [attempt.calibration] : [],
  );
}

/**
 * The strings the recording carries, each parsed when asked for, in preference order.
 */
function* attemptsOf(strings: CalibrationStrings): Generator<Attempt> {
  for (const key of CALIBRATION_PREFERENCE) {
    const text = strings[key];
    if (text !== undefined) yield tryParse(CALIBRATION_SOURCES[key], text);
  }
}

function tryParse({ name }: CalibrationSource, text: string): Attempt {
  try {
    return { calibration: parseOffsetString(text) };
  } catch (error) {
    if (error instanceof GyroViewError && SKIPPABLE.has(error.code)) {
      return { warning: `${name} skipped: ${error.message}` };
    }
    throw error;
  }
}
