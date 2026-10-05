import {
  GyroViewError,
  isAbortError,
  type AudioTrackCodec,
  type CodecReader,
  type ContainerCodecs,
  type VideoTrackCodec,
} from '@gyroview/core';
import {
  BufferSource,
  Input,
  MP4,
  QTFF,
  type InputAudioTrack,
  type InputVideoTrack,
} from 'mediabunny';

import { audioConfigurationOf, codecStringOf, videoConfigurationOf } from './decoderConfigurations';
import { trackColourOf } from './trackColour';

/**
 * The movie bytes are an ISO BMFF file's type and movie boxes, whatever its brand: with only
 * these two formats named, a page's bundle leaves out mediabunny's other demuxers, a third of
 * its weight.
 */
const MOVIE_FORMATS = [MP4, QTFF];

/**
 * CodecReader over mediabunny: opens the file type and movie boxes as a file of their own, in
 * memory, and tells each track's decoder configuration. mediabunny reads a sample only for a
 * video codec without its configuration box; the samples are not there, so that track is
 * refused as the file's failing.
 */
export class MediabunnyCodecReader implements CodecReader {
  public async read(movieBytes: Uint8Array): Promise<ContainerCodecs> {
    const input = new Input({ formats: MOVIE_FORMATS, source: new BufferSource(movieBytes) });
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
    configurationOf(track, trackIndex),
    track.getCodedWidth(),
    track.getCodedHeight(),
  ]);
  const description = {
    trackIndex,
    codedWidth,
    codedHeight,
    codec: await codecStringOf(track, config),
    colour: trackColourOf(config.colorSpace),
  };
  return {
    trackId: track.id,
    description,
    configuration: videoConfigurationOf(config, description),
  };
}

/**
 * The configuration of a codec that carries it in the movie box. A sample entry without one, or
 * with one mediabunny cannot read, fails as the file's: no browser could configure a decoder from
 * it, and the movie bytes hold no sample to find it in.
 */
async function configurationOf(
  track: InputVideoTrack,
  trackIndex: number,
): Promise<VideoDecoderConfig> {
  let config: VideoDecoderConfig | null;
  try {
    config = await track.getDecoderConfig();
  } catch (error) {
    throw noConfiguration(trackIndex, { cause: error });
  }
  if (config === null) throw noConfiguration(trackIndex);
  return config;
}

function noConfiguration(trackIndex: number, options?: ErrorOptions): GyroViewError {
  return new GyroViewError(
    'unsupported-container',
    `video track ${trackIndex} has no decoder configuration in its sample entry`,
    options,
  );
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
