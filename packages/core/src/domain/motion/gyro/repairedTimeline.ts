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
 * A stretch of stamps in step this long is trusted: longer than any run of strays the repair
 * mends (a clock glitch, a flipped bit, a few uninitialised stamps), so strays never outvote it.
 */
const TRUSTED_STRETCH = 17;

export interface RepairedTimeline {
  readonly times: Float64Array;
  /**
   * How many stamps were moved, for a warning.
   */
  readonly mended: number;
}

interface Stretch {
  readonly start: number;
  /**
   * One past the last stamp.
   */
  readonly end: number;
}

interface Line {
  readonly recorded: Float64Array;
  readonly interval: number;
  readonly tolerance: number;
}

/**
 * Recorded stamps made fit to integrate over and to search. Stretches of stamps in step are
 * trusted when they are long (and the longest always is); every stamp outside them is placed on
 * the line from its nearest trusted neighbour, keeping its own time when that is near. A real gap
 * lies between two trusted stretches and stays. No stamp is then let go back.
 */
export function repairedTimeline(recorded: Float64Array): RepairedTimeline {
  const interval = typicalInterval(recorded);
  const line = { recorded, interval, tolerance: toleranceOf(interval) };
  const times = Float64Array.from(recorded);
  placeOutsideTrusted(times, trustedStretches(steadyStretches(line)), line);
  // Counted before the clamp: a stamp held at its predecessor's time was not a stray.
  const mended = times.filter((time, index) => time !== recorded[index]).length;
  for (let index = 1; index < times.length; index += 1) {
    times[index] = Math.max(times[index] ?? 0, times[index - 1] ?? 0);
  }
  return { times, mended };
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

/**
 * The maximal runs of stamps each a step after the one before (not back, not far ahead).
 */
function steadyStretches({ recorded, tolerance }: Line): Stretch[] {
  const stretches: Stretch[] = [];
  let start = 0;
  for (let index = 1; index <= recorded.length; index += 1) {
    const step = (recorded[index] ?? -Infinity) - (recorded[index - 1] ?? 0);
    if (step >= 0 && step <= tolerance) continue;
    stretches.push({ start, end: index });
    start = index;
  }
  return stretches;
}

function trustedStretches(stretches: readonly Stretch[]): Stretch[] {
  let longest = 0;
  for (const stretch of stretches) longest = Math.max(longest, lengthOf(stretch));
  return stretches.filter((stretch) => {
    const length = lengthOf(stretch);
    return length >= TRUSTED_STRETCH || length === longest;
  });
}

function lengthOf(stretch: Stretch): number {
  return stretch.end - stretch.start;
}

/**
 * Each stamp between trusted stretches, or before the first or after the last, placed on the
 * line from the trusted stamp before it (or after it, ahead of the first stretch).
 */
function placeOutsideTrusted(times: Float64Array, trusted: readonly Stretch[], line: Line): void {
  const [first] = trusted;
  if (!first) return;
  for (let index = first.start - 1; index >= 0; index -= 1) {
    times[index] = placed(index, (times[index + 1] ?? 0) - line.interval, line);
  }
  for (const [position, stretch] of trusted.entries()) {
    placeAfter(
      times,
      { start: stretch.end, end: trusted[position + 1]?.start ?? times.length },
      line,
    );
  }
}

function placeAfter(times: Float64Array, untrusted: Stretch, line: Line): void {
  for (let index = untrusted.start; index < untrusted.end; index += 1) {
    times[index] = placed(index, (times[index - 1] ?? 0) + line.interval, line);
  }
}

/**
 * The stamp's own time when it is near where its neighbour puts it, that place otherwise.
 */
function placed(index: number, expected: number, line: Line): number {
  const recorded = line.recorded[index] ?? expected;
  return Math.abs(recorded - expected) <= line.tolerance ? recorded : expected;
}
