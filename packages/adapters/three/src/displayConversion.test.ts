import {
  buildStitchingSetup,
  seconds,
  type DecodedFrame,
  type DisplayConversion,
  type Vector3,
  type ViewMode,
} from '@gyroview/core';
import {
  AS_RECORDED,
  equirectangularPixelOf,
  exposureSignalOf,
  HLG_TO_SDR_BT709,
  shownOf,
  toDisplay,
} from '@gyroview/core/testing';
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
 * The seam meter's means, from 0 to 1, may differ from the core's by as much: its target holds 8
 * bits too.
 */
const METER_TOLERANCE = TOLERANCE_LEVELS / CHANNEL_MAX;

/**
 * Colours painted as the lens frames, each read back as its texels hold it.
 */
const PAINTED: readonly (readonly [name: string, css: string, texel: Vector3])[] = [
  ['a dark grey', 'rgb(40, 40, 40)', [40, 40, 40]],
  ['a mid grey', 'rgb(128, 128, 128)', [128, 128, 128]],
  ['a bright grey', 'rgb(230, 230, 230)', [230, 230, 230]],
  ['a saturated green', 'rgb(40, 200, 60)', [40, 200, 60]],
];

function unitTexel(texel: Vector3): Vector3 {
  const [red, green, blue] = texel;
  return [red / CHANNEL_MAX, green / CHANNEL_MAX, blue / CHANNEL_MAX];
}

function inLevels(colour: Vector3): readonly number[] {
  return colour.map((value) => value * CHANNEL_MAX);
}

function expectWithin(shown: readonly number[], reference: readonly number[]): void {
  for (const [channel, value] of shown.entries()) {
    expect(Math.abs(value - (reference[channel] ?? NaN))).toBeLessThanOrEqual(TOLERANCE_LEVELS);
  }
}

/**
 * The shader's display conversion against the core's, on painted frames drawn as the raw lenses
 * and as the stitched panorama, gained and metered (ADR 0033): every pass that reads a lens's
 * texels brings them to the display, or to its exposure signal, the same way.
 */
describe('the display conversion', () => {
  const cleanups: (() => void)[] = [];

  afterEach(() => {
    for (const cleanup of cleanups.splice(0).toReversed()) cleanup();
  });

  /**
   * Both lenses painted `css` and shown through `conversion`, gained by `gain`, drawn once.
   */
  interface Drawing {
    readonly conversion: DisplayConversion;
    readonly css: string;
    readonly viewMode: ViewMode;
    readonly gain?: Vector3;
  }

  function rendererOf(drawing: Drawing): {
    readonly renderer: ThreeFrameRenderer;
    readonly canvas: HTMLCanvasElement;
  } {
    const canvas = document.createElement('canvas');
    canvas.width = SIZE.width;
    canvas.height = SIZE.height;
    const setup = buildStitchingSetup({
      calibration: syntheticCalibration(),
      layout: MULTI_TRACK,
      displayConversions: [drawing.conversion, drawing.conversion],
    });
    const renderer = ThreeFrameRenderer.create(canvas, setup, { preserveDrawingBuffer: true });
    const frames: DecodedFrame<VideoFrame>[] = [solidFrame(drawing.css), solidFrame(drawing.css)];
    cleanups.push(() => {
      renderer.dispose();
      for (const frame of frames) frame.close();
    });
    renderer.setViewMode(drawing.viewMode);
    if (drawing.gain) renderer.setLensGains([drawing.gain, drawing.gain]);
    renderer.present({ pair: { timestamp: seconds(0), frames }, mediaTime: seconds(0) });
    return { renderer, canvas };
  }

  /**
   * The pixel ahead of the first lens, in levels.
   */
  function drawnAhead(drawing: Drawing): readonly number[] {
    const { canvas } = rendererOf(drawing);
    const { column, row } = equirectangularPixelOf([0, 0, 1], SIZE);
    const pixels = readPixels(canvas);
    const offset = ((SIZE.height - 1 - row) * SIZE.width + column) * 4;
    return [pixels[offset] ?? -1, pixels[offset + 1] ?? -1, pixels[offset + 2] ?? -1];
  }

  for (const viewMode of ['raw-lenses', 'equirectangular'] as const) {
    it.each(PAINTED)(
      `converts %s from HLG as the core does, drawn ${viewMode}`,
      (_name, css, texel) => {
        const reference = inLevels(toDisplay(HLG_TO_SDR_BT709, unitTexel(texel)));
        expectWithin(drawnAhead({ conversion: HLG_TO_SDR_BT709, css, viewMode }), reference);
      },
    );
  }

  it('gains an HLG lens before its highlights roll off, as the core does', () => {
    const gain: Vector3 = [1.6, 1.6, 1.6];
    const [red, green, blue] = exposureSignalOf(HLG_TO_SDR_BT709, unitTexel([128, 128, 128]));
    const gained: Vector3 = [red * gain[0], green * gain[1], blue * gain[2]];
    const reference = inLevels(shownOf(HLG_TO_SDR_BT709, gained));
    const shown = drawnAhead({
      conversion: HLG_TO_SDR_BT709,
      css: 'rgb(128, 128, 128)',
      viewMode: 'equirectangular',
      gain,
    });
    expectWithin(shown, reference);
  });

  it("meters an HLG lens's exposure signal along the seam, as the core does", async () => {
    const { renderer } = rendererOf({
      conversion: HLG_TO_SDR_BT709,
      css: 'rgb(230, 128, 40)',
      viewMode: 'equirectangular',
    });
    const meter = renderer.createSeamMeter();
    cleanups.push(() => {
      meter.dispose();
    });
    const means = await meter.measure();
    const reference = exposureSignalOf(HLG_TO_SDR_BT709, unitTexel([230, 128, 40]));
    expect(means).toHaveLength(2);
    const measured = means ?? [];
    for (const mean of measured) {
      for (const [channel, value] of mean.entries()) {
        expect(Math.abs(value - (reference[channel] ?? NaN))).toBeLessThanOrEqual(METER_TOLERANCE);
      }
    }
  });

  it('shows a lens as recorded pixel for pixel', () => {
    const drawing: Drawing = {
      conversion: AS_RECORDED,
      css: 'rgb(40, 200, 60)',
      viewMode: 'raw-lenses',
    };
    expect(drawnAhead(drawing)).toEqual([40, 200, 60]);
  });
});
