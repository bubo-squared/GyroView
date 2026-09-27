/**
 * How far a stamp may stray from its neighbourhood, in typical sample intervals, before it is
 * taken for a glitch: far beyond an IMU's jitter, far below what a flipped bit leaves.
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
const NEIGHBOURS_EACH_SIDE = 2;

interface Spacing {
  readonly interval: number;
  readonly tolerance: number;
}

/**
 * Recorded stamps made fit to integrate over and to search: a stamp far from the median of its
 * neighbourhood (two samples each side), as a clock glitch or a flipped bit leaves, is put back
 * where that median neighbour says it belongs, which mends a lone stray or a pair anywhere, the
 * first sample included; then no stamp is let go back. A longer run of strays is held at the
 * time where it began.
 */
export function repairedTimeline(times: Float64Array): Float64Array {
  const interval = typicalInterval(times);
  const spacing = {
    interval,
    tolerance: Math.max(STRAY_INTERVALS * interval, MIN_STRAY_TOLERANCE_US),
  };
  const repaired = times.map((time, index) =>
    isInStep(times, index, spacing.tolerance) ? time : mended(times, index, spacing),
  );
  for (let index = 1; index < repaired.length; index += 1) {
    repaired[index] = Math.max(repaired[index] ?? 0, repaired[index - 1] ?? 0);
  }
  return repaired;
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
 * Between its neighbours and near both: the common case, which needs no closer look.
 */
function isInStep(times: Float64Array, index: number, tolerance: number): boolean {
  const time = times[index] ?? 0;
  const previous = times[index - 1] ?? time;
  const next = times[index + 1] ?? time;
  return time >= previous && next >= time && next - previous <= 2 * tolerance;
}

/**
 * A stamp far from its neighbourhood's median takes the median neighbour's time, moved by the
 * typical interval for each sample between them; one near it (either side of a real gap in the
 * recording) is kept.
 */
function mended(times: Float64Array, index: number, spacing: Spacing): number {
  const time = times[index] ?? 0;
  const anchor = medianNeighbourOf(times, index);
  const anchorTime = times[anchor] ?? time;
  const isStray = Math.abs(time - anchorTime) > spacing.tolerance;
  return isStray ? anchorTime + (index - anchor) * spacing.interval : time;
}

function medianNeighbourOf(times: Float64Array, index: number): number {
  const start = Math.max(0, index - NEIGHBOURS_EACH_SIDE);
  const end = Math.min(times.length, index + NEIGHBOURS_EACH_SIDE + 1);
  const neighbourhood = Array.from({ length: end - start }, (_unused, offset) => start + offset);
  const byTime = neighbourhood.toSorted((a, b) => (times[a] ?? 0) - (times[b] ?? 0));
  return byTime[Math.floor(byTime.length / 2)] ?? index;
}
