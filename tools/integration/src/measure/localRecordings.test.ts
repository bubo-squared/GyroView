import { readPixels } from '@gyroview/adapter-three/testing';
import { buildStitchingSetup, type Vector3 } from '@gyroview/core';
import { afterAll, describe, expect, it } from 'vitest';

import { drawAndSaveRender, saveMeasurement, saveRender } from '../browser/artifacts';
import { LOCAL_SAMPLES } from '../browser/localSamples';
import { coverageOf, measureCentre } from '../browser/pictureChecks';
import { calibrationOf, equirectangularRendering } from '../browser/rendering';
import { SharedSample } from '../browser/SharedSample';

const PANORAMA_SIZE = { width: 1536, height: 768 };
const MIN_COVERAGE = 0.97;
const UNITY_GAIN: Vector3 = [1, 1, 1];
const SILENCED: Vector3 = [0, 0, 0];

/**
 * The recordings only this machine has (ADR 0031), drawn and measured as the committed samples
 * are before a camera's decisions are made: its renders to look at, and where each lens's image
 * circle lies against the canvas window and the sensor window (ADR 0014), whose radius tells the
 * lens's field edge.
 */
for (const local of LOCAL_SAMPLES) {
  describe(`the local recording ${local.name}`, () => {
    const shared = new SharedSample(local.sample);

    afterAll(() => {
      shared.dispose();
    });

    it(`stitches the frame at ${local.renderMoment} s into a panorama without holes`, async (context) => {
      const opened = await shared.open(context);
      const { first } = await shared.momentAt(context, local.renderMoment);
      const { canvas, renderer, dispose } = equirectangularRendering(opened, PANORAMA_SIZE);
      try {
        renderer.present({ pair: first, mediaTime: first.timestamp });
        const prefix = `${local.slug}-${local.renderMoment}s`;
        await saveRender(`${prefix}-equirect`, canvas);
        expect(coverageOf(readPixels(canvas))).toBeGreaterThan(MIN_COVERAGE);
        await drawAndSaveRender(`${prefix}-lens0`, canvas, () => {
          renderer.setLensGains([UNITY_GAIN, SILENCED]);
        });
        await drawAndSaveRender(`${prefix}-lens1`, canvas, () => {
          renderer.setLensGains([SILENCED, UNITY_GAIN]);
        });
      } finally {
        dispose();
      }
    });

    it(`finds each lens's image circle at ${local.renderMoment} s`, async (context) => {
      const opened = await shared.open(context);
      const { first } = await shared.momentAt(context, local.renderMoment);
      const setup = buildStitchingSetup({
        calibration: calibrationOf(opened),
        layout: opened.layout,
      });
      const measurements = setup.lenses.map((lens) => measureCentre(opened, lens, first));
      await saveMeasurement(`${local.slug}-${local.renderMoment}s-image-circle`, measurements);
      expect(measurements).toHaveLength(setup.lenses.length);
    });
  });
}
