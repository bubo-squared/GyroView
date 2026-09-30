import { describe, expect, it } from 'vitest';

import type { DownloadPolicy } from './DownloadPolicy';
import { planDownloads, type CursorPosition, type DownloadState } from './planDownloads';
import { EVERY_SAMPLE_IS_A_KEYFRAME } from '../container/KeyframeRule';
import { TrackSampleTable, type TrackKind } from '../container/TrackSampleTable';
import { ByteRange } from '../../shared/binary/ByteRange';
import { ByteRangeSet } from '../../shared/binary/ByteRangeSet';
import { seconds } from '../../shared/units/time';

/**
 * A file laid out as the cameras write theirs: per frame, the first lens's frame, a sound
 * sample, then the second lens's frame, one after another.
 */
const FRAME = 60_000;
const SOUND = 500;
const SLOT = 2 * FRAME + SOUND;
const FRAME_DURATION = 1 / 60;
const GOP = 30;

interface CameraFile {
  readonly lens0: TrackSampleTable;
  readonly sound: TrackSampleTable;
  readonly lens1: TrackSampleTable;
}

function trackOf(
  kind: TrackKind,
  frames: number,
  place: { at: number; size: number },
): TrackSampleTable {
  const each = (value: (frame: number) => number): Float64Array =>
    Float64Array.from({ length: frames }, (_, frame) => value(frame));
  return new TrackSampleTable({
    trackId: place.at,
    kind,
    offsets: each((frame) => frame * SLOT + place.at),
    sizes: each(() => place.size),
    timestamps: each((frame) => frame * FRAME_DURATION),
    durations: each(() => FRAME_DURATION),
    syncSamples:
      kind === 'video'
        ? Array.from({ length: Math.ceil(frames / GOP) }, (_, gop) => gop * GOP)
        : undefined,
    end: seconds(frames * FRAME_DURATION),
    keyframeRule: EVERY_SAMPLE_IS_A_KEYFRAME,
  });
}

function cameraFile(frames = 1200): CameraFile {
  return {
    lens0: trackOf('video', frames, { at: 0, size: FRAME }),
    sound: trackOf('audio', frames, { at: FRAME, size: SOUND }),
    lens1: trackOf('video', frames, { at: FRAME + SOUND, size: FRAME }),
  };
}

const POLICY: DownloadPolicy = {
  aheadSeconds: seconds(2),
  aheadBytes: 100 * SLOT,
  keepBehindBytes: 10 * SLOT,
  requestSize: 20 * SLOT,
  requestsInFlight: 2,
  bridgedGap: 2 ** 20,
  refillBytes: 25 * SLOT,
  resumeSeconds: seconds(1),
};

function at(track: TrackSampleTable, sample: number, isWaiting = false): CursorPosition {
  return { track, sample, isWaiting };
}

function everyTrackAt(file: CameraFile, frame: number, isWaiting = false): CursorPosition[] {
  return [
    at(file.lens0, frame, isWaiting),
    at(file.sound, frame, isWaiting),
    at(file.lens1, frame, isWaiting),
  ];
}

function stateOf(parts: Partial<DownloadState>): DownloadState {
  return {
    cursors: [],
    held: ByteRangeSet.empty,
    transfers: [],
    unreadable: ByteRangeSet.empty,
    isReadingAhead: true,
    policy: POLICY,
    ...parts,
  };
}

function slots(from: number, to: number): ByteRange {
  return ByteRange.of(from * SLOT, (to - from) * SLOT);
}

function spansOf(ranges: readonly ByteRange[]): [number, number][] {
  return ranges.map((range) => [range.offset, range.end]);
}

/**
 * Byte spans of whole slots, `[from, to]` in slots each.
 */
function slotSpans(...pairs: (readonly [number, number])[]): [number, number][] {
  return pairs.map(([from, to]) => [from * SLOT, to * SLOT]);
}

function heldSlots(from: number, to: number): ByteRangeSet {
  return ByteRangeSet.of([slots(from, to)]);
}

