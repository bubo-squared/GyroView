import { ThreeFrameRenderer } from '@gyroview/adapter-three';
import {
  isProperRotation,
  buildStitchingSetup,
  IDENTITY_MATRIX3,
  assumedImuFrame,
  imuFrameFor,
  DecodePipeline,
  stabilizerFor,
  OrientationTrack,
  type BodyAxes,
  type ImuFrame,
  type SignedAxis,
} from '@gyroview/core';
import { commands } from '@vitest/browser/context';
import { DECODE_PIPELINE_OPTIONS } from '@gyroview/player/composition';
import { afterEach, describe, expect, it } from 'vitest';

import { closeAll, openSample, port, takePairs } from './realRecordingSupport';
import { OFFICE_5K7_60, SAILING_8K_30 } from './sampleUrls';
import { worldMovement } from './worldMovement';

const WIDTH = 384;
const HEIGHT = 192;
/**
 * Consecutive pairs this far apart: enough camera motion to tell mappings apart, little scene
 * motion.
 */
const PAIRS_APART = 16;
const AXES: readonly SignedAxis[] = ['x', 'y', 'z', '-x', '-y', '-z'];

interface Ranked {
  readonly name: string;
  readonly stillness: number;
}

/**
 * Every proper rotation that permutes and flips axes: the 24 ways an IMU can sit in a camera.
 */
function allImuFrames(): readonly ImuFrame[] {
  return AXES.flatMap((x) => AXES.flatMap((y) => AXES.flatMap((z) => properFrameOf(x, y, z))));
}

function properFrameOf(x: SignedAxis, y: SignedAxis, z: SignedAxis): ImuFrame[] {
  const axes: BodyAxes = [x, y, z];
  return isProperRotation(axes) ? [assumedImuFrame(axes.join(','), axes)] : [];
}

/**
 * In lock mode the world must stand still, so the IMU frame whose orientation keeps consecutive
 * renders most alike is the frame the camera really has. This is the data-driven check ADR 0009
 * rests on; it runs on the real recordings only.
 */
interface Candidate {
  readonly frame: ImuFrame;
  readonly orientations: OrientationTrack;
  total: number;
}

interface Measured {
  readonly unstabilized: number;
  readonly ranking: readonly Ranked[];
}

interface MeasurementParts {
  readonly opened: Awaited<ReturnType<typeof openSample>>;
  readonly renderer: ThreeFrameRenderer;
  readonly candidates: Candidate[];
  readonly times: readonly number[];
}

/**
 * Decodes pairs at every time and accumulates how much the world moved between them, without
 * stabilization and under every candidate frame.
 */
async function measureStillness(parts: MeasurementParts): Promise<Measured> {
  const lock = stabilizerFor('lock');
  let unstabilized = 0;
  for (const time of parts.times) {
    const pipeline = new DecodePipeline<VideoFrame>(
      parts.opened.frameSources,
      port,
      DECODE_PIPELINE_OPTIONS,
    );
    const pairs = await takePairs(pipeline, time, PAIRS_APART);
    const [first] = pairs;
    const later = pairs.at(-1);
    if (!first || !later) throw new Error('no pairs decoded');
    const renderable = { renderer: parts.renderer, first, later };
    unstabilized += worldMovement(renderable, () => IDENTITY_MATRIX3);
    for (const candidate of parts.candidates) {
      candidate.total += worldMovement(renderable, (pair) =>
        lock.nextRotation(candidate.orientations.orientationAt(pair.timestamp), pair.timestamp),
      );
    }
    closeAll(pairs);
  }
  const ranking = parts.candidates
    .map(({ frame, total }) => ({ name: frame.name, stillness: total / parts.times.length }))
    .toSorted((left, right) => left.stillness - right.stillness);
  return { unstabilized: unstabilized / parts.times.length, ranking };
}

function nameOf(frame: ImuFrame): string | undefined {
  return allImuFrames().find((candidate) => candidate.toBody.join(',') === frame.toBody.join(','))
    ?.name;
}

describe('IMU frame ranking by world stillness under lock stabilization', () => {
  const cleanups: (() => void)[] = [];

  afterEach(() => {
    for (const cleanup of cleanups.splice(0).toReversed()) cleanup();
  });

  for (const [slug, sample, times] of [
    ['sailing', SAILING_8K_30, [20, 55, 85, 135, 170]],
    ['office', OFFICE_5K7_60, [3, 45, 120, 210, 240]],
  ] as const) {
    it(`ranks the configured X5 frame first on the ${sample.name}`, async (context) => {
      const opened = await openSample(context, sample);
      cleanups.push(() => {
        opened.dispose();
      });
      const { recording } = opened;
      const calibration = recording.calibration.calibration;
      const gyro = await recording.readGyroRecord();
      if (!calibration || !gyro) throw new Error(`${sample.name} lacks calibration or gyro`);
      const clock = await recording.captureClock();
      if (!clock) throw new Error('the recording has no first-frame timestamp');
      const canvas = document.createElement('canvas');
      canvas.width = WIDTH;
      canvas.height = HEIGHT;
      const setup = buildStitchingSetup({
        calibration,
        layout: opened.layout,
      });
      const renderer = ThreeFrameRenderer.create(canvas, setup, {
        preserveDrawingBuffer: true,
      });
      renderer.setViewMode('equirectangular');
      cleanups.push(() => {
        renderer.dispose();
      });
      const candidates = allImuFrames().map((frame) => ({
        frame,
        orientations: OrientationTrack.integrate({ gyro: gyro.track, clock, frame }),
        total: 0,
      }));
      const measured = await measureStillness({ opened, renderer, candidates, times });
      await commands.saveArtifact(
        `${slug}-imu-frame-ranking.json`,
        `data:application/json;base64,${btoa(JSON.stringify(measured, undefined, 2))}`,
      );
      expect(measured.ranking[0]?.name).toBe(nameOf(imuFrameFor(recording.info)));
      expect(measured.ranking[0]?.stillness).toBeLessThan(measured.unstabilized);
    });
  }
});
