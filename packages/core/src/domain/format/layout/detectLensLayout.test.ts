import { describe, expect, it } from 'vitest';

import { detectLensLayout, FileLayoutHint } from './detectLensLayout';
import { FULL_FRAME, LEFT_HALF, RIGHT_HALF } from './LensLayout';
import type { InputDescription, VideoTrackDescription } from './VideoTrackDescription';
import { captureError } from '../../../../test/support/errors';

const HEVC = 'hvc1.1.6.L153.B0';

function track(trackIndex: number, width: number, height = width): VideoTrackDescription {
  return { trackIndex, codedWidth: width, codedHeight: height, codec: HEVC };
}

function input(
  name: string | undefined,
  ...videoTracks: VideoTrackDescription[]
): InputDescription {
  return { name, videoTracks };
}

describe('detectLensLayout', () => {
  it('maps two square tracks in one file onto the two lenses in track order (X4/X5)', () => {
    const layout = detectLensLayout(
      [input('VID_20260814_132640_00_013.insv', track(0, 2880), track(1, 2880))],
      {
        fileLayout: FileLayoutHint.MultiTrack,
      },
    );
    expect(layout.kind).toBe('multi-track');
    expect(layout.sources).toEqual([
      { lensIndex: 0, inputIndex: 0, trackIndex: 0, region: FULL_FRAME },
      { lensIndex: 1, inputIndex: 0, trackIndex: 1, region: FULL_FRAME },
    ]);
    expect(layout.evidence).toEqual([
      'one input with two video tracks',
      'info record file layout 2',
    ]);
  });

  it('records only the track evidence when the info record has no layout field', () => {
    const layout = detectLensLayout([input('clip.insv', track(0, 3840), track(1, 3840))], {
      fileLayout: undefined,
    });
    expect(layout.evidence).toEqual(['one input with two video tracks']);
  });

  it('maps a _00_/_10_ pair onto the lenses with the _00_ file first, whatever order they are given in (X3)', () => {
    const layout = detectLensLayout(
      [
        input('VID_20240101_120000_10_001.insv', track(0, 2880)),
        input('VID_20240101_120000_00_001.insv', track(0, 2880)),
      ],
      { fileLayout: FileLayoutHint.SplitFiles },
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

  it('keeps the given order for a pair of unnamed inputs', () => {
    const layout = detectLensLayout(
      [input(undefined, track(0, 2880)), input(undefined, track(0, 2880))],
      {
        fileLayout: undefined,
      },
    );
    expect(layout.sources.map((source) => source.inputIndex)).toEqual([0, 1]);
    expect(layout.evidence[0]).toBe('two inputs with one video track each (?, ?)');
  });

  it('splits a single 2:1 track into left and right halves (packed modes, LRV)', () => {
    const layout = detectLensLayout(
      [input('LRV_20260814_132640_01_013.lrv', { ...track(0, 1664, 832), codec: 'avc1.640028' })],
      {
        fileLayout: undefined,
      },
    );
    expect(layout.kind).toBe('packed');
    expect(layout.sources.map((source) => source.region)).toEqual([LEFT_HALF, RIGHT_HALF]);
    expect(layout.evidence).toEqual(['single 1664x832 track with a 2:1 aspect ratio']);
  });

  it.each([
    [
      'only the _00_ half of a pair is given',
      [input('VID_20240101_120000_00_001.insv', track(0, 2880))],
      { fileLayout: undefined },
    ],
    [
      'the info record says the recording is split',
      [input('clip.insv', track(0, 2880))],
      { fileLayout: FileLayoutHint.SplitFiles },
    ],
  ])('asks for the second file when %s', (_case, inputs, hints) => {
    expect(captureError(() => detectLensLayout(inputs, hints))).toMatchObject({
      code: 'missing-second-file',
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
    ['no inputs at all', []],
  ])('rejects %s as an unsupported layout', (_case, inputs) => {
    expect(captureError(() => detectLensLayout(inputs, { fileLayout: undefined }))).toMatchObject({
      code: 'unsupported-layout',
    });
  });

  it('names the track shapes in the unsupported-layout message', () => {
    const error = captureError(() =>
      detectLensLayout([input('clip.mp4', track(0, 1920, 1080))], { fileLayout: undefined }),
    );
    expect(error).toMatchObject({ message: expect.stringContaining('1920x1080') as string });
  });
});
