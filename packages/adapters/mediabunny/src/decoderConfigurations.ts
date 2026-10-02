import {
  hevcCodecStringOf,
  type AudioDecoderConfiguration,
  type VideoDecoderConfiguration,
  type VideoTrackDescription,
} from '@gyroview/core';
import type { InputVideoTrack } from 'mediabunny';

import { copyOfBytes } from './bufferSources';

/**
 * The sample entry types an HEVC track's codec string begins with (ISO/IEC 14496-15 §8.4.1,
 * Annex E.3). An encrypted track's entry, `encv`, names its protection instead.
 */
const HEVC_SAMPLE_ENTRY_TYPES: ReadonlySet<string> = new Set(['hvc1', 'hev1']);

/**
 * A video track's codec string: mediabunny's, but for an HEVC track, whose codec mediabunny
 * names from the configuration's header alone, the core's, which reads a blank header's SPS.
 */
export async function codecStringOf(
  track: Pick<InputVideoTrack, 'getCodec' | 'getInternalCodecId'>,
  config: VideoDecoderConfig,
): Promise<string> {
  const [codec, sampleEntryType] = await Promise.all([
    track.getCodec(),
    track.getInternalCodecId(),
  ]);
  const isHevcSampleEntry =
    codec === 'hevc' &&
    typeof sampleEntryType === 'string' &&
    HEVC_SAMPLE_ENTRY_TYPES.has(sampleEntryType);
  return isHevcSampleEntry && config.description !== undefined
    ? hevcCodecStringOf(sampleEntryType, copyOfBytes(config.description))
    : config.codec;
}

/**
 * A WebCodecs video decoder configuration in the core's terms; the codec string and the colour
 * come from the track's description, the coded size from the track where the configuration
 * leaves it out.
 */
export function videoConfigurationOf(
  config: VideoDecoderConfig,
  description: Pick<VideoTrackDescription, 'codec' | 'codedWidth' | 'codedHeight' | 'colour'>,
): VideoDecoderConfiguration {
  return {
    codec: description.codec,
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
