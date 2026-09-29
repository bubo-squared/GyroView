import type { FixtureSample, FixtureTrack } from './FixtureTrack';
import { concatenated } from './concatenated';
import { encodeTable } from './encodeTable';
import { Mp4BoxType } from '../../domain/format/mp4/mp4BoxTypes';
import {
  CHUNK_LARGE_OFFSET,
  CHUNK_OFFSET,
  COMPOSITION_OFFSET,
  SAMPLE_SIZE_COUNT_OFFSET,
  SAMPLE_SIZE_ENTRIES_OFFSET,
  SAMPLE_SIZE_ENTRY_SIZE,
  SAMPLE_SIZE_OF_EACH,
  SAMPLE_SIZE_SHARED_OFFSET,
  SAMPLE_TO_CHUNK,
  SYNC_SAMPLE,
  TABLE_ENTRIES_OFFSET,
  TABLE_ENTRY_COUNT_OFFSET,
  TIME_TO_SAMPLE,
} from '../../domain/format/mp4/mp4Layouts';
import { encodeBox, encodeFullBox } from '../encodeBox';

/**
 * Where a track's chunks landed in the file, and in how many bits the table says so.
 */
export interface ChunkPlacement {
  readonly offsets: readonly number[];
  readonly sampleCounts: readonly number[];
  readonly offsetSize: '32-bit' | '64-bit';
}

const FIRST_NUMBER = 1;
const ONLY_SAMPLE_DESCRIPTION = 1;
const VERSION_0 = { version: 0 };

interface Run {
  readonly value: number;
  readonly count: number;
}

/**
 * The sample table of a track whose chunks were placed at `placement`.
 */
export function encodeSampleTable(track: FixtureTrack, placement: ChunkPlacement): Uint8Array {
  const tables = [
    sampleDescription(track.sampleEntry),
    timeToSample(track.samples),
    ...compositionOffsets(track),
    ...syncSamples(track),
    sampleToChunk(placement.sampleCounts),
    sampleSizes(track.samples),
    chunkOffsets(placement),
  ];
  return encodeBox(Mp4BoxType.SampleTable, concatenated(tables));
}

function sampleDescription(entry: Uint8Array): Uint8Array {
  const payload = new Uint8Array(TABLE_ENTRIES_OFFSET + entry.byteLength);
  new DataView(payload.buffer).setUint32(TABLE_ENTRY_COUNT_OFFSET, ONLY_SAMPLE_DESCRIPTION);
  payload.set(entry, TABLE_ENTRIES_OFFSET);
  return encodeFullBox(Mp4BoxType.SampleDescription, VERSION_0, payload);
}

function timeToSample(samples: readonly FixtureSample[]): Uint8Array {
  const runs = runsOf(samples.map((sample) => sample.duration));
  const rows = runs.map((run) => ({ sampleCount: run.count, sampleDelta: run.value }));
  return encodeTable({ type: Mp4BoxType.TimeToSample, version: 0, layout: TIME_TO_SAMPLE }, rows);
}

function compositionOffsets(track: FixtureTrack): Uint8Array[] {
  if (track.compositionOffsets === undefined) return [];
  const version = track.compositionOffsets === 'version-1' ? 1 : 0;
  const runs = runsOf(track.samples.map((sample) => sample.compositionOffset ?? 0));
  const rows = runs.map((run) => ({ sampleCount: run.count, sampleOffset: run.value }));
  const layout = COMPOSITION_OFFSET[version];
  return [encodeTable({ type: Mp4BoxType.CompositionOffset, version, layout }, rows)];
}

function syncSamples(track: FixtureTrack): Uint8Array[] {
  if (track.syncSamples === 'unlisted') return [];
  const rows = track.samples.flatMap((sample, index) =>
    sample.isSync ? [{ sampleNumber: index + FIRST_NUMBER }] : [],
  );
  return [encodeTable({ type: Mp4BoxType.SyncSample, version: 0, layout: SYNC_SAMPLE }, rows)];
}

/**
 * One entry wherever the number of samples per chunk changes.
 */
function sampleToChunk(sampleCounts: readonly number[]): Uint8Array {
  const rows = sampleCounts.flatMap((count, index) =>
    index > 0 && sampleCounts[index - 1] === count
      ? []
      : [
          {
            firstChunk: index + FIRST_NUMBER,
            samplesPerChunk: count,
            sampleDescriptionIndex: ONLY_SAMPLE_DESCRIPTION,
          },
        ],
  );
  return encodeTable({ type: Mp4BoxType.SampleToChunk, version: 0, layout: SAMPLE_TO_CHUNK }, rows);
}

/**
 * One size shared by every sample when they are all alike, one size per sample otherwise.
 */
function sampleSizes(samples: readonly FixtureSample[]): Uint8Array {
  const sizes = samples.map((sample) => sample.bytes.byteLength);
  const [first] = sizes;
  const shared = sizes.every((size) => size === first) ? (first ?? 0) : SAMPLE_SIZE_OF_EACH;
  const entries = shared === SAMPLE_SIZE_OF_EACH ? sizes : [];
  const payload = new Uint8Array(
    SAMPLE_SIZE_ENTRIES_OFFSET + entries.length * SAMPLE_SIZE_ENTRY_SIZE,
  );
  const view = new DataView(payload.buffer);
  view.setUint32(SAMPLE_SIZE_SHARED_OFFSET, shared);
  view.setUint32(SAMPLE_SIZE_COUNT_OFFSET, sizes.length);
  for (const [index, size] of entries.entries()) {
    view.setUint32(SAMPLE_SIZE_ENTRIES_OFFSET + index * SAMPLE_SIZE_ENTRY_SIZE, size);
  }
  return encodeFullBox(Mp4BoxType.SampleSize, VERSION_0, payload);
}

function chunkOffsets(placement: ChunkPlacement): Uint8Array {
  const isLarge = placement.offsetSize === '64-bit';
  const type = isLarge ? Mp4BoxType.ChunkLargeOffset : Mp4BoxType.ChunkOffset;
  const layout = isLarge ? CHUNK_LARGE_OFFSET : CHUNK_OFFSET;
  const rows = placement.offsets.map((chunkOffset) => ({ chunkOffset }));
  return encodeTable({ type, version: 0, layout }, rows);
}

function runsOf(values: readonly number[]): Run[] {
  const runs: Run[] = [];
  for (const value of values) {
    const last = runs.at(-1);
    if (last?.value === value) runs[runs.length - 1] = { value, count: last.count + 1 };
    else runs.push({ value, count: 1 });
  }
  return runs;
}
