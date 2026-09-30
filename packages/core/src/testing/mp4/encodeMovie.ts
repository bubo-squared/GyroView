import type { FixtureTrack } from './FixtureTrack';
import { concatenated } from '../../shared/binary/concatenated';
import { encodeSampleTable, type ChunkPlacement } from './encodeSampleTable';
import { encodeTable, writeInteger } from './encodeTable';
import { HandlerType, Mp4BoxType } from '../../domain/format/mp4/mp4BoxTypes';
import {
  EDIT_LIST,
  HANDLER_NAME_OFFSET,
  HANDLER_TYPE_OFFSET,
  MEDIA_HEADER,
  MOVIE_HEADER,
  TABLE_ENTRIES_OFFSET,
  UNIT_MEDIA_RATE,
  TABLE_ENTRY_COUNT_OFFSET,
  TRACK_HEADER_ID,
  type HeaderTiming,
  type IntegerField,
} from '../../domain/format/mp4/mp4Layouts';
import { encodeBox, encodeFullBox } from '../encodeBox';
import { encodeAscii } from '../encodeAscii';

export type HeaderVersion = 0 | 1;

export interface PlacedTrack {
  readonly track: FixtureTrack;
  readonly placement: ChunkPlacement;
}

export interface MovieLayout {
  readonly movieTimescale: number;
  readonly headerVersion: HeaderVersion;
}

/**
 * Fields of the movie and track headers the player does not read, but a well-formed file has
 * (ISO/IEC 14496-12 §8.2.2, §8.3.2), counted from the end of each header's duration: a rate and
 * a volume of 1, an identity matrix, a next track id; a track enabled and in the movie.
 */
const ONE_IN_16_16 = 0x00_01_00_00;
const ONE_IN_2_30 = 0x40_00_00_00;
const UNIT_RATE = ONE_IN_16_16;
const UNIT_VOLUME = 0x01_00;
const IDENTITY_MATRIX = [ONE_IN_16_16, 0, 0, 0, ONE_IN_16_16, 0, 0, 0, ONE_IN_2_30];
const MATRIX_ENTRY_SIZE = 4;
const MOVIE_RATE_AFTER_DURATION = 0;
const MOVIE_VOLUME_AFTER_DURATION = 4;
const MOVIE_MATRIX_AFTER_DURATION = 16;
const MOVIE_NEXT_TRACK_ID_AFTER_DURATION = 76;
const TRACK_HEADER: Readonly<Record<HeaderVersion, Omit<HeaderTiming, 'timescale'>>> = {
  0: { duration: { offset: 16, kind: 'uint32' }, size: 80 },
  1: { duration: { offset: 24, kind: 'uint64' }, size: 92 },
};
const TRACK_MATRIX_AFTER_DURATION = 16;
const TRACK_ENABLED_IN_MOVIE = 0x00_00_03;
/**
 * The media header's ISO 639-2 language code, "und" packed in 5 bits a letter (§8.4.2).
 */
const UNDETERMINED_LANGUAGE = 0x55_c4;
const HANDLER_NAME = '\0';
/**
 * A video media header's graphics mode and colour, and a sound one's balance: all zero
 * (§12.1.2, §12.2.2). The video one carries flag 1, as the standard fixes.
 */
const VIDEO_MEDIA_HEADER_SIZE = 8;
const SOUND_MEDIA_HEADER_SIZE = 4;
const VIDEO_MEDIA_HEADER_FLAGS = 1;
/**
 * The media header of a video or a sound track, and one data reference: a `url ` box whose
 * flag 1 says the media is in this file (§8.7.2). The player reads none of them.
 */
const VIDEO_MEDIA_HEADER = 'vmhd';
const SOUND_MEDIA_HEADER = 'smhd';
const DATA_INFORMATION = 'dinf';
const DATA_REFERENCE = 'dref';
const DATA_ENTRY_URL = 'url ';
const DATA_IN_THIS_FILE = 1;
const ONE_ENTRY = 1;
const TIME_FIELD_BYTES: Readonly<Record<IntegerField['kind'], number>> = {
  uint32: 4,
  int32: 4,
  uint64: 8,
  int64: 8,
};

export function encodeMovie(placed: readonly PlacedTrack[], layout: MovieLayout): Uint8Array {
  const tracks = placed.map(({ track, placement }) => encodeTrack(track, placement, layout));
  const movieDuration = Math.max(0, ...placed.map(({ track }) => movieDurationOf(track, layout)));
  const header = movieHeader(movieDuration, placed.length, layout);
  return encodeBox(Mp4BoxType.Movie, concatenated([header, ...tracks]));
}

function movieHeader(duration: number, trackCount: number, layout: MovieLayout): Uint8Array {
  const timing = MOVIE_HEADER[layout.headerVersion];
  const payload = new Uint8Array(timing.size);
  const view = new DataView(payload.buffer);
  view.setUint32(timing.timescale, layout.movieTimescale);
  writeInteger(view, timing.duration, duration);
  const afterDuration = endOf(timing.duration);
  view.setUint32(afterDuration + MOVIE_RATE_AFTER_DURATION, UNIT_RATE);
  view.setUint16(afterDuration + MOVIE_VOLUME_AFTER_DURATION, UNIT_VOLUME);
  writeMatrix(view, afterDuration + MOVIE_MATRIX_AFTER_DURATION);
  view.setUint32(afterDuration + MOVIE_NEXT_TRACK_ID_AFTER_DURATION, trackCount + 1);
  return encodeFullBox(Mp4BoxType.MovieHeader, { version: layout.headerVersion }, payload);
}

