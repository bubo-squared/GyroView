import {
  rollingShutterFor,
  rotationIntoBody,
  rowCorrectionsAt,
  seconds,
  stabilizerFor,
  type FramePair,
  type Matrix3,
  type RollingShutter,
} from '@gyroview/core';
import { afterEach, describe, expect, it } from 'vitest';

import { saveMeasurement } from '../browser/artifacts';
import { LOCAL_SAMPLES } from '../browser/localSamples';
import { openSample } from '../browser/realRecordingSupport';
import { equirectangularRendering } from '../browser/rendering';
import { closeMoment, decodeMoment } from '../browser/SharedSample';
import { worldMovement } from '../browser/worldMovement';

/**
 * Larger panoramas than the IMU frame ranking renders: a row's correction moves its picture by a
 * degree or so, a few pixels at this size.
 */
const RANKING_SIZE = { width: 1536, height: 768 };
/**
 * The readouts tried besides the camera's stated one, as fractions of it: whether the stated
 * readout is about right, not only its row order.
 */
const READOUT_SCALES = [0.5, 1, 1.5];

interface Candidate {
  readonly name: string;
  readonly shutter: RollingShutter | undefined;
  total: number;
}

function candidatesFor(readout: number): Candidate[] {
  const corrected = (['top-first', 'bottom-first'] as const).flatMap((rowOrder) =>
    READOUT_SCALES.map((scale) => ({
      name: `${rowOrder} x${scale}`,
      shutter: { readout: seconds(readout * scale), rowOrder },
      total: 0,
    })),
  );
  return [{ name: 'uncorrected', shutter: undefined, total: 0 }, ...corrected];
}

/**
 * Under lock with the camera's true orientation the world stands still but for what the sensor's
 * rows were read at other times: the rolling shutter whose row corrections keep consecutive
 * renders most alike is the camera's. Ranked at the moments its IMU frame is, in a camera that
 * turns. This is how a camera's row order is measured (ADR 0046): add its recording to the local
 * catalogue and run `pnpm measure`.
 */
describe('rolling shutter ranking by world stillness under lock stabilization', () => {
  const cleanups: (() => void)[] = [];

  afterEach(() => {
    for (const cleanup of cleanups.splice(0).toReversed()) cleanup();
  });

  const turning = LOCAL_SAMPLES.filter((local) => local.imuRankingTimes.length > 0);
  for (const sample of turning) {
    it(`ranks the rolling shutter of the ${sample.name}`, async (context) => {
      const opened = await openSample(context, sample);
      cleanups.push(() => {
        opened.dispose();
      });
      const { motion, frameTimes, recording } = opened;
      const readout = recording.info.readoutTime;
      if (!motion || readout === undefined) {
        context.skip(`${sample.name} states no readout or has no motion to correct by`);
        return;
      }
      const { canvas, renderer, dispose } = equirectangularRendering(opened, RANKING_SIZE);
      cleanups.push(dispose);
      const lock = stabilizerFor('lock');
      const timeOf = (pair: FramePair<VideoFrame>): number =>
        frameTimes?.midExposureAt(pair.timestamp) ?? pair.timestamp;
      const rotationFor = (pair: FramePair<VideoFrame>): Matrix3 => {
        const time = seconds(timeOf(pair));
        return rotationIntoBody(
          motion.mounting,
          lock.nextRotation(motion.orientations.orientationAt(time), time),
        );
      };
      const candidates = candidatesFor(readout);
      for (const time of sample.imuRankingTimes) {
        const moment = await decodeMoment(opened, time);
        // Consecutive frames: half a second apart, the scene itself moves far more than a row's
        // correction does.
        const pairs = { canvas, renderer, first: moment.first, later: moment.second };
        for (const candidate of candidates) {
          const { shutter } = candidate;
          const rowCorrectionsFor = (pair: FramePair<VideoFrame>): Matrix3[] | undefined =>
            shutter ? rowCorrectionsAt(motion, seconds(timeOf(pair)), shutter) : undefined;
          candidate.total += worldMovement({ ...pairs, rowCorrectionsFor }, rotationFor);
        }
        closeMoment(moment);
      }
      const ranking = candidates
        .map(({ name, total }) => ({ name, stillness: total / sample.imuRankingTimes.length }))
        .toSorted((left, right) => left.stillness - right.stillness);
      await saveMeasurement(`${sample.slug}-rolling-shutter-ranking`, { readout, ranking });
      // A camera whose row order is measured keeps it: its stated readout, in that order, stills
      // the world more than turning every row with the frame or reading the rows the other way.
      const measured = rollingShutterFor(recording.info);
      if (!measured) return;
      const stillnessOf = (name: string): number =>
        ranking.find((ranked) => ranked.name === name)?.stillness ?? Infinity;
      const opposite = measured.rowOrder === 'top-first' ? 'bottom-first' : 'top-first';
      expect(stillnessOf(`${measured.rowOrder} x1`)).toBeLessThan(stillnessOf('uncorrected'));
      expect(stillnessOf(`${measured.rowOrder} x1`)).toBeLessThan(stillnessOf(`${opposite} x1`));
    });
  }
});
