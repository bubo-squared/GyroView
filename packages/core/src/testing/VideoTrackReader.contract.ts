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
    it('finds the key packet at or before a time and none before the first packet', async () => {
      const track = await open();
      const first = await track.keyPacketAt(seconds(start));
      expect(first?.isKeyFrame).toBe(true);
      expect(first?.timestamp).toBeCloseTo(start, 6);
      const key = await track.keyPacketAt(insideSecondGop);
      expect(key?.isKeyFrame).toBe(true);
      expect(key?.timestamp).toBeCloseTo(secondGopStart, 6);
      await expect(track.keyPacketAt(seconds(start - frameDuration))).resolves.toBeUndefined();
    });

    it('hands out its first key packet, from which the whole track iterates', async () => {
      const track = await open();
      const first = await track.firstKeyPacket();
      if (!first) throw new Error('no first key packet');
      expect(first.isKeyFrame).toBe(true);
      expect(first.timestamp).toBeCloseTo(start, 6);
      await expect(collect(track.packetsFrom(first))).resolves.toHaveLength(expected.frameCount);
    });

    it('iterates packets in decode order from a packet it handed out to the end of the track', async () => {
      const track = await open();
      const key = await track.keyPacketAt(insideSecondGop);
      if (!key) throw new Error('no key packet');
      const packets = await collect(track.packetsFrom(key));
      expect(packets).toHaveLength(expected.frameCount - expected.framesPerGop);
      expect(packets[0]?.timestamp).toBeCloseTo(key.timestamp, 6);
      const timestamps = packets.map((packet) => packet.timestamp);
      expect(timestamps).toEqual(timestamps.toSorted((left, right) => left - right));
      expect(timestamps.at(-1)).toBeCloseTo(start + (expected.frameCount - 1) * frameDuration, 4);
    });

    it('refuses to iterate from a packet it did not hand out', async () => {
      const track = await open();
      const key = await track.firstKeyPacket();
      if (!key) throw new Error('no key packet');
      await expect(collect(track.packetsFrom({ ...key }))).rejects.toMatchObject({
        code: 'invariant-violation',
      });
    });

    it('reports the frame count, sorted sample timestamps and a decoder configuration for its codec', async () => {
      const track = await open();
      await expect(track.frameCount()).resolves.toBe(expected.frameCount);
      const timestamps = await track.sampleTimestamps();
      expect(timestamps).toHaveLength(expected.frameCount);
      expect([...timestamps]).toEqual([...timestamps].toSorted((left, right) => left - right));
      const configuration = await track.decoderConfiguration();
      expect(configuration.codec).toBe(track.description.codec);
      expect(configuration.codedWidth).toBe(track.description.codedWidth);
      expect(configuration.codedHeight).toBe(track.description.codedHeight);
    });
  });
}
