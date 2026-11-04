import { readPixels } from '@gyroview/adapter-three/testing';
import type { DisplayConversion } from '@gyroview/core';
import { afterEach, describe, expect, it } from 'vitest';

import { saveMeasurement } from '../browser/artifacts';
import { openSample } from '../browser/realRecordingSupport';
import { equirectangularRendering } from '../browser/rendering';
import { isServed } from '../browser/sampleUrls';
import { closeMoment, decodeMoment } from '../browser/SharedSample';
import { colourStatisticsOf } from './support/colourStatistics';
import {
  loadRawRgb,
  recordingTimeOf,
  REFERENCE_PANORAMA_SIZE,
  STUDIO_CLIPS,
} from './support/referenceFrames';

/**
 * How far the player's mean red, green and blue, its saturation and its luma percentiles may lie
 * from Studio's, in levels of 255: a little above what ADR 0033 and ADR 0047 measured, so a
 * change to the conversion that moves the picture off Studio's fails here. A wrong matrix barely
 * moves these statistics of a whole scene; `decodedFrameUpload.test.ts` and the three adapter's
 * upload tests guard the matrix.
 */
const MEAN_TOLERANCE_LEVELS = 5;
const SATURATION_TOLERANCE_LEVELS = 2.5;
/**
 * The luma's, by the conversion: I-Log's curve is steeper than HLG's through the middle tones, so
 * the player's own stitch, a level or two brighter than Studio's, moves it further.
 */
const LUMA_TOLERANCE_LEVELS: Readonly<Record<DisplayConversion['kind'], number>> = {
  'as-recorded': 4,
  'hlg-to-sdr-bt709': 4,
  'log-to-sdr-bt709': 4.5,
};

function expectWithin(
  player: readonly number[],
  studio: readonly number[],
  tolerance: number,
): void {
  for (const [index, value] of player.entries()) {
    expect(Math.abs(value - (studio[index] ?? NaN))).toBeLessThan(tolerance);
  }
}

const CLIPS = STUDIO_CLIPS.filter((clip) => clip.sdrFrames.length > 0);

/**
 * The player's colour of an HDR or log recording against Insta360 Studio's SDR export of the
 * same stitch (ADR 0033, ADR 0047): the whole sphere's statistics, weighted by area, which no
 * turn between the two panoramas changes.
 */
describe.skipIf(CLIPS.length === 0)("the player's colour against Studio's SDR export", () => {
  const cleanups: (() => void)[] = [];

  afterEach(() => {
    for (const cleanup of cleanups.splice(0).toReversed()) cleanup();
  });

  for (const clip of CLIPS) {
    for (const frame of clip.sdrFrames) {
      it(`measures the ${clip.sample.name}'s colour at ${frame.time} s against Studio's`, async (context) => {
        if (!(await isServed(frame.url))) context.skip(`no SDR Studio frame at ${frame.time} s`);
        const opened = await openSample(context, clip.sample);
        cleanups.push(() => {
          opened.dispose();
        });
        const moment = await decodeMoment(opened, recordingTimeOf(clip, frame));
        cleanups.push(() => {
          closeMoment(moment);
        });
        const { canvas, renderer, dispose } = equirectangularRendering(
          opened,
          REFERENCE_PANORAMA_SIZE,
        );
        cleanups.push(dispose);
        renderer.present({ pair: moment.first, mediaTime: moment.first.timestamp });
        const player = colourStatisticsOf(readPixels(canvas), REFERENCE_PANORAMA_SIZE);
        const studio = colourStatisticsOf(await loadRawRgb(frame.url), REFERENCE_PANORAMA_SIZE);
        await saveMeasurement(`${clip.slug}-${frame.time}s-colour`, { player, studio });
        expectWithin(player.meanRgb, studio.meanRgb, MEAN_TOLERANCE_LEVELS);
        expectWithin([player.saturation], [studio.saturation], SATURATION_TOLERANCE_LEVELS);
        const [conversion] = opened.displayConversions;
        const lumaTolerance = LUMA_TOLERANCE_LEVELS[conversion?.kind ?? 'as-recorded'];
        expectWithin(player.lumaPercentiles, studio.lumaPercentiles, lumaTolerance);
      });
    }
  }
});
