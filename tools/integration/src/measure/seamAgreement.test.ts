import { readPixels } from '@gyroview/adapter-three/testing';
import { buildStitchingSetup, type Vector3 } from '@gyroview/core';
import { afterEach, describe, expect, it } from 'vitest';

import { saveMeasurement, saveRender } from '../browser/artifacts';
import { closeAll, openSample } from '../browser/realRecordingSupport';
import { calibrationOf, equirectangularRendering } from '../browser/rendering';
import { KRNJACA_8K_30, OFFICE_5K7_60, SAILING_8K_30 } from '../browser/sampleUrls';
import {
  factoryCostOf,
  measureMoment,
  REFINED_LENS,
  searchJointly,
  type MomentAgreement,
  type SeamAgreementParts,
  type SeamMoment,
} from '../browser/seamAgreement';
import { seamSheetOf } from '../browser/seamSheet';
import { decodeMoment } from '../browser/SharedSample';

const PANORAMA_SIZE = { width: 1536, height: 768 };
const UNIT_GAIN: Vector3 = [1, 1, 1];
const SILENCED: Vector3 = [0, 0, 0];
/**
 * How many of the moments the joint search is run over, to see how the estimate settles with
 * the number of frames; the run over all of them is the joint result.
 */
const CONVERGENCE_COUNTS = [1, 2, 4];

interface MeasuredMoment extends MomentAgreement {
  /**
   * The factory cost of the same moment's later pair: the cost's own noise between two frames
   * of the same scene a fraction of a second apart.
   */
  readonly laterFactoryCost: number | undefined;
}

/**
 * Lens-only renders of the frames on screen for the seam sheet, the gains restored after.
 */
function lensOnlyRenders(
  parts: SeamAgreementParts,
  canvas: HTMLCanvasElement,
): {
  lens0: Uint8ClampedArray;
  lens1: Uint8ClampedArray;
} {
  parts.renderer.setLensGains([UNIT_GAIN, SILENCED]);
  const lens0 = readPixels(canvas);
  parts.renderer.setLensGains([SILENCED, UNIT_GAIN]);
  const lens1 = readPixels(canvas);
  parts.renderer.setLensGains([UNIT_GAIN, UNIT_GAIN]);
  return { lens0, lens1 };
}

/**
 * How the two lenses agree along the seam strip at the factory pose, and how much better a
 * turned back lens agrees: the measurement the pose conventions and the refinement rest on.
 * Written to `.artifacts/` under `pnpm measure`.
 */
describe('seam agreement of the real recordings', () => {
  const cleanups: (() => void)[] = [];

  afterEach(() => {
    for (const cleanup of cleanups.splice(0).toReversed()) cleanup();
  });

  for (const [slug, sample, times] of [
    ['office', OFFICE_5K7_60, [3, 45, 100, 120, 210]],
    ['sailing', SAILING_8K_30, [20, 55, 85, 100, 135, 170]],
    ['krnjaca', KRNJACA_8K_30, [20, 60, 100, 140, 180]],
  ] as const) {
    it(`measures how the lenses of the ${sample.name} agree along the seam, and the back-lens pose that agrees best`, async (context) => {
      const opened = await openSample(context, sample);
      cleanups.push(() => {
        opened.dispose();
      });
      const { canvas, renderer, dispose } = equirectangularRendering(opened, PANORAMA_SIZE);
      cleanups.push(dispose);
      const setup = buildStitchingSetup({
        calibration: calibrationOf(opened),
        layout: opened.layout,
      });
      const factoryPose = setup.lenses[REFINED_LENS]?.rotation;
      if (!factoryPose) throw new Error(`${sample.name} has no lens ${REFINED_LENS}`);
      const meter = renderer.createSeamMismatchMeter();
      cleanups.push(() => {
        meter.dispose();
      });
      const parts: SeamAgreementParts = { renderer, meter, factoryPose };

      const moments: MeasuredMoment[] = [];
      const kept: SeamMoment[] = [];
      for (const time of times) {
        const moment = await decodeMoment(opened, time);
        cleanups.push(() => {
          closeAll([moment.first]);
        });
        const measured = await measureMoment(parts, { time, pair: moment.first });
        const laterFactoryCost = await factoryCostOf(parts, moment.later, measured.gains);
        closeAll([moment.second, moment.later]);
        moments.push({ ...measured, laterFactoryCost });
        kept.push({ time, pair: moment.first });
        parts.renderer.present({ pair: moment.first, mediaTime: moment.first.timestamp });
        const sheet = seamSheetOf({ ...lensOnlyRenders(parts, canvas), size: PANORAMA_SIZE });
        await saveRender(`${slug}-${time}s-seam-sheet`, sheet);
      }

      const gainsByMoment = moments.map((moment) => moment.gains);
      const counts = [...CONVERGENCE_COUNTS.filter((count) => count < kept.length), kept.length];
      const convergence = [];
      for (const count of counts) {
        const result = await searchJointly(
          parts,
          kept.slice(0, count),
          gainsByMoment.slice(0, count),
        );
        convergence.push({ frames: count, ...result });
      }
      const joint = convergence.at(-1);
      if (!joint) throw new Error('no moments were measured');
      await saveMeasurement(`${slug}-seam-agreement`, { moments, joint, convergence });

      for (const moment of moments) expect(moment.factoryCost).toBeDefined();
      expect(joint.bestCost).toBeLessThanOrEqual(joint.factoryCost);
    });
  }
});
