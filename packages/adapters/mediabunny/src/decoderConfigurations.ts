import type {
  AudioDecoderConfiguration,
  VideoDecoderConfiguration,
  VideoTrackDescription,
} from '@gyroview/core';

import { copyOfBytes } from './bufferSources';

/**
 * A WebCodecs video decoder configuration in the core's terms; the coded size comes from the
 * track where the configuration leaves it out, the colour from the track's description.
 */
export function videoConfigurationOf(
  config: VideoDecoderConfig,
  description: Pick<VideoTrackDescription, 'codedWidth' | 'codedHeight' | 'colour'>,
): VideoDecoderConfiguration {
  return {
    codec: config.codec,
    codedWidth: config.codedWidth ?? description.codedWidth,
    codedHeight: config.codedHeight ?? description.codedHeight,
    description: config.description === undefined ? undefined : copyOfBytes(config.description),
    colour: description.colour,
  };
}

/**
 * A WebCodecs audio decoder configuration in the core's terms.
 */
export function audioConfigurationOf(config: AudioDecoderConfig): AudioDecoderConfiguration {
  return {
    codec: config.codec,
    sampleRate: config.sampleRate,
    numberOfChannels: config.numberOfChannels,
    description: config.description === undefined ? undefined : copyOfBytes(config.description),
  };
}
