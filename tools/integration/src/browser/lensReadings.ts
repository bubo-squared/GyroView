import {
  buildStitchingSetup,
  type CalibrationSet,
  type LensLayout,
  type StitchingSetup,
} from '@gyroview/core';
import { parseOffsetString } from '@gyroview/core/testing';
import type { OpenedRecording } from '@gyroview/player/composition';

import type { BlockShift } from './blockField';

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
 * The readings the strings allow: the unified (Mei) model of the v3 string, the polynomial of
 * the v2 string, the equidistant model of the legacy string with its radius at the angle the
 * core reads it at (96 degrees, ADR 0023). A radial scale multiplies what the reading draws.
 */
export function readingsOf(opened: OpenedRecording): LensReading[] {
  const { offset, offsetV2, offsetV3 } = opened.recording.info.calibration;
  const strings = [
    ['mei', offsetV3],
    ['polynomial', offsetV2],
    ['equidistant', offset],
  ] as const;
  return strings.flatMap(([name, text]) =>
    text ? [{ name, calibration: parseOffsetString(text), radialScale: 1 }] : [],
  );
}

export function withRadialScale(reading: LensReading, radialScale: number): LensReading {
  return {
    ...reading,
    name: `${reading.name}@${radialScale.toFixed(SCALE_DECIMALS)}`,
    radialScale,
  };
}

/**
 * The stitching setup of a reading: the model's radius scaled by shrinking each lens's canvas
 * window about its principal point by the inverse, which maps a canvas radius `r` to the
 * frame position of `r / scale`.
 */
export function setupOf(reading: LensReading, layout: LensLayout): StitchingSetup {
  const setup = buildStitchingSetup({ calibration: reading.calibration, layout });
  const windowScale = 1 / reading.radialScale;
  return {
    ...setup,
    lenses: setup.lenses.map((lens) => {
      const { principalPoint } = lens.projection;
      return {
        ...lens,
        window: {
          x: principalPoint.x + (lens.window.x - principalPoint.x) * windowScale,
          y: principalPoint.y + (lens.window.y - principalPoint.y) * windowScale,
          width: lens.window.width * windowScale,
          height: lens.window.height * windowScale,
        },
      };
    }),
  };
}

/**
 * How the block field stretches away from the horizon: the mean vertical shift of the trusted
 * blocks above the middle row minus that below it, in pixels. Negative when GyroView's content
 * sits further from the horizon than the reference's on both sides.
 */
export function verticalStretchOf(field: readonly BlockShift[], height: number): number {
  const trusted = field.filter((block) => block.contrast > MIN_CONTRAST);
  const upper = trusted.filter((block) => block.row < height / 2);
  const lower = trusted.filter((block) => block.row >= height / 2);
  return meanOf(upper.map((block) => block.dy)) - meanOf(lower.map((block) => block.dy));
}

const MIN_CONTRAST = 0.3;
const SCALE_DECIMALS = 3;

function meanOf(values: readonly number[]): number {
  let total = 0;
  for (const value of values) total += value;
  return values.length > 0 ? total / values.length : 0;
}
