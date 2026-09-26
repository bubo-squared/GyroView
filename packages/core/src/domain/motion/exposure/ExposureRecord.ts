import type { ReadonlyFloat64Array } from '../../../shared/binary/ReadonlyTypedArray';
import { ensureIndexInRange, ensureInvariant } from '../../../shared/errors/GyroViewError';
import { type Microseconds, microseconds, seconds, type Seconds } from '../../../shared/units/time';

export interface ExposureEntry {
  readonly captureTime: Microseconds;
  readonly shutterTime: Seconds;
}

/**
 * Capture times and shutter durations of every frame the sensor produced, in order.
 */
export class ExposureRecord {
  public constructor(
    private readonly captureTimeStore: Float64Array,
    private readonly shutterTimeStore: Float64Array,
  ) {
    ensureInvariant(
      captureTimeStore.length === shutterTimeStore.length,
      'exposure record arrays disagree on the entry count',
    );
  }

  public get length(): number {
    return this.captureTimeStore.length;
  }

  public get captureTimes(): ReadonlyFloat64Array {
    return this.captureTimeStore;
  }

  public get shutterTimes(): ReadonlyFloat64Array {
    return this.shutterTimeStore;
  }

  public entryAt(index: number): ExposureEntry {
    ensureIndexInRange(index, this.length, 'exposure entry');
    return {
      captureTime: microseconds(this.captureTimeStore[index] ?? 0),
      shutterTime: seconds(this.shutterTimeStore[index] ?? 0),
    };
  }

  /**
   * Index of the first entry captured at or after `captureTime`, or the length when none is.
   */
  public indexAtOrAfter(captureTime: Microseconds): number {
    let low = 0;
    let high = this.captureTimeStore.length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if ((this.captureTimeStore[middle] ?? Infinity) < captureTime) low = middle + 1;
      else high = middle;
    }
    return low;
  }

  /**
   * The `count` entries starting at `start`, as their own record.
   */
  public slice(start: number, count: number): ExposureRecord {
    ensureInvariant(
      start >= 0 && count >= 0 && start + count <= this.length,
      'exposure slice out of range',
    );
    return new ExposureRecord(
      this.captureTimeStore.slice(start, start + count),
      this.shutterTimeStore.slice(start, start + count),
    );
  }
}
