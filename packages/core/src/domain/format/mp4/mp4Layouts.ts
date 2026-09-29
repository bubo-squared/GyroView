/**
 * The layouts of the MP4 boxes that describe a movie's samples, from ISO/IEC 14496-12 (the
 * section is named with each box). Offsets count from the end of the box header and, for a full
 * box, from the end of its version and flags (`FULL_BOX_HEADER_SIZE`). All integers are
 * big-endian.
 */

export type IntegerKind = 'uint16' | 'uint32' | 'uint64' | 'int32' | 'int64';

export interface IntegerField {
  readonly offset: number;
  readonly kind: IntegerKind;
}

/**
 * The time fields of a movie, track or media header in one version: version 1 widens the
 * times to 64 bits. `size` is the whole header after its version and flags.
 */
export interface HeaderTiming {
  readonly timescale: number;
  readonly duration: IntegerField;
  readonly size: number;
}

/**
 * MovieHeaderBox, `mvhd` (§8.2.2): creation and modification times, the movie timescale (in which
 * edit lists count), the duration, then fields the player does not read.
 */
export const MOVIE_HEADER: Readonly<Record<0 | 1, HeaderTiming>> = {
  0: { timescale: 8, duration: { offset: 12, kind: 'uint32' }, size: 96 },
  1: { timescale: 16, duration: { offset: 20, kind: 'uint64' }, size: 108 },
};

/**
 * TrackHeaderBox, `tkhd` (§8.3.2): the track's id sits after the creation and modification times.
 */
export const TRACK_HEADER_ID: Readonly<Record<0 | 1, number>> = { 0: 8, 1: 16 };

/**
 * MediaHeaderBox, `mdhd` (§8.4.2): the timescale the track's sample tables count in.
 */
export const MEDIA_HEADER: Readonly<Record<0 | 1, HeaderTiming>> = {
  0: { timescale: 8, duration: { offset: 12, kind: 'uint32' }, size: 20 },
  1: { timescale: 16, duration: { offset: 20, kind: 'uint64' }, size: 32 },
};

/**
 * HandlerBox, `hdlr` (§8.4.3): a pre-defined zero, the handler type, 12 reserved bytes, a name.
 */
export const HANDLER_TYPE_OFFSET = 4;
export const HANDLER_NAME_OFFSET = 20;

/**
 * Every table box opens with a u32 entry count; its entries follow, `entrySize` bytes each.
 */
export const TABLE_ENTRY_COUNT_OFFSET = 0;
export const TABLE_ENTRIES_OFFSET = 4;

export interface TableLayout<Field extends string> {
  readonly entrySize: number;
  readonly fields: Readonly<Record<Field, IntegerField>>;
}

/**
 * SampleDescriptionBox, `stsd` (§8.5.2): its entries are sample entry boxes.
 */
export const SAMPLE_DESCRIPTION_ENTRIES_OFFSET = TABLE_ENTRIES_OFFSET;

/**
 * TimeToSampleBox, `stts` (§8.6.1.2): runs of samples with the same decode duration.
 */
export const TIME_TO_SAMPLE: TableLayout<'sampleCount' | 'sampleDelta'> = {
  entrySize: 8,
  fields: {
    sampleCount: { offset: 0, kind: 'uint32' },
    sampleDelta: { offset: 4, kind: 'uint32' },
  },
};

/**
 * CompositionOffsetBox, `ctts` (§8.6.1.3): runs of samples presented the same time after (and in
 * version 1, possibly before) they are decoded.
 */
export const COMPOSITION_OFFSET: Readonly<
  Record<0 | 1, TableLayout<'sampleCount' | 'sampleOffset'>>
> = {
  0: {
    entrySize: 8,
    fields: {
      sampleCount: { offset: 0, kind: 'uint32' },
      sampleOffset: { offset: 4, kind: 'uint32' },
    },
  },
  1: {
    entrySize: 8,
    fields: {
      sampleCount: { offset: 0, kind: 'uint32' },
      sampleOffset: { offset: 4, kind: 'int32' },
    },
  },
};

/**
 * SyncSampleBox, `stss` (§8.6.2): the 1-based numbers of the samples decoding may start at. A
 * track without one starts anywhere.
 */
export const SYNC_SAMPLE: TableLayout<'sampleNumber'> = {
  entrySize: 4,
  fields: { sampleNumber: { offset: 0, kind: 'uint32' } },
};

