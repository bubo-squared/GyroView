import {
  GyroViewError,
  seconds,
  type EncodedVideoPacket,
  type VideoDecoderConfiguration,
  type VideoTrackDescription,
  type VideoTrackReader,
} from '@gyroview/core';
import { EncodedPacketSink, type EncodedPacket, type InputVideoTrack } from 'mediabunny';

/**
 * VideoTrackReader over one mediabunny video track. Packets handed out are plain data; the
 * mediabunny packet behind each is remembered so iteration can resume from it.
 */
export class MediabunnyVideoTrackReader implements VideoTrackReader {
  private readonly sink: EncodedPacketSink;
  private readonly originals = new WeakMap<EncodedVideoPacket, EncodedPacket>();

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
        'unsupported-layout',
        `video track ${trackIndex} has an unknown codec`,
      );
    }
    return new MediabunnyVideoTrackReader(track, { trackIndex, codedWidth, codedHeight, codec });
  }

  public async decoderConfiguration(): Promise<VideoDecoderConfiguration> {
    const config = await this.track.getDecoderConfig();
    if (config === null) {
      throw new GyroViewError(
        'unsupported-layout',
        `video track ${this.description.trackIndex} (${this.description.codec}) cannot be configured for decoding`,
      );
    }
    return {
      codec: config.codec,
      codedWidth: config.codedWidth ?? this.description.codedWidth,
      codedHeight: config.codedHeight ?? this.description.codedHeight,
      description: config.description === undefined ? undefined : toBytes(config.description),
      isFullRange: config.colorSpace?.fullRange ?? undefined,
    };
  }

  public async keyPacketAt(time: number): Promise<EncodedVideoPacket | undefined> {
    const packet = await this.sink.getKeyPacket(time, { verifyKeyPackets: true });
    return packet === null ? undefined : this.wrap(packet);
  }

  public async *packetsFrom(start: EncodedVideoPacket): AsyncIterable<EncodedVideoPacket> {
    const original = this.originals.get(start);
    if (!original) {
      throw new GyroViewError(
        'invariant-violation',
        'packetsFrom needs a packet handed out by this reader',
      );
    }
    for await (const packet of this.sink.packets(original)) yield this.wrap(packet);
  }

  public async sampleTimestamps(): Promise<readonly number[]> {
    const timestamps: number[] = [];
    const metadataOnly = this.sink.packets(undefined, undefined, { metadataOnly: true });
    for await (const packet of metadataOnly) timestamps.push(packet.timestamp);
    return timestamps.toSorted((left, right) => left - right);
  }

  public async frameCount(): Promise<number> {
    const stats = await this.track.computePacketStats();
    return stats.packetCount;
  }

  private wrap(packet: EncodedPacket): EncodedVideoPacket {
    const wrapped: EncodedVideoPacket = {
      timestamp: seconds(packet.timestamp),
      duration: seconds(packet.duration),
      isKeyFrame: packet.type === 'key',
      data: packet.data,
    };
    this.originals.set(wrapped, packet);
    return wrapped;
  }
}

/**
 * Copies a buffer source into a plain Uint8Array without naming SharedArrayBuffer, which
 * browsers only define under cross-origin isolation.
 */
function toBytes(source: AllowSharedBufferSource): Uint8Array {
  return ArrayBuffer.isView(source)
    ? new Uint8Array(source.buffer, source.byteOffset, source.byteLength)
    : new Uint8Array(source);
}
