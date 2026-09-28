import { buildStitchingSetup, degrees, type StripShift } from '@gyroview/core';
import { afterEach, describe, expect, it } from 'vitest';

import { saveMeasurement, saveRender } from '../browser/artifacts';
import { closeAll, openSample } from '../browser/realRecordingSupport';
import { calibrationOf, equirectangularRendering } from '../browser/rendering';
import { OFFICE_5K7_60, SAILING_8K_30 } from '../browser/sampleUrls';
import { gainsOf, REFINED_LENS, showPair, type SeamAgreementParts } from '../browser/seamAgreement';
import { decodeMoment } from '../browser/SharedSample';
import { stripImagesOf, stripSheetOf } from '../browser/stripImage';

const PANORAMA_SIZE = { width: 1536, height: 768 };
const MOMENT = 100;
const SWEEP_EXTENT = 2;
const SWEEP_STEP = 0.1;

function sweep(axis: 'along' | 'across'): StripShift[] {
  const count = Math.round((2 * SWEEP_EXTENT) / SWEEP_STEP) + 1;
  return Array.from({ length: count }, (_unused, index) => {
    const value = degrees(-SWEEP_EXTENT + index * SWEEP_STEP);
    return axis === 'along'
      ? { along: value, across: degrees(0) }
      : { along: degrees(0), across: value };
  });
}

/**
 * What the meter compares, drawn: the strip from each lens through the core's models on the
 * CPU, and every bin's cost as the back lens's sampling slides along and across the ring.
 */
describe('seam strip diagnostics', () => {
  const cleanups: (() => void)[] = [];

  afterEach(() => {
    for (const cleanup of cleanups.splice(0).toReversed()) cleanup();
  });

  for (const [slug, sample] of [
    ['office', OFFICE_5K7_60],
    ['sailing', SAILING_8K_30],
  ] as const) {
    it(`draws the seam strip of the ${sample.name} and each bin's cost curves`, async (context) => {
      const opened = await openSample(context, sample);
      cleanups.push(() => {
        opened.dispose();
      });
      const calibration = calibrationOf(opened);
      const setup = buildStitchingSetup({ calibration, layout: opened.layout });
      const { renderer, dispose } = equirectangularRendering(opened, PANORAMA_SIZE);
      cleanups.push(dispose);
      const factoryPose = setup.lenses[REFINED_LENS]?.rotation;
      if (!factoryPose) throw new Error('no back lens');
      const meter = renderer.createSeamMismatchMeter();
      cleanups.push(() => {
        meter.dispose();
      });
      const parts: SeamAgreementParts = { renderer, meter, factoryPose };
      const moment = await decodeMoment(opened, MOMENT);
      cleanups.push(() => {
        closeAll([moment.first, moment.later]);
      });

      const images = await stripImagesOf(setup, calibration, moment.first);
      await saveRender(`${slug}-${MOMENT}s-strip`, stripSheetOf(images));

      showPair(parts, moment.first);
      const gains = await gainsOf(renderer);
      const curves: Record<string, unknown> = { gains };
      for (const axis of ['along', 'across'] as const) {
        const shifts = sweep(axis);
        const measured = await meter.measure({
          lensIndex: REFINED_LENS,
          candidates: { kind: 'shifts', shifts },
          gains,
        });
        if (!measured) throw new Error('the strip was not measured');
        curves[axis] = {
          shifts: shifts.map((shift) => shift[axis]),
          costsByBin: Array.from({ length: measured[0]?.length ?? 0 }, (_unused, bin) =>
            measured.map((byBin) => byBin[bin]?.mismatch ?? NaN),
          ),
        };
      }
      await saveMeasurement(`${slug}-${MOMENT}s-strip-cost-curves`, curves);
      expect(images.width).toBeGreaterThan(0);
    });
  }
});
