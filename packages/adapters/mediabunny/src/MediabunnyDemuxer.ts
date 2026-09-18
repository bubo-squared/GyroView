import {
  ByteRange,
  GyroViewError,
  seconds,
  type AudioTrackDescription,
  type DemuxedInput,
  type Demuxer,
  type RandomAccessSource,
} from '@gyroview/core';
import { ALL_FORMATS, CustomSource, Input, type InputAudioTrack } from 'mediabunny';

import { MediabunnyVideoTrackReader } from './MediabunnyVideoTrackReader';

/**
 * Demuxer over mediabunny. Bytes flow through the core's RandomAccessSource port (one HTTP
 * client, one cache), presented to mediabunny as a CustomSource with network prefetching.
 */
export class MediabunnyDemuxer implements Demuxer {
  public async open(source: RandomAccessSource, name?: string): Promise<DemuxedInput> {
    const input = new Input({
      formats: ALL_FORMATS,
      source: new CustomSource({
        getSize: (): Promise<number> => source.size(),
        read: (start, end): Promise<Uint8Array> => source.read(ByteRange.of(start, end - start)),
        prefetchProfile: 'network',
      }),
    });
    try {
      return await describeInput(input, name);
    } catch (error) {
      input.dispose();
      throw error instanceof GyroViewError
        ? error
        : new GyroViewError(
            'unsupported-layout',
            `${name ?? 'the input'} is not a readable media file`,
            {
              cause: error,
            },
          );
    }
  }
}

async function describeInput(input: Input, name: string | undefined): Promise<DemuxedInput> {
  const [videoTracks, audioTracks, duration] = await Promise.all([
    input.getVideoTracks(),
    input.getAudioTracks(),
    input.computeDuration(),
  ]);
  return {
    name,
    duration: seconds(duration),
    videoTracks: await Promise.all(
      videoTracks.map((track, trackIndex) => MediabunnyVideoTrackReader.open(track, trackIndex)),
    ),
    audioTracks: await Promise.all(
      audioTracks.map((track, trackIndex) => describeAudio(track, trackIndex)),
    ),
    dispose: (): void => {
      input.dispose();
    },
  };
}

async function describeAudio(
  track: InputAudioTrack,
  trackIndex: number,
): Promise<AudioTrackDescription> {
  const [codec, sampleRate, channelCount] = await Promise.all([
    track.getCodecParameterString(),
    track.getSampleRate(),
    track.getNumberOfChannels(),
  ]);
  return { trackIndex, codec: codec ?? 'unknown', sampleRate, channelCount };
}
