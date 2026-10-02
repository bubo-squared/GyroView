import { readPixels } from '@gyroview/adapter-three/testing';
import { DecodePipeline, FramePairQueue, seconds, type FramePair } from '@gyroview/core';
import {
  DECODE_PIPELINE_OPTIONS,
  PAIR_QUEUE_CAPACITY,
  type OpenedRecording,
} from '@gyroview/player/composition';
import { waitFor } from '@gyroview/player/testing';
import { afterEach, describe, expect, it } from 'vitest';

import { saveMeasurement } from '../browser/artifacts';
import { LOCAL_SAMPLES } from '../browser/localSamples';
import { openSample, port } from '../browser/realRecordingSupport';
import { equirectangularRendering, lockAt } from '../browser/rendering';
import { SAILING_8K_30, type SampleRecording } from '../browser/sampleUrls';

const SIZE = { width: 512, height: 256 };
const RGBA = 4;
/**
 * The far field: a band just above the horizon, the sky's edge and what stands far away on it.
 */
const FAR_FIELD_ROWS = { top: 0.41, bottom: 0.5 };
const LUMA = [0.2126, 0.7152, 0.0722] as const;
/**
 * Consecutive frames drawn, and the most a frame may shift the far field, in panorama pixels.
 */
const PAIRS = 420;
const MOST_SHIFT_PIXELS = 12;
/**
 * Sway faster than this is shake the stabilization left; slower, the far field's own drift.
 */
const SMOOTHING_SECONDS = 0.3;
const PERCENTILE = 0.95;
const DECODE_TIMEOUT_MS = 600_000;
const TEST_TIMEOUT_MS = 900_000;

const SAMPLES: readonly (readonly [slug: string, sample: SampleRecording, from: number])[] = [
  ...LOCAL_SAMPLES.map((local) => [local.slug, local, 0.3] as const),
  ['sailing', SAILING_8K_30, 20],
];

const cleanups: (() => void)[] = [];

afterEach(() => {
  for (const cleanup of cleanups.splice(0).toReversed()) cleanup();
});

/**
 * The far field's luma down each column of a WebGL read-back, whose rows run from the bottom up.
 */
function profileOf(pixels: Uint8ClampedArray): Float64Array {
  const profile = new Float64Array(SIZE.width);
  const firstRow = Math.round((1 - FAR_FIELD_ROWS.bottom) * SIZE.height);
  const lastRow = Math.round((1 - FAR_FIELD_ROWS.top) * SIZE.height);
  for (let row = firstRow; row < lastRow; row += 1) {
    for (let column = 0; column < SIZE.width; column += 1) {
      const at = (row * SIZE.width + column) * RGBA;
      profile[column] =
        (profile[column] ?? 0) +
        LUMA[0] * (pixels[at] ?? 0) +
        LUMA[1] * (pixels[at + 1] ?? 0) +
        LUMA[2] * (pixels[at + 2] ?? 0);
    }
  }
  return profile;
}

function mismatchAt(before: Float64Array, after: Float64Array, shift: number): number {
  let total = 0;
  for (const [column, level] of before.entries()) {
    const moved = after[(column + shift + after.length) % after.length] ?? 0;
    total += (level - moved) ** 2;
  }
  return total;
}

/**
 * How far the far field moved between two profiles, in pixels, to a fraction of one.
 */
function shiftBetween(before: Float64Array, after: Float64Array): number {
  const shifts = Array.from(
    { length: 2 * MOST_SHIFT_PIXELS + 1 },
    (_unused, index) => index - MOST_SHIFT_PIXELS,
  );
  const costs = shifts.map((shift) => mismatchAt(before, after, shift));
  const lowest = costs.indexOf(Math.min(...costs));
  const index = Math.min(Math.max(lowest, 1), costs.length - 2);
  const [left = 0, at = 0, right = 0] = costs.slice(index - 1, index + 2);
  const curvature = left - 2 * at + right;
  const shift = curvature > 0 ? Math.min(Math.max((0.5 * (left - right)) / curvature, -1), 1) : 0;
  return (shifts[index] ?? 0) + shift;
}

