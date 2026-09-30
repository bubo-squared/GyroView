import {
  buildStitchingSetup,
  CalibrationVersion,
  type CalibrationSet,
  type LensLayout,
  type StitchingSetup,
} from '@gyroview/core';
import {
  extendedMeiLayout,
  parseOffsetString,
  shownAsRecorded,
  usableCalibrationsOf,
} from '@gyroview/core/testing';
import type { OpenedRecording } from '@gyroview/player/composition';

import { V6_TERM_CANDIDATES, type NamedTermReading } from './v6TermReadings';

/**
 * One way of reading the recording's calibration strings into lens models, and a factor on
 * the radius every model draws: what the reference decides between.
 */
export interface LensReading {
  readonly name: string;
  readonly calibration: CalibrationSet;
  readonly radialScale: number;
}

/**
 * The name the v6 string's reading is measured under.
 */
export const EXTENDED_MEI = 'extended-mei';

/**
 * Each string version's reading as the measurements and renders name it, in the order they are
 * scored, with the radial scales tried on it against the reading as the core reads it: the
 * unified (Mei) model of the v3 and v6 strings up to the Mei model's best on the two X5 units
 * (ADR 0023), the polynomial of the v2 string as it is, a fallback, and the equidistant model of
 * the legacy string with its radius at 96 to 98 degrees. The alignment starts from the first
 * reading a recording has: the v3 one ADR 0023's measurements aligned from, else the v6 one.
 */
/* eslint-disable @typescript-eslint/no-magic-numbers -- the scales tried, ADR 0023 */
const READINGS: readonly {
  readonly version: CalibrationVersion;
  readonly name: string;
  readonly radialScales: readonly number[];
}[] = [
  { version: CalibrationVersion.Mei, name: 'mei', radialScales: [1, 1.02, 1.04] },
  {
    version: CalibrationVersion.ExtendedMei,
    name: EXTENDED_MEI,
    radialScales: [0.98, 1, 1.02, 1.04, 1.06],
  },
  { version: CalibrationVersion.Polynomial, name: 'polynomial', radialScales: [1] },
  { version: CalibrationVersion.Legacy, name: 'equidistant', radialScales: [1, 0.99, 0.98] },
];
/* eslint-enable @typescript-eslint/no-magic-numbers */

/**
 * The readings the recording's calibration strings allow, each at every radial scale its version
 * tries, in the order of {@link READINGS}; a string the core cannot use is left out.
 */
export function readingsOf(opened: OpenedRecording): LensReading[] {
  const calibrations = usableCalibrationsOf(opened.recording.info.calibration);
  return READINGS.flatMap(({ version, name, radialScales }) =>
    calibrations
      .filter((calibration) => calibration.version === version)
      .flatMap((calibration) =>
        radialScales.map((radialScale) => ({ name, calibration, radialScale })),
      ),
  );
}

/**
 * The v6 string read by each candidate reading of its higher-order terms, at `radialScale`:
 * none when the recording has no v6 string (ADR 0032).
 */
export function termReadingsOf(opened: OpenedRecording, radialScale: number): LensReading[] {
  const text = opened.recording.info.calibration.offsetV6;
  return text === undefined
    ? []
    : V6_TERM_CANDIDATES.map((candidate) => termReadingOf(text, candidate, radialScale));
}

function termReadingOf(
  text: string,
  candidate: NamedTermReading,
  radialScale: number,
): LensReading {
  return {
    name: `${EXTENDED_MEI}/${candidate.name}`,
    calibration: parseOffsetString(text, [extendedMeiLayout(candidate.reading)]),
    radialScale,
  };
}

/**
 * The stitching setup of a reading, drawn as recorded: the lenses at the reading's radial scale
 * on top of the one the core reads their string at.
 */
export function setupOf(reading: LensReading, layout: LensLayout): StitchingSetup {
  const { calibration } = reading;
  return buildStitchingSetup({
    calibration: { ...calibration, radialScale: calibration.radialScale * reading.radialScale },
    layout,
    displayConversions: shownAsRecorded(layout),
  });
}
