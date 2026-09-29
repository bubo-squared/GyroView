import {
  GyroViewError,
  isAbortError,
  type AudioTrackCodec,
  type CodecReader,
  type ContainerCodecs,
  type VideoTrackCodec,
} from '@gyroview/core';
import {
  ALL_FORMATS,
  BufferSource,
  Input,
  type InputAudioTrack,
  type InputVideoTrack,
} from 'mediabunny';

import { audioConfigurationOf, videoConfigurationOf } from './decoderConfigurations';

/**
 * CodecReader over mediabunny: opens the file type and movie boxes as a file of their own, in
 * memory, and tells each track's decoder configuration. mediabunny reads a sample only for a
 * video codec without its configuration box; the samples are not there, so that track is
 * refused.
 */
export class MediabunnyCodecReader implements CodecReader {
  public async read(movieBytes: Uint8Array): Promise<ContainerCodecs> {
    const input = new Input({ formats: ALL_FORMATS, source: new BufferSource(movieBytes) });
    try {
      const [videoTracks, audioTracks] = await Promise.all([
        input.getVideoTracks(),
        input.getAudioTracks(),
      ]);
      const video = await Promise.all(
        videoTracks.map((track, index) => videoCodecOf(track, index)),
      );
      const audio = await Promise.all(audioTracks.map((track) => audioCodecOf(track)));
      return { video, audio: audio.flat() };
    } catch (error) {
      throw failureOf(error);
    } finally {
      input.dispose();
    }
  }
}

async function videoCodecOf(track: InputVideoTrack, trackIndex: number): Promise<VideoTrackCodec> {
  const [config, codedWidth, codedHeight] = await Promise.all([
    configurationOrNull(track),
    track.getCodedWidth(),
    track.getCodedHeight(),
  ]);
  if (config === null) {
    throw new GyroViewError(
      'codec-unsupported',
      `video track ${trackIndex} has no decoder configuration in its sample entry`,
    );
  }
  const description = { trackIndex, codedWidth, codedHeight, codec: config.codec };
  return {
    trackId: track.id,
    description,
    configuration: videoConfigurationOf(config, description),
  };
}

/**
 * The configuration of a codec that carries it in the movie box; null for one that would need
 * a sample, which the movie bytes do not hold.
 */
async function configurationOrNull(track: InputVideoTrack): Promise<VideoDecoderConfig | null> {
  try {
    return await track.getDecoderConfig();
  } catch {
    return null;
  }
}

/**
 * An audio track mediabunny cannot configure is left out: the picture then plays without sound
 * rather than not at all.
 */
async function audioCodecOf(track: InputAudioTrack): Promise<AudioTrackCodec[]> {
  const config = await track.getDecoderConfig();
  return config === null
    ? []
    : [{ trackId: track.id, configuration: audioConfigurationOf(config) }];
}

/**
 * A caller's abort and the core's own failures pass as they are; anything else mediabunny
 * throws means the bytes are no movie it can read.
 */
function failureOf(error: unknown): unknown {
  const isPassedOn = isAbortError(error) || error instanceof GyroViewError;
  return isPassedOn
    ? error
    : new GyroViewError('unsupported-container', 'the movie box is not a readable movie', {
        cause: error,
      });
}
