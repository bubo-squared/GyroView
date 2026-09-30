import { afterEach, describe, expect, it } from 'vitest';

import { saveRender } from '../browser/artifacts';
import { openSample } from '../browser/realRecordingSupport';
import { closeMoment, decodeMoment } from '../browser/SharedSample';
import { OFFICE_5K7_60, SAILING_8K_30 } from '../browser/sampleUrls';
import { labRenderingOfSetup } from './support/labRendering';
import { readingsOf, setupOf } from './support/lensReadings';

const PANORAMA_SIZE = { width: 1536, height: 768 };
/**
 * The moment every reading is drawn at, the same as the player's renders: a fixed pose and no
 * alignment, so that two runs draw the same pixels and a change to a lens model shows as a
 * difference between them.
 */
const MOMENT = 100;

/**
 * Every reading of the calibration strings at its own scale, drawn as a panorama: the Mei and
 * polynomial models the player falls back to never reach its renders on an X5, whose legacy
 * string comes first (ADR 0023), so these are what a change to them is compared against.
 */
for (const [slug, sample] of [
  ['office', OFFICE_5K7_60],
  ['sailing', SAILING_8K_30],
] as const) {
  describe(`each calibration reading of the ${sample.name}`, () => {
    const cleanups: (() => void)[] = [];

    afterEach(() => {
      for (const cleanup of cleanups.splice(0).toReversed()) cleanup();
    });

    it(`draws every reading at ${MOMENT} s`, async (context) => {
      const opened = await openSample(context, sample);
      cleanups.push(() => {
        opened.dispose();
      });
      const moment = await decodeMoment(opened, MOMENT);
      cleanups.push(() => {
        closeMoment(moment);
      });
      const readings = readingsOf(opened);
      for (const reading of readings) {
        const { canvas, renderer, dispose } = labRenderingOfSetup(
          setupOf(reading, opened.layout),
          PANORAMA_SIZE,
        );
        cleanups.push(dispose);
        renderer.present({ pair: moment.first, mediaTime: moment.first.timestamp });
        await saveRender(`${slug}-${MOMENT}s-reading-${reading.name}`, canvas);
      }
      expect(readings.map((reading) => reading.name)).toContain('mei');
    });
  });
}
