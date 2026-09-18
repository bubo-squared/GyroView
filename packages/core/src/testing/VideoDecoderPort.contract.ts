import { describe, expect, it } from 'vitest';

import type { EncodedVideoPacket, VideoTrackReader } from '../ports/Demuxer';
import type { DecodedFrame, VideoDecoderHandle, VideoDecoderPort } from '../ports/VideoDecoderPort';
import { seconds } from '../shared/units/time';

export interface VideoDecoderContractSubject<Handle> {
  readonly port: VideoDecoderPort<Handle>;
  /**
   * A track the port can decode, with at least one delta packet after its first key packet.
   */
  readonly track: VideoTrackReader;
}

interface OpenedDecoder<Handle> {
  readonly decoder: VideoDecoderHandle;
  readonly frames: DecodedFrame<Handle>[];
  readonly errors: Error[];
  readonly key: EncodedVideoPacket;
  readonly delta: EncodedVideoPacket;
}

async function firstTwoPackets(
  track: VideoTrackReader,
): Promise<[key: EncodedVideoPacket, delta: EncodedVideoPacket]> {
  const key = await track.keyPacketAt(seconds(0));
  if (!key) throw new Error('the contract track has no key packet');
  const packets: EncodedVideoPacket[] = [];
  for await (const packet of track.packetsFrom(key)) {
    packets.push(packet);
    if (packets.length === 2) break;
  }
  const [first, second] = packets;
  if (!first || !second || second.isKeyFrame) {
    throw new Error('the contract track needs a delta packet right after its first key packet');
  }
  return [first, second];
}

async function openDecoder<Handle>(
  subject: VideoDecoderContractSubject<Handle>,
): Promise<OpenedDecoder<Handle>> {
  const frames: DecodedFrame<Handle>[] = [];
  const errors: Error[] = [];
  const [key, delta] = await firstTwoPackets(subject.track);
  const decoder = await subject.port.create(await subject.track.decoderConfiguration(), {
    onFrame: (frame): void => {
      frames.push(frame);
    },
    onError: (error): void => {
      errors.push(error);
    },
  });
  return { decoder, frames, errors, key, delta };
}

function closeAll<Handle>(opened: OpenedDecoder<Handle>): void {
  for (const frame of opened.frames) frame.close();
  opened.decoder.close();
}

/**
 * The VideoDecoderPort contract, run against the fake and against every real adapter.
 */
export function describeVideoDecoderPortContract<Handle>(
  name: string,
  setup: () => Promise<VideoDecoderContractSubject<Handle>>,
): void {
  describe(`VideoDecoderPort contract (${name})`, () => {
    it('supports the configuration of a track it can decode', async () => {
      const subject = await setup();
      await expect(
        subject.port.isSupported(await subject.track.decoderConfiguration()),
      ).resolves.toBe(true);
    });

    it('decodes a key packet into one picture carrying its timestamp, and flush drains it', async () => {
      const opened = await openDecoder(await setup());
      opened.decoder.decode(opened.key);
      expect(opened.decoder.pendingCount).toBe(1);
      await opened.decoder.flush();
      expect(opened.decoder.pendingCount).toBe(0);
      expect(opened.frames).toHaveLength(1);
      expect(opened.frames[0]?.timestamp).toBeCloseTo(opened.key.timestamp, 4);
      expect(opened.errors).toEqual([]);
      closeAll(opened);
    });

    it('refuses a delta packet as the first packet after creation and after a reset', async () => {
      const opened = await openDecoder(await setup());
      expect(() => {
        opened.decoder.decode(opened.delta);
      }).toThrow();
      opened.decoder.decode(opened.key);
      opened.decoder.reset();
      expect(opened.decoder.pendingCount).toBe(0);
      expect(() => {
        opened.decoder.decode(opened.delta);
      }).toThrow();
      opened.decoder.decode(opened.key);
      await opened.decoder.flush();
      closeAll(opened);
    });

    it('resolves waitForPendingBelow once the pending count drops under the limit', async () => {
      const opened = await openDecoder(await setup());
      opened.decoder.decode(opened.key);
      await opened.decoder.waitForPendingBelow(1);
      expect(opened.decoder.pendingCount).toBe(0);
      await opened.decoder.flush();
      closeAll(opened);
    });

    it('refuses to decode and rejects flush once closed', async () => {
      const opened = await openDecoder(await setup());
      opened.decoder.close();
      expect(() => {
        opened.decoder.decode(opened.key);
      }).toThrow();
      await expect(opened.decoder.flush()).rejects.toBeDefined();
      await expect(opened.decoder.waitForPendingBelow(1)).resolves.toBeUndefined();
    });
  });
}
