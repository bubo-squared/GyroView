import { describe, expect, it } from 'vitest';

import { detectLensLayout, type InputDescription, type LayoutHints } from './detectLensLayout';
import { FULL_FRAME, LEFT_HALF, RIGHT_HALF } from '../../stitching/LensLayout';
import type { VideoTrackDescription } from '../../../ports/VideoTrack';
import { captureError } from '../../../../test/support/errors';
import { UNSPECIFIED_COLOUR } from '../../colour/TrackColour';

const HEVC = 'hvc1.1.6.L153.B0';
const NO_HINTS = { fileLayout: undefined, trackOrder: undefined };

function track(trackIndex: number, width: number, height = width): VideoTrackDescription {
  return {
    trackIndex,
    codedWidth: width,
    codedHeight: height,
    codec: HEVC,
    colour: UNSPECIFIED_COLOUR,
  };
}

function input(
  name: string | undefined,
  ...videoTracks: VideoTrackDescription[]
): InputDescription {
  return {
    name,
    videoTracks: videoTracks.map((description) => ({ description })),
    hasTrailer: false,
  };
}

/**
 * A file of an older camera's pair that ends with the trailer, as its back lens's file does.
 */
function carrier(name: string | undefined, videoTrack: VideoTrackDescription): InputDescription {
  return { ...input(name, videoTrack), hasTrailer: true };
}