/**
 * Each pair drawn under lock at the player's own frame time, as its far field's profile.
 */
async function profilesOf(opened: OpenedRecording, from: number): Promise<Float64Array[]> {
  const { canvas, renderer, dispose } = equirectangularRendering(opened, SIZE);
  cleanups.push(dispose);
  const profiles: Float64Array[] = [];
  const draw = (pair: FramePair<VideoFrame>): void => {
    const time = seconds(opened.frameTimes?.midExposureAt(pair.timestamp) ?? pair.timestamp);
    renderer.setStabilization(lockAt(opened, time));
    renderer.present({ pair, mediaTime: pair.timestamp });
    profiles.push(profileOf(readPixels(canvas)));
  };
  const pipeline = new DecodePipeline<VideoFrame>(
    opened.frameSources,
    port,
    DECODE_PIPELINE_OPTIONS,
  );
  const queue = new FramePairQueue<VideoFrame>(PAIR_QUEUE_CAPACITY);
  const run = pipeline.run(seconds(from), queue);
  try {
    await waitFor(
      () => {
        for (let head = queue.peekTimestamp(); head !== undefined; head = queue.peekTimestamp()) {
          const pair = queue.takePairAt(head);
          if (!pair) break;
          if (profiles.length < PAIRS) draw(pair);
          for (const frame of pair.frames) frame.close();
        }
        return profiles.length >= PAIRS;
      },
      `${PAIRS} pairs drawn`,
      DECODE_TIMEOUT_MS,
    );
    return profiles;
  } finally {
    pipeline.abort();
    await run;
    queue.close();
  }
}

/**
 * The far field's sway: its horizontal position frame after frame, what moves faster than the
 * smoothing (the shake left), and the steps between frames.
 */
function swayOf(profiles: readonly Float64Array[], frameRate: number): object {
  const degreesPerPixel = 360 / SIZE.width;
  const positions = [0];
  for (const [index, profile] of profiles.entries()) {
    if (index === 0) continue;
    const step = shiftBetween(profiles[index - 1] ?? profile, profile) * degreesPerPixel;
    positions.push((positions.at(-1) ?? 0) + step);
  }
  const half = Math.round((SMOOTHING_SECONDS * frameRate) / 2);
  const fast = positions.map((position, index) => {
    const window = positions.slice(Math.max(0, index - half), index + half + 1);
    return position - window.reduce((sum, value) => sum + value, 0) / window.length;
  });
  const steps = positions
    .slice(1)
    .map((position, index) => Math.abs(position - (positions[index] ?? 0)));
  const sortedSteps = steps.toSorted((left, right) => left - right);
  return {
    fastSwayRmsDegrees: Math.sqrt(
      fast.reduce((sum, value) => sum + value * value, 0) / fast.length,
    ),
    stepDegreesAtPercentile: sortedSteps[Math.floor(PERCENTILE * (sortedSteps.length - 1))],
    positionsDegrees: positions,
  };
}

/**
 * How much the far field still sways under lock, at the player's own frame timing (ADR 0034):
 * what a viewer sees as the sky wobbling as the camera swings.
 */
describe("the far field's sway under lock", () => {
  for (const [slug, sample, from] of SAMPLES) {
    it(
      `measures how much the far field of the ${sample.name} still sways`,
      async (context) => {
        const opened = await openSample(context, sample);
        cleanups.push(() => {
          opened.dispose();
        });
        const profiles = await profilesOf(opened, from);
        const sway = swayOf(profiles, opened.recording.info.frameRate ?? 1);
        await saveMeasurement(`${slug}-far-field-sway`, sway);
        expect(profiles).toHaveLength(PAIRS);
      },
      TEST_TIMEOUT_MS,
    );
  }
});
