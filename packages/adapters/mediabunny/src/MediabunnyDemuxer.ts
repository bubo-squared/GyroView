import {
  ByteRange,
  GyroViewError,
  seconds,
  type DemuxedInput,
  type Demuxer,
  type RandomAccessSource,
} from '@gyroview/core';
import { ALL_FORMATS, CustomSource, Input } from 'mediabunny';

import { MediabunnyAudioTrackReader } from './MediabunnyAudioTrackReader';
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
            'unsupported-container',
            `${name ?? 'the input'} is not a readable media file`,
            { cause: error },
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
      audioTracks.map((track, trackIndex) => MediabunnyAudioTrackReader.open(track, trackIndex)),
    ),
    dispose: (): void => {
      input.dispose();
    },
  };
}
