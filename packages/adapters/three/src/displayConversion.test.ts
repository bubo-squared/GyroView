import {
  AS_RECORDED,
  buildStitchingSetup,
  HLG_TO_SDR_BT709,
  seconds,
  toDisplay,
  type DecodedFrame,
  type DisplayConversionParameters,
  type Rgb,
  type ViewMode,
} from '@gyroview/core';
import { equirectangularPixelOf } from '@gyroview/core/testing';
import { afterEach, describe, expect, it } from 'vitest';

import { readPixels } from './test/readPixels';
import { solidFrame } from './test/syntheticFrames';
import { MULTI_TRACK, syntheticCalibration } from './test/syntheticStitching';
import { ThreeFrameRenderer } from './ThreeFrameRenderer';

const CHANNEL_MAX = 255;
const SIZE = { width: 128, height: 64 };
/**
 * Levels of 255 the shader may differ from the core's reference: the 8-bit texel and the 8-bit
 * canvas each round once, and the GPU's exp and pow are not the CPU's.
 */
const TOLERANCE_LEVELS = 2;

/**
 * Colours painted as the lens frames, each read back as its texels hold it.
 */
const PAINTED: readonly (readonly [name: string, css: string, texel: Rgb])[] = [
  ['a dark grey', 'rgb(40, 40, 40)', [40, 40, 40]],
  ['a mid grey', 'rgb(128, 128, 128)', [128, 128, 128]],
  ['a bright grey', 'rgb(230, 230, 230)', [230, 230, 230]],
  ['a saturated green', 'rgb(40, 200, 60)', [40, 200, 60]],
];

/**
 * The core's reference for a texel of 0-255 levels, in levels.
 */
function expected(conversion: DisplayConversionParameters, texel: Rgb): readonly number[] {
  const [red, green, blue] = texel.map((level) => level / CHANNEL_MAX);
  return toDisplay(conversion, [red ?? 0, green ?? 0, blue ?? 0]).map(
    (value) => value * CHANNEL_MAX,
  );
}

/**
 * The shader's display conversion against the core's `toDisplay`, on painted frames drawn as the
 * raw lenses and as the stitched panorama (ADR 0033): every pass that reads a lens's texels
 * brings them to the display the same way.
 */
describe('the display conversion', () => {
  const cleanups: (() => void)[] = [];

  afterEach(() => {
    for (const cleanup of cleanups.splice(0).toReversed()) cleanup();
  });

  function drawn(
    conversion: DisplayConversionParameters,
    css: string,
    viewMode: ViewMode,
  ): readonly number[] {
    const canvas = document.createElement('canvas');
    canvas.width = SIZE.width;
    canvas.height = SIZE.height;
    const setup = buildStitchingSetup({
      calibration: syntheticCalibration(),
      layout: MULTI_TRACK,
      displayConversions: [conversion, conversion],
    });
    const renderer = ThreeFrameRenderer.create(canvas, setup, { preserveDrawingBuffer: true });
    const frames: DecodedFrame<VideoFrame>[] = [solidFrame(css), solidFrame(css)];
    cleanups.push(() => {
      renderer.dispose();
      for (const frame of frames) frame.close();
    });
    renderer.setViewMode(viewMode);
    renderer.present({ pair: { timestamp: seconds(0), frames }, mediaTime: seconds(0) });
    const { column, row } = equirectangularPixelOf([0, 0, 1], SIZE);
    const pixels = readPixels(canvas);
    const offset = ((SIZE.height - 1 - row) * SIZE.width + column) * 4;
    return [pixels[offset] ?? -1, pixels[offset + 1] ?? -1, pixels[offset + 2] ?? -1];
  }

  for (const viewMode of ['raw-lenses', 'equirectangular'] as const) {
    it.each(PAINTED)(
      `converts %s from HLG as the core does, drawn ${viewMode}`,
      (_name, css, texel) => {
        const shown = drawn(HLG_TO_SDR_BT709.parameters, css, viewMode);
        const reference = expected(HLG_TO_SDR_BT709.parameters, texel);
        for (const [channel, value] of shown.entries()) {
          expect(Math.abs(value - (reference[channel] ?? NaN))).toBeLessThanOrEqual(
            TOLERANCE_LEVELS,
          );
        }
      },
    );
  }

  it('shows a lens as recorded pixel for pixel', () => {
    expect(drawn(AS_RECORDED.parameters, 'rgb(40, 200, 60)', 'raw-lenses')).toEqual([40, 200, 60]);
  });
});
