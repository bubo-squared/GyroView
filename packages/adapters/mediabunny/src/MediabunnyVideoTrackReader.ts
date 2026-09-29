import {
  GyroViewError,
  seconds,
  type EncodedVideoPacket,
  type KeyframeTime,
  type Seconds,
  type VideoDecoderConfiguration,
  type VideoTrackDescription,
  type VideoTrackReader,
} from '@gyroview/core';
import { EncodedPacketSink, type EncodedPacket, type InputVideoTrack } from 'mediabunny';

import { copyOfBytes } from './bufferSources';

/**
 * Container metadata may mark a packet as a key packet that is not one; the bitstream decides.
 */
const VERIFIED = { verifyKeyPackets: true };

const DONE: IteratorReturnResult<undefined> = { done: true, value: undefined };

/**
 * VideoTrackReader over one mediabunny video track; the packets it hands out are plain data.
 */
export class MediabunnyVideoTrackReader implements VideoTrackReader {
  private readonly sink: EncodedPacketSink;

  private constructor(
    private readonly track: InputVideoTrack,
    public readonly description: VideoTrackDescription,
  ) {
    this.sink = new EncodedPacketSink(track);
  }

  public static async open(
    track: InputVideoTrack,
    trackIndex: number,
  ): Promise<MediabunnyVideoTrackReader> {
    const [codec, codedWidth, codedHeight] = await Promise.all([
      track.getCodecParameterString(),
      track.getCodedWidth(),
      track.getCodedHeight(),
    ]);
    if (codec === null) {
      throw new GyroViewError(
        'codec-unsupported',
        `video track ${trackIndex} has an unknown codec`,
      );
    }
    return new MediabunnyVideoTrackReader(track, { trackIndex, codedWidth, codedHeight, codec });
  }

  public async decoderConfiguration(): Promise<VideoDecoderConfiguration> {
    const config = await this.track.getDecoderConfig();
    if (config === null) {
      throw new GyroViewError(
        'codec-unsupported',
        `video track ${this.description.trackIndex} (${this.description.codec}) cannot be configured for decoding`,
      );
    }
    return {
      codec: config.codec,
      codedWidth: config.codedWidth ?? this.description.codedWidth,
      codedHeight: config.codedHeight ?? this.description.codedHeight,
      description: config.description === undefined ? undefined : copyOfBytes(config.description),
      isFullRange: config.colorSpace?.fullRange ?? undefined,
    };
  }

  public async keyframeAt(time: Seconds): Promise<KeyframeTime | undefined> {
    return timeOf(await this.sink.getKeyPacket(time, VERIFIED));
  }

  public async firstKeyframe(): Promise<KeyframeTime | undefined> {
    return timeOf(await this.sink.getFirstKeyPacket(VERIFIED));
  }

  public packetsFrom(time: Seconds): AsyncIterable<EncodedVideoPacket> {
    return {
      [Symbol.asyncIterator]: (): AsyncIterator<EncodedVideoPacket> =>
        new PacketCursor(() => this.packetsFromKeyAt(time)),
    };
  }

  public async sampleTimestamps(): Promise<readonly Seconds[]> {
    const timestamps: Seconds[] = [];
    const metadataOnly = this.sink.packets(undefined, undefined, { metadataOnly: true });
    for await (const packet of metadataOnly) timestamps.push(seconds(packet.timestamp));
    return timestamps.toSorted((left, right) => left - right);
  }

  public async frameCount(): Promise<number> {
    const stats = await this.track.computePacketStats();
    return stats.packetCount;
  }

  private async packetsFromKeyAt(time: Seconds): Promise<AsyncIterator<EncodedPacket>> {
    const start =
      (await this.sink.getKeyPacket(time, VERIFIED)) ??
      (await this.sink.getFirstKeyPacket(VERIFIED));
    if (start === null) {
      throw new GyroViewError(
        'no-key-frame',
        `track ${this.description.trackIndex} has no key frame`,
      );
    }
    return this.sink.packets(start)[Symbol.asyncIterator]();
  }
}

/**
 * One iteration over mediabunny's packets, opened on the first packet asked for. Returning it
 * returns mediabunny's own iterator, which ends a read awaited meanwhile; mediabunny stops
 * reading ahead for it at once.
 */
class PacketCursor implements AsyncIterator<EncodedVideoPacket> {
  private packets: AsyncIterator<EncodedPacket> | undefined;
  private isOpen = true;

  public constructor(private readonly open: () => Promise<AsyncIterator<EncodedPacket>>) {}

  public async next(): Promise<IteratorResult<EncodedVideoPacket>> {
    this.packets ??= await this.open();
    if (this.wasReturned()) return this.returnPackets();
    const result = await this.packets.next();
    return result.done === true || this.wasReturned()
      ? DONE
      : { done: false, value: plainPacketOf(result.value) };
  }

  public async return(): Promise<IteratorResult<EncodedVideoPacket>> {
    this.isOpen = false;
    return this.returnPackets();
  }

  /**
   * Asked afresh after every wait: a return may come while a packet is awaited.
   */
  private wasReturned(): boolean {
    return !this.isOpen;
  }

  private async returnPackets(): Promise<IteratorReturnResult<undefined>> {
    await this.packets?.return?.();
    return DONE;
  }
}

function plainPacketOf(packet: EncodedPacket): EncodedVideoPacket {
  return {
    timestamp: seconds(packet.timestamp),
    duration: seconds(packet.duration),
    isKeyFrame: packet.type === 'key',
    data: packet.data,
  };
}

function timeOf(packet: EncodedPacket | null): KeyframeTime | undefined {
  return packet === null
    ? undefined
    : { timestamp: seconds(packet.timestamp), duration: seconds(packet.duration) };
}