/**
 * EditListBox, `elst` (§8.6.6): segments of the movie timeline, each showing the media from
 * `mediaTime` (media timescale) for `segmentDuration` (movie timescale), or nothing where
 * `mediaTime` is -1.
 */
export const EDIT_LIST: Readonly<
  Record<0 | 1, TableLayout<'segmentDuration' | 'mediaTime' | 'mediaRate'>>
> = {
  0: {
    entrySize: 12,
    fields: {
      segmentDuration: { offset: 0, kind: 'uint32' },
      mediaTime: { offset: 4, kind: 'int32' },
      mediaRate: { offset: 8, kind: 'uint16' },
    },
  },
  1: {
    entrySize: 20,
    fields: {
      segmentDuration: { offset: 0, kind: 'uint64' },
      mediaTime: { offset: 8, kind: 'int64' },
      mediaRate: { offset: 16, kind: 'uint16' },
    },
  },
};
export const EMPTY_EDIT_MEDIA_TIME = -1;

/**
 * SampleToChunkBox, `stsc` (§8.7.4): from each 1-based first chunk on, how many samples a chunk
 * holds, until the next entry's first chunk.
 */
export const SAMPLE_TO_CHUNK: TableLayout<
  'firstChunk' | 'samplesPerChunk' | 'sampleDescriptionIndex'
> = {
  entrySize: 12,
  fields: {
    firstChunk: { offset: 0, kind: 'uint32' },
    samplesPerChunk: { offset: 4, kind: 'uint32' },
    sampleDescriptionIndex: { offset: 8, kind: 'uint32' },
  },
};

/**
 * ChunkOffsetBox, `stco`, and ChunkLargeOffsetBox, `co64` (§8.7.5): where each chunk starts in the
 * file, in 32 or 64 bits.
 */
export const CHUNK_OFFSET: TableLayout<'chunkOffset'> = {
  entrySize: 4,
  fields: { chunkOffset: { offset: 0, kind: 'uint32' } },
};
export const CHUNK_LARGE_OFFSET: TableLayout<'chunkOffset'> = {
  entrySize: 8,
  fields: { chunkOffset: { offset: 0, kind: 'uint64' } },
};

/**
 * SampleSizeBox, `stsz` (§8.7.3.2): a size every sample shares, or zero and then one u32 size per
 * sample.
 */
export const SAMPLE_SIZE_SHARED_OFFSET = 0;
export const SAMPLE_SIZE_COUNT_OFFSET = 4;
export const SAMPLE_SIZE_ENTRIES_OFFSET = 8;
export const SAMPLE_SIZE_ENTRY_SIZE = 4;
export const SAMPLE_SIZE_OF_EACH = 0;

/**
 * SampleEntry (§8.5.2.2): six reserved bytes, then the index of its data reference.
 */
export const SAMPLE_ENTRY_DATA_REFERENCE_OFFSET = 6;

/**
 * VisualSampleEntry (§12.1.3): the coded width and height, and the boxes after its fixed fields
 * (the codec configuration among them).
 */
export const VISUAL_SAMPLE_ENTRY_WIDTH_OFFSET = 24;
export const VISUAL_SAMPLE_ENTRY_HEIGHT_OFFSET = 26;
export const VISUAL_SAMPLE_ENTRY_BOXES_OFFSET = 78;

/**
 * AudioSampleEntry (§12.2.3): the channel count, the sample size, the sample rate in 16.16 fixed
 * point, and the boxes after its fixed fields.
 */
export const AUDIO_SAMPLE_ENTRY_CHANNEL_COUNT_OFFSET = 16;
export const AUDIO_SAMPLE_ENTRY_SAMPLE_SIZE_OFFSET = 18;
export const AUDIO_SAMPLE_ENTRY_SAMPLE_RATE_OFFSET = 24;
export const AUDIO_SAMPLE_ENTRY_BOXES_OFFSET = 28;

/**
 * How many bytes each NAL unit's length takes in a sample, less one: the low two bits of a byte
 * of the AVCDecoderConfigurationRecord (`avcC`) and of the HEVCDecoderConfigurationRecord
 * (`hvcC`), ISO/IEC 14496-15.
 */
export const AVC_LENGTH_SIZE_OFFSET = 4;
export const HEVC_LENGTH_SIZE_OFFSET = 21;
export const LENGTH_SIZE_MINUS_ONE_MASK = 0b11;
