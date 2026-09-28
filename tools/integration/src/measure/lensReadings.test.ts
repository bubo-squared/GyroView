import { multiplyMatrices, stabilizerFor, type PoseDelta } from '@gyroview/core';
import { afterEach, describe, expect, it } from 'vitest';

import { saveMeasurement } from '../browser/artifacts';
import { blockFieldOf } from '../browser/blockField';
import { readingsOf, setupOf, verticalStretchOf, withRadialScale } from '../browser/lensReadings';
import { openSample } from '../browser/realRecordingSupport';
import { alignToReference, renderUnder, rotationOf } from '../browser/referenceAlignment';
import { radialScaleErrorOf } from '../browser/radialFit';
import { loadGreyImage, recordingTimeOf, STUDIO_SAILING_FRAMES } from '../browser/referenceFrames';
import { equirectangularRenderingOf, motionOf } from '../browser/rendering';
import { isServed, SAILING_8K_30 } from '../browser/sampleUrls';
import { closeMoment, decodeMoment } from '../browser/SharedSample';

const PANORAMA_SIZE = { width: 1536, height: 768 };
/**
 * The radial scales tried on each reading: from four percent smaller to six larger, which
 * spans the 5312 window's 0.988, the whole square's 1, and omnikit's 95-degree reading of
 * the legacy radius, 1.053.
 */
const RADIAL_SCALES = [1, 1.02, 1.04, 1.053];
/**
 * Twenty-one candidates, each aligned and block-matched, take a few minutes per frame.
 */
const FRAME_TIMEOUT_MS = 900_000;

/**
 * Which reading of the calibration, at which radial scale, draws the far field where Insta360
 * Studio draws it. Every candidate is aligned to the reference on its own; the far-field cost
 * and the block field's vertical stretch decide.
 */
describe('lens readings against the Studio export', () => {
  const cleanups: (() => void)[] = [];

  afterEach(() => {
    for (const cleanup of cleanups.splice(0).toReversed()) cleanup();
  });

  for (const frame of STUDIO_SAILING_FRAMES) {
    it(
      `scores every reading and radial scale on the Studio frame at ${frame.time} s`,
      async (context) => {
        if (!(await isServed(frame.url))) context.skip(`no Studio frame at ${frame.time} s`);
        const reference = await loadGreyImage(frame.url);
        const opened = await openSample(context, SAILING_8K_30);
        cleanups.push(() => {
          opened.dispose();
        });
        const { orientations } = motionOf(opened);
        const moment = await decodeMoment(opened, recordingTimeOf(frame));
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
            viewToBody,
            field,
          });
        }
        await saveMeasurement(`sailing-${frame.time}s-lens-readings`, {
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
