import { fullBoxOf, optionalBox, requiredBox, unreadableMovie, type Mp4Box } from './movieBoxes';
import { Mp4BoxType } from './mp4BoxTypes';
import {
  CHUNK_LARGE_OFFSET,
  CHUNK_OFFSET,
  SAMPLE_SIZE_COUNT_OFFSET,
  SAMPLE_SIZE_ENTRIES_OFFSET,
  SAMPLE_SIZE_ENTRY_SIZE,
  SAMPLE_SIZE_OF_EACH,
  SAMPLE_SIZE_SHARED_OFFSET,
  SAMPLE_TO_CHUNK,
} from './mp4Layouts';
import { readTableColumns } from './readTable';

/**
 * Where each of a track's samples starts in the file and how many bytes it takes, in decode
 * order.
 */
export interface SampleLocations {
  readonly offsets: Float64Array;
  readonly sizes: Float64Array;
}

/**
 * Chunk numbers in the sample-to-chunk table count from one.
 */
const FIRST_CHUNK_NUMBER = 1;

/**
 * The sample locations a sample table's boxes describe: the sizes of `stsz`, laid out one after
 * another in the chunks `stsc` fills, which start where `stco` or `co64` says.
 */
export function sampleLocationsOf(sampleTable: readonly Mp4Box[]): SampleLocations {
  const sizes = sampleSizesOf(requiredBox(sampleTable, Mp4BoxType.SampleSize));
  const chunkOffsets = chunkOffsetsOf(sampleTable);
  const sampleToChunk = fullBoxOf(requiredBox(sampleTable, Mp4BoxType.SampleToChunk)).content;
  const perChunk = samplesPerChunkOf(
    readTableColumns(sampleToChunk, SAMPLE_TO_CHUNK),
    chunkOffsets.length,
  );
  return { offsets: offsetsOf({ sizes, chunkOffsets, perChunk }), sizes };
}

function sampleSizesOf(box: Mp4Box): Float64Array {
  const { content } = fullBoxOf(box);
  const shared = content.uint32BeAt(SAMPLE_SIZE_SHARED_OFFSET);
  const count = content.uint32BeAt(SAMPLE_SIZE_COUNT_OFFSET);
  if (shared !== SAMPLE_SIZE_OF_EACH) return new Float64Array(count).fill(shared);
  if (SAMPLE_SIZE_ENTRIES_OFFSET + count * SAMPLE_SIZE_ENTRY_SIZE > content.length) {
    throw unreadableMovie(`lists ${count} sample sizes that do not fit in its box`);
  }
  return Float64Array.from({ length: count }, (_, index) =>
    content.uint32BeAt(SAMPLE_SIZE_ENTRIES_OFFSET + index * SAMPLE_SIZE_ENTRY_SIZE),
  );
}

function chunkOffsetsOf(sampleTable: readonly Mp4Box[]): number[] {
  const large = optionalBox(sampleTable, Mp4BoxType.ChunkLargeOffset);
  const box = large ?? optionalBox(sampleTable, Mp4BoxType.ChunkOffset);
  if (!box) throw unreadableMovie('has a sample table without chunk offsets');
  const layout = large ? CHUNK_LARGE_OFFSET : CHUNK_OFFSET;
  return readTableColumns(fullBoxOf(box).content, layout).chunkOffset;
}

/**
 * How many samples each chunk holds: every entry holds from its first chunk to the next entry's.
 */
function samplesPerChunkOf(
  table: { readonly firstChunk: readonly number[]; readonly samplesPerChunk: readonly number[] },
  chunkCount: number,
): number[] {
  const perChunk = Array.from({ length: chunkCount }, () => 0);
  for (const [entry, firstChunk] of table.firstChunk.entries()) {
    const nextFirst = table.firstChunk[entry + 1] ?? chunkCount + FIRST_CHUNK_NUMBER;
    const count = table.samplesPerChunk[entry] ?? 0;
    perChunk.fill(count, firstChunk - FIRST_CHUNK_NUMBER, nextFirst - FIRST_CHUNK_NUMBER);
  }
  return perChunk;
}

interface ChunkLayout {
  readonly sizes: Float64Array;
  readonly chunkOffsets: readonly number[];
  readonly perChunk: readonly number[];
}

function offsetsOf(layout: ChunkLayout): Float64Array {
  const offsets = new Float64Array(layout.sizes.length);
  let sample = 0;
  for (const [chunk, chunkOffset] of layout.chunkOffsets.entries()) {
    let offset = chunkOffset;
    const last = Math.min(sample + (layout.perChunk[chunk] ?? 0), offsets.length);
    for (; sample < last; sample += 1) {
      offsets[sample] = offset;
      offset += layout.sizes[sample] ?? 0;
    }
  }
  if (sample < offsets.length) {
    throw unreadableMovie(`has chunks for ${sample} of its ${offsets.length} samples`);
  }
  return offsets;
}
