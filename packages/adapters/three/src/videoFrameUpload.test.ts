import { buildStitchingSetup, seconds, type DecodedFrame } from '@gyroview/core';
import { AS_RECORDED, shownAsRecorded } from '@gyroview/core/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { server } from 'vitest/browser';

import { readPixels } from './test/readPixels';
import { MULTI_TRACK, syntheticCalibration } from './test/syntheticStitching';
import {
  BT2020_WEIGHTS,
  BT601_WEIGHTS,
  BT709_WEIGHTS,
  EIGHT_BIT_LIMITED,
  encodedRgbOf,
  largestDifference,
  TEN_BIT_LIMITED,
  type LimitedRange,
  type YcbcrCodes,
} from './test/ycbcrPrediction';
import { ThreeFrameRenderer } from './ThreeFrameRenderer';

const SIZE = 32;
/**
 * Levels of 255 the texel may differ from the prediction: the conversion to 8 bits rounds, and
 * browsers round the matrix product differently.
 */
const TOLERANCE_LEVELS = 3;
/**
 * For a saturated colour: WebKit's software upload on Linux rounds the matrix product up to
 * about four levels off, still well inside the eleven levels between the matrices' predictions.
 */
const MATRIX_TOLERANCE_LEVELS = 5;

/**
 * A sample format of 4:2:0 frames, its limited range and how its planes are held.
 */
interface SampleDepth extends LimitedRange {
  readonly name: string;
  readonly format: string;
  readonly planesOf: (samples: number) => Uint8Array | Uint16Array;
  /**
   * WebKit's `VideoFrame` refuses the 10-bit formats its decoders output; everywhere else the
   * probe must run.
   */
  readonly isBuiltHere: boolean;
}

const TEN_BIT: SampleDepth = {
  ...TEN_BIT_LIMITED,
  name: '10-bit',
  format: 'I420P10',
  planesOf: (samples) => new Uint16Array(samples),
  isBuiltHere: server.browser !== 'webkit',
};

const EIGHT_BIT: SampleDepth = {
  ...EIGHT_BIT_LIMITED,
  name: '8-bit',
  format: 'I420',
  planesOf: (samples) => new Uint8Array(samples),
  isBuiltHere: true,
};

/**
 * A Y′CbCr signal: luma from 0 to 1, the colour differences from -0.5 to 0.5.
 */
interface Signal {
  readonly luma: number;
  readonly blueDifference: number;
  readonly redDifference: number;
}

/**
 * A colour whose R′G′B′ through each of the three matrices lies at least eleven levels from the
 * others', and inside the range, so no channel clips.
 */
const TELLING_COLOUR: Signal = { luma: 0.692, blueDifference: 0.0759, redDifference: -0.415 };

/**
 * TypeScript's DOM library lags the WebCodecs specification, which names BT.2020 and HLG and the
 * 10-bit formats: the strings are cast to the library's types.
 */
const HLG_BT2020_LIMITED: VideoColorSpaceInit = specColorSpace({
  primaries: 'bt2020',
  transfer: 'hlg',
  matrix: 'bt2020-ncl',
  fullRange: false,
});

interface SpecColorSpace {
  readonly primaries: string;
  readonly transfer: string;
  readonly matrix: string;
  readonly fullRange: boolean;
}

function specColorSpace(colorSpace: SpecColorSpace): VideoColorSpaceInit {
  return colorSpace as VideoColorSpaceInit;
}

function codesOf(signal: Signal, depth: SampleDepth): YcbcrCodes {
  return {
    y: Math.round(depth.lumaBlack + signal.luma * depth.lumaExcursion),
    cb: Math.round(depth.chromaCentre + signal.blueDifference * depth.chromaExcursion),
    cr: Math.round(depth.chromaCentre + signal.redDifference * depth.chromaExcursion),
  };
}

/**
 * The same, naming BT.709's matrix, as WebKit's decoders name theirs whatever the stream says.
 */
const HLG_NAMING_BT709: VideoColorSpaceInit = specColorSpace({
  primaries: 'bt2020',
  transfer: 'hlg',
  matrix: 'bt709',
  fullRange: false,
});

/**
 * A uniform 4:2:0 frame of the codes, tagged BT.2020 HLG as the X6's decoder hands it over, or
 * with the colour space given.
 */
function frameOf(
  codes: YcbcrCodes,
  depth: SampleDepth,
  colorSpace: VideoColorSpaceInit = HLG_BT2020_LIMITED,
): DecodedFrame<VideoFrame> {
  const lumaSamples = SIZE * SIZE;
  const chromaSamples = lumaSamples / 4;
  const planes = depth.planesOf(lumaSamples + 2 * chromaSamples);
  planes.fill(codes.y, 0, lumaSamples);
  planes.fill(codes.cb, lumaSamples, lumaSamples + chromaSamples);
  planes.fill(codes.cr, lumaSamples + chromaSamples);
  const frame = new VideoFrame(planes, {
    format: depth.format as VideoPixelFormat,
    codedWidth: SIZE,
    codedHeight: SIZE,
    timestamp: 0,
    colorSpace,
  });
  return {
    timestamp: seconds(0),
    handle: frame,
    close: (): void => {
      frame.close();
    },
  };
}

