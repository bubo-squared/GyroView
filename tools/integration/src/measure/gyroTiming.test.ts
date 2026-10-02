import { seconds, type OrientationTrack, type Vector3 } from '@gyroview/core';
import type { OpenedRecording } from '@gyroview/player/composition';
import { afterEach, describe, expect, it } from 'vitest';

import { saveMeasurement } from '../browser/artifacts';
import { LOCAL_SAMPLES } from '../browser/localSamples';
import { openSample } from '../browser/realRecordingSupport';
import { equirectangularRendering, lockAt, motionOf } from '../browser/rendering';
import {
  KRNJACA_8K_30,
  OFFICE_5K7_60,
  SAILING_8K_30,
  type SampleRecording,
} from '../browser/sampleUrls';
import { closeMoment, decodeMoment, type Moment } from '../browser/SharedSample';
import { worldMovement, type RowBand } from '../browser/worldMovement';
import { angularVelocityAt } from './support/angularVelocity';

const SIZE = { width: 384, height: 192 };
/**
 * Gyro times tried around each frame's own: 2 ms apart, 20 ms either side.
 */
const OFFSET_STEP_MS = 2;
const OFFSETS_EITHER_SIDE = 10;
const OFFSETS_MS = Array.from(
  { length: 2 * OFFSETS_EITHER_SIDE + 1 },
  (_unused, index) => (index - OFFSETS_EITHER_SIDE) * OFFSET_STEP_MS,
);
const MILLISECONDS_PER_SECOND = 1000;
/**
 * The rows scored: a band about the horizon as wide above as below, so that neither end of a
 * lens's readout weighs more in the time found, and the poles, which the panorama stretches,
 * weigh nothing.
 */
const HORIZON_BAND: RowBand = { top: 0.3, bottom: 0.7 };
/**
 * The moments measured. A moment compares its first frame with one fifteen frames later, so a
 * gyro time off by δ moves the world between them by the change of the turn rate times δ: the
 * moments are those where the rate changes most, apart enough not to repeat one swing.
 */
const MOMENTS = 16;
const FRAMES_BETWEEN_COMPARED = 15;
const MOMENT_SPACING_SECONDS = 0.6;
const CANDIDATE_STEP_SECONDS = 0.25;
const EDGE_SECONDS = 0.5;
/**
 * A recording tells its timing when the minima of its moments agree this well (their standard
 * error); one that turned too little scatters them and is skipped.
 */
const TELLING_STANDARD_ERROR_MS = 3;
/**
 * The frame's time must lie within this many standard errors of the measured minimum, or within
 * the grid: a step, and the integration's own lag of up to a gyro sample.
 */
const STANDARD_ERRORS_ALLOWED = 2;
const WITHIN_THE_GRID_MS = 3;
const TEST_TIMEOUT_MS = 900_000;

const SAMPLES: readonly (readonly [slug: string, sample: SampleRecording])[] = [
  ...LOCAL_SAMPLES.map((local) => [local.slug, local] as const),
  ['sailing', SAILING_8K_30],
  ['office', OFFICE_5K7_60],
  ['krnjaca', KRNJACA_8K_30],
];

const cleanups: (() => void)[] = [];

afterEach(() => {
  for (const cleanup of cleanups.splice(0).toReversed()) cleanup();
});

function distance(left: Vector3, right: Vector3): number {
  return Math.hypot(left[0] - right[0], left[1] - right[1], left[2] - right[2]);
}

/**
 * The moments whose turn rate changes most between the two frames compared, apart from each
 * other.
 */