describe('planDownloads', () => {
  it('before playing, reads nothing while no picture is read, however long the sound waits', () => {
    const file = cameraFile();
    const plan = planDownloads(
      stateOf({
        cursors: [at(file.sound, 0, true)],
        isReadingAhead: false,
        held: heldSlots(0, 10),
        transfers: [{ id: 2, remaining: slots(10, 20) }],
      }),
    );
    expect(plan.start).toEqual([]);
    expect(plan.cancel).toEqual([2]);
    expect(plan.release.isEmpty).toBe(true);
  });

  it('once playing, reads ahead of the sound where no picture was ever read', () => {
    const file = cameraFile();
    const plan = planDownloads(stateOf({ cursors: [at(file.sound, 60, true)] }));
    expect(plan.start[0]?.offset).toBe(60 * SLOT + FRAME);
    expect(plan.anchor).toBeUndefined();
  });

  it('once playing, follows the sound as it moves on where no picture was ever read', () => {
    const file = cameraFile();
    const first = planDownloads(stateOf({ cursors: [at(file.sound, 60, true)] }));
    const later = planDownloads(
      stateOf({ cursors: [at(file.sound, 600, true)], anchor: first.anchor }),
    );
    expect(later.start[0]?.offset).toBe(600 * SLOT + FRAME);
  });

  it('reads the sound where the picture last stood once its readers closed, as after its last frame', () => {
    const file = cameraFile(50);
    const anchor = { time: seconds(50 * FRAME_DURATION), offset: 50 * SLOT };
    const plan = planDownloads(stateOf({ cursors: [at(file.sound, 48, true)], anchor }));
    expect(spansOf(plan.start)).toEqual([[48 * SLOT + FRAME, 49 * SLOT + FRAME + SOUND]]);
    expect(plan.anchor).toEqual(anchor);
  });

  it('reads nothing with no reader at all, even once playing', () => {
    const plan = planDownloads(stateOf({ transfers: [{ id: 4, remaining: slots(0, 10) }] }));
    expect(plan).toMatchObject({ start: [], cancel: [4], anchor: undefined });
  });

  it('stands a picture reader that read all of its track at the end of its last frame', () => {
    const file = cameraFile(50);
    const plan = planDownloads(stateOf({ cursors: [at(file.lens0, 50), at(file.lens1, 50)] }));
    expect(plan.anchor).toEqual({ time: file.lens0.end, offset: 49 * SLOT + FRAME });
  });

  it('stands a picture reader of a track with no frames at the start', () => {
    const empty = trackOf('video', 0, { at: 0, size: FRAME });
    const plan = planDownloads(stateOf({ cursors: [at(empty, 0)] }));
    expect(plan.anchor).toEqual({ time: 0, offset: 0 });
  });

  it('tells where the picture stands, for the plans to come', () => {
    const file = cameraFile();
    const plan = planDownloads(stateOf({ cursors: everyTrackAt(file, 60) }));
    expect(plan.anchor).toEqual({ time: file.lens0.timestampOf(60), offset: 60 * SLOT });
  });

  it('before playing, reads only the frames the picture waits for, with the sound between them', () => {
    const file = cameraFile();
    const plan = planDownloads(
      stateOf({ cursors: everyTrackAt(file, 0, true), isReadingAhead: false }),
    );
    expect(spansOf(plan.start)).toEqual([[0, SLOT]]);
  });

  it('reads the next frame of every picture reader, however far apart and whatever the budget', () => {
    const file = cameraFile();
    const cursors = [at(file.lens0, 0, true), at(file.lens0, 600, true)];
    const beforePlaying = planDownloads(stateOf({ cursors, isReadingAhead: false }));
    expect(spansOf(beforePlaying.start)).toEqual([
      [0, FRAME],
      [600 * SLOT, 600 * SLOT + FRAME],
    ]);
    const playing = planDownloads(stateOf({ cursors, held: heldSlots(0, 121) }));
    expect(spansOf(playing.start)).toEqual([[600 * SLOT, 600 * SLOT + FRAME]]);
  });

  it('reads ahead of the picture in ranges of at most the request size, lowest first, so many at a time', () => {
    const file = cameraFile();
    const plan = planDownloads(stateOf({ cursors: everyTrackAt(file, 0) }));
    expect(spansOf(plan.start)).toEqual(slotSpans([0, 20], [20, 40]));
  });

  it('before playing, reads nothing for readers that do not wait', () => {
    const file = cameraFile();
    const plan = planDownloads(stateOf({ cursors: everyTrackAt(file, 0), isReadingAhead: false }));
    expect(plan.start).toEqual([]);
  });

  it('asks for a range no longer than what is missing, and none that is empty', () => {
    const file = cameraFile();
    const plan = planDownloads(
      stateOf({
        cursors: everyTrackAt(file, 0),
        held: heldSlots(0, 80),
        policy: { ...POLICY, requestsInFlight: 3, refillBytes: 20 * SLOT },
      }),
    );
    expect(spansOf(plan.start)).toEqual(slotSpans([80, 100]));
  });

  it('counts against its budget only the bytes wanted, not the gaps skipped between them', () => {
    const file = cameraFile();
    const policy = { ...POLICY, aheadBytes: 2.5 * FRAME, bridgedGap: 1000, requestsInFlight: 3 };
    const plan = planDownloads(stateOf({ cursors: [at(file.lens0, 0, true)], policy }));
    expect(spansOf(plan.start)).toEqual([
      [0, FRAME],
      [SLOT, SLOT + FRAME],
      [2 * SLOT, 2 * SLOT + FRAME / 2],
    ]);
  });

  it('asks for no more ranges at once than the requests in flight leave room for', () => {
    const file = cameraFile();
    const plan = planDownloads(
      stateOf({ cursors: everyTrackAt(file, 0), transfers: [{ id: 1, remaining: slots(0, 20) }] }),
    );
    expect(spansOf(plan.start)).toEqual(slotSpans([20, 40]));
    expect(plan.cancel).toEqual([]);
  });

  it('reads ahead no further than its bytes allow, nor than its seconds', () => {
    const file = cameraFile();
    const byBytes = planDownloads(
      stateOf({ cursors: everyTrackAt(file, 0), held: heldSlots(0, 60) }),
    );
    expect(spansOf(byBytes.start)).toEqual(slotSpans([60, 80], [80, 100]));
    const bySeconds = planDownloads(
      stateOf({
        cursors: everyTrackAt(file, 0),
        held: heldSlots(0, 30),
        policy: { ...POLICY, aheadSeconds: seconds(1), aheadBytes: 1000 * SLOT },
      }),
    );
    expect(spansOf(bySeconds.start)).toEqual(slotSpans([30, 50], [50, 61]));
  });

  it('gives up a transfer no cursor needs any more and reads from where the picture now is, at once', () => {
    const file = cameraFile();
    const plan = planDownloads(
      stateOf({
        cursors: everyTrackAt(file, 600, true),
        transfers: [{ id: 7, remaining: slots(40, 60) }],
      }),
    );
    expect(plan.cancel).toEqual([7]);
    expect(spansOf(plan.start)).toEqual(slotSpans([600, 620], [620, 640]));
  });

  it('keeps a transfer the window still needs and fills the holes around it', () => {
    const file = cameraFile();
    const plan = planDownloads(
      stateOf({ cursors: everyTrackAt(file, 0), transfers: [{ id: 3, remaining: slots(10, 20) }] }),
    );
    expect(plan.cancel).toEqual([]);
    expect(spansOf(plan.start)).toEqual(slotSpans([0, 10]));
  });

  it('asks for nothing that failed, and reads on past it', () => {
    const file = cameraFile();
    const plan = planDownloads(
      stateOf({ cursors: everyTrackAt(file, 0), unreadable: heldSlots(0, 20) }),
    );
    expect(spansOf(plan.start)).toEqual(slotSpans([20, 40], [40, 60]));
  });

  it('waits to top up until a quarter of its bytes is missing', () => {
    const file = cameraFile();
    const plan = planDownloads(stateOf({ cursors: everyTrackAt(file, 0), held: heldSlots(0, 90) }));
    expect(plan.start).toEqual([]);
  });

  it('tops up once exactly a quarter of its bytes is missing', () => {
    const file = cameraFile();
    const plan = planDownloads(stateOf({ cursors: everyTrackAt(file, 0), held: heldSlots(0, 75) }));
    expect(spansOf(plan.start)).toEqual(slotSpans([75, 95], [95, 100]));
  });

  it('waits to top up while any track read has samples beyond the window', () => {
    const file = cameraFile();
    const shortSound = trackOf('audio', 50, { at: FRAME, size: SOUND });
    const cursors = [at(file.lens0, 0), at(shortSound, 0), at(file.lens1, 0)];
    const plan = planDownloads(stateOf({ cursors, held: heldSlots(0, 90) }));
    expect(plan.start).toEqual([]);
  });

  it('with only sound to follow, waits to top up until a quarter of its bytes is missing', () => {
    const file = cameraFile();
    const plan = planDownloads(
      stateOf({ cursors: [at(file.sound, 60)], held: heldSlots(60, 175) }),
    );
    expect(plan.start).toEqual([]);
  });

  it('reads at once what a waiting cursor misses, however little is missing', () => {
    const file = cameraFile();
    const plan = planDownloads(
      stateOf({
        cursors: everyTrackAt(file, 0, true),
        policy: { ...POLICY, refillBytes: 1000 * SLOT },
      }),
    );
    expect(spansOf(plan.start)).toEqual(slotSpans([0, 20], [20, 40]));
  });

  it('reads the last bytes of the tracks, however few', () => {
    const file = cameraFile(50);
    const plan = planDownloads(
      stateOf({ cursors: everyTrackAt(file, 45), held: heldSlots(45, 48) }),
    );
    expect(spansOf(plan.start)).toEqual(slotSpans([48, 50]));
  });

  it('reads the last bytes once the window reaches the last frame exactly', () => {
    const file = cameraFile(50);
    const policy = { ...POLICY, aheadSeconds: seconds(49 * FRAME_DURATION) };
    const plan = planDownloads(
      stateOf({ cursors: everyTrackAt(file, 0), held: heldSlots(0, 48), policy }),
    );
    expect(spansOf(plan.start)).toEqual(slotSpans([48, 50]));
  });

  it('reads the sound to its end once the picture has read all of its own', () => {
    const file = cameraFile(50);
    const cursors = [at(file.lens0, 50), at(file.lens1, 50), at(file.sound, 48, true)];
    const plan = planDownloads(stateOf({ cursors }));
    expect(spansOf(plan.start)).toEqual([[48 * SLOT + FRAME, 49 * SLOT + FRAME + SOUND]]);
  });

  it('reads no sound beyond the window of the picture', () => {
    const file = cameraFile();
    const cursors = [at(file.lens0, 0), at(file.lens1, 0), at(file.sound, 1000, true)];
    const plan = planDownloads(stateOf({ cursors }));
    expect(plan.start.every((range) => range.end <= 100 * SLOT)).toBe(true);
  });

  it('fetches the unneeded bytes between needed ones when the gap is short, and skips a long one', () => {
    const file = cameraFile();
    const lensAlone = [at(file.lens0, 0)];
    const bridged = planDownloads(stateOf({ cursors: lensAlone }));
    expect(spansOf(bridged.start)).toEqual(slotSpans([0, 20], [20, 40]));
    const skipped = planDownloads(
      stateOf({ cursors: lensAlone, policy: { ...POLICY, bridgedGap: 1000 } }),
    );
    expect(spansOf(skipped.start)).toEqual([
      [0, FRAME],
      [SLOT, SLOT + FRAME],
    ]);
  });

  it('lets go of the bytes behind the kept distance and beyond the window', () => {
    const file = cameraFile();
    const plan = planDownloads(
      stateOf({ cursors: everyTrackAt(file, 50), held: heldSlots(0, 300) }),
    );
    expect(spansOf(plan.release.ranges)).toEqual(slotSpans([0, 40], [150, 300]));
  });

  it('keeps behind the picture only the stretch it keeps, however far in the picture is', () => {
    const file = cameraFile();
    const plan = planDownloads(
      stateOf({ cursors: everyTrackAt(file, 100), held: heldSlots(250, 260) }),
    );
    expect(spansOf(plan.release.ranges)).toEqual(slotSpans([250, 260]));
  });
});
