import {
  AUDIO_SAMPLE_ENTRY_BOXES_OFFSET,
  AUDIO_SAMPLE_ENTRY_CHANNEL_COUNT_OFFSET,
  AUDIO_SAMPLE_ENTRY_SAMPLE_RATE_OFFSET,
  AUDIO_SAMPLE_ENTRY_SAMPLE_SIZE_OFFSET,
  SAMPLE_ENTRY_DATA_REFERENCE_OFFSET,
  VISUAL_SAMPLE_ENTRY_BOXES_OFFSET,
  VISUAL_SAMPLE_ENTRY_HEIGHT_OFFSET,
  VISUAL_SAMPLE_ENTRY_WIDTH_OFFSET,
} from '../../domain/format/mp4/mp4Layouts';
import { encodeBox } from '../encodeBox';

/**
 * The fixed values a VisualSampleEntry carries (ISO/IEC 14496-12 §12.1.3): 72 dpi in 16.16 fixed
 * point both ways, one frame per sample, 24-bit colour and a pre-defined -1.
 */
const RESOLUTION_72_DPI = 0x00_48_00_00;
const HORIZONTAL_RESOLUTION_OFFSET = 28;
const VERTICAL_RESOLUTION_OFFSET = 32;
const FRAME_COUNT_OFFSET = 40;
const FRAMES_PER_SAMPLE = 1;
const DEPTH_OFFSET = 74;
const DEPTH_24_BIT_COLOUR = 0x00_18;
const VISUAL_PRE_DEFINED_OFFSET = 76;
const PRE_DEFINED_MINUS_ONE = -1;
/**
 * The first entry of the track's data references: the file itself.
 */
const DATA_REFERENCE_INDEX = 1;
const BITS_PER_AUDIO_SAMPLE = 16;
const ONE_IN_16_16 = 0x1_00_00;

export interface VideoSampleEntrySpec {
  readonly type: string;
  readonly width: number;
  readonly height: number;
  /**
   * The codec configuration box (`avcC`, `hvcC`), whole.
   */
  readonly configuration: Uint8Array;
}

export interface AudioSampleEntrySpec {
  readonly type: string;
  readonly channelCount: number;
  readonly sampleRate: number;
  /**
   * The codec configuration box (`esds` for AAC), whole.
   */
  readonly configuration: Uint8Array;
}

export function videoSampleEntry(spec: VideoSampleEntrySpec): Uint8Array {
  const payload = sampleEntryPayload(VISUAL_SAMPLE_ENTRY_BOXES_OFFSET, spec.configuration);
  const view = new DataView(payload.buffer);
  view.setUint16(VISUAL_SAMPLE_ENTRY_WIDTH_OFFSET, spec.width);
  view.setUint16(VISUAL_SAMPLE_ENTRY_HEIGHT_OFFSET, spec.height);
  view.setUint32(HORIZONTAL_RESOLUTION_OFFSET, RESOLUTION_72_DPI);
  view.setUint32(VERTICAL_RESOLUTION_OFFSET, RESOLUTION_72_DPI);
  view.setUint16(FRAME_COUNT_OFFSET, FRAMES_PER_SAMPLE);
  view.setUint16(DEPTH_OFFSET, DEPTH_24_BIT_COLOUR);
  view.setInt16(VISUAL_PRE_DEFINED_OFFSET, PRE_DEFINED_MINUS_ONE);
  return encodeBox(spec.type, payload);
}

export function audioSampleEntry(spec: AudioSampleEntrySpec): Uint8Array {
  const payload = sampleEntryPayload(AUDIO_SAMPLE_ENTRY_BOXES_OFFSET, spec.configuration);
  const view = new DataView(payload.buffer);
  view.setUint16(AUDIO_SAMPLE_ENTRY_CHANNEL_COUNT_OFFSET, spec.channelCount);
  view.setUint16(AUDIO_SAMPLE_ENTRY_SAMPLE_SIZE_OFFSET, BITS_PER_AUDIO_SAMPLE);
  view.setUint32(AUDIO_SAMPLE_ENTRY_SAMPLE_RATE_OFFSET, spec.sampleRate * ONE_IN_16_16);
  return encodeBox(spec.type, payload);
}

/**
 * The fixed fields (zeros but for the data reference) followed by the configuration box.
 */
function sampleEntryPayload(boxesOffset: number, configuration: Uint8Array): Uint8Array {
  const payload = new Uint8Array(boxesOffset + configuration.byteLength);
  new DataView(payload.buffer).setUint16(SAMPLE_ENTRY_DATA_REFERENCE_OFFSET, DATA_REFERENCE_INDEX);
  payload.set(configuration, boxesOffset);
  return payload;
}