describe('detectLensLayout', () => {
  it('maps two square tracks in one file onto the two lenses in track order when track 0 is stream 00', () => {
    const layout = detectLensLayout(
      [input('VID_20260814_132640_00_013.insv', track(0, 2880), track(1, 2880))],
      {
        fileLayout: 'multi-track',
        trackOrder: 'stream-00-first',
      },
    );
    expect(layout.kind).toBe('multi-track');
    expect(layout.sources).toEqual([
      { lensIndex: 0, inputIndex: 0, trackIndex: 0, region: FULL_FRAME },
      { lensIndex: 1, inputIndex: 0, trackIndex: 1, region: FULL_FRAME },
    ]);
    expect(layout.evidence).toEqual([
      'one input with two video tracks',
      'info record file layout multi-track',
      'info record track order stream-00-first: lens 0 is track 0',
    ]);
  });

  it('swaps the tracks when the info record says track 0 is the screen-side stream (X5)', () => {
    const layout = detectLensLayout([input('clip.insv', track(0, 2880), track(1, 2880))], {
      fileLayout: 'multi-track',
      trackOrder: 'stream-10-first',
    });
    expect(layout.sources.map((source) => [source.lensIndex, source.trackIndex])).toEqual([
      [0, 1],
      [1, 0],
    ]);
    expect(layout.evidence).toContain('info record track order stream-10-first: lens 0 is track 1');
  });

  it('records only the track evidence when the info record has no layout fields', () => {
    const layout = detectLensLayout([input('clip.insv', track(0, 3840), track(1, 3840))], NO_HINTS);
    expect(layout.evidence).toEqual([
      'one input with two video tracks',
      'no track order hint: lens 0 assumed to be track 0',
    ]);
  });

  it('maps a _00_/_10_ pair onto the lenses with the _00_ file first, whatever order they are given in (X3)', () => {
    const layout = detectLensLayout(
      [
        input('VID_20240101_120000_10_001.insv', track(0, 2880)),
        input('VID_20240101_120000_00_001.insv', track(0, 2880)),
      ],
      { fileLayout: 'split-files', trackOrder: undefined },
    );
    expect(layout.kind).toBe('split-files');
    expect(layout.sources.map((source) => [source.lensIndex, source.inputIndex])).toEqual([
      [0, 1],
      [1, 0],
    ]);
    expect(layout.evidence[0]).toBe(
      'two inputs with one video track each (VID_20240101_120000_10_001.insv, VID_20240101_120000_00_001.insv)',
    );
  });

  it('takes lens 0 from the file that carries the trailer when the names say nothing', () => {
    const layout = detectLensLayout(
      [input('media/a1b2.insv', track(0, 2880)), carrier('media/c3d4.insv', track(0, 2880))],
      NO_HINTS,
    );
    expect(layout.sources.map((source) => [source.lensIndex, source.inputIndex])).toEqual([
      [0, 1],
      [1, 0],
    ]);
    expect(layout.evidence[1]).toBe(
      'lens 0 taken from the file that carries the trailer (media/c3d4.insv)',
    );
  });

  it('follows the trailer over a name that says otherwise, and says so', () => {
    const layout = detectLensLayout(
      [
        input('VID_20240101_120000_00_001.insv', track(0, 2880)),
        carrier('VID_20240101_120000_10_001.insv', track(0, 2880)),
      ],
      NO_HINTS,
    );
    expect(layout.sources.map((source) => source.inputIndex)).toEqual([1, 0]);
    expect(layout.evidence[1]).toContain('though its name says _10_');
  });

  it('lets the names decide where both files carry a trailer', () => {
    const layout = detectLensLayout(
      [
        carrier('VID_20240101_120000_10_001.insv', track(0, 2880)),
        carrier('VID_20240101_120000_00_001.insv', track(0, 2880)),
      ],
      NO_HINTS,
    );
    expect(layout.sources.map((source) => source.inputIndex)).toEqual([1, 0]);
    expect(layout.evidence[1]).toBe('lens 0 taken from the _00_ file when named');
  });

  it('keeps the given order for a pair of unnamed inputs', () => {
    const layout = detectLensLayout(
      [input(undefined, track(0, 2880)), input(undefined, track(0, 2880))],
      NO_HINTS,
    );
    expect(layout.sources.map((source) => source.inputIndex)).toEqual([0, 1]);
    expect(layout.evidence[0]).toBe('two inputs with one video track each (?, ?)');
  });

  it('splits a single 2:1 track into left and right halves (packed modes, LRV)', () => {
    const packedTrack = { ...track(0, 1664, 832), codec: 'avc1.640028' };
    const layout = detectLensLayout(
      [input('LRV_20260814_132640_01_013.lrv', packedTrack)],
      NO_HINTS,
    );
    expect(layout.kind).toBe('packed');
    expect(layout.sources.map((source) => source.region)).toEqual([LEFT_HALF, RIGHT_HALF]);
    expect(layout.evidence).toEqual(['single 1664x832 track with a 2:1 aspect ratio']);
  });

  it.each<[string, InputDescription[], LayoutHints]>([
    [
      'only the _00_ half of a pair is given',
      [input('VID_20240101_120000_00_001.insv', track(0, 2880))],
      NO_HINTS,
    ],
    [
      'the info record says the recording is split',
      [input('clip.insv', track(0, 2880))],
      { fileLayout: 'split-files', trackOrder: undefined },
    ],
    [
      'only the _10_ half is given',
      [input('VID_20240101_120000_10_001.insv', track(0, 2880))],
      NO_HINTS,
    ],
    ['a renamed half comes without a hint', [input('clip.insv', track(0, 2880))], NO_HINTS],
  ])('asks for the second file when %s', (_case, inputs, hints) => {
    expect(captureError(() => detectLensLayout(inputs, hints))).toMatchObject({
      code: 'missing-second-file',
    });
  });

  it('names the file that holds the other lens when the name follows the pattern', () => {
    const error = captureError(() =>
      detectLensLayout([input('VID_20240101_120000_10_001.insv', track(0, 2880))], NO_HINTS),
    );
    expect(error).toMatchObject({
      message: expect.stringContaining('VID_20240101_120000_00_001.insv') as string,
    });
  });

  it.each([
    ['a single non-square, non-packed track', [input('clip.mp4', track(0, 1920, 1080))]],
    ['three tracks in one file', [input('a', track(0, 2880), track(1, 2880), track(2, 2880))]],
    [
      'two files where one holds both tracks',
      [input('a', track(0, 2880), track(1, 2880)), input('b')],
    ],
    ['a 2:1 track next to a square one', [input('a', track(0, 1664, 832), track(1, 2880))]],
    ['two square tracks of different sizes', [input('a', track(0, 2880), track(1, 1920))]],
    ['no inputs at all', []],
  ])('rejects %s as an unsupported layout', (_case, inputs) => {
    expect(captureError(() => detectLensLayout(inputs, NO_HINTS))).toMatchObject({
      code: 'unsupported-layout',
    });
  });

  it('names the track shapes in the unsupported-layout message', () => {
    const error = captureError(() =>
      detectLensLayout([input('clip.mp4', track(0, 1920, 1080))], NO_HINTS),
    );
    expect(error).toMatchObject({ message: expect.stringContaining('1920x1080') as string });
  });
});
