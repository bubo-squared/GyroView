import {
  buildStitchingSetup,
  CALIBRATION_SOURCES,
  CalibrationVersion,
  GyroViewError,
  mapRecord,
  type CalibrationSet,
  type LensLayout,
  type StitchingSetup,
  type VersionedCalibration,
} from '@gyroview/core';
import { parseOffsetString } from '@gyroview/core/testing';
import type { OpenedRecording } from '@gyroview/player/composition';

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
 * Each string version's reading as the measurements and renders name it, in the order they are
 * scored: the unified (Mei) model of the v3 and v6 strings, the polynomial of the v2 string, the
 * equidistant model of the legacy string with its radius at the angle the core reads it at (96
 * degrees, ADR 0023). The alignment starts from the first reading a recording has: the v3 one
 * ADR 0023's measurements aligned from, else the v6 one.
 */
const READINGS: readonly { readonly version: CalibrationVersion; readonly name: string }[] = [
  { version: CalibrationVersion.Mei, name: 'mei' },
  { version: CalibrationVersion.ExtendedMei, name: 'extended-mei' },
  { version: CalibrationVersion.Polynomial, name: 'polynomial' },
  { version: CalibrationVersion.Legacy, name: 'equidistant' },
];

/**
 * The readings the recording's calibration strings allow, in the order of {@link READINGS}; a
 * string the core cannot read is left out. A radial scale multiplies what the reading draws.
 */
export function readingsOf(opened: OpenedRecording): LensReading[] {
  const { calibration } = opened.recording.info;
  const calibrations = Object.values(
    mapRecord(CALIBRATION_SOURCES, (_source, key) => calibration[key]),
  ).flatMap((text) => (text === undefined ? [] : readableCalibrationOf(text)));
  return READINGS.flatMap(({ version, name }) =>
    calibrations
      .filter((candidate) => candidate.version === version)
      .map((readable) => ({ name, calibration: readable, radialScale: 1 })),
  );
}

function readableCalibrationOf(text: string): VersionedCalibration[] {
  try {
    return [parseOffsetString(text)];
  } catch (error) {
    if (error instanceof GyroViewError && error.code === 'invalid-calibration') return [];
    throw error;
  }
}

export function withRadialScale(reading: LensReading, radialScale: number): LensReading {
  return {
    ...reading,
    name: `${reading.name}@${radialScale.toFixed(SCALE_DECIMALS)}`,
    radialScale,
  };
}

/**
 * The stitching setup of a reading: each lens drawn at the reading's radial scale on top of the
 * one the core reads it at.
 */
export function setupOf(reading: LensReading, layout: LensLayout): StitchingSetup {
  const { calibration } = reading;
  const lenses = calibration.lenses.map((lens) => ({
    ...lens,
    radialScale: lens.radialScale * reading.radialScale,
  }));
  return buildStitchingSetup({ calibration: { ...calibration, lenses }, layout });
}

const SCALE_DECIMALS = 3;
