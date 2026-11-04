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
  X6_I_LOG_TO_SDR_BT709,
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

/**
 * The conversions that bring a signal to scene light and tone it, by the signal's name, each
 * with a saturated orange short of white in it for the seam meter, which leaves out what is
 * blown out: I-Log's highlights lie lower in its signal than HLG's.
 */
const TONING: readonly (readonly [
  signal: string,
  conversion: DisplayConversion,
  orange: Vector3,
])[] = [
  ['HLG', HLG_TO_SDR_BT709, [230, 128, 40]],
  ['I-Log', X6_I_LOG_TO_SDR_BT709, [180, 128, 90]],
];

function cssOf([red, green, blue]: Vector3): string {
  return `rgb(${red}, ${green}, ${blue})`;
}

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
 * and as the stitched panorama, gained and metered (ADR 0033, ADR 0047): every pass that reads a
 * lens's texels brings them to the display, or to its exposure signal, the same way.
 */
describe('the display conversion', () => {
  const cleanups: (() => void)[] = [];

  afterEach(() => {
    for (const cleanup of cleanups.splice(0).toReversed()) cleanup();
  });

  /**
   * Both lenses painted `css` and shown through `conversion`, lens 1 through `secondLens` where
   * given, gained by `gain`, drawn once.
   */
  interface Drawing {
    readonly conversion: DisplayConversion;
    readonly secondLens?: DisplayConversion;
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
      displayConversions: [drawing.conversion, drawing.secondLens ?? drawing.conversion],
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

  for (const [signal, conversion, orange] of TONING) {
    for (const viewMode of ['raw-lenses', 'equirectangular'] as const) {
      it.each(PAINTED)(
        `converts %s from ${signal} as the core does, drawn ${viewMode}`,
        (_name, css, texel) => {
          const reference = inLevels(toDisplay(conversion, unitTexel(texel)));
          expectWithin(drawnAhead({ conversion, css, viewMode }), reference);
        },
      );
    }

    it(`gains an ${signal} lens before its highlights roll off, as the core does`, () => {
      const gain: Vector3 = [1.6, 1.6, 1.6];
      const [red, green, blue] = exposureSignalOf(conversion, unitTexel([128, 128, 128]));
      const gained: Vector3 = [red * gain[0], green * gain[1], blue * gain[2]];
      const reference = inLevels(shownOf(conversion, gained));
      const shown = drawnAhead({
        conversion,
        css: 'rgb(128, 128, 128)',
        viewMode: 'equirectangular',
        gain,
      });
      expectWithin(shown, reference);
    });

    it(`meters an ${signal} lens's exposure signal along the seam, as the core does`, async () => {
      const { renderer } = rendererOf({
        conversion,
        css: cssOf(orange),
        viewMode: 'equirectangular',
      });
      const meter = renderer.createSeamMeter();
      cleanups.push(() => {
        meter.dispose();
      });
      const means = await meter.measure();
      const reference = exposureSignalOf(conversion, unitTexel(orange));
      expect(means).toHaveLength(2);
      const measured = means ?? [];
      for (const mean of measured) {
        for (const [channel, value] of mean.entries()) {
          expect(Math.abs(value - (reference[channel] ?? NaN))).toBeLessThanOrEqual(
            METER_TOLERANCE,
          );
        }
      }
    });
  }

  it("meters each lens through its own conversion, lens 1's log curve its own", async () => {
    const orange: Vector3 = [180, 128, 90];
    const { renderer } = rendererOf({
      conversion: AS_RECORDED,
      secondLens: X6_I_LOG_TO_SDR_BT709,
      css: cssOf(orange),
      viewMode: 'equirectangular',
    });
    const meter = renderer.createSeamMeter();
    cleanups.push(() => {
      meter.dispose();
    });
    const means = await meter.measure();
    const references = [AS_RECORDED, X6_I_LOG_TO_SDR_BT709].map((conversion) =>
      exposureSignalOf(conversion, unitTexel(orange)),
    );
    expect(means).toHaveLength(2);
    const measured = means ?? [];
    for (const [lens, mean] of measured.entries()) {
      for (const [channel, value] of mean.entries()) {
        const reference = references[lens]?.[channel] ?? NaN;
        expect(Math.abs(value - reference)).toBeLessThanOrEqual(METER_TOLERANCE);
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
