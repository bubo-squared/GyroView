import { describe, expect, it } from 'vitest';

import type { DownloadPolicy } from './DownloadPolicy';
import { isReadyToResume } from './isReadyToResume';
import type { CursorPosition } from './planDownloads';
import { ByteRange } from '../../shared/binary/ByteRange';
import { ByteRangeSet } from '../../shared/binary/ByteRangeSet';
import { seconds } from '../../shared/units/time';
import { cameraRecording } from '../../testing/cameraRecording';

const FRAME_BYTES = 40;
const RECORDING = cameraRecording({
  frames: 30,
  frameBytes: FRAME_BYTES,
  soundBytes: 8,
  frameRate: 10,
  framesPerGop: 10,
});
const SLOT = RECORDING.slotBytes;
const POLICY: DownloadPolicy = {
  aheadSeconds: seconds(10),
  aheadBytes: 100 * SLOT,
  keepBehindBytes: 10 * SLOT,
  requestSize: 10 * SLOT,
  requestsInFlight: 2,
  bridgedGap: SLOT,
  refillBytes: 25 * SLOT,
  resumeSeconds: seconds(1),
};

function picturesAt(frame: number): CursorPosition[] {
  return [RECORDING.lens0, RECORDING.lens1].map((track) => ({
    track,
    sample: frame,
    isWaiting: false,
  }));
}

function heldSlots(from: number, to: number): ByteRangeSet {
  return ByteRangeSet.of([ByteRange.of(from * SLOT, (to - from) * SLOT)]);
}

describe('isReadyToResume', () => {
  it("is ready once every picture reader's frames of the next seconds are held", () => {
    const state = { cursors: picturesAt(10), time: seconds(1), policy: POLICY };
    expect(isReadyToResume({ ...state, held: heldSlots(10, 21) })).toBe(true);
    expect(isReadyToResume({ ...state, held: heldSlots(10, 20) })).toBe(false);
  });

  it('wants none of the sound between the frames', () => {
    const lensFrames = [RECORDING.lens0, RECORDING.lens1].flatMap((track) =>
      Array.from({ length: 11 }, (_, index) => track.rangeOf(15 + index)),
    );
    const state = { cursors: picturesAt(15), time: seconds(1.5), policy: POLICY };
    expect(isReadyToResume({ ...state, held: ByteRangeSet.of(lensFrames) })).toBe(true);
  });

  it('wants of more seconds than the budget holds only what fits in it less a request', () => {
    const policy = { ...POLICY, aheadBytes: 15 * FRAME_BYTES, requestSize: 5 * FRAME_BYTES };
    const state = { cursors: picturesAt(10), time: seconds(1), policy };
    expect(isReadyToResume({ ...state, held: heldSlots(10, 15) })).toBe(true);
    expect(isReadyToResume({ ...state, held: heldSlots(10, 14) })).toBe(false);
  });

  it('wants three quarters of a budget smaller than one request', () => {
    const policy = {
      ...POLICY,
      aheadBytes: 20 * FRAME_BYTES,
      requestSize: 100 * SLOT,
      refillBytes: 5 * FRAME_BYTES,
    };
    const state = { cursors: picturesAt(10), time: seconds(1), policy };
    expect(isReadyToResume({ ...state, held: heldSlots(10, 17) })).toBe(false);
    expect(isReadyToResume({ ...state, held: heldSlots(10, 18) })).toBe(true);
  });

  it('is ready at the end of the tracks once what is left is held', () => {
    const state = { cursors: picturesAt(25), time: seconds(2.5), policy: POLICY };
    expect(isReadyToResume({ ...state, held: heldSlots(25, 30) })).toBe(true);
  });

  it('is ready when the pictures have read past the seconds, or read all', () => {
    const empty = ByteRangeSet.empty;
    expect(
      isReadyToResume({ cursors: picturesAt(29), time: seconds(1), policy: POLICY, held: empty }),
    ).toBe(true);
    expect(
      isReadyToResume({ cursors: picturesAt(30), time: seconds(2), policy: POLICY, held: empty }),
    ).toBe(true);
  });

  it('is ready with no picture reader, the sound buffering by itself', () => {
    const sound = [{ track: RECORDING.sound, sample: 0, isWaiting: true }];
    const state = { cursors: sound, time: seconds(0), policy: POLICY, held: ByteRangeSet.empty };
    expect(isReadyToResume(state)).toBe(true);
  });
});
