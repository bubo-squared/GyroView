/**
 * How far a stamp may stray from where its neighbours put it, in typical sample intervals,
 * before it is taken for a glitch: far beyond an IMU's jitter, far below what a flipped bit
 * leaves.
 */
const STRAY_INTERVALS = 50;
/**
 * The least stray tolerance, in microseconds, for a record whose stamps barely move.
 */
const MIN_STRAY_TOLERANCE_US = 10_000;
/**
 * How many leading intervals the typical interval is measured over.
 */
const INTERVAL_PROBE = 1024;
/**
 * How far ahead a run of strays may reach before the stamps are taken to have jumped for real (a
 * gap in the recording): a sample this near that comes back to the line proves a run.
 */
const RUN_LOOKAHEAD = 16;

export interface RepairedTimeline {
  readonly times: Float64Array;
  /**
   * How many stamps were moved, for a warning: a wrong stamp unit shows here too.
   */
  readonly mended: number;
}

interface Line {
  readonly times: Float64Array;
  readonly interval: number;
  readonly tolerance: number;
}

/**
 * Recorded stamps made fit to integrate over and to search. The walk trusts a stamp in step with
 * the last trusted one; a stamp off that line is a stray when a sample soon after comes back to
 * it (a clock glitch, a flipped bit, a short run of them, either way, anywhere) and is put on the
 * line; one that never comes back starts a real gap. Stamps before the first steady stretch are
 * placed back from it. No stamp is then let go back.
 */
export function repairedTimeline(recorded: Float64Array): RepairedTimeline {
  const interval = typicalInterval(recorded);
  const line = { times: recorded, interval, tolerance: toleranceOf(interval) };
  const times = Float64Array.from(recorded);
  const anchor = firstSteadyIndex(line);
  if (anchor !== undefined) {
    placeBackFrom(anchor, times, line);
    walkFrom(anchor, times, line);
  }
  for (let index = 1; index < times.length; index += 1) {
    times[index] = Math.max(times[index] ?? 0, times[index - 1] ?? 0);
  }
  return { times, mended: times.filter((time, index) => time !== recorded[index]).length };
}

function toleranceOf(interval: number): number {
  return Math.max(STRAY_INTERVALS * interval, MIN_STRAY_TOLERANCE_US);
}

/**
 * The median spacing of the first samples: a stray among them moves it no more than one.
 */
function typicalInterval(times: Float64Array): number {
  const probe = times.subarray(0, INTERVAL_PROBE + 1);
  const intervals = probe.subarray(1).map((time, index) => time - (probe[index] ?? time));
  const sorted = intervals.toSorted();
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

function isStep(from: number | undefined, to: number | undefined, tolerance: number): boolean {
  return from !== undefined && to !== undefined && to >= from && to - from <= tolerance;
}

/**
 * The first sample that begins three in step, the walk's first trusted stamp.
 */
function firstSteadyIndex({ times, tolerance }: Line): number | undefined {
  for (let index = 0; index + 2 < times.length; index += 1) {
    const isSteady =
      isStep(times[index], times[index + 1], tolerance) &&
      isStep(times[index + 1], times[index + 2], tolerance);
    if (isSteady) return index;
  }
  return undefined;
}

function placeBackFrom(anchor: number, times: Float64Array, line: Line): void {
  for (let index = anchor - 1; index >= 0; index -= 1) {
    const expected = (times[index + 1] ?? 0) - line.interval;
    if (Math.abs((line.times[index] ?? expected) - expected) > line.tolerance) {
      times[index] = expected;
    }
  }
}

function walkFrom(anchor: number, times: Float64Array, line: Line): void {
  let trusted = anchor;
  for (let index = anchor + 1; index < times.length; index += 1) {
    const base = { index: trusted, time: times[trusted] ?? 0 };
    const expected = base.time + (index - base.index) * line.interval;
    const isOnLine = Math.abs((line.times[index] ?? expected) - expected) <= line.tolerance;
    if (isOnLine || !willComeBackToLine(index, base, line)) {
      trusted = index;
    } else {
      times[index] = expected;
    }
  }
}

/**
 * Whether a sample soon after `index` is back on the line through `base`: then `index` is a
 * stray. Running out of samples counts as coming back, a jump in the last few being no gap to
 * keep.
 */
function willComeBackToLine(
  index: number,
  base: { readonly index: number; readonly time: number },
  line: Line,
): boolean {
  const last = Math.min(line.times.length - 1, index + RUN_LOOKAHEAD);
  if (last < index + RUN_LOOKAHEAD) return true;
  for (let ahead = index + 1; ahead <= last; ahead += 1) {
    const expected = base.time + (ahead - base.index) * line.interval;
    if (Math.abs((line.times[ahead] ?? expected) - expected) <= line.tolerance) return true;
  }
  return false;
}
