import {
  GyroViewError,
  seconds,
  type AudioSampleSource,
  type AudioSegmentSource,
  type EncodedAudioSample,
  type Seconds,
} from '@gyroview/core';
import { EncodedPacketSink, type EncodedPacket, type InputAudioTrack } from 'mediabunny';

import { audioConfigurationOf } from './decoderConfigurations';
import { MediabunnyAudioPackager } from './MediabunnyAudioPackager';
import { PacketCursor } from './PacketCursor';

/**
 * An audio track mediabunny demuxed, re-packaged for the audio clock: its packets served as
 * samples to the packager. Rejects with `codec-unsupported`, naming the track, when it cannot be
 * re-packaged: the picture then plays without sound rather than not at all.
 */
export async function openAudioSegments(
  track: InputAudioTrack,
  trackIndex: number,
): Promise<AudioSegmentSource> {
  const [config, duration] = await Promise.all([track.getDecoderConfig(), track.computeDuration()]);
  if (config === null) {
    const named = (await track.getCodecParameterString()) ?? 'an unknown codec';
    throw new GyroViewError(
      'codec-unsupported',
      `audio track ${trackIndex} (${named}) cannot be re-packaged for playback`,
    );
  }
  const samples = new TrackAudioSamples(track, seconds(duration));
  return new MediabunnyAudioPackager().segmentsOf(samples, audioConfigurationOf(config));
}

/**
 * An audio track's samples as mediabunny reads them from the file.
 */
class TrackAudioSamples implements AudioSampleSource {
  public constructor(
    private readonly track: InputAudioTrack,
    public readonly duration: Seconds,
  ) {}

  public samplesFrom(time: Seconds): AsyncIterable<EncodedAudioSample> {
    return {
      [Symbol.asyncIterator]: (): AsyncIterator<EncodedAudioSample> =>
        new PacketCursor(() => this.packetsFrom(time), sampleOf),
    };
  }

  /**
   * Packets in decode order from the one playing at `time` (or the first one) to the end.
   */
  private async packetsFrom(time: Seconds): Promise<AsyncIterator<EncodedPacket>> {
    const sink = new EncodedPacketSink(this.track);
    const start = (await sink.getPacket(time)) ?? (await sink.getFirstPacket());
    return sink.packets(start ?? undefined)[Symbol.asyncIterator]();
  }
}

function sampleOf(packet: EncodedPacket): EncodedAudioSample {
  return {
    timestamp: seconds(packet.timestamp),
    duration: seconds(packet.duration),
    data: packet.data,
  };
}
