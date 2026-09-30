import { InfoField } from './infoFields';
import type { CalibrationStrings } from './RecordingInfo';

/**
 * Where the info record keeps one calibration string, and the name a warning about the string
 * uses: the camera's own schema's (telemetry-parser `src/insta360/extra_info.rs`), or, for the v6
 * string, which no published schema names, the name its siblings suggest.
 */
export interface CalibrationSource {
  readonly field: number;
  readonly name: string;
}

/**
 * Every calibration string the player reads, declared once: the parser reads the strings by it,
 * and the calibration's selection names them by it. The record's type makes the compiler refuse
 * a string of {@link CalibrationStrings} without a source.
 */
export const CALIBRATION_SOURCES = {
  offset: { field: InfoField.Offset, name: 'offset' },
  offsetV2: { field: InfoField.OffsetV2, name: 'offset_v2' },
  offsetV3: { field: InfoField.OffsetV3, name: 'offset_v3' },
  offsetV6: { field: InfoField.OffsetV6, name: 'offset_v6' },
} as const satisfies Readonly<Record<keyof CalibrationStrings, CalibrationSource>>;
