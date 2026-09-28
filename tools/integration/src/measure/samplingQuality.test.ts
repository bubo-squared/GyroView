import {
  PICTURE_QUALITIES,
  stabilizerFor,
  type FramePair,
  type PictureQuality,
} from '@gyroview/core';
import { afterEach, describe, expect, it } from 'vitest';

import { saveMeasurement, saveRender } from '../browser/artifacts';
import { openSample } from '../browser/realRecordingSupport';
import { greyCanvasOf } from '../browser/referenceFrames';
import { equirectangularRendering, motionOf } from '../browser/rendering';
import {
  measureSampling,
  renderLocked,
  sharpestRegionOf,
  type LockedPair,
  type SamplingMeasurement,
} from '../browser/samplingChecks';
import { OFFICE_5K7_60, SAILING_8K_30 } from '../browser/sampleUrls';
import { closeMoment, decodeMoment } from '../browser/SharedSample';

const PANORAMA_SIZE = { width: 1536, height: 768 };
const MOMENT = 100;
/**
 * The aliasing the balanced quality must remove, as a fraction of the fast quality's.
 */
const ALIASING_CEILING = 0.7;

/**
 * Each quality on a panorama the size of a laptop window, under lock: what moves between two
 * consecutive frames of a still picture, what a pixel misses of what it covers, and the cost.
 */
describe('sampling quality', () => {
  const cleanups: (() => void)[] = [];

  afterEach(() => {
    for (const cleanup of cleanups.splice(0).toReversed()) cleanup();
  });

  for (const [slug, sample] of [
    ['office', OFFICE_5K7_60],
    ['sailing', SAILING_8K_30],
  ] as const) {
    it(`measures flicker, aliasing and timing per quality on the ${sample.name}`, async (context) => {
      const opened = await openSample(context, sample);
      cleanups.push(() => {
        opened.dispose();
      });
      const { canvas, renderer, dispose } = equirectangularRendering(opened, PANORAMA_SIZE);
      cleanups.push(dispose);
      const moment = await decodeMoment(opened, MOMENT);
      cleanups.push(() => {
        closeMoment(moment);
      });
      const { orientations } = motionOf(opened);
      const lockedPairOf = (pair: FramePair<VideoFrame>): LockedPair => ({
        pair,
        lock: stabilizerFor('lock').nextRotation(
          orientations.orientationAt(pair.timestamp),
          pair.timestamp,
        ),
      });
      const pairs = [lockedPairOf(moment.first), lockedPairOf(moment.second)] as const;
      renderer.setQuality('fast');
      const region = sharpestRegionOf(renderLocked(renderer, canvas, pairs[0]));
      const parts = { renderer, canvas, size: PANORAMA_SIZE, pairs, region };
      const measurements: Partial<Record<PictureQuality, SamplingMeasurement>> = {};
      for (const quality of PICTURE_QUALITIES) {
        const { measurement, picture } = measureSampling(parts, quality);
        measurements[quality] = measurement;
        await saveRender(`${slug}-${MOMENT}s-sampling-${quality}`, greyCanvasOf(picture));
      }
      await saveMeasurement(`${slug}-${MOMENT}s-sampling`, {
        size: PANORAMA_SIZE,
        region,
        measurements,
      });
      const fast = measurements.fast;
      const balanced = measurements.balanced;
      if (!fast || !balanced) throw new Error('a quality went unmeasured');
      expect(balanced.aliasing).toBeLessThan(ALIASING_CEILING * fast.aliasing);
      expect(balanced.flicker).toBeLessThanOrEqual(fast.flicker);
    });
  }
});
