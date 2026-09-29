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

import { videoConfigurationOf } from './decoderConfigurations';
import { PacketCursor } from './PacketCursor';

/**
 * Container metadata may mark a packet as a key packet that is not one; the bitstream decides.
 */
const VERIFIED = { verifyKeyPackets: true };

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
    return videoConfigurationOf(config, this.description);
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
        new PacketCursor(() => this.packetsFromKeyAt(time), plainPacketOf),
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
