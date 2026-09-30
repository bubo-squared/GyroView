import type { FixtureTrack } from './FixtureTrack';
import { concatenated } from '../../shared/binary/concatenated';
import { encodeMovie, type HeaderVersion, type MovieLayout, type PlacedTrack } from './encodeMovie';
import { BOX_HEADER_SIZE, LARGE_BOX_HEADER_SIZE } from '../../domain/format/boxes/boxConstants';
import { Mp4BoxType } from '../../domain/format/mp4/mp4BoxTypes';
import { ByteRange } from '../../shared/binary/ByteRange';
import { encodeBox, encodeLargeBox } from '../encodeBox';
import { encodeAscii } from '../encodeAscii';

export type { FixtureEdit, FixtureSample, FixtureTrack } from './FixtureTrack';

/**
 * How a synthetic file is laid out. The defaults are how the cameras write theirs, but for the
 * sizes, which grow to 64 bits only past 4 GiB.
 */
export interface Mp4FileLayout extends MovieLayout {
  readonly movieBox: 'before-media' | 'after-media';
  readonly mediaDataSize: '32-bit' | '64-bit';
  readonly chunkOffsets: '32-bit' | '64-bit';
}

export interface BuiltMp4File {
  readonly bytes: Uint8Array;
  /**
   * Per track, in the order given, where each of its samples starts in the file.
   */
  readonly sampleOffsets: readonly (readonly number[])[];
  readonly movieBox: ByteRange;
  readonly mediaData: ByteRange;
}

const DEFAULT_LAYOUT: Mp4FileLayout = {
  movieBox: 'after-media',
  mediaDataSize: '32-bit',
  chunkOffsets: '32-bit',
  headerVersion: 0 satisfies HeaderVersion,
  movieTimescale: 1000,
};
/**
 * The file type box ffmpeg writes (ISO/IEC 14496-12 §4.3): the `isom` brand, minor version 512.
 */
const MAJOR_BRAND = 'isom';
const MINOR_VERSION = 0x2_00;
const COMPATIBLE_BRANDS = ['isom', 'iso2', 'avc1', 'mp41'];
const BRAND_SIZE = 4;
const ONE_SAMPLE_A_CHUNK = [1];

/**
 * Where each track's chunks and samples sit within the media data's payload.
 */
interface TrackInMedia {
  readonly chunkOffsets: number[];
  readonly sampleCounts: number[];
  readonly sampleOffsets: number[];
}

interface InterleavedMedia {
  readonly payload: Uint8Array;
  readonly tracks: readonly TrackInMedia[];
}

/**
 * A whole MP4 file of the given tracks, their chunks interleaved in turn (the first chunk of
 * every track, then the second of each), as the cameras interleave theirs.
 */
export function buildMp4File(
  tracks: readonly FixtureTrack[],
  layout: Partial<Mp4FileLayout> = {},
): BuiltMp4File {
  const chosen = { ...DEFAULT_LAYOUT, ...layout };
  const media = interleaved(tracks);
  const fileType = fileTypeBox();
  const isMovieFirst = chosen.movieBox === 'before-media';
  // Every offset field has a fixed width, so the movie's size does not depend on the offsets.
  const movieSize = encodeMovie(
    placed(tracks, media, { base: 0, layout: chosen }),
    chosen,
  ).byteLength;
  const mediaStart = fileType.byteLength + (isMovieFirst ? movieSize : 0);
  const base = mediaStart + mediaDataHeaderSize(chosen);
  const movie = encodeMovie(placed(tracks, media, { base, layout: chosen }), chosen);
  const mediaData = mediaDataBox(media.payload, chosen);
  const parts = isMovieFirst ? [fileType, movie, mediaData] : [fileType, mediaData, movie];
  const movieStart = isMovieFirst ? fileType.byteLength : mediaStart + mediaData.byteLength;
  return {
    bytes: concatenated(parts),
    sampleOffsets: media.tracks.map((track) => track.sampleOffsets.map((offset) => base + offset)),
    movieBox: ByteRange.of(movieStart, movie.byteLength),
    mediaData: ByteRange.of(mediaStart, mediaData.byteLength),
  };
}

