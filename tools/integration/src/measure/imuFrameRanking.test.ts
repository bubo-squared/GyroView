import type { ThreeFrameRenderer } from '@gyroview/adapter-three';
import {
  isProperRotation,
  IDENTITY_MATRIX3,
  assumedImuFrame,
  imuFrameFor,
  stabilizerFor,
  OrientationTrack,
  type BodyAxes,
  type ImuFrame,
  type SignedAxis,
} from '@gyroview/core';
import type { OpenedRecording } from '@gyroview/player/composition';
import { afterEach, describe, expect, it } from 'vitest';

import { saveMeasurement } from '../browser/artifacts';
import { openSample } from '../browser/realRecordingSupport';
import { equirectangularRendering } from '../browser/rendering';
import { LOCAL_SAMPLES } from '../browser/localSamples';
import { KRNJACA_8K_30, OFFICE_5K7_60, SAILING_8K_30 } from '../browser/sampleUrls';
import { closeMoment, decodeMoment } from '../browser/SharedSample';
import { worldMovement } from '../browser/worldMovement';

/**
 * Small panoramas: 24 candidates render each moment twice, and the ranking needs no detail.
 */
const RANKING_SIZE = { width: 384, height: 192 };
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
  readonly opened: OpenedRecording;
  readonly canvas: HTMLCanvasElement;
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
    const moment = await decodeMoment(parts.opened, time);
    const renderable = { canvas: parts.canvas, renderer: parts.renderer, ...moment };
    unstabilized += worldMovement(renderable, () => IDENTITY_MATRIX3);
    for (const candidate of parts.candidates) {
      candidate.total += worldMovement(renderable, (pair) =>
        lock.nextRotation(candidate.orientations.orientationAt(pair.timestamp), pair.timestamp),
      );
    }
    closeMoment(moment);
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

/**
 * The committed samples, and the local ones (ADR 0031), with the moments ranked on.
 */
const RANKED_SAMPLES = [
  ['sailing', SAILING_8K_30, [20, 55, 85, 135, 170]],
  ['office', OFFICE_5K7_60, [3, 45, 120, 210, 240]],
  ['krnjaca', KRNJACA_8K_30, [20, 60, 100, 140, 180]],
  ...LOCAL_SAMPLES.map((local) => [local.slug, local, local.imuRankingTimes] as const),
] as const;

/**
 * In lock mode the world must stand still, so the IMU frame whose orientation keeps consecutive
 * renders most alike is the frame the camera really has. This is the measurement ADR 0009 rests
 * on, and how a new camera's frame is found: add its recording here (or to the local catalogue)
 * and run `pnpm measure`.
 */
describe('IMU frame ranking by world stillness under lock stabilization', () => {
  const cleanups: (() => void)[] = [];

  afterEach(() => {
    for (const cleanup of cleanups.splice(0).toReversed()) cleanup();
  });

  for (const [slug, sample, times] of RANKED_SAMPLES) {
    it(`ranks the camera's measured frame first on the ${sample.name}`, async (context) => {
      const opened = await openSample(context, sample);
      cleanups.push(() => {
        opened.dispose();
      });
      const { recording } = opened;
      const [gyro, clock] = await Promise.all([
        recording.readGyroRecord(),
        recording.captureClock(),
      ]);
      if (!gyro || !clock) throw new Error(`${sample.name} lacks a gyro record or a clock`);
      const { canvas, renderer, dispose } = equirectangularRendering(opened, RANKING_SIZE);
      cleanups.push(dispose);
      const candidates = allImuFrames().map((frame) => ({
        frame,
        orientations: OrientationTrack.integrate({ gyro: gyro.track, clock, frame }),
        total: 0,
      }));
      const measured = await measureStillness({ opened, canvas, renderer, candidates, times });
      await saveMeasurement(`${slug}-imu-frame-ranking`, measured);
      // A camera whose frame is still assumed has nothing to hold the ranking to: the saved
      // ranking says what to measure it as.
      const configured = imuFrameFor(recording.info);
      if (configured.isVerified) expect(measured.ranking[0]?.name).toBe(nameOf(configured));
      expect(measured.ranking[0]?.stillness).toBeLessThan(measured.unstabilized);
    });
  }
});
