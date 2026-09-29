import type {
  AudioDecoderConfiguration,
  VideoDecoderConfiguration,
  VideoTrackDescription,
} from '@gyroview/core';

import { copyOfBytes } from './bufferSources';

/**
 * A WebCodecs video decoder configuration in the core's terms; the coded size comes from the
 * track where the configuration leaves it out.
 */
export function videoConfigurationOf(
  config: VideoDecoderConfig,
  description: Pick<VideoTrackDescription, 'codedWidth' | 'codedHeight'>,
): VideoDecoderConfiguration {
  return {
    codec: config.codec,
    codedWidth: config.codedWidth ?? description.codedWidth,
    codedHeight: config.codedHeight ?? description.codedHeight,
    description: config.description === undefined ? undefined : copyOfBytes(config.description),
    isFullRange: config.colorSpace?.fullRange ?? undefined,
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
