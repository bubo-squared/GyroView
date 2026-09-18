import { describe, expect, it } from 'vitest';

import { FULL_FRAME, LEFT_HALF, RIGHT_HALF } from './LensLayout';
import { FileLayoutHint, LensLayoutDetector } from './LensLayoutDetector';
import type { InputDescription, VideoTrackDescription } from './VideoTrackDescription';
import { captureError } from '../../../../test/support/errors';

const detector = new LensLayoutDetector();

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

describe('LensLayoutDetector', () => {
  it('maps two square tracks in one file onto the two lenses in track order (X4/X5)', () => {
    const layout = detector.detect(
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
    expect(layout.evidence).toContain('info record file layout 2');
  });

  it('maps a _00_/_10_ pair onto the lenses with the _00_ file first, whatever order they are given in (X3)', () => {
    const layout = detector.detect(
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
  });

  it('keeps the given order for a pair of unnamed inputs', () => {
    const layout = detector.detect(
      [input(undefined, track(0, 2880)), input(undefined, track(0, 2880))],
      {
        fileLayout: undefined,
      },
    );
    expect(layout.sources.map((source) => source.inputIndex)).toEqual([0, 1]);
  });

  it('splits a single 2:1 track into left and right halves (packed modes, LRV)', () => {
    const layout = detector.detect(
      [input('LRV_20260814_132640_01_013.lrv', { ...track(0, 1664, 832), codec: 'avc1.640028' })],
      {
        fileLayout: undefined,
      },
    );
    expect(layout.kind).toBe('packed');
    expect(layout.sources.map((source) => source.region)).toEqual([LEFT_HALF, RIGHT_HALF]);
    expect(layout.evidence[0]).toContain('1664x832');
  });

  it('asks for the second file when only the _00_ half of a pair is given', () => {
    const error = captureError(() =>
      detector.detect([input('VID_20240101_120000_00_001.insv', track(0, 2880))], {
        fileLayout: undefined,
      }),
    );
    expect(error).toMatchObject({ code: 'missing-second-file' });
  });

  it('asks for the second file when the info record says the recording is split', () => {
    const error = captureError(() =>
      detector.detect([input('clip.insv', track(0, 2880))], {
        fileLayout: FileLayoutHint.SplitFiles,
      }),
    );
    expect(error).toMatchObject({ code: 'missing-second-file' });
  });

  it('rejects shapes it cannot map onto two lenses', () => {
    expect(
      captureError(() =>
        detector.detect([input('clip.mp4', track(0, 1920, 1080))], { fileLayout: undefined }),
      ),
    ).toMatchObject({
      code: 'unsupported-layout',
      message: expect.stringContaining('1920x1080') as string,
    });
    expect(
      captureError(() =>
        detector.detect([input('a', track(0, 2880), track(1, 2880), track(2, 2880))], {
          fileLayout: undefined,
        }),
      ),
    ).toMatchObject({
      code: 'unsupported-layout',
    });
    expect(captureError(() => detector.detect([], { fileLayout: undefined }))).toMatchObject({
      code: 'unsupported-layout',
    });
  });
});
