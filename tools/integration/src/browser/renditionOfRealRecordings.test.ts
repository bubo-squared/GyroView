import { openRendition } from '@gyroview/player';
import { describe, expect, it } from 'vitest';

import { saveMeasurement, saveRender } from './artifacts';
import { LOCAL_SAMPLES } from './localSamples';
import { isServed } from './sampleUrls';

/**
 * The size an encoder of 360 video is commonly given: 4K equirectangular, which every H.264
 * level 5.1 decoder plays.
 */
const WIDTH = 3840;
/**
 * Seconds rendered from each recording's render moment: long enough for a rate, short enough
 * for every run.
 */
const SPAN_SECONDS = 2;
/**
 * A frame's timestamp may round to the microsecond either side of the grid.
 */
const FRAME_COUNT_TOLERANCE = 1;
const TIMEOUT_MS = 120_000;
const MILLISECONDS_PER_SECOND = 1000;

/**
 * The frame drawn onto a canvas element, which the artifact command saves.
 */
function canvasOf(frame: VideoFrame): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = frame.displayWidth;
  canvas.height = frame.displayHeight;
  canvas.getContext('2d')?.drawImage(frame, 0, 0);
  return canvas;
}

describe.skipIf(LOCAL_SAMPLES.length === 0)('rendering the local recordings frame by frame', () => {
  for (const local of LOCAL_SAMPLES) {
    it(
      `renders every frame of two seconds of the ${local.name} at 4K, in order`,
      async (context) => {
        if (!(await isServed(local.url))) context.skip(`${local.name} is not available locally`);
        const from = local.renderMoment;
        const rendition = await openRendition(
          { main: { url: local.url } },
          { width: WIDTH, from, to: from + SPAN_SECONDS, stabilization: 'horizon' },
        );
        const timestamps: number[] = [];
        const started = performance.now();
        for await (const frame of rendition.frames()) {
          if (timestamps.length === 0)
            await saveRender(`${local.slug}-rendition-${from}s`, canvasOf(frame));
          timestamps.push(frame.timestamp);
          frame.close();
        }
        const elapsed = (performance.now() - started) / MILLISECONDS_PER_SECOND;
        rendition.dispose();
        await saveMeasurement(`${local.slug}-rendition-rate`, {
          frames: timestamps.length,
          seconds: elapsed,
          framesPerSecond: timestamps.length / elapsed,
        });
        expect(Math.abs(timestamps.length - SPAN_SECONDS * local.frameRate)).toBeLessThanOrEqual(
          FRAME_COUNT_TOLERANCE,
        );
        expect(timestamps).toEqual(timestamps.toSorted((a, b) => a - b));
        expect(new Set(timestamps).size).toBe(timestamps.length);
      },
      TIMEOUT_MS,
    );
  }
});
