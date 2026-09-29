import {
  boxesIn,
  fullBoxOf,
  optionalBox,
  requiredBox,
  unreadableMovie,
  type Mp4Box,
} from './movieBoxes';
import { Mp4BoxType } from './mp4BoxTypes';
import {
  COMPOSITION_OFFSET,
  EDIT_LIST,
  EMPTY_EDIT_MEDIA_TIME,
  TIME_TO_SAMPLE,
  UNIT_MEDIA_RATE,
} from './mp4Layouts';
import { readTableColumns } from './readTable';
import { inVersion, type TrackBoxes } from './trackHeaders';
import { presentationOrderOf } from '../../container/presentationOrder';
import { seconds, type Seconds } from '../../../shared/units/time';

/**
 * What a track's timing is counted against: its media timescale, the movie's (in which edit
 * lists count) and how many samples its size table holds.
 */
export interface TimingContext {
  readonly media: number;
  readonly movie: number;
  readonly sampleCount: number;
}

/**
 * When each sample shows and for how long, in seconds, in decode order, and when the track ends.
 */
export interface SampleTiming {
  readonly timestamps: Float64Array;
  readonly durations: Float64Array;
  readonly end: Seconds;
}

interface DecodeTicks {
  readonly times: Float64Array;
  readonly deltas: Float64Array;
}

/**
 * The track's timing as mediabunny reads it, so that both agree to the bit: a sample shows at its
 * decode time plus its composition offset, less the edit list's shift, all in ticks, divided by
 * the timescale once. Where composition offsets reorder the frames, each lasts until the next
 * one shows and the last one shown for its own decode duration.
 */
export function sampleTimingOf(boxes: TrackBoxes, context: TimingContext): SampleTiming {
  const decode = decodeTicksOf(requiredBox(boxes.sampleTable, Mp4BoxType.TimeToSample), context);
  const offsets = compositionOffsetsOf(boxes.sampleTable, context.sampleCount);
  const presentation = offsets
    ? decode.times.map((time, sample) => time + (offsets[sample] ?? 0))
    : decode.times;
  const shift = editShiftOf(boxes.track, context);
  const timestamps = presentation.map((ticks) => (ticks - shift) / context.media);
  const durationTicks = offsets ? presentationGaps(presentation, decode.deltas) : decode.deltas;
  const durations = durationTicks.map((ticks) => ticks / context.media);
  return { timestamps, durations, end: endOf(timestamps, durations, context.media) };
}

/**
 * Each sample's decode time and duration, from the runs of `stts`.
 */
function decodeTicksOf(box: Mp4Box, context: TimingContext): DecodeTicks {
  const runs = readTableColumns(fullBoxOf(box).content, TIME_TO_SAMPLE);
  const deltas = expandedRuns(runs.sampleCount, runs.sampleDelta);
  if (deltas.length !== context.sampleCount) {
    throw unreadableMovie(
      `times ${deltas.length} samples of a track that has ${context.sampleCount}`,
    );
  }
  const times = new Float64Array(deltas.length);
  for (let sample = 1; sample < deltas.length; sample += 1) {
    times[sample] = (times[sample - 1] ?? 0) + (deltas[sample - 1] ?? 0);
  }
  return { times, deltas };
}

/**
 * Each sample's composition offset from the runs of `ctts`, zero past its last run; undefined
 * for a track without the box, whose frames show in decode order.
 */
function compositionOffsetsOf(
  sampleTable: readonly Mp4Box[],
  sampleCount: number,
): Float64Array | undefined {
  const box = optionalBox(sampleTable, Mp4BoxType.CompositionOffset);
  if (!box) return undefined;
  const runs = readTableColumns(fullBoxOf(box).content, COMPOSITION_OFFSET);
  const offsets = new Float64Array(sampleCount);
  offsets.set(expandedRuns(runs.sampleCount, runs.sampleOffset).subarray(0, sampleCount));
  return offsets;
}

function expandedRuns(counts: readonly number[], values: readonly number[]): Float64Array {
  const total = counts.reduce((sum, count) => sum + count, 0);
  const expanded = new Float64Array(total);
  let start = 0;
  for (const [run, count] of counts.entries()) {
    expanded.fill(values[run] ?? 0, start, start + count);
    start += count;
  }
  return expanded;
}

/**
 * The ticks the edit list moves the media by: the media time of its first edit that shows media
 * at the media's own pace, less the empty edits before it (movie time, rounded to media ticks).
 * Later edits are not followed, as mediabunny does not follow them.
 */
function editShiftOf(track: readonly Mp4Box[], context: TimingContext): number {
  const edit = optionalBox(track, Mp4BoxType.Edit);
  const list = edit && optionalBox(boxesIn(edit.body), Mp4BoxType.EditList);
  if (!list) return 0;
  const box = fullBoxOf(list);
  const entries = readTableColumns(box.content, inVersion(box, EDIT_LIST, Mp4BoxType.EditList));
  let emptyDuration = 0;
  for (const [entry, mediaTime] of entries.mediaTime.entries()) {
    if (mediaTime === EMPTY_EDIT_MEDIA_TIME) {
      emptyDuration += entries.segmentDuration[entry] ?? 0;
      continue;
    }
    return entries.mediaRate[entry] === UNIT_MEDIA_RATE
      ? mediaTime - Math.round((emptyDuration / context.movie) * context.media)
      : 0;
  }
  return 0;
}

/**
 * How long each sample shows: until the next one in presentation order (ties kept in decode
 * order), the last one for its own decode duration.
 */
function presentationGaps(presentation: Float64Array, deltas: Float64Array): Float64Array {
  const order = presentationOrderOf(presentation);
  const gaps = Float64Array.from(deltas);
  for (let position = 0; position < order.length - 1; position += 1) {
    const sample = order[position] ?? 0;
    gaps[sample] = (presentation[order[position + 1] ?? 0] ?? 0) - (presentation[sample] ?? 0);
  }
  return gaps;
}

/**
 * When the last sample shown stops showing, rounded to the timescale as mediabunny rounds a
 * track's duration.
 */
function endOf(timestamps: Float64Array, durations: Float64Array, timescale: number): Seconds {
  const last = presentationOrderOf(timestamps).at(-1);
  if (last === undefined) return seconds(0);
  const end = (timestamps[last] ?? 0) + (durations[last] ?? 0);
  return seconds(Math.round(end * timescale) / timescale);
}
