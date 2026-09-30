/**
 * The MP4 boxes the player reads or refuses, by the names ISO/IEC 14496-12 gives them.
 */
export const Mp4BoxType = {
  FileType: 'ftyp',
  MediaData: 'mdat',
  Movie: 'moov',
  MovieHeader: 'mvhd',
  MovieExtends: 'mvex',
  Track: 'trak',
  TrackHeader: 'tkhd',
  Edit: 'edts',
  EditList: 'elst',
  Media: 'mdia',
  MediaHeader: 'mdhd',
  Handler: 'hdlr',
  MediaInformation: 'minf',
  SampleTable: 'stbl',
  SampleDescription: 'stsd',
  TimeToSample: 'stts',
  CompositionOffset: 'ctts',
  SyncSample: 'stss',
  SampleToChunk: 'stsc',
  SampleSize: 'stsz',
  ChunkOffset: 'stco',
  ChunkLargeOffset: 'co64',
  AvcConfiguration: 'avcC',
  HevcConfiguration: 'hvcC',
} as const;

/**
 * A track's handler type (ISO/IEC 14496-12 §8.4.3): what its samples are. Tracks of any other
 * handler (timed metadata, hints) are not played.
 */
export const HandlerType = {
  Video: 'vide',
  Sound: 'soun',
} as const;

/**
 * The sample entries of the codecs the cameras record, by family: the parameter sets travel in
 * the sample entry (`avc1`, `hvc1`) or in the stream as well (`avc3`, `hev1`); ISO/IEC 14496-15.
 */
export const AVC_SAMPLE_ENTRIES: readonly string[] = ['avc1', 'avc3'];
export const HEVC_SAMPLE_ENTRIES: readonly string[] = ['hvc1', 'hev1'];
