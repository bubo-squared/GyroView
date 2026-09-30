import { readPixels } from '@gyroview/adapter-three/testing';
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
 * How far the player's mean red, green and blue, and its median luma, may lie from Studio's, in
 * levels of 255: a little above what ADR 0033 measured, so a change to the conversion that moves
 * the picture off Studio's fails here.
 */
const MEAN_TOLERANCE_LEVELS = 5;
const MEDIAN_LUMA_TOLERANCE_LEVELS = 4;
const MEDIAN = 1;

const CLIPS = STUDIO_CLIPS.filter((clip) => clip.sdrFrames.length > 0);

/**
 * The player's colour of an HDR recording against Insta360 Studio's SDR export of the same
 * stitch (ADR 0033): the whole sphere's statistics, weighted by area, which no turn between the
 * two panoramas changes.
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
        for (const [channel, mean] of player.meanRgb.entries()) {
          expect(Math.abs(mean - (studio.meanRgb[channel] ?? NaN))).toBeLessThan(
            MEAN_TOLERANCE_LEVELS,
          );
        }
        const medians = [player, studio].map((side) => side.lumaPercentiles[MEDIAN] ?? NaN);
        expect(Math.abs((medians[0] ?? NaN) - (medians[1] ?? NaN))).toBeLessThan(
          MEDIAN_LUMA_TOLERANCE_LEVELS,
        );
      });
    }
  }
});
