import { buildStitchingSetup, seconds, type DecodedFrame } from '@gyroview/core';
import { afterEach, describe, expect, it } from 'vitest';

import { readPixels } from './test/readPixels';
import { MULTI_TRACK, syntheticCalibration } from './test/syntheticStitching';
import { ThreeFrameRenderer } from './ThreeFrameRenderer';

const SIZE = 32;
const CHANNEL_MAX = 255;
/**
 * Levels of 255 the texel may differ from the prediction: the conversion to 8 bits rounds, and
 * browsers round the matrix product differently.
 */
const TOLERANCE_LEVELS = 3;

/**
 * 10-bit limited range (BT.2100 table 9): black 64, white 940, chroma centred on 512 with a
 * half excursion of 448.
 */
const LUMA_BLACK = 64;
const LUMA_EXCURSION = 876;
const CHROMA_CENTRE = 512;
const CHROMA_EXCURSION = 896;

interface Codes {
  readonly y: number;
  readonly cb: number;
  readonly cr: number;
}

interface Matrix {
  readonly kr: number;
  readonly kb: number;
}

/**
 * The luma weights of BT.2020's non-constant-luminance matrix and of BT.709's.
 */
const BT2020: Matrix = { kr: 0.2627, kb: 0.0593 };
const BT709: Matrix = { kr: 0.2126, kb: 0.0722 };

/**
 * TypeScript's DOM library lags the WebCodecs specification, which names BT.2020 and HLG, and
 * a VideoFrame built from its planes; the casts say what the browser is handed.
 */
const HLG_BT2020_LIMITED = {
  primaries: 'bt2020',
  transfer: 'hlg',
  matrix: 'bt2020-ncl',
  fullRange: false,
} as unknown as VideoColorSpaceInit;

/**
 * R'G'B' of limited-range codes through a matrix, in levels of 255: what the texel holds if the
 * upload converts Y'CbCr and range and nothing more.
 */
function encodedRgbOf(codes: Codes, matrix: Matrix): readonly number[] {
  const y = (codes.y - LUMA_BLACK) / LUMA_EXCURSION;
  const pb = (codes.cb - CHROMA_CENTRE) / CHROMA_EXCURSION;
  const pr = (codes.cr - CHROMA_CENTRE) / CHROMA_EXCURSION;
  const kg = 1 - matrix.kr - matrix.kb;
  const red = y + 2 * (1 - matrix.kr) * pr;
  const blue = y + 2 * (1 - matrix.kb) * pb;
  const green = (y - matrix.kr * red - matrix.kb * blue) / kg;
  return [red, green, blue].map((value) => Math.min(Math.max(value, 0), 1) * CHANNEL_MAX);
}

/**
 * A uniform 10-bit 4:2:0 frame of the codes, as a camera's decoder hands it over.
 */
function tenBitFrame(codes: Codes): DecodedFrame<VideoFrame> {
  const lumaSamples = SIZE * SIZE;
  const chromaSamples = lumaSamples / 4;
  const planes = new Uint16Array(lumaSamples + 2 * chromaSamples);
  planes.fill(codes.y, 0, lumaSamples);
  planes.fill(codes.cb, lumaSamples, lumaSamples + chromaSamples);
  planes.fill(codes.cr, lumaSamples + chromaSamples);
  const init = {
    format: 'I420P10',
    codedWidth: SIZE,
    codedHeight: SIZE,
    timestamp: 0,
    colorSpace: HLG_BT2020_LIMITED,
  } as unknown as VideoFrameInit;
  const frame = new VideoFrame(planes as unknown as CanvasImageSource, init);
  return {
    timestamp: seconds(0),
    handle: frame,
    close: (): void => {
      frame.close();
    },
  };
}

function canBuildTenBitFrames(): boolean {
  try {
    tenBitFrame({ y: LUMA_BLACK, cb: CHROMA_CENTRE, cr: CHROMA_CENTRE }).close();
    return true;
  } catch {
    return false;
  }
}

/**
 * Where the browser's upload of a decoded frame ends and the shader's work begins (ADR 0033):
 * a 10-bit HLG frame of known codes, drawn as the raw lenses show it, must hold the BT.2020
 * matrix's R'G'B' at full range, still HLG-encoded, with no tone mapping of the browser's own.
 */
describe.skipIf(!canBuildTenBitFrames())('uploading a 10-bit HLG frame', () => {
  const cleanups: (() => void)[] = [];

  afterEach(() => {
    for (const cleanup of cleanups.splice(0).toReversed()) cleanup();
  });

  function drawnCentreOf(codes: Codes): readonly number[] {
    const canvas = document.createElement('canvas');
    canvas.width = 2 * SIZE;
    canvas.height = SIZE;
    const setup = buildStitchingSetup({ calibration: syntheticCalibration(), layout: MULTI_TRACK });
    const renderer = ThreeFrameRenderer.create(canvas, setup, { preserveDrawingBuffer: true });
    const frames = [tenBitFrame(codes), tenBitFrame(codes)];
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

  it.each([300, 502, 900])(
    'expands luma %i to full range and nothing more: no tone mapping of the browser',
    (luma) => {
      const codes = { y: luma, cb: CHROMA_CENTRE, cr: CHROMA_CENTRE };
      const [grey] = encodedRgbOf(codes, BT2020);
      for (const value of drawnCentreOf(codes)) {
        expect(Math.abs(value - (grey ?? NaN))).toBeLessThanOrEqual(TOLERANCE_LEVELS);
      }
    },
  );

  it('converts Y′CbCr through the BT.2020 matrix the frame names, not BT.709', () => {
    const codes = { y: 450, cb: 300, cr: 800 };
    const [, drawnGreen = NaN] = drawnCentreOf(codes);
    const [, bt2020Green = NaN] = encodedRgbOf(codes, BT2020);
    const [, bt709Green = NaN] = encodedRgbOf(codes, BT709);
    expect(Math.abs(bt709Green - bt2020Green)).toBeGreaterThan(2 * TOLERANCE_LEVELS);
    expect(Math.abs(drawnGreen - bt2020Green)).toBeLessThanOrEqual(TOLERANCE_LEVELS);
  });
});