function interleaved(tracks: readonly FixtureTrack[]): InterleavedMedia {
  const chunks = tracks.map((track) => chunksOf(track));
  const writer = new MediaWriter(tracks.length);
  const chunkCount = Math.max(0, ...chunks.map((trackChunks) => trackChunks.length));
  for (let chunkIndex = 0; chunkIndex < chunkCount; chunkIndex += 1) {
    for (const [trackIndex, trackChunks] of chunks.entries()) {
      writer.append(trackIndex, trackChunks[chunkIndex] ?? []);
    }
  }
  return writer.media();
}

/**
 * Appends chunks to the media data's payload, remembering where each chunk and sample went.
 */
class MediaWriter {
  private readonly parts: Uint8Array[] = [];
  private readonly tracks: TrackInMedia[];
  private offset = 0;

  public constructor(trackCount: number) {
    this.tracks = Array.from({ length: trackCount }, () => ({
      chunkOffsets: [],
      sampleCounts: [],
      sampleOffsets: [],
    }));
  }

  public append(trackIndex: number, chunk: readonly Uint8Array[]): void {
    const track = this.tracks[trackIndex];
    if (!track || chunk.length === 0) return;
    track.chunkOffsets.push(this.offset);
    track.sampleCounts.push(chunk.length);
    for (const sample of chunk) {
      track.sampleOffsets.push(this.offset);
      this.parts.push(sample);
      this.offset += sample.byteLength;
    }
  }

  public media(): InterleavedMedia {
    return { payload: concatenated(this.parts), tracks: this.tracks };
  }
}

/**
 * The track's sample bytes grouped into chunks by its chunk sizes, the last size repeating.
 */
function chunksOf(track: FixtureTrack): Uint8Array[][] {
  const sizes = track.chunkSizes ?? ONE_SAMPLE_A_CHUNK;
  const chunks: Uint8Array[][] = [];
  let next = 0;
  while (next < track.samples.length) {
    const size = sizes[Math.min(chunks.length, sizes.length - 1)] ?? 1;
    chunks.push(track.samples.slice(next, next + size).map((sample) => sample.bytes));
    next += size;
  }
  return chunks;
}

function placed(
  tracks: readonly FixtureTrack[],
  media: InterleavedMedia,
  at: { readonly base: number; readonly layout: Mp4FileLayout },
): PlacedTrack[] {
  return tracks.map((track, index) => {
    const inMedia = media.tracks[index];
    return {
      track,
      placement: {
        offsets: (inMedia?.chunkOffsets ?? []).map((offset) => at.base + offset),
        sampleCounts: inMedia?.sampleCounts ?? [],
        offsetSize: at.layout.chunkOffsets,
      },
    };
  });
}

function mediaDataHeaderSize(layout: Mp4FileLayout): number {
  return layout.mediaDataSize === '64-bit' ? LARGE_BOX_HEADER_SIZE : BOX_HEADER_SIZE;
}

function mediaDataBox(payload: Uint8Array, layout: Mp4FileLayout): Uint8Array {
  return layout.mediaDataSize === '64-bit'
    ? encodeLargeBox(Mp4BoxType.MediaData, payload)
    : encodeBox(Mp4BoxType.MediaData, payload);
}

function fileTypeBox(): Uint8Array {
  const brands = [MAJOR_BRAND, '', ...COMPATIBLE_BRANDS];
  const payload = new Uint8Array(brands.length * BRAND_SIZE);
  for (const [index, brand] of brands.entries())
    payload.set(encodeAscii(brand), index * BRAND_SIZE);
  new DataView(payload.buffer).setUint32(BRAND_SIZE, MINOR_VERSION);
  return encodeBox(Mp4BoxType.FileType, payload);
}
