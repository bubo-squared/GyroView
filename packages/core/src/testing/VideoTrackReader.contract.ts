import { describe, expect, it } from 'vitest';

import type { VideoTrackReader } from '../ports/Demuxer';
import type { EncodedVideoPacket } from '../ports/VideoTrack';
import { seconds } from '../shared/units/time';

export interface VideoTrackReaderExpectations {
  readonly frameCount: number;
  readonly frameRate: number;
  readonly framesPerGop: number;
  /**
   * When the track's first frame is, in seconds; zero unless an edit list shifts it.
   */
  readonly firstTimestamp?: number;
}

function collect(packets: AsyncIterable<EncodedVideoPacket>): Promise<EncodedVideoPacket[]> {
  return Array.fromAsync(packets);
}

/**
 * The VideoTrackReader port contract, run against the fake and against every real adapter over
 * a track of `frameCount` frames at `frameRate` with a key frame every `framesPerGop`, its first
 * frame at `firstTimestamp`.
 */
export function describeVideoTrackReaderContract(
  name: string,
  open: () => Promise<VideoTrackReader>,
  expected: VideoTrackReaderExpectations,
): void {
  const start = expected.firstTimestamp ?? 0;
  const frameDuration = 1 / expected.frameRate;
  const secondGopStart = start + expected.framesPerGop * frameDuration;
  const insideSecondGop = seconds(secondGopStart + 2 * frameDuration);

  describe(`VideoTrackReader contract (${name})`, () => {
    it('tells when the key frame at or before a time shows, and of none before the first frame', async () => {
      const track = await open();
      const first = await track.keyframeAt(seconds(start));
      expect(first?.timestamp).toBeCloseTo(start, 6);
      const key = await track.keyframeAt(insideSecondGop);
      expect(key?.timestamp).toBeCloseTo(secondGopStart, 6);
      expect(key?.duration).toBeCloseTo(frameDuration, 6);
      await expect(track.keyframeAt(seconds(start - frameDuration))).resolves.toBeUndefined();
    });

    it('tells when its first key frame shows and how long it lasts', async () => {
      const track = await open();
      const first = await track.firstKeyframe();
      expect(first?.timestamp).toBeCloseTo(start, 6);
      expect(first?.duration).toBeCloseTo(frameDuration, 6);
    });

    it('iterates the whole track from a time before its first frame', async () => {
      const track = await open();
      const packets = await collect(track.packetsFrom(seconds(start - frameDuration)));
      expect(packets).toHaveLength(expected.frameCount);
      expect(packets[0]?.isKeyFrame).toBe(true);
      expect(packets[0]?.timestamp).toBeCloseTo(start, 6);
    });

    it('iterates packets in decode order from the key frame at or before a time to the end of the track', async () => {
      const track = await open();
      const packets = await collect(track.packetsFrom(insideSecondGop));
      expect(packets).toHaveLength(expected.frameCount - expected.framesPerGop);
      expect(packets[0]?.isKeyFrame).toBe(true);
      expect(packets[0]?.timestamp).toBeCloseTo(secondGopStart, 6);
      const timestamps = packets.map((packet) => packet.timestamp);
      expect(timestamps).toEqual(timestamps.toSorted((left, right) => left - right));
      expect(timestamps.at(-1)).toBeCloseTo(start + (expected.frameCount - 1) * frameDuration, 4);
    });

    it('lets go of its packets when returned, even while a next packet is awaited', async () => {
      const track = await open();
      const packets = track.packetsFrom(seconds(start))[Symbol.asyncIterator]();
      await packets.next();
      const awaited = packets.next();
      await expect(packets.return?.()).resolves.toMatchObject({ done: true });
      await expect(awaited).resolves.toMatchObject({ done: true });
      await expect(packets.next()).resolves.toMatchObject({ done: true });
    });

    it('reports the frame count, sorted sample timestamps and a decoder configuration for its codec', async () => {
      const track = await open();
      await expect(track.frameCount()).resolves.toBe(expected.frameCount);
      const timestamps = await track.sampleTimestamps();
      expect(timestamps).toHaveLength(expected.frameCount);
      expect(timestamps[0]).toBeCloseTo(start, 6);
      expect([...timestamps]).toEqual([...timestamps].toSorted((left, right) => left - right));
      const configuration = await track.decoderConfiguration();
      expect(configuration.codec).toBe(track.description.codec);
      expect(configuration.codedWidth).toBe(track.description.codedWidth);
      expect(configuration.codedHeight).toBe(track.description.codedHeight);
    });
  });
}
