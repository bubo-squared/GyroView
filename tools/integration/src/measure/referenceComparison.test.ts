import { stabilizerFor } from '@gyroview/core';
import { afterEach, describe, expect, it } from 'vitest';

import { saveMeasurement, saveRender } from '../browser/artifacts';
import { blockFieldOf, BLOCK_SIZE } from '../browser/blockField';
import { openSample } from '../browser/realRecordingSupport';
import { alignToReference, renderUnder } from '../browser/referenceAlignment';
import {
  loadGreyImage,
  recordingTimeOf,
  STUDIO_SAILING,
  type GreyImage,
} from '../browser/referenceFrames';
import { equirectangularRendering, motionOf } from '../browser/rendering';
import { isServed, SAILING_8K_30 } from '../browser/sampleUrls';
import { closeMoment, decodeMoment } from '../browser/SharedSample';

const PANORAMA_SIZE = { width: 1536, height: 768 };
const COMPARED_TIMES = new Set([55, 100, 175]);
const COMPARED_FRAMES = STUDIO_SAILING.frames.filter((frame) => COMPARED_TIMES.has(frame.time));
const DIFFERENCE_GAIN = 3;
const CHANNEL_MAX = 255;

function sheetOf(reference: GreyImage, aligned: GreyImage): HTMLCanvasElement {
  const { width, height } = reference;
  const sheet = document.createElement('canvas');
  sheet.width = width;
  sheet.height = 3 * height;
  const context = sheet.getContext('2d');
  if (!context) throw new Error('no 2d context');
  const draw = (grey: (index: number) => number, top: number): void => {
    const image = new ImageData(width, height);
    for (let index = 0; index < width * height; index += 1) {
      const level = grey(index);
      image.data.set([level, level, level, CHANNEL_MAX], index * 4);
    }
    context.putImageData(image, 0, top);
  };
  draw((index) => reference.data[index] ?? 0, 0);
  draw((index) => aligned.data[index] ?? 0, height);
  draw(
    (index) =>
      Math.min(
        CHANNEL_MAX,
        DIFFERENCE_GAIN * Math.abs((reference.data[index] ?? 0) - (aligned.data[index] ?? 0)),
      ),
    2 * height,
  );
  return sheet;
}

/**
 * GyroView against Insta360 Studio's stitch of the same frames: the panorama turned to match
 * the reference on the far field, then every block's remaining shift. Where the shifts follow
 * the seams, GyroView's lens geometry differs from Insta360's; where they follow the boat, the
 * two stitches treat parallax differently.
 */
describe('GyroView against the Studio export of the sailing recording', () => {
  const cleanups: (() => void)[] = [];

  afterEach(() => {
    for (const cleanup of cleanups.splice(0).toReversed()) cleanup();
  });

  for (const frame of COMPARED_FRAMES) {
    it(`aligns to the Studio frame at ${frame.time} s and measures what remains`, async (context) => {
      if (!(await isServed(frame.url))) context.skip(`no Studio frame at ${frame.time} s`);
      const reference = await loadGreyImage(frame.url);
      const opened = await openSample(context, SAILING_8K_30);
      cleanups.push(() => {
        opened.dispose();
      });
      const { canvas, renderer, dispose } = equirectangularRendering(opened, PANORAMA_SIZE);
      cleanups.push(dispose);
      const moment = await decodeMoment(opened, recordingTimeOf(STUDIO_SAILING, frame));
      cleanups.push(() => {
        closeMoment(moment);
      });
      const { orientations } = motionOf(opened);
      const pair = moment.first;
      const lock = stabilizerFor('lock').nextRotation(
        orientations.orientationAt(pair.timestamp),
        pair.timestamp,
      );
      const renderable = { renderer, canvas, pair, lock };
      const alignment = alignToReference(reference, renderable);
      const aligned = renderUnder(renderable, alignment.rotation);
      const field = blockFieldOf(reference, aligned);
      await saveRender(`sailing-${frame.time}s-reference-sheet`, sheetOf(reference, aligned));
      await saveMeasurement(`sailing-${frame.time}s-reference-alignment`, {
        ...alignment,
        blockSize: BLOCK_SIZE,
        size: PANORAMA_SIZE,
        field,
      });
      expect(alignment.cost).toBeLessThan(alignment.initialCost);
    });
  }
});