function encodeTrack(
  track: FixtureTrack,
  placement: ChunkPlacement,
  layout: MovieLayout,
): Uint8Array {
  const parts = [
    trackHeader(track, layout),
    ...editBox(track, layout.headerVersion),
    mediaBox(track, placement, layout.headerVersion),
  ];
  return encodeBox(Mp4BoxType.Track, concatenated(parts));
}

function trackHeader(track: FixtureTrack, layout: MovieLayout): Uint8Array {
  const { headerVersion: version } = layout;
  const timing = TRACK_HEADER[version];
  const payload = new Uint8Array(timing.size);
  const view = new DataView(payload.buffer);
  view.setUint32(TRACK_HEADER_ID[version], track.trackId);
  writeInteger(view, timing.duration, movieDurationOf(track, layout));
  writeMatrix(view, endOf(timing.duration) + TRACK_MATRIX_AFTER_DURATION);
  const header = { version, flags: TRACK_ENABLED_IN_MOVIE };
  return encodeFullBox(Mp4BoxType.TrackHeader, header, payload);
}

function editBox(track: FixtureTrack, version: HeaderVersion): Uint8Array[] {
  if (!track.edits) return [];
  const rows = track.edits.map((edit) => ({ ...edit, mediaRate: UNIT_MEDIA_RATE }));
  const list = encodeTable(
    { type: Mp4BoxType.EditList, version, layout: EDIT_LIST[version] },
    rows,
  );
  return [encodeBox(Mp4BoxType.Edit, list)];
}

function mediaBox(
  track: FixtureTrack,
  placement: ChunkPlacement,
  version: HeaderVersion,
): Uint8Array {
  const parts = [
    mediaHeader(track, version),
    handler(track.handler),
    encodeBox(
      Mp4BoxType.MediaInformation,
      concatenated([
        mediaKindHeader(track.handler),
        dataInformation(),
        encodeSampleTable(track, placement),
      ]),
    ),
  ];
  return encodeBox(Mp4BoxType.Media, concatenated(parts));
}

function mediaHeader(track: FixtureTrack, version: HeaderVersion): Uint8Array {
  const timing = MEDIA_HEADER[version];
  const payload = new Uint8Array(timing.size);
  const view = new DataView(payload.buffer);
  view.setUint32(timing.timescale, track.timescale);
  writeInteger(view, timing.duration, mediaDurationOf(track));
  view.setUint16(endOf(timing.duration), UNDETERMINED_LANGUAGE);
  return encodeFullBox(Mp4BoxType.MediaHeader, { version }, payload);
}

function handler(type: string): Uint8Array {
  const payload = new Uint8Array(HANDLER_NAME_OFFSET + HANDLER_NAME.length);
  payload.set(encodeAscii(type), HANDLER_TYPE_OFFSET);
  return encodeFullBox(Mp4BoxType.Handler, { version: 0 }, payload);
}

function mediaKindHeader(handlerType: string): Uint8Array {
  return handlerType === HandlerType.Video
    ? encodeFullBox(
        VIDEO_MEDIA_HEADER,
        { version: 0, flags: VIDEO_MEDIA_HEADER_FLAGS },
        new Uint8Array(VIDEO_MEDIA_HEADER_SIZE),
      )
    : encodeFullBox(SOUND_MEDIA_HEADER, { version: 0 }, new Uint8Array(SOUND_MEDIA_HEADER_SIZE));
}

function dataInformation(): Uint8Array {
  const count = new Uint8Array(TABLE_ENTRIES_OFFSET);
  new DataView(count.buffer).setUint32(TABLE_ENTRY_COUNT_OFFSET, ONE_ENTRY);
  const url = encodeFullBox(
    DATA_ENTRY_URL,
    { version: 0, flags: DATA_IN_THIS_FILE },
    new Uint8Array(),
  );
  const references = encodeFullBox(DATA_REFERENCE, { version: 0 }, concatenated([count, url]));
  return encodeBox(DATA_INFORMATION, references);
}

function writeMatrix(view: DataView, offset: number): void {
  for (const [index, value] of IDENTITY_MATRIX.entries()) {
    view.setUint32(offset + index * MATRIX_ENTRY_SIZE, value);
  }
}

function endOf(field: IntegerField): number {
  return field.offset + TIME_FIELD_BYTES[field.kind];
}

function mediaDurationOf(track: FixtureTrack): number {
  return track.samples.reduce((total, sample) => total + sample.duration, 0);
}

function movieDurationOf(track: FixtureTrack, layout: MovieLayout): number {
  return track.edits
    ? track.edits.reduce((total, edit) => total + edit.segmentDuration, 0)
    : Math.round((mediaDurationOf(track) * layout.movieTimescale) / track.timescale);
}