/**
 * Where the browser's upload of a decoded frame ends and the shader's work begins (ADR 0033):
 * an HLG frame of known codes, drawn as the raw lenses show it, must hold the BT.2020 matrix's
 * R′G′B′ at full range, still HLG-encoded, with no tone mapping of the browser's own. Frames
 * built from planes take the CPU's upload path; `decodedFrameUpload.test.ts` in the integration
 * tools checks decoded ones.
 */
describe.each([TEN_BIT, EIGHT_BIT])('uploading a $name HLG frame', (depth) => {
  const cleanups: (() => void)[] = [];

  afterEach(() => {
    for (const cleanup of cleanups.splice(0).toReversed()) cleanup();
  });

  function drawnCentreOf(codes: YcbcrCodes): readonly number[] {
    const canvas = document.createElement('canvas');
    canvas.width = 2 * SIZE;
    canvas.height = SIZE;
    const setup = buildStitchingSetup({
      calibration: syntheticCalibration(),
      layout: MULTI_TRACK,
      displayConversions: shownAsRecorded(MULTI_TRACK),
    });
    const renderer = ThreeFrameRenderer.create(canvas, setup, { preserveDrawingBuffer: true });
    const frames = [frameOf(codes, depth), frameOf(codes, depth)];
    cleanups.push(() => {
      renderer.dispose();
      for (const frame of frames) frame.close();
    });
    renderer.setViewMode('raw-lenses');
    renderer.present({ pair: { timestamp: seconds(0), frames }, mediaTime: seconds(0) });
    const pixels = readPixels(canvas);
    const centre = ((SIZE / 2) * canvas.width + SIZE / 2) * 4;
    return [pixels[centre] ?? -1, pixels[centre + 1] ?? -1, pixels[centre + 2] ?? -1];
  }

  it.skipIf(!depth.isBuiltHere).each([0.27, 0.5, 0.95])(
    'expands luma %f to full range and nothing more: no tone mapping of the browser',
    (luma) => {
      const codes = codesOf({ luma, blueDifference: 0, redDifference: 0 }, depth);
      const [grey] = encodedRgbOf(codes, depth, BT2020_WEIGHTS);
      for (const value of drawnCentreOf(codes)) {
        expect(Math.abs(value - (grey ?? NaN))).toBeLessThanOrEqual(TOLERANCE_LEVELS);
      }
    },
  );

  it.skipIf(!depth.isBuiltHere)(
    'converts Y′CbCr through the BT.2020 matrix the frame names, not BT.709 or BT.601',
    () => {
      const codes = codesOf(TELLING_COLOUR, depth);
      const bt2020 = encodedRgbOf(codes, depth, BT2020_WEIGHTS);
      for (const other of [BT709_WEIGHTS, BT601_WEIGHTS]) {
        const otherRgb = encodedRgbOf(codes, depth, other);
        expect(largestDifference(bt2020, otherRgb)).toBeGreaterThan(2 * MATRIX_TOLERANCE_LEVELS);
      }
      expect(largestDifference(drawnCentreOf(codes), bt2020)).toBeLessThanOrEqual(
        MATRIX_TOLERANCE_LEVELS,
      );
    },
  );
});

/**
 * The matrix correction through the shader (ADR 0033): frames of a track recorded in BT.2020,
 * one naming BT.709 as WebKit's decoders name theirs, one naming BT.2020, both show BT.2020's
 * R′G′B′ once brought back to the track's matrix, one after the other on the same renderer.
 */
describe("bringing a frame's matrix back to the track's", () => {
  it("shows R′G′B′ through the track's matrix, whichever matrix the frame names", () => {
    const canvas = document.createElement('canvas');
    canvas.width = 2 * SIZE;
    canvas.height = SIZE;
    const recordedAsBt2020 = { ...AS_RECORDED, matrix: 'bt2020-ncl' } as const;
    const setup = buildStitchingSetup({
      calibration: syntheticCalibration(),
      layout: MULTI_TRACK,
      displayConversions: [recordedAsBt2020, recordedAsBt2020],
    });
    const renderer = ThreeFrameRenderer.create(canvas, setup, { preserveDrawingBuffer: true });
    renderer.setViewMode('raw-lenses');
    const codes = codesOf(TELLING_COLOUR, EIGHT_BIT);
    const bt2020 = encodedRgbOf(codes, EIGHT_BIT, BT2020_WEIGHTS);
    try {
      for (const colorSpace of [HLG_NAMING_BT709, HLG_BT2020_LIMITED]) {
        const frames = [
          frameOf(codes, EIGHT_BIT, colorSpace),
          frameOf(codes, EIGHT_BIT, colorSpace),
        ];
        renderer.present({ pair: { timestamp: seconds(0), frames }, mediaTime: seconds(0) });
        for (const frame of frames) frame.close();
        const pixels = readPixels(canvas);
        const centre = ((SIZE / 2) * canvas.width + SIZE / 2) * 4;
        const drawn = [pixels[centre] ?? -1, pixels[centre + 1] ?? -1, pixels[centre + 2] ?? -1];
        expect(largestDifference(drawn, bt2020)).toBeLessThanOrEqual(MATRIX_TOLERANCE_LEVELS);
      }
    } finally {
      renderer.dispose();
    }
  });
});
