import { multiplyMatrices, stabilizerFor, type PoseDelta } from '@gyroview/core';
import { afterEach, describe, expect, it } from 'vitest';

import { saveMeasurement } from '../browser/artifacts';
import { blockFieldOf } from '../browser/blockField';
import { readingsOf, setupOf, verticalStretchOf, withRadialScale } from '../browser/lensReadings';
import { openSample } from '../browser/realRecordingSupport';
import { alignToReference, renderUnder, rotationOf } from '../browser/referenceAlignment';
import { radialScaleErrorOf } from '../browser/radialFit';
import { loadGreyImage, recordingTimeOf, STUDIO_CLIPS } from '../browser/referenceFrames';
import { equirectangularRenderingOf, motionOf } from '../browser/rendering';
import { isServed } from '../browser/sampleUrls';
import { matchedGains, measuredDisparity, type MeasuredDisparity } from '../browser/seamJoins';
import { closeMoment, decodeMoment } from '../browser/SharedSample';

const PANORAMA_SIZE = { width: 1536, height: 768 };
const COMPARED_TIMES = new Set([55, 100, 175]);
/**
 * The radial scales tried on each reading, against the reading as the core reads it: from two
 * percent smaller to five larger, which spans the legacy radius at 98 degrees (0.98) and at
 * omnikit's 95 degrees (1.01), and the Mei model's best on the X5 units (1.02 to 1.04).
 */
const RADIAL_SCALES = [0.98, 0.99, 1, 1.02, 1.04, 1.053];
/**
 * Twenty-one candidates, each aligned and block-matched, take a few minutes per frame.
 */
const FRAME_TIMEOUT_MS = 900_000;

function trustedDisparities(seam: MeasuredDisparity): number[] {
  return seam.bins.filter((bin) => bin.isTrusted).map((bin) => bin.disparity);
}

function quartilesOf(values: readonly number[]): { lower: number; median: number; upper: number } {
  const sorted = values.toSorted((a, b) => a - b);
  const at = (share: number): number => sorted[Math.floor(share * (sorted.length - 1))] ?? NaN;
  return { lower: at(0.25), median: at(0.5), upper: at(0.75) };
}

/**
 * Which reading of the calibration, at which radial scale, draws the far field where Insta360
 * Studio draws it. Every candidate is aligned to the reference on its own; the far-field cost
 * and the block field's vertical stretch decide. And how far apart the reading draws the two
 * lenses' images at the seam: parallax only ever moves them apart, so the disparity of the far
 * bins, the lower quartile, is the reading's own error there.
 */
for (const clip of STUDIO_CLIPS) {
  describe(`lens readings against the Studio export of ${clip.sample.name}`, () => {
    const cleanups: (() => void)[] = [];

    afterEach(() => {
      for (const cleanup of cleanups.splice(0).toReversed()) cleanup();
    });

    const compared = clip.frames.filter((frame) => COMPARED_TIMES.has(frame.time));
    for (const frame of compared) {
      it(
        `scores every reading and radial scale on the Studio frame at ${frame.time} s`,
        async (context) => {
          if (!(await isServed(frame.url))) context.skip(`no Studio frame at ${frame.time} s`);
          const reference = await loadGreyImage(frame.url);
          const opened = await openSample(context, clip.sample);
          cleanups.push(() => {
            opened.dispose();
          });
          const { orientations } = motionOf(opened);
          const moment = await decodeMoment(opened, recordingTimeOf(clip, frame));
          cleanups.push(() => {
            closeMoment(moment);
          });
          const pair = moment.first;
          const lock = stabilizerFor('lock').nextRotation(
            orientations.orientationAt(pair.timestamp),
            pair.timestamp,
          );
          const candidates = readingsOf(opened).flatMap((reading) =>
            reading.name === 'polynomial'
              ? [reading]
              : RADIAL_SCALES.map((scale) => withRadialScale(reading, scale)),
          );
          const scores = [];
          let from: PoseDelta | undefined;
          for (const candidate of candidates) {
            const { canvas, renderer, dispose } = equirectangularRenderingOf(
              setupOf(candidate, opened.layout),
              PANORAMA_SIZE,
            );
            const renderable = { renderer, canvas, pair, lock };
            const alignment = alignToReference(reference, renderable, from);
            from ??= alignment.rotation;
            const field = blockFieldOf(reference, renderUnder(renderable, alignment.rotation));
            const viewToBody = multiplyMatrices(lock, rotationOf(alignment.rotation));
            const radial = radialScaleErrorOf(field, PANORAMA_SIZE, viewToBody);
            const seam = await measuredDisparity(renderer, await matchedGains(renderer));
            dispose();
            scores.push({
              reading: candidate.name,
              radialScale: candidate.radialScale,
              cost: alignment.cost,
              rotation: alignment.rotation,
              stretch: verticalStretchOf(field, PANORAMA_SIZE.height),
              epsilon: radial.epsilon,
              radialBlocks: radial.blocksUsed,
              impliedScale: candidate.radialScale * (1 + radial.epsilon),
              seamDisparity: quartilesOf(trustedDisparities(seam)),
              viewToBody,
              field,
            });
          }
          await saveMeasurement(`${clip.slug}-${frame.time}s-lens-readings`, {
            scales: RADIAL_SCALES,
            scores,
          });
          expect(scores).toHaveLength(candidates.length);
          expect(scores.every((score) => Number.isFinite(score.cost))).toBe(true);
        },
        FRAME_TIMEOUT_MS,
      );
    }
  });
}
