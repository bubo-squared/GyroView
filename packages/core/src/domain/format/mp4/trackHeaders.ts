import {
  boxesIn,
  fullBoxOf,
  requiredBox,
  unreadableMovie,
  type FullBox,
  type Mp4Box,
} from './movieBoxes';
import { HandlerType, Mp4BoxType } from './mp4BoxTypes';
import {
  AVC_LENGTH_SIZE_OFFSET,
  HANDLER_TYPE_OFFSET,
  HEVC_LENGTH_SIZE_OFFSET,
  LENGTH_SIZE_MINUS_ONE_MASK,
  MEDIA_HEADER,
  MOVIE_HEADER,
  SAMPLE_DESCRIPTION_ENTRIES_OFFSET,
  TRACK_HEADER_ID,
  VISUAL_SAMPLE_ENTRY_BOXES_OFFSET,
} from './mp4Layouts';

const FOUR_CHARACTERS = 4;

/**
 * The boxes of one track the sample table is read from, each walked once.
 */
export interface TrackBoxes {
  readonly track: readonly Mp4Box[];
  readonly media: readonly Mp4Box[];
  readonly sampleTable: readonly Mp4Box[];
}

/**
 * What a track's headers say of it: its id, what its samples are, the timescale its tables count
 * in, and its first sample entry, with the NAL length size of a video codec that has one.
 */
export interface TrackHeaders {
  readonly trackId: number;
  readonly handlerType: string;
  readonly mediaTimescale: number;
  readonly sampleEntryType: string;
  readonly nalLengthSize: number | undefined;
}

/**
 * Where the length size of each codec family's NAL units is kept, by its configuration box.
 */
const LENGTH_SIZE_OFFSETS: ReadonlyMap<string, number> = new Map([
  [Mp4BoxType.AvcConfiguration, AVC_LENGTH_SIZE_OFFSET],
  [Mp4BoxType.HevcConfiguration, HEVC_LENGTH_SIZE_OFFSET],
]);

/**
 * The timescale of the movie header, in which edit lists count.
 */
export function movieTimescaleOf(movie: readonly Mp4Box[]): number {
  const header = fullBoxOf(requiredBox(movie, Mp4BoxType.MovieHeader));
  return header.content.uint32BeAt(
    inVersion(header, MOVIE_HEADER, Mp4BoxType.MovieHeader).timescale,
  );
}

export function trackBoxesOf(trackBox: Mp4Box): TrackBoxes {
  const track = boxesIn(trackBox.body);
  const media = boxesIn(requiredBox(track, Mp4BoxType.Media).body);
  const information = boxesIn(requiredBox(media, Mp4BoxType.MediaInformation).body);
  const sampleTable = boxesIn(requiredBox(information, Mp4BoxType.SampleTable).body);
  return { track, media, sampleTable };
}

export function trackHeadersOf(boxes: TrackBoxes): TrackHeaders {
  const handlerType = handlerTypeOf(boxes.media);
  const entry = firstSampleEntryOf(boxes.sampleTable);
  return {
    trackId: trackIdOf(boxes.track),
    handlerType,
    mediaTimescale: mediaTimescaleOf(boxes.media),
    sampleEntryType: entry.type,
    nalLengthSize: handlerType === HandlerType.Video ? nalLengthSizeOf(entry) : undefined,
  };
}

/**
 * The layout of a box in its version; a version the standard does not define is refused.
 */
export function inVersion<Layout>(
  box: FullBox,
  layouts: Readonly<Record<0 | 1, Layout>>,
  type: string,
): Layout {
  const layout = box.version === 0 || box.version === 1 ? layouts[box.version] : undefined;
  if (layout === undefined) throw unreadableMovie(`has a ${type} box of version ${box.version}`);
  return layout;
}

function trackIdOf(track: readonly Mp4Box[]): number {
  const header = fullBoxOf(requiredBox(track, Mp4BoxType.TrackHeader));
  return header.content.uint32BeAt(inVersion(header, TRACK_HEADER_ID, Mp4BoxType.TrackHeader));
}

function mediaTimescaleOf(media: readonly Mp4Box[]): number {
  const header = fullBoxOf(requiredBox(media, Mp4BoxType.MediaHeader));
  return header.content.uint32BeAt(
    inVersion(header, MEDIA_HEADER, Mp4BoxType.MediaHeader).timescale,
  );
}

function handlerTypeOf(media: readonly Mp4Box[]): string {
  const { content } = fullBoxOf(requiredBox(media, Mp4BoxType.Handler));
  return content.asciiAt(HANDLER_TYPE_OFFSET, FOUR_CHARACTERS);
}

function firstSampleEntryOf(sampleTable: readonly Mp4Box[]): Mp4Box {
  const { content } = fullBoxOf(requiredBox(sampleTable, Mp4BoxType.SampleDescription));
  const entriesLength = content.length - SAMPLE_DESCRIPTION_ENTRIES_OFFSET;
  const [entry] = boxesIn(content.bytesAt(SAMPLE_DESCRIPTION_ENTRIES_OFFSET, entriesLength));
  if (!entry) throw unreadableMovie('has a track without a sample entry');
  return entry;
}

/**
 * The bytes before each NAL unit that give its length, from the codec configuration inside the
 * visual sample entry; undefined for a codec without one (the codec reader then refuses it).
 */
function nalLengthSizeOf(entry: Mp4Box): number | undefined {
  const boxes = boxesIn(entry.body.subarray(VISUAL_SAMPLE_ENTRY_BOXES_OFFSET));
  const configuration = boxes.find((box) => LENGTH_SIZE_OFFSETS.has(box.type));
  const byte = configuration?.body[LENGTH_SIZE_OFFSETS.get(configuration.type) ?? 0];
  return byte === undefined ? undefined : (byte & LENGTH_SIZE_MINUS_ONE_MASK) + 1;
}
