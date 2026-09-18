import {
  GyroViewError,
  seconds,
  type AudioDecoderConfiguration,
  type AudioTrackDescription,
  type AudioTrackReader,
  type EncodedAudioPacket,
  type Seconds,
} from '@gyroview/core';
import { EncodedPacketSink, type EncodedPacket, type InputAudioTrack } from 'mediabunny';

import { toBytes } from './bufferSources';

const UNKNOWN_CODEC = 'unknown';

/**
 * AudioTrackReader over one mediabunny audio track. An unknown codec is described, not refused:
 * the picture plays without sound rather than not at all.
 */
export class MediabunnyAudioTrackReader implements AudioTrackReader {
  private readonly sink: EncodedPacketSink;

  private constructor(
    private readonly track: InputAudioTrack,
    public readonly description: AudioTrackDescription,
  ) {
    this.sink = new EncodedPacketSink(track);
  }

  public static async open(
    track: InputAudioTrack,
    trackIndex: number,
  ): Promise<MediabunnyAudioTrackReader> {
    const [codec, sampleRate, channelCount] = await Promise.all([
      track.getCodecParameterString(),
      track.getSampleRate(),
      track.getNumberOfChannels(),
    ]);
    return new MediabunnyAudioTrackReader(track, {
      trackIndex,
      codec: codec ?? UNKNOWN_CODEC,
      sampleRate,
      channelCount,
    });
  }

  public async decoderConfiguration(): Promise<AudioDecoderConfiguration> {
    const config = await this.track.getDecoderConfig();
    if (config === null) {
      throw new GyroViewError(
        'codec-unsupported',
        `audio track ${this.description.trackIndex} (${this.description.codec}) cannot be configured for decoding`,
      );
    }
    return {
      codec: config.codec,
      sampleRate: config.sampleRate,
      channelCount: config.numberOfChannels,
      description: config.description === undefined ? undefined : toBytes(config.description),
    };
  }

  public async duration(): Promise<Seconds> {
    return seconds(await this.track.computeDuration());
  }

  public async *packetsFrom(time: Seconds): AsyncIterable<EncodedAudioPacket> {
    const start = (await this.sink.getPacket(time)) ?? (await this.sink.getFirstPacket());
    if (start === null) return;
    for await (const packet of this.sink.packets(start)) yield wrap(packet);
  }
}

function wrap(packet: EncodedPacket): EncodedAudioPacket {
  return {
    timestamp: seconds(packet.timestamp),
    duration: seconds(packet.duration),
    data: packet.data,
  };
}
