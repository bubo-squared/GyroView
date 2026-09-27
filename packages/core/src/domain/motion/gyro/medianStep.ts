/**
 * The median spacing of consecutive stamps: a stray among them moves it by no more than one
 * place, so a few glitched or unset stamps do not decide it. Zero for fewer than two stamps.
 */
export function medianStep(stamps: Float64Array): number {
  const steps = stamps.subarray(1).map((stamp, index) => stamp - (stamps[index] ?? stamp));
  const sorted = steps.toSorted();
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}