function changingTurns(orientations: OrientationTrack, opened: OpenedRecording): number[] {
  const { frameRate } = opened.recording.info;
  if (frameRate === undefined) throw new Error('the recording names no frame rate');
  const gap = FRAMES_BETWEEN_COMPARED / frameRate;
  const last = opened.duration - gap - EDGE_SECONDS;
  const candidates = Array.from(
    { length: Math.floor((last - EDGE_SECONDS) / CANDIDATE_STEP_SECONDS) },
    (_unused, index) => {
      const time = EDGE_SECONDS + index * CANDIDATE_STEP_SECONDS;
      const change = distance(
        angularVelocityAt(orientations, time),
        angularVelocityAt(orientations, time + gap),
      );
      return { time, change };
    },
  ).toSorted((left, right) => right.change - left.change);
  const chosen: number[] = [];
  for (const { time } of candidates) {
    if (chosen.every((other) => Math.abs(other - time) > MOMENT_SPACING_SECONDS)) chosen.push(time);
    if (chosen.length === MOMENTS) break;
  }
  return chosen;
}

/**
 * The offset of least world movement on one curve, by a parabola through the lowest three.
 */
function minimumOf(stillness: readonly number[]): number {
  const lowest = stillness.indexOf(Math.min(...stillness));
  const index = Math.min(Math.max(lowest, 1), stillness.length - 2);
  const [before = 0, at = 0, after = 0] = stillness.slice(index - 1, index + 2);
  const curvature = before - 2 * at + after;
  const shift = curvature > 0 ? Math.min(Math.max((0.5 * (before - after)) / curvature, -1), 1) : 0;
  return (OFFSETS_MS[index] ?? 0) + shift * OFFSET_STEP_MS;
}

function meanOf(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function standardErrorOf(values: readonly number[]): number {
  const mean = meanOf(values);
  const variance =
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance / values.length);
}

/**
 * Each offset's world movement at one moment, the gyro sampled at the player's frame time and
 * that offset.
 */
function curveAt(
  opened: OpenedRecording,
  renderable: Moment & Parameters<typeof worldMovement>[0],
): number[] {
  const { frameTimes } = opened;
  if (!frameTimes) throw new Error('the recording has no frame times');
  return OFFSETS_MS.map((offset) =>
    worldMovement(
      renderable,
      (pair) => {
        const frameTime = frameTimes.midExposureAt(pair.timestamp) ?? pair.timestamp;
        return lockAt(opened, seconds(frameTime + offset / MILLISECONDS_PER_SECOND));
      },
      HORIZON_BAND,
    ),
  );
}

async function curvesOf(opened: OpenedRecording, times: readonly number[]): Promise<number[][]> {
  const { canvas, renderer, dispose } = equirectangularRendering(opened, SIZE);
  cleanups.push(dispose);
  const curves: number[][] = [];
  for (const time of times) {
    const moment = await decodeMoment(opened, time);
    curves.push(curveAt(opened, { canvas, renderer, ...moment }));
    closeMoment(moment);
  }
  return curves;
}

/**
 * When the gyro's orientation holds the world stillest under lock, against each frame's own
 * time (ADR 0034): the measurement a camera's frame timing is checked by. A recording whose
 * moments agree on it has its minimum at the frame's time; one that turned too little is
 * skipped.
 */
describe("the gyro's timing against the frames", () => {
  for (const [slug, sample] of SAMPLES) {
    it(
      `holds the world stillest at the frame's own time on the ${sample.name}`,
      async (context) => {
        const opened = await openSample(context, sample);
        cleanups.push(() => {
          opened.dispose();
        });
        const times = changingTurns(motionOf(opened).orientations, opened);
        const curves = await curvesOf(opened, times);
        const minima = curves.map((curve) => minimumOf(curve));
        const best = { offsetMs: meanOf(minima), standardErrorMs: standardErrorOf(minima) };
        await saveMeasurement(`${slug}-gyro-timing`, {
          offsetsMs: OFFSETS_MS,
          times,
          curves,
          minima,
          best,
        });
        context.skip(
          best.standardErrorMs > TELLING_STANDARD_ERROR_MS,
          `${sample.name} turned too little to tell its timing`,
        );
        expect(Math.abs(best.offsetMs)).toBeLessThanOrEqual(
          Math.max(WITHIN_THE_GRID_MS, STANDARD_ERRORS_ALLOWED * best.standardErrorMs),
        );
      },
      TEST_TIMEOUT_MS,
    );
  }
});
