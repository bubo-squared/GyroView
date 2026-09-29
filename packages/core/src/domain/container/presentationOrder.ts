import type { ReadonlyFloat64Array } from '../../shared/binary/ReadonlyTypedArray';

/**
 * The samples in the order they show, given when each shows in decode order; samples that show
 * at the same time keep their decode order, as a stable sort keeps them.
 */
export function presentationOrderOf(times: ReadonlyFloat64Array): number[] {
  const decodeOrder = Array.from({ length: times.length }, (_, sample) => sample);
  return decodeOrder.toSorted((left, right) => (times[left] ?? 0) - (times[right] ?? 0));
}
