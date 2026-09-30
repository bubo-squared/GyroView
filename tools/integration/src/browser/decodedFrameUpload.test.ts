import { MediabunnyCodecReader } from '@gyroview/adapter-mediabunny';
import { ThreeFrameRenderer } from '@gyroview/adapter-three';
import {
  BT2020_WEIGHTS,
  BT601_WEIGHTS,
  BT709_WEIGHTS,
  encodedRgbOf,
  largestDifference,
  MULTI_TRACK,
  readPixels,
  syntheticCalibration,
  TEN_BIT_LIMITED,
  type LumaWeights,
  type YcbcrCodes,
} from '@gyroview/adapter-three/testing';
import {
  buildStitchingSetup,
  seconds,
  type DecodedFrame,
  type DisplayConversion,
  type DownloadedFile,
} from '@gyroview/core';
import { AS_RECORDED, openDownloadedFile } from '@gyroview/core/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import fixtureUrl from '../../../../test/fixtures/synthetic/hevc-main10-hlg-patches-64px-10fps.mp4?url';
import { port } from './realRecordingSupport';

const SIZE = 64;
const QUADRANT_CENTRE = 16;
/**
 * Levels of 255 the texel may differ from the prediction: the conversion to 8 bits rounds, and
 * browsers round the matrix product differently.
 */
const TOLERANCE_LEVELS = 3;

/**
 * The weights of the matrices a frame may name.
 */
const WEIGHTS_BY_MATRIX: Readonly<Record<string, LumaWeights>> = {
  'bt2020-ncl': BT2020_WEIGHTS,
  bt709: BT709_WEIGHTS,
  smpte170m: BT601_WEIGHTS,
  bt470bg: BT601_WEIGHTS,
};

/**
 * The track's matrix, which the renderer brings the texels back to.
 */
const RECORDED_AS_BT2020: DisplayConversion = { ...AS_RECORDED, matrix: 'bt2020-ncl' };

/**
 * The fixture's four patches, its quadrants from the top left, row by row.
 */
const PATCHES: readonly (readonly [name: string, codes: YcbcrCodes])[] = [
  ['a dark grey', { y: 300, cb: 512, cr: 512 }],
  ['a mid grey', { y: 502, cb: 512, cr: 512 }],
  ['a bright grey', { y: 900, cb: 512, cr: 512 }],
  ['a colour the three matrices tell apart', { y: 670, cb: 580, cr: 140 }],
];

/**
 * The upload of frames the platform's own decoder made (ADR 0033), where the three adapter's
 * `videoFrameUpload.test.ts` checks frames built from planes: the first frame of a lossless HEVC
 * Main 10 recording of four uniform patches, tagged BT.2020 HLG in its VUI as the X6 tags its
 * tracks, decoded by WebCodecs. Its texels hold R′G′B′ at full range, with no tone mapping of the
 * browser's, through the matrix the frame names: BT.2020 in Chromium, BT.709 in WebKit, whose
 * decoders ignore the stream's. Brought back to the track's matrix, they are BT.2020's
 * everywhere. Skipped where the browser takes no HEVC Main 10 configuration (a decoder that
 * takes it and fails fails the test).
 */
describe('uploading a decoded 10-bit HLG frame', () => {
  let input: DownloadedFile;
  let frame: DecodedFrame<VideoFrame> | undefined;

  beforeAll(async () => {
    const response = await fetch(fixtureUrl);
    input = await openDownloadedFile(
      new Uint8Array(await response.arrayBuffer()),
      new MediabunnyCodecReader(),
    );
    frame = await firstFrameOf(input);
  });

  afterAll(() => {
    frame?.close();
    input.dispose();
  });

  const cases = PATCHES.map(([name, codes], quadrant) => [name, codes, quadrant] as const);

  it.for(cases)('holds %s through the matrix its frame names', ([, codes, quadrant], context) => {
    if (!frame) return context.skip('this browser decodes no HEVC Main 10');
    const named = WEIGHTS_BY_MATRIX[frame.handle.colorSpace.matrix ?? ''];
    if (!named)
      throw new Error(`the frame names the ${String(frame.handle.colorSpace.matrix)} matrix`);
    const drawn = drawnAt(frame, { conversion: AS_RECORDED, quadrant });
    const predicted = encodedRgbOf(codes, TEN_BIT_LIMITED, named);
    expect(largestDifference(drawn, predicted)).toBeLessThanOrEqual(TOLERANCE_LEVELS);
  });

  it.for(cases)(
    "shows %s through the track's BT.2020 matrix once corrected",
    ([, codes, quadrant], context) => {
      if (!frame) return context.skip('this browser decodes no HEVC Main 10');
      const drawn = drawnAt(frame, { conversion: RECORDED_AS_BT2020, quadrant });
      const predicted = encodedRgbOf(codes, TEN_BIT_LIMITED, BT2020_WEIGHTS);
      expect(largestDifference(drawn, predicted)).toBeLessThanOrEqual(TOLERANCE_LEVELS);
    },
  );
});

/**
 * The fixture's first frame as the platform decodes it; undefined where it cannot.
 */
async function firstFrameOf(input: DownloadedFile): Promise<DecodedFrame<VideoFrame> | undefined> {
  const [track] = input.videoTracks;
  if (!track) throw new Error('the fixture has no video track');
  const configuration = await track.decoderConfiguration();
  if (!(await port.isSupported(configuration))) return undefined;
  const frames: DecodedFrame<VideoFrame>[] = [];
  const failures: Error[] = [];
  const decoder = await port.create(configuration, {
    onFrame: (decoded) => {
      frames.push(decoded);
    },
    onError: (error) => {
      failures.push(error);
    },
  });
  const packets = track.packetsFrom(seconds(0));
  for await (const packet of packets) {
    decoder.decode(packet);
    break;
  }
  await decoder.flush();
  decoder.close();
  const [first, ...others] = frames;
  for (const other of others) other.close();
  const [failure] = failures;
  if (failure) throw failure;
  if (!first) throw new Error('the decoder took the configuration but made no frame');
  return first;
}

/**
 * The centre of one quadrant of the frame, drawn through `conversion` as the raw lenses show it,
 * in levels.
 */
function drawnAt(
  frame: DecodedFrame<VideoFrame>,
  drawing: { readonly conversion: DisplayConversion; readonly quadrant: number },
): readonly number[] {
  const { conversion, quadrant } = drawing;
  const canvas = document.createElement('canvas');
  canvas.width = 2 * SIZE;
  canvas.height = SIZE;
  const setup = buildStitchingSetup({
    calibration: syntheticCalibration(),
    layout: MULTI_TRACK,
    displayConversions: [conversion, conversion],
  });
  const renderer = ThreeFrameRenderer.create(canvas, setup, { preserveDrawingBuffer: true });
  try {
    renderer.setViewMode('raw-lenses');
    renderer.present({
      pair: { timestamp: seconds(0), frames: [frame, frame] },
      mediaTime: seconds(0),
    });
    const column = QUADRANT_CENTRE + (quadrant % 2) * (SIZE / 2);
    const row = QUADRANT_CENTRE + Math.floor(quadrant / 2) * (SIZE / 2);
    const pixels = readPixels(canvas);
    const offset = ((SIZE - 1 - row) * canvas.width + column) * 4;
    return [pixels[offset] ?? -1, pixels[offset + 1] ?? -1, pixels[offset + 2] ?? -1];
  } finally {
    renderer.dispose();
  }
}
